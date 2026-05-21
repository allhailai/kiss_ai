import { useCallback, useEffect, useRef, useState } from "react";
import type { Topic, TopicDisposition, TopicState } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { useBuildContext } from "../../app/contexts/BuildContext";

type TopicsFilter = "all" | "seeds" | "active" | "shallow" | "deep" | "queued" | "deepened" | "parked" | "settled" | "deprecated";

const VALID_FILTERS = new Set<TopicsFilter>(["all", "seeds", "active", "shallow", "deep", "queued", "deepened", "parked", "settled", "deprecated"]);

function parseFilterFromHash(): TopicsFilter {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return "all";
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  const f = params.get("filter") as TopicsFilter | null;
  return f && VALID_FILTERS.has(f) ? f : "all";
}

function setFilterInHash(filter: TopicsFilter): void {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  const basePath = qIndex === -1 ? hash : hash.slice(0, qIndex);
  if (filter === "all") {
    // Clean URL for default filter
    window.history.replaceState(null, "", basePath);
  } else {
    window.history.replaceState(null, "", `${basePath}?filter=${filter}`);
  }
}

function stateLabel(state: TopicState): string {
  switch (state) {
    case "seed": return "Seed";
    case "shallow": return "Shallow";
    case "deep": return "Deep";
    case "saturated": return "Saturated";
    case "split_candidate": return "Split Candidate";
    case "deprecated": return "Deprecated";
  }
}

function isActiveTopic(topic: Topic): boolean {
  const activeState = topic.state === "shallow" || topic.state === "deep" || topic.state === "saturated" || topic.state === "split_candidate";
  return activeState && !topic.disposition;
}

