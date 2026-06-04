import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildQuestion, RebuildModel, Topic } from "../contracts/api";
import type { AiTab } from "../navigation/views";
import type { ProjectChatController } from "./hooks/useProjectChat";
import { QuestionsWorkspace } from "../features/questions/QuestionsWorkspace";
import { TopicsWorkspace } from "../features/topics/TopicsWorkspace";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { EmptyProjectGuide } from "../features/onboarding/EmptyProjectGuide";
import { useUxPreferences } from "./contexts/UxPreferencesContext";
import { useBuildContext } from "./contexts/BuildContext";

const VALID_TABS = new Set<AiTab>(["conversations", "topics", "questions"]);

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
  showTopics,
  onSwitchTab,
}: {
  questions: BuildQuestion[];
  topics: Topic[];
  showTopics: boolean;
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
      {showTopics ? (
        <section className="ai-summary-card" onClick={() => onSwitchTab("topics")}>
          <div className="ai-summary-card-header">
            <h3 className="ai-summary-card-title">Research Areas</h3>
            <button
              className="ai-summary-cta"
              onClick={(e) => { e.stopPropagation(); onSwitchTab("topics"); }}
              type="button"
            >
              View →
            </button>
          </div>
          <div className="ai-summary-stats">
            <span className="ai-summary-stat">{totalTopics} area{totalTopics !== 1 ? "s" : ""} being researched · {progressPct}% complete</span>

          </div>
        </section>
      ) : null}

      <section className="ai-summary-card" onClick={() => onSwitchTab("questions")}>
        <div className="ai-summary-card-header">
          <h3 className="ai-summary-card-title">Needs Your Input</h3>
          <button
            className="ai-summary-cta"
            onClick={(e) => { e.stopPropagation(); onSwitchTab("questions"); }}
            type="button"
          >
            {openQuestions.length > 0 ? "Answer →" : "View →"}
          </button>
        </div>
        <div className="ai-summary-stats">
          {blockingCount > 0 ? (
            <span className="ai-summary-stat ai-summary-stat-warn">{blockingCount} required before next update</span>
          ) : null}
            <span className="ai-summary-stat">
              {blockingCount} required · {importantCount} recommended · {informationalCount} optional
            </span>
          <span className="ai-summary-stat">
              {answeredQuestions.length} of {questions.length} answered
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
  projectChat,
  projectSlug,
  selectProjectChatConversation,
  selectedModelId,
}: {
  context: Record<string, string>;
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  onNavigateToFile: (path: string) => void;
  projectChat: ProjectChatController;
  projectSlug: string;
  selectProjectChatConversation: (conversationId: string) => void;
  selectedModelId: string;
}) {
  const { preferences } = useUxPreferences();
  const build = useBuildContext();
  const hasNeverBuilt = !build.status?.lastSuccessfulRunAt;
  const [activeTab, setActiveTabState] = useState<AiTab>(() => parseTabFromContext(context));

  // Sync from context on external navigation (e.g. legacy URL redirects)
  useEffect(() => {
    const t = parseTabFromContext(context);
    setActiveTabState(t);
  }, [context]);

  // If user navigated to hidden Topics tab but preference is off, redirect
  useEffect(() => {
    if (activeTab === "topics" && !preferences.showTopics) {
      setActiveTabState("conversations");
    }
  }, [activeTab, preferences.showTopics]);

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
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);

    Promise.all([
      fetch(`/api/projects/${encodeURIComponent(projectSlug)}/questions`).then((r) => r.ok ? r.json() : { questions: [] }),
      fetch(`/api/projects/${encodeURIComponent(projectSlug)}/topics`).then((r) => r.ok ? r.json() : { topics: [] }),
    ]).then(([qData, tData]) => {
      if (cancelled) return;
      setQuestions(qData.questions ?? []);
      setTopics(tData.topics ?? []);
      setSummaryLoading(false);
    }).catch(() => {
      if (!cancelled) setSummaryLoading(false);
    });

    return () => { cancelled = true; };
  }, [projectSlug]);

  const openQuestions = questions.filter((q) => q.status === "open").length;
  const blockingQuestions = questions.filter((q) => q.status === "open" && q.priority === "blocking").length;
  const seedTopics = topics.filter((t) => t.state === "seed").length;

  // Build tabs dynamically based on preferences
  const tabs: Array<{ id: AiTab; label: string; badge?: number; badgeClass?: string }> = [
    { id: "conversations", label: "Chat History" },
  ];

  if (preferences.showTopics) {
    tabs.push({ id: "topics", label: "Research Areas", badge: seedTopics > 0 ? seedTopics : undefined, badgeClass: "ai-tab-badge-open" });
  }

  tabs.push({ id: "questions", label: "Needs Your Input", badge: openQuestions > 0 ? openQuestions : undefined, badgeClass: blockingQuestions > 0 ? "ai-tab-badge-blocking" : "ai-tab-badge-open" });

  return (
    <div className="ai-workspace">
      <header className="ai-workspace-header">
        <h2>Welcome back</h2>
        {summaryLoading ? (
          <p className="ai-workspace-summary">Loading…</p>
        ) : (
          <p className="ai-workspace-summary">
            {openQuestions > 0
              ? `You have ${openQuestions} item${openQuestions !== 1 ? "s" : ""} that need${openQuestions === 1 ? "s" : ""} your attention`
              : "Everything is up to date"}
          </p>
        )}
      </header>

      {hasNeverBuilt && !summaryLoading ? (
        <EmptyProjectGuide
          models={build.models}
          status={build.status}
          onOpenBuild={build.openBuildPanel}
          onConnectionChange={build.refreshStatus}
        />
      ) : (
        <>
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
                showTopics={preferences.showTopics}
                onSwitchTab={setActiveTab}
              />
            ) : null}
            <div className="chat-history-workspace">
              <ProjectChatConversationHistory chat={projectChat} onSelectConversation={selectProjectChatConversation} />
            </div>
          </>
        ) : null}
        {activeTab === "topics" && preferences.showTopics ? (
          <TopicsWorkspace
            onNavigateToFile={onNavigateToFile}
            projectSlug={projectSlug}
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
      </div>
      </>
      )}
    </div>
  );
}
