import { useCallback, useEffect, useRef, useState } from "react";
import type { Topic } from "../../contracts/api";
import { useBuildContext } from "../../app/contexts/BuildContext";
import { TopicConfirmationCard } from "../../shared/TopicConfirmationCard";
import { projectsApi } from "../../data/projectsApi";
import { TopicCard } from "./TopicCard";
import { type TopicsFilter, isActiveTopic, parseFilterFromHash, setFilterInHash } from "./topicHelpers";

export function TopicsWorkspace({
  onNavigateToFile,
  onAddTopicToChat,
  projectSlug,
  refreshKey = 0,
}: {
  onNavigateToFile: (path: string) => void;
  onAddTopicToChat: (topicId: string, label: string) => void;
  projectSlug: string;
  refreshKey?: number;
}) {
  const build = useBuildContext();
  const { isBuilding, openBuildPanel } = build;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilterState] = useState<TopicsFilter>(parseFilterFromHash);
  const [error, setError] = useState<string | null>(null);
  const [showNewTopicForm, setShowNewTopicForm] = useState(false);

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

  // Re-fetch when refreshKey changes (e.g. after agent edits topic details)
  const prevRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (prevRefreshKey.current !== refreshKey) {
      void fetchTopics();
    }
    prevRefreshKey.current = refreshKey;
  }, [refreshKey, fetchTopics]);

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


  const handleToggleQueue = useCallback(
    async (topicId: string) => {
      const topic = topics.find((t) => t.id === topicId);
      const wasQueued = topic?.queued_for_deepen;

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

        // If we just queued (not dequeued), automatically kick off the build
        if (!wasQueued) {
          build.startRebuild();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle deepen queue");
      }
    },
    [projectSlug, fetchTopics, topics, build],
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

  const handleDeepenNow = useCallback(
    async (topicId: string) => {
      try {
        await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/topics/${encodeURIComponent(topicId)}/queue-deepen`,
          { method: "POST" },
        );
        build.startRebuild();
      } catch {
        // Best-effort queue
      }
    },
    [projectSlug, build],
  );

  const needsReviewCount = topics.filter((t) => t.state === "seed").length;
  const activeCount = topics.filter((t) => isActiveTopic(t)).length;
  const shallowCount = topics.filter((t) => t.state === "shallow").length;
  const deepCount = topics.filter((t) => t.state === "deep").length;
  const inProgressCount = topics.filter((t) => t.queued_for_deepen).length;
  const archivedCount = topics.filter((t) => t.state === "deprecated").length;

  const filteredTopics = topics.filter((t) => {
    if (filter === "needs_review") return t.state === "seed";
    if (filter === "active") return isActiveTopic(t);
    if (filter === "shallow") return t.state === "shallow";
    if (filter === "deep") return t.state === "deep";
    if (filter === "in_progress") return t.queued_for_deepen;
    if (filter === "archived") return t.state === "deprecated";
    return true;
  });

  // Sort logic depends on active filter
  const sortedTopics = [...filteredTopics].sort((a, b) => {
    // Archived filter: sort by disposition_at descending (most recently decided first)
    if (filter === "archived") {
      const aTime = a.disposition_at ? new Date(a.disposition_at).getTime() : (a.deprecation?.deprecated_at ? new Date(a.deprecation.deprecated_at).getTime() : 0);
      const bTime = b.disposition_at ? new Date(b.disposition_at).getTime() : (b.deprecation?.deprecated_at ? new Date(b.deprecation.deprecated_at).getTime() : 0);
      return bTime - aTime;
    }

    // Default sort: seeds first, then active by depth, then deprecated
    const stateOrder: Record<string, number> = { seed: 0, shallow: 1, deep: 2, saturated: 3, split_candidate: 4, deprecated: 6 };
    const sa = stateOrder[a.state] ?? 5;
    const sb = stateOrder[b.state] ?? 5;

    if (sa !== sb) return sa - sb;
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

  const filterConfig: Array<{ id: TopicsFilter; label: string; count: number; warn?: boolean }> = [
    { id: "all", label: "All", count: topics.length },
    { id: "needs_review", label: "Needs Review", count: needsReviewCount, warn: needsReviewCount > 0 },
    { id: "active", label: "Active", count: activeCount },
    { id: "in_progress", label: "In Progress", count: inProgressCount },
    { id: "archived", label: "Archived", count: archivedCount },
  ];

  return (
    <div className="topics-workspace">
      <header className="topics-header">
        <h2>Topics</h2>
        <p className="topics-summary">
          {topics.length} topic{topics.length !== 1 ? "s" : ""}
          {activeCount > 0 ? (
            <>
              {" \u00b7 "}{activeCount} active (
              <button
                className={`topics-summary-link${filter === "deep" ? " active" : ""}`}
                onClick={() => setFilter(filter === "deep" ? "active" : "deep")}
                type="button"
              >
                {deepCount} deep
              </button>
              ,{" "}
              <button
                className={`topics-summary-link${filter === "shallow" ? " active" : ""}`}
                onClick={() => setFilter(filter === "shallow" ? "active" : "shallow")}
                type="button"
              >
                {shallowCount} shallow
              </button>
              )
            </>
          ) : null}
          {inProgressCount > 0 ? <>{" \u00b7 "}{inProgressCount} in deepening queue</> : null}
          {needsReviewCount > 0 ? <>{" \u00b7 "}{needsReviewCount} awaiting review</> : null}
        </p>
        <div className="topics-filter-row">
          <div className="topics-filter-bar">
            {filterConfig.map((f) => (
              <button
                className={`topics-filter-button${filter === f.id ? " active" : ""}`}
                key={f.id}
                onClick={() => setFilter(f.id)}
                type="button"
              >
                {f.label}
                {f.count > 0 ? (
                  <span className={`topics-filter-badge${f.warn ? " topics-filter-badge-warn" : ""}`}>
                    {f.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <button
            className={`topics-new-topic-button${showNewTopicForm ? " active" : ""}`}
            onClick={() => setShowNewTopicForm((prev) => !prev)}
            title={showNewTopicForm ? "Close new topic form" : "Create a new research topic"}
            type="button"
          >
            {showNewTopicForm ? "Cancel" : "+ New Topic"}
          </button>
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
            {inProgressCount > 0 ? (
              <button
                className="topics-run-deepen-button"
                onClick={() => void handleRunDeepen()}
                title={`Run deepening on ${inProgressCount} queued topic(s)`}
                type="button"
              >
                Run Deepening ({inProgressCount})
              </button>
            ) : null}
          </div>
        </div>
        {showNewTopicForm ? (
          <div className="topics-new-topic-form">
            <TopicConfirmationCard
              projectSlug={projectSlug}
              isBuilding={isBuilding}
              listTopics={projectsApi.topics}
              createTopic={projectsApi.createTopic}
              onCreated={() => {
                setShowNewTopicForm(false);
                void fetchTopics();
              }}
              onDeepenNow={handleDeepenNow}
              onCancel={() => setShowNewTopicForm(false)}
            />
          </div>
        ) : null}
      </header>

      {error ? <p className="topics-error">{error}</p> : null}

      {sortedTopics.length === 0 ? (
        <div className="topics-empty">
          <p>
            {topics.length === 0
              ? "No topics yet. Run a build to discover topics from your project's evidence."
              : `No ${filterConfig.find((f) => f.id === filter)?.label.toLowerCase() ?? filter} topics.`}
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
              onNavigateToFile={onNavigateToFile}
              onResolve={handleResolve}
              onAddToChatContext={onAddTopicToChat}
              topic={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
