import { useCallback, useState } from "react";
import type { Topic, TopicDisposition } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { isActiveTopic, stateLabel } from "./topicHelpers";

export function TopicCard({
  topic,
  allTopics,
  isBuilding,
  onToggleQueue,
  onResolve,
  onDisposition,
  onNavigateToFile,
}: {
  topic: Topic;
  allTopics: Topic[];
  isBuilding: boolean;
  onToggleQueue: (topicId: string) => void;
  onResolve: (topicId: string, action: "accept" | "dismiss" | "deprecate") => void;
  onDisposition: (topicId: string, disposition: TopicDisposition) => void;
  onNavigateToFile: (path: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isSeed = topic.state === "seed";
  const isActive = isActiveTopic(topic);
  const isDeprecated = topic.state === "deprecated";
  const isParked = topic.disposition === "parked";
  const isSettled = topic.disposition === "settled";
  const hasDisposition = isParked || isSettled;
  const hasBeenDeepened = (topic.discovery?.deepening_count ?? 0) > 0;
  const isRunningDeepen = isBuilding && !!topic.queued_for_deepen;

  const handleResolve = useCallback(
    async (action: "accept" | "dismiss" | "deprecate") => {
      if (saving) return;
      setSaving(true);
      try {
        onResolve(topic.id, action);
      } finally {
        setSaving(false);
      }
    },
    [saving, onResolve, topic.id],
  );

  const handleDisposition = useCallback(
    async (disposition: TopicDisposition) => {
      if (saving) return;
      setSaving(true);
      try {
        onDisposition(topic.id, disposition);
      } finally {
        setSaving(false);
      }
    },
    [saving, onDisposition, topic.id],
  );

  const dependencyLabels = topic.depends_on
    .map((depId) => {
      const dep = allTopics.find((t) => t.id === depId);
      return dep ? { id: depId, label: dep.label } : { id: depId, label: depId };
    });

  const cardClassName = [
    "topic-card",
    `topic-card-${topic.state}`,
    hasDisposition ? `topic-card-disposition-${topic.disposition}` : "",
    topic.queued_for_deepen ? "topic-card-queued" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={cardClassName}>
      <header className="topic-card-header">
        <span className={`topic-state-pill topic-state-${topic.state}`}>
          {stateLabel(topic.state)}
        </span>
        <span className={`topic-confidence-pill topic-confidence-${topic.confidence}`}>
          {topic.confidence}
        </span>
        {hasDisposition ? (
          <span className={`topic-disposition-pill topic-disposition-${topic.disposition}`}>
            {isParked ? "Parked" : "Settled"}
          </span>
        ) : null}
      </header>

      <p className="topic-card-label">{topic.label}</p>

      {topic.justification?.goal_support ? (
        <p className="topic-card-justification">
          <strong>Why: </strong>{topic.justification.goal_support}
        </p>
      ) : null}

      <div className="topic-card-metrics">
        <span>Sources: {topic.metrics?.source_count ?? 0}</span>
        <span>Cross-refs: {topic.metrics?.cross_references ?? 0}</span>
        {topic.metrics?.last_updated ? (
          <span>Updated: {formatLocalDateTime(topic.metrics.last_updated, "—")}</span>
        ) : null}
        <span>Origin: {topic.discovery?.origin ?? "unknown"}</span>
      </div>

      {dependencyLabels.length > 0 ? (
        <div className="topic-card-related">
          <span className="topic-card-related-label">Depends on:</span>
          {dependencyLabels.map((dep) => (
            <button
              className="topic-card-dep-link"
              key={dep.id}
              onClick={() => {
                const depTopic = allTopics.find((t) => t.id === dep.id);
                if (depTopic?.wiki_page) {
                  onNavigateToFile(depTopic.wiki_page);
                }
              }}
              type="button"
            >
              {dep.label}
            </button>
          ))}
        </div>
      ) : null}

      {(topic.coverage_gaps?.length ?? 0) > 0 ? (
        <div className="topic-card-gaps">
          <span className="topic-card-gaps-label">Gaps:</span>
          {topic.coverage_gaps.map((gap, i) => {
            const label = typeof gap === "string" ? gap : gap.description || "Untitled gap";
            return (
              <span className="topic-card-gap-tag" key={typeof gap === "string" ? gap : gap.description || i}>{label}</span>
            );
          })}
        </div>
      ) : null}

      {hasBeenDeepened ? (
        <div className="topic-card-deepened">
          <div className="topic-card-deepened-header">
            <span className="topic-deepened-badge">Deepened ×{topic.discovery.deepening_count}</span>
            {topic.discovery.last_deepened ? (
              <span className="topic-deepened-date">{formatLocalDateTime(topic.discovery.last_deepened, "")}</span>
            ) : null}
          </div>

          {(topic.deepen_log?.length ?? 0) > 0 ? (
            <>
              {topic.deepen_log.slice().reverse().map((entry, idx) => {
                const wordDelta = entry.word_count_after - entry.word_count_before;
                const wordPct = entry.word_count_before > 0
                  ? Math.round((wordDelta / entry.word_count_before) * 100)
                  : 0;
                const stateChanged = entry.state_before !== entry.state_after;
                const isLatest = idx === 0;

                return (
                  <details
                    className="topic-deepen-entry"
                    key={entry.deepened_at}
                    open={isLatest}
                  >
                    <summary className="topic-deepen-entry-summary">
                      <span className="topic-deepen-entry-date">{formatLocalDateTime(entry.deepened_at, "")}</span>
                      <span className="topic-deepen-entry-stats">
                        +{entry.sources_added} sources · {entry.word_count_after.toLocaleString()} words
                        {stateChanged ? ` · ${stateLabel(entry.state_before)} → ${stateLabel(entry.state_after)}` : ""}
                      </span>
                    </summary>
                    <div className="topic-deepen-entry-body">
                      <div className="topic-deepen-entry-row">
                        <span className="topic-deepen-entry-label">Sources</span>
                        <span>
                          {entry.sources_added} new
                          {entry.sources_total != null ? ` (${entry.sources_total} total)` : ""}
                          {entry.unfetched && entry.unfetched.length > 0 ? ` · ${entry.unfetched.length} unfetched` : ""}
                        </span>
                      </div>
                      <div className="topic-deepen-entry-row">
                        <span className="topic-deepen-entry-label">Wiki</span>
                        <span>
                          {entry.word_count_after.toLocaleString()} words (was {entry.word_count_before.toLocaleString()})
                          {wordPct !== 0 ? ` — ${wordPct > 0 ? "+" : ""}${wordPct}%` : ""}
                        </span>
                      </div>
                      {stateChanged ? (
                        <div className="topic-deepen-entry-row">
                          <span className="topic-deepen-entry-label">State</span>
                          <span className="topic-deepen-state-change">
                            {stateLabel(entry.state_before)} → {stateLabel(entry.state_after)}
                          </span>
                        </div>
                      ) : null}
                      {entry.enriched_file_details && entry.enriched_file_details.length > 0 ? (
                        <div className="topic-deepen-entry-row topic-deepen-entry-row-block">
                          <span className="topic-deepen-entry-label">Outputs updated</span>
                          <ul className="topic-deepen-enriched-list">
                            {entry.enriched_file_details.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (entry.enriched_files?.length ?? 0) > 0 ? (
                        <div className="topic-deepen-entry-row topic-deepen-entry-row-block">
                          <span className="topic-deepen-entry-label">Outputs updated</span>
                          <ul className="topic-deepen-enriched-list">
                            {entry.enriched_files.map((f) => (
                              <li key={f}>{f.split("/").pop()?.replace(/\.md$/, "").replace(/_/g, " ") ?? f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {entry.coverage_gaps_remaining && entry.coverage_gaps_remaining.length > 0 ? (
                        <div className="topic-deepen-entry-row topic-deepen-entry-row-block">
                          <span className="topic-deepen-entry-label">Gaps remaining</span>
                          <div className="topic-deepen-gaps">
                            {entry.coverage_gaps_remaining.map((g) => (
                              <span className="topic-card-gap-tag" key={g}>{g}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </>
          ) : (
            <div className="topic-card-deepened-stats">
              <span>{topic.metrics?.source_count ?? 0} sources</span>
              <span>{topic.metrics?.word_count ? `${Math.round(topic.metrics.word_count / 1000 * 10) / 10}k words` : "—"}</span>
              <span>State: {stateLabel(topic.state)}</span>
            </div>
          )}

          {(topic.sources?.length ?? 0) > 0 ? (
            <details className="topic-card-deepened-sources">
              <summary>{topic.sources.length} source{topic.sources.length === 1 ? "" : "s"} acquired</summary>
              <ul>
                {topic.sources.map((s) => {
                  const sourcePath = typeof s === "string" ? s : s.path;
                  const basename = sourcePath.split("/").pop() ?? sourcePath;
                  return <li key={sourcePath}>{basename.replace(/\.md$/, "").replace(/_/g, " ")}</li>;
                })}
              </ul>
            </details>
          ) : null}
          {topic.wiki_page ? (
            <button
              className="topic-view-wiki-button topic-deepened-wiki-link"
              onClick={() => onNavigateToFile(topic.wiki_page!)}
              type="button"
            >
              View Enriched Wiki Page
            </button>
          ) : null}
        </div>
      ) : null}

      {isSeed ? (
        <div className="topic-card-actions">
          <button
            className="topic-accept-button"
            disabled={saving}
            onClick={() => void handleResolve("accept")}
            type="button"
          >
            {saving ? "Saving…" : "Accept"}
          </button>
          <button
            className="topic-dismiss-button"
            disabled={saving}
            onClick={() => void handleResolve("dismiss")}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isActive ? (
        <div className="topic-card-actions">
          <button
            className={`topic-deepen-button${isRunningDeepen ? " topic-deepen-running" : topic.queued_for_deepen ? " topic-deepen-queued" : ""}`}
            disabled={saving || isRunningDeepen}
            onClick={() => onToggleQueue(topic.id)}
            title={isRunningDeepen ? "Deepening in progress…" : topic.queued_for_deepen ? "Remove from deepen queue" : "Add to deepen queue"}
            type="button"
          >
            {isRunningDeepen ? (<><span className="topic-deepen-spinner" /> Running</>) : topic.queued_for_deepen ? "Queued ✓" : "Go Deeper"}
          </button>
          {topic.wiki_page ? (
            <button
              className="topic-view-wiki-button"
              onClick={() => onNavigateToFile(topic.wiki_page!)}
              type="button"
            >
              View Wiki Page
            </button>
          ) : null}
          <button
            className="topic-park-button"
            disabled={saving}
            onClick={() => void handleDisposition("parked")}
            title="Defer — revisit this topic later"
            type="button"
          >
            Park
          </button>
          <button
            className="topic-settle-button"
            disabled={saving}
            onClick={() => void handleDisposition("settled")}
            title="Good enough — don't go deeper on this topic"
            type="button"
          >
            Settle
          </button>
          <button
            className="topic-deprecate-button"
            disabled={saving}
            onClick={() => void handleResolve("deprecate")}
            type="button"
          >
            Deprecate
          </button>
        </div>
      ) : null}

      {hasDisposition && !isDeprecated ? (
        <div className="topic-card-disposition-info">
          <span className="topic-card-disposition-note">
            {isParked ? "Parked" : "Settled"}{topic.disposition_at ? ` · ${formatLocalDateTime(topic.disposition_at, "")}` : ""}
            {topic.disposition_note ? ` — ${topic.disposition_note}` : ""}
          </span>
          <button
            className="topic-resume-button"
            disabled={saving}
            onClick={() => void handleDisposition(null)}
            type="button"
          >
            Resume
          </button>
        </div>
      ) : null}

      {isDeprecated && topic.deprecation ? (
        <span className="topic-card-deprecated-note">
          Deprecated: {topic.deprecation.reason ?? "unknown reason"}
          {topic.deprecation.deprecated_at ? ` · ${formatLocalDateTime(topic.deprecation.deprecated_at, "")}` : ""}
        </span>
      ) : null}
    </article>
  );
}
