import { useCallback, useState } from "react";
import type { Topic } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { isActiveTopic, stateLabel } from "./topicHelpers";

export function TopicCard({
  topic,
  allTopics,
  isBuilding,
  onToggleQueue,
  onResolve,
  onNavigateToFile,
  onAddToChatContext,
}: {
  topic: Topic;
  allTopics: Topic[];
  isBuilding: boolean;
  onToggleQueue: (topicId: string) => void;
  onResolve: (topicId: string, action: "accept" | "dismiss" | "deprecate") => void;
  onNavigateToFile: (path: string) => void;
  onAddToChatContext: (topicId: string, label: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isSeed = topic.state === "seed";
  const isActive = isActiveTopic(topic);
  const isDeprecated = topic.state === "deprecated";
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



  const dependencyLabels = topic.depends_on
    .map((depId) => {
      const dep = allTopics.find((t) => t.id === depId);
      return dep ? { id: depId, label: dep.label } : { id: depId, label: depId };
    });

  const cardClassName = [
    "topic-card",
    `topic-card-${topic.state}`,
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
      </header>

      <p className="topic-card-label">{topic.label}</p>

      {topic.details ? (
        <div className="topic-card-details">
          <strong className="topic-card-details-label">Details</strong>
          <p className="topic-card-details-text">{topic.details}</p>
        </div>
      ) : null}

      {topic.state !== "deprecated" && topic.state !== "seed" ? (() => {
        const sourceCount = topic.metrics?.source_count ?? 0;
        const sourceTypes = topic.metrics?.source_types ?? [];
        const dataPoints = topic.metrics?.data_point_count ?? 0;
        const gapCount = topic.coverage_gaps?.length ?? 0;
        const crossRefs = topic.metrics?.cross_references ?? 0;
        const hasContrarian = topic.metrics?.has_contrarian_evidence ?? false;

        const criteria = [
          {
            label: "Source diversity",
            met: sourceCount >= 3 && sourceTypes.length >= 2,
            value: `${sourceCount} sources, ${sourceTypes.length} type${sourceTypes.length !== 1 ? "s" : ""}`,
            target: "≥3 sources, ≥2 types",
          },
          {
            label: "Evidence specificity",
            met: dataPoints >= 2,
            value: `${dataPoints} data point${dataPoints !== 1 ? "s" : ""}`,
            target: "≥2 cited data points",
          },
          {
            label: "Coverage gaps",
            met: gapCount <= 1,
            value: gapCount === 0 ? "none" : `${gapCount} gap${gapCount !== 1 ? "s" : ""}`,
            target: "≤1 gap",
          },
          {
            label: "Cross-referencing",
            met: crossRefs >= 1,
            value: `${crossRefs} ref${crossRefs !== 1 ? "s" : ""}`,
            target: "≥1 dependency ref",
          },
          {
            label: "Contrarian evidence",
            met: hasContrarian,
            value: hasContrarian ? "documented" : "none",
            target: "≥1 counterargument",
          },
        ];
        const metCount = criteria.filter((c) => c.met).length;

        return (
          <div className="topic-depth-tracker">
            <div className="topic-depth-tracker-header">
              <span className="topic-depth-tracker-title">Deep criteria</span>
              <span className={`topic-depth-tracker-score${metCount === criteria.length ? " topic-depth-tracker-complete" : ""}`}>
                {metCount}/{criteria.length}
              </span>
            </div>
            <div className="topic-depth-tracker-list">
              {criteria.map((c) => (
                <div className={`topic-depth-criterion${c.met ? " topic-depth-criterion-met" : ""}`} key={c.label}>
                  <span className="topic-depth-criterion-icon">{c.met ? "✓" : "✗"}</span>
                  <span className="topic-depth-criterion-label">{c.label}</span>
                  <span className="topic-depth-criterion-value">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })() : null}

      {topic.metrics?.last_updated ? (
        <div className="topic-card-meta-row">
          <span>Updated: {formatLocalDateTime(topic.metrics.last_updated, "—")}</span>
          <span>Origin: {topic.discovery?.origin ?? "unknown"}</span>
        </div>
      ) : null}

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
              {topic.deepen_log.map((entry, idx) => {
                const wordBefore = entry.word_count_before ?? 0;
                const wordAfter = entry.word_count_after ?? 0;
                const wordDelta = wordAfter - wordBefore;
                const wordPct = wordBefore > 0
                  ? Math.round((wordDelta / wordBefore) * 100)
                  : 0;
                const stateChanged = entry.state_before !== entry.state_after;
                const isLatest = idx === 0;
                const hasWordData = entry.word_count_after != null;
                const sourcesAdded = entry.sources_added ?? 0;
                const sourcesTotal = entry.sources_total ?? 0;
                // Array is newest-first, so the previous run is at idx+1
                const prevTotal = topic.deepen_log[idx + 1]?.sources_total ?? 0;
                const sourceDelta = sourcesAdded > 0 ? sourcesAdded : Math.max(0, sourcesTotal - prevTotal);
                const runNumber = topic.deepen_log.length - idx;

                // Build a meaningful summary string
                const summaryParts: string[] = [];
                if (sourceDelta > 0) {
                  summaryParts.push(`+${sourceDelta} sources`);
                }
                if (hasWordData && wordDelta > 0) {
                  summaryParts.push(`+${wordDelta.toLocaleString()} words`);
                }
                if (stateChanged) {
                  summaryParts.push(`${stateLabel(entry.state_before)} → ${stateLabel(entry.state_after)}`);
                }
                if (summaryParts.length === 0) {
                  summaryParts.push("no changes");
                }

                return (
                  <details
                    className="topic-deepen-entry"
                    key={entry.deepened_at}
                    open={isLatest}
                  >
                    <summary className="topic-deepen-entry-summary">
                      <span className="topic-deepen-entry-date">
                        Run #{runNumber} · {formatLocalDateTime(entry.deepened_at, "")}
                      </span>
                      <span className="topic-deepen-entry-stats">
                        {summaryParts.join(" · ")}
                      </span>
                    </summary>
                    <div className="topic-deepen-entry-body">
                      <div className="topic-deepen-entry-row">
                        <span className="topic-deepen-entry-label">Sources</span>
                        <span>
                          {sourceDelta > 0
                            ? `${sourceDelta} new (${sourcesTotal} total)`
                            : sourcesTotal > 0
                              ? `${sourcesTotal} total`
                              : "none found"}
                        </span>
                      </div>
                      {hasWordData ? (
                        <div className="topic-deepen-entry-row">
                          <span className="topic-deepen-entry-label">Wiki</span>
                          <span>
                            {wordAfter.toLocaleString()} words (was {wordBefore.toLocaleString()})
                            {wordPct !== 0 ? ` — ${wordPct > 0 ? "+" : ""}${wordPct}%` : ""}
                          </span>
                        </div>
                      ) : null}
                      {entry.source_types && entry.source_types.length > 0 ? (
                        <div className="topic-deepen-entry-row">
                          <span className="topic-deepen-entry-label">Types</span>
                          <span>{entry.source_types.join(", ")}</span>
                        </div>
                      ) : null}
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
                            {entry.enriched_file_details.map((detail: string) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (entry.enriched_files?.length ?? 0) > 0 ? (
                        <div className="topic-deepen-entry-row topic-deepen-entry-row-block">
                          <span className="topic-deepen-entry-label">Outputs updated</span>
                          <ul className="topic-deepen-enriched-list">
                            {entry.enriched_files?.map((f: string) => (
                              <li key={f}>{f.split("/").pop()?.replace(/\.md$/, "").replace(/_/g, " ") ?? f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {entry.coverage_gaps_remaining && entry.coverage_gaps_remaining.length > 0 ? (
                        <div className="topic-deepen-entry-row topic-deepen-entry-row-block">
                          <span className="topic-deepen-entry-label">Gaps remaining</span>
                          <div className="topic-deepen-gaps">
                            {entry.coverage_gaps_remaining.map((g: string) => (
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
                  const basename = (sourcePath.split("/").pop() ?? sourcePath).replace(/\.md$/, "");

                  // Parse URL-encoded filename: domain__path_segments
                  const parts = basename.split("__");
                  const domain = parts[0]?.replace(/_/g, ".") ?? "";
                  const pathPart = parts.slice(1).join("__");

                  // Clean up the path into a readable title
                  let title = pathPart
                    .replace(/_/g, " ")       // underscores → spaces
                    .replace(/\b(html|htm|php|asp|aspx|pdf|json)\b/gi, "") // strip extensions
                    .replace(/\b(index|default|view)\b/gi, "")  // strip generic page names
                    .replace(/\s{2,}/g, " ")  // collapse whitespace
                    .trim();

                  // Capitalize first letter
                  if (title) {
                    title = title.charAt(0).toUpperCase() + title.slice(1);
                    // Truncate long titles
                    if (title.length > 60) title = title.slice(0, 57) + "…";
                  }

                  const label = title ? `${title} — ${domain}` : domain;

                  return <li key={sourcePath} title={basename}>{label}</li>;
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
            className="topic-deprecate-button"
            disabled={saving}
            onClick={() => void handleResolve("deprecate")}
            type="button"
          >
            Deprecate
          </button>
          <button
            className="topic-add-to-chat-button"
            onClick={() => onAddToChatContext(topic.id, topic.label)}
            type="button"
          >
            + Chat Context
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