function TopicCard({
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

export function TopicsWorkspace({
  onNavigateToFile,
  projectSlug,
}: {
  onNavigateToFile: (path: string) => void;
  projectSlug: string;
}) {
  const { isBuilding, openBuildPanel } = useBuildContext();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilterState] = useState<TopicsFilter>(parseFilterFromHash);
  const [error, setError] = useState<string | null>(null);

  const setFilter = useCallback((f: TopicsFilter) => {
    setFilterState(f);
    setFilterInHash(f);
  }, []);

  // Sync filter from URL on popstate / hashchange
  useEffect(() => {
    const onHashChange = () => {
      const f = parseFilterFromHash();
      setFilterState(f);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const fetchTopics = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/topics`);
      if (!response.ok) throw new Error("Failed to load topics");
      const data = await response.json();
      setTopics(data.topics ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topics");
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void fetchTopics();
  }, [fetchTopics]);

  // Auto-refresh when a build finishes (isBuilding transitions true → false)
  const prevIsBuilding = useRef(isBuilding);
  useEffect(() => {
    if (prevIsBuilding.current && !isBuilding) {
      void fetchTopics();
    }
    prevIsBuilding.current = isBuilding;
  }, [isBuilding, fetchTopics]);

  const handleResolve = useCallback(
    async (topicId: string, action: "accept" | "dismiss" | "deprecate") => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/topics/${encodeURIComponent(topicId)}/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        if (!response.ok) throw new Error("Failed to resolve topic");
        await fetchTopics();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve topic");
      }
    },
    [projectSlug, fetchTopics],
  );

  const handleDisposition = useCallback(
    async (topicId: string, disposition: TopicDisposition) => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/topics/${encodeURIComponent(topicId)}/disposition`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disposition }),
          },
        );
        if (!response.ok) throw new Error("Failed to update disposition");
        await fetchTopics();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update disposition");
      }
    },
    [projectSlug, fetchTopics],
  );

  const handleToggleQueue = useCallback(
    async (topicId: string) => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/topics/${encodeURIComponent(topicId)}/queue-deepen`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "Failed to toggle deepen queue");
        }
        await fetchTopics();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle deepen queue");
      }
    },
    [projectSlug, fetchTopics],
  );

  const handleRunDeepen = useCallback(
    async () => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/rebuild/deepen`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "Failed to start batch deepen");
        }
        openBuildPanel();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start batch deepen");
      }
    },
    [projectSlug, openBuildPanel],
  );

  const handleDeepenAllShallow = useCallback(
    async () => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/topics/queue-all-shallow`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "Failed to queue shallow topics");
        }
        await fetchTopics();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to queue shallow topics");
      }
    },
    [projectSlug, fetchTopics],
  );

  const seedCount = topics.filter((t) => t.state === "seed").length;
  const activeCount = topics.filter((t) => isActiveTopic(t)).length;
  const shallowCount = topics.filter((t) => t.state === "shallow" && !t.disposition).length;
  const deepCount = topics.filter((t) => t.state === "deep" && !t.disposition).length;
  const queuedCount = topics.filter((t) => t.queued_for_deepen).length;
  const deepenedCount = topics.filter((t) => (t.discovery?.deepening_count ?? 0) > 0).length;
  const parkedCount = topics.filter((t) => t.disposition === "parked").length;
  const settledCount = topics.filter((t) => t.disposition === "settled").length;
  const deprecatedCount = topics.filter((t) => t.state === "deprecated").length;

  const filteredTopics = topics.filter((t) => {
    if (filter === "seeds") return t.state === "seed";
    if (filter === "active") return isActiveTopic(t);
    if (filter === "shallow") return t.state === "shallow" && !t.disposition;
    if (filter === "deep") return t.state === "deep" && !t.disposition;
    if (filter === "queued") return t.queued_for_deepen;
    if (filter === "deepened") return (t.discovery?.deepening_count ?? 0) > 0;
    if (filter === "parked") return t.disposition === "parked";
    if (filter === "settled") return t.disposition === "settled";
    if (filter === "deprecated") return t.state === "deprecated";
    return true;
  });

  // Sort logic depends on active filter
  const sortedTopics = [...filteredTopics].sort((a, b) => {
    // Parked/Settled filters: sort by disposition_at descending (most recently decided first)
    if (filter === "parked" || filter === "settled") {
      const aTime = a.disposition_at ? new Date(a.disposition_at).getTime() : 0;
      const bTime = b.disposition_at ? new Date(b.disposition_at).getTime() : 0;
      return bTime - aTime;
    }

    // Deepened filter: sort by last_deepened descending (most recently deepened first)
    if (filter === "deepened") {
      const aTime = a.discovery?.last_deepened ? new Date(a.discovery.last_deepened).getTime() : 0;
      const bTime = b.discovery?.last_deepened ? new Date(b.discovery.last_deepened).getTime() : 0;
      return bTime - aTime;
    }

    // Default sort: seeds first, then active by depth, then parked/settled, then deprecated
    const stateOrder: Record<string, number> = { seed: 0, shallow: 1, deep: 2, saturated: 3, split_candidate: 4, deprecated: 6 };
    const sa = stateOrder[a.state] ?? 5;
    const sb = stateOrder[b.state] ?? 5;

    // Disposition topics sort after active, before deprecated
    const dispositionPenalty = (t: Topic) => t.disposition ? 0.5 : 0;
    const adjustedSa = sa + dispositionPenalty(a);
    const adjustedSb = sb + dispositionPenalty(b);

    if (adjustedSa !== adjustedSb) return adjustedSa - adjustedSb;
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  if (loading) {
    return (
      <div className="topics-workspace">
        <p className="topics-loading">Loading topics…</p>
      </div>
    );
  }

  const filterLabels: Record<TopicsFilter, string> = {
    all: "All",
    seeds: "Seeds",
    active: "Active",
    shallow: "Shallow",
    deep: "Deep",
    queued: "Queued",
    deepened: "Deepened",
    parked: "Parked",
    settled: "Settled",
    deprecated: "Deprecated",
  };

  return (
    <div className="topics-workspace">
      <header className="topics-header">
        <h2>Topics</h2>
        <p className="topics-summary">
          {seedCount} seeds · {activeCount} active · {shallowCount} shallow · {deepCount} deep · {queuedCount} queued · {deepenedCount} deepened · {parkedCount} parked · {settledCount} settled · {deprecatedCount} deprecated · {topics.length} total
        </p>
        <div className="topics-filter-bar">
          {(["all", "seeds", "active", "shallow", "deep", "queued", "deepened", "parked", "settled", "deprecated"] as const).map((f) => (
            <button
              className={`topics-filter-button${filter === f ? " active" : ""}`}
              key={f}
              onClick={() => setFilter(f)}
              type="button"
            >
              {filterLabels[f]}
            </button>
          ))}
          <div className="topics-action-buttons">
            {shallowCount > 0 ? (
              <button
                className="topics-deepen-all-shallow-button"
                disabled={isBuilding}
                onClick={() => void handleDeepenAllShallow()}
                title={`Queue all ${shallowCount} shallow topic(s) for deepening`}
                type="button"
              >
                Queue All Shallow ({shallowCount})
              </button>
            ) : null}
            {queuedCount > 0 ? (
              <button
                className="topics-run-deepen-button"
                onClick={() => void handleRunDeepen()}
                title={`Run deepening on ${queuedCount} queued topic(s)`}
                type="button"
              >
                Run Deepening ({queuedCount})
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <p className="topics-error">{error}</p> : null}

      {sortedTopics.length === 0 ? (
        <div className="topics-empty">
          <p>
            {topics.length === 0
              ? "No topics yet. Run a build to discover topics from your project's evidence."
              : `No ${filter} topics.`}
          </p>
        </div>
      ) : (
        <div className="topics-list">
          {sortedTopics.map((t) => (
            <TopicCard
              allTopics={topics}
              isBuilding={isBuilding}
              key={t.id}
              onToggleQueue={handleToggleQueue}
              onDisposition={handleDisposition}
              onNavigateToFile={onNavigateToFile}
              onResolve={handleResolve}
              topic={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
