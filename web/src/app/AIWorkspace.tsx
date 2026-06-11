import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildQuestion, RebuildModel, Topic } from "../contracts/api";
import type { AiTab } from "../navigation/views";
import type { ProjectChatController } from "./hooks/useProjectChat";
import { QuestionsWorkspace } from "../features/questions/QuestionsWorkspace";
import { TopicsWorkspace } from "../features/topics/TopicsWorkspace";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { FailedSourcesWorkspace, FailedSource } from "../features/questions/FailedSourcesWorkspace";

const VALID_TABS = new Set<AiTab>(["conversations", "topics", "questions", "failed-sources"]);

function parseTabFromContext(context: Record<string, string>): AiTab {
  const t = context.tab as AiTab | undefined;
  if (t && VALID_TABS.has(t)) return t;
  return "conversations";
}

function truncate(text: string | undefined | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

/* ── Summary Cards (inline at top of Conversations tab) ────────── */

function AiSummaryCards({
  questions,
  topics,
  onSwitchTab,
}: {
  questions: BuildQuestion[];
  topics: Topic[];
  onSwitchTab: (tab: AiTab) => void;
}) {
  const topicsByState = useMemo(() => {
    const counts = { seed: 0, shallow: 0, deep: 0, saturated: 0, other: 0 };
    for (const t of topics) {
      if (t.state in counts) {
        counts[t.state as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    }
    return counts;
  }, [topics]);

  const totalTopics = topics.length;
  const progressPct = totalTopics > 0
    ? Math.round(((topicsByState.deep + topicsByState.saturated) / totalTopics) * 100)
    : 0;

  const openQuestions = questions.filter((q) => q.status === "open");
  const blockingCount = openQuestions.filter((q) => q.priority === "blocking").length;
  const importantCount = openQuestions.filter((q) => q.priority === "important").length;
  const informationalCount = openQuestions.filter((q) => q.priority === "informational").length;
  const answeredQuestions = questions.filter((q) => q.status === "answered");

  return (
    <div className="ai-summary-cards">
      <section className="ai-summary-card" onClick={() => onSwitchTab("topics")}>
        <div className="ai-summary-card-header">
          <h3 className="ai-summary-card-title">Topics</h3>
          <button
            className="ai-summary-cta"
            onClick={(e) => { e.stopPropagation(); onSwitchTab("topics"); }}
            type="button"
          >
            View →
          </button>
        </div>
        <div className="ai-summary-stats">
          <span className="ai-summary-stat">{totalTopics} total · {progressPct}% deep</span>
          <span className="ai-summary-stat">
            {topicsByState.deep} deep · {topicsByState.shallow} shallow · {topicsByState.seed} seed
          </span>
        </div>
      </section>

      <section className="ai-summary-card" onClick={() => onSwitchTab("questions")}>
        <div className="ai-summary-card-header">
          <h3 className="ai-summary-card-title">Questions</h3>
          <button
            className="ai-summary-cta"
            onClick={(e) => { e.stopPropagation(); onSwitchTab("questions"); }}
            type="button"
          >
            View →
          </button>
        </div>
        <div className="ai-summary-stats">
          {blockingCount > 0 ? (
            <span className="ai-summary-stat ai-summary-stat-warn">{blockingCount} blocking</span>
          ) : null}
          <span className="ai-summary-stat">
            {blockingCount} blocking · {importantCount} important · {informationalCount} info
          </span>
          <span className="ai-summary-stat">
            {answeredQuestions.length} of {questions.length} resolved
          </span>
        </div>
      </section>
    </div>
  );
}

/* ── AI Workspace ─────────────────────────────────────────────── */

export function AIWorkspace({
  context,
  models,
  onModelChange,
  onNavigateToFile,
  onAddTopicToChat,
  onNewTopicViaChat,
  projectChat,
  projectSlug,
  selectProjectChatConversation,
  selectedModelId,
  topicsRefreshKey,
}: {
  context: Record<string, string>;
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  onNavigateToFile: (path: string) => void;
  onAddTopicToChat: (topicId: string, label: string) => void;
  onNewTopicViaChat: () => void;
  projectChat: ProjectChatController;
  projectSlug: string;
  selectProjectChatConversation: (conversationId: string) => void;
  selectedModelId: string;
  topicsRefreshKey: number;
}) {
  const [activeTab, setActiveTabState] = useState<AiTab>(() => parseTabFromContext(context));

  // Sync from context on external navigation (e.g. legacy URL redirects)
  useEffect(() => {
    const t = parseTabFromContext(context);
    setActiveTabState(t);
  }, [context]);

  const setActiveTab = useCallback((tab: AiTab) => {
    setActiveTabState(tab);
    // Update URL with tab param
    const hash = window.location.hash;
    const qIndex = hash.indexOf("?");
    const basePath = qIndex === -1 ? hash : hash.slice(0, qIndex);
    if (tab === "conversations") {
      window.history.pushState(null, "", basePath);
    } else {
      window.history.pushState(null, "", `${basePath}?tab=${tab}`);
    }
  }, []);

  // Fetch summary counts for the summary cards
  const [questions, setQuestions] = useState<BuildQuestion[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [failedSources, setFailedSources] = useState<FailedSource[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetchFailedSources = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/failed-sources`);
      if (r.ok) {
        const data = await r.json();
        setFailedSources(data.failedSources ?? []);
      }
    } catch {
      // Ignore
    }
  }, [projectSlug]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);

    Promise.all([
      fetch(`/api/projects/${encodeURIComponent(projectSlug)}/questions`).then((r) => r.ok ? r.json() : { questions: [] }),
      fetch(`/api/projects/${encodeURIComponent(projectSlug)}/topics`).then((r) => r.ok ? r.json() : { topics: [] }),
      fetch(`/api/projects/${encodeURIComponent(projectSlug)}/failed-sources`).then((r) => r.ok ? r.json() : { failedSources: [] }),
    ]).then(([qData, tData, fsData]) => {
      if (cancelled) return;
      setQuestions(qData.questions ?? []);
      setTopics(tData.topics ?? []);
      setFailedSources(fsData.failedSources ?? []);
      setSummaryLoading(false);
    }).catch(() => {
      if (!cancelled) setSummaryLoading(false);
    });

    return () => { cancelled = true; };
  }, [projectSlug]);

  const openQuestions = questions.filter((q) => q.status === "open").length;
  const blockingQuestions = questions.filter((q) => q.status === "open" && q.priority === "blocking").length;
  const seedTopics = topics.filter((t) => t.state === "seed").length;
  const failedSourcesCount = failedSources.length;

  const tabs: Array<{ id: AiTab; label: string; badge?: number; badgeClass?: string }> = [
    { id: "conversations", label: "Conversations" },
    { id: "topics", label: "Topics", badge: seedTopics > 0 ? seedTopics : undefined, badgeClass: "ai-tab-badge-open" },
    { id: "questions", label: "Questions", badge: openQuestions > 0 ? openQuestions : undefined, badgeClass: blockingQuestions > 0 ? "ai-tab-badge-blocking" : "ai-tab-badge-open" },
    { id: "failed-sources", label: "Failed Sources", badge: failedSourcesCount > 0 ? failedSourcesCount : undefined, badgeClass: "ai-tab-badge-blocking" },
  ];

  return (
    <div className="ai-workspace">
      <header className="ai-workspace-header">
        <h2>AI</h2>
        {summaryLoading ? (
          <p className="ai-workspace-summary">Loading…</p>
        ) : (
          <p className="ai-workspace-summary">
            {topics.length} topic{topics.length !== 1 ? "s" : ""}
            {" · "}
            {openQuestions} open question{openQuestions !== 1 ? "s" : ""}
            {blockingQuestions > 0 ? ` (${blockingQuestions} blocking)` : ""}
          </p>
        )}
      </header>

      <nav className="ai-tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`ai-tab${activeTab === tab.id ? " ai-tab-active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
            {tab.badge != null ? (
              <span className={`ai-tab-badge ${tab.badgeClass ?? ""}`}>{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="ai-tab-content" role="tabpanel">
        {activeTab === "conversations" ? (
          <>
            {!summaryLoading ? (
              <AiSummaryCards
                questions={questions}
                topics={topics}
                onSwitchTab={setActiveTab}
              />
            ) : null}
            <div className="chat-history-workspace">
              <ProjectChatConversationHistory chat={projectChat} onSelectConversation={selectProjectChatConversation} />
            </div>
          </>
        ) : null}
        {activeTab === "topics" ? (
          <TopicsWorkspace
            onNavigateToFile={onNavigateToFile}
            onAddTopicToChat={onAddTopicToChat}
            onNewTopicViaChat={onNewTopicViaChat}
            projectSlug={projectSlug}
            refreshKey={topicsRefreshKey}
          />
        ) : null}
        {activeTab === "questions" ? (
          <QuestionsWorkspace
            models={models}
            onModelChange={onModelChange}
            onNavigateToFile={onNavigateToFile}
            projectSlug={projectSlug}
            selectedModelId={selectedModelId}
          />
        ) : null}
        {activeTab === "failed-sources" ? (
          <FailedSourcesWorkspace
            projectSlug={projectSlug}
            failedSources={failedSources}
            onRefresh={fetchFailedSources}
          />
        ) : null}
      </div>
    </div>
  );
}
