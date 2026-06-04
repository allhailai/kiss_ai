import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildQuestion, RebuildModel, Topic } from "../contracts/api";
type ReviewTab = "attention" | "questions" | "topics";
import { QuestionsWorkspace } from "../features/questions/QuestionsWorkspace";
import { TopicsWorkspace } from "../features/topics/TopicsWorkspace";

const VALID_TABS = new Set<ReviewTab>(["attention", "questions", "topics"]);
const LEGACY_VIEW_TO_TAB: Record<string, ReviewTab> = { questions: "questions", topics: "topics" };

function parseTabFromHash(): ReviewTab {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  const routePart = (qIndex === -1 ? hash : hash.slice(0, qIndex)).replace(/^#\/?/, "");
  const params = qIndex === -1 ? new URLSearchParams() : new URLSearchParams(hash.slice(qIndex + 1));

  // Check explicit tab param first
  const t = params.get("tab") as ReviewTab | null;
  if (t && VALID_TABS.has(t)) return t;

  // Detect legacy routes: #/p/{slug}/questions → tab=questions
  const segments = routePart.split("/");
  const viewSegment = segments[0] === "p" && segments.length >= 3 ? segments[2] : segments[0];
  if (viewSegment && viewSegment in LEGACY_VIEW_TO_TAB) return LEGACY_VIEW_TO_TAB[viewSegment];

  return "attention";
}

function setTabInHash(tab: ReviewTab): void {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  const basePath = qIndex === -1 ? hash : hash.slice(0, qIndex);
  if (tab === "attention") {
    window.history.pushState(null, "", basePath);
  } else {
    window.history.pushState(null, "", `${basePath}?tab=${tab}`);
  }
}

function truncate(text: string | undefined | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

/* ── Summary Dashboard ────────────────────────────────────────────── */

function SummaryDashboard({
  questions,
  topics,
  onSwitchTab,
}: {
  questions: BuildQuestion[];
  topics: Topic[];
  onSwitchTab: (tab: ReviewTab) => void;
}) {
  // ── Topic stats ──────────────────────────────────
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
  const topicsWithGaps = topics.filter((t) => t.coverage_gaps.length > 0).length;
  const topicsQueued = topics.filter((t) => t.queued_for_deepen).length;
  const topicsParked = topics.filter((t) => t.disposition === "parked").length;
  const topicsSettled = topics.filter((t) => t.disposition === "settled").length;

  // ── Question stats ───────────────────────────────
  const openQuestions = questions.filter((q) => q.status === "open");
  const answeredQuestions = questions.filter((q) => q.status === "answered");
  const blockingCount = openQuestions.filter((q) => q.priority === "blocking").length;
  const importantCount = openQuestions.filter((q) => q.priority === "important").length;
  const informationalCount = openQuestions.filter((q) => q.priority === "informational").length;
  const latestQuestion = openQuestions.length > 0
    ? openQuestions.sort((a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime())[0]
    : null;



  return (
    <div className="review-summary-dashboard">
      {/* ── Topics Section ─────────────────────── */}
      <section className="review-summary-card review-summary-topics" onClick={() => onSwitchTab("topics")}>
        <div className="review-summary-card-header">
          <h3 className="review-summary-card-title">Research Topics</h3>
          <button
            className="review-summary-cta"
            onClick={() => onSwitchTab("topics")}
            type="button"
          >
            View Topics →
          </button>
        </div>

        <div className="review-topic-progress">
          <div className="review-topic-progress-header">
            <span className="review-topic-progress-title">Research Coverage</span>
            <span className="review-topic-progress-pct">{progressPct}% deep</span>
          </div>
          <div className="review-topic-progress-bar">
            <div
              className="review-topic-progress-fill review-topic-progress-saturated"
              style={{ width: totalTopics > 0 ? `${(topicsByState.saturated / totalTopics) * 100}%` : "0%" }}
            />
            <div
              className="review-topic-progress-fill review-topic-progress-deep"
              style={{ width: totalTopics > 0 ? `${(topicsByState.deep / totalTopics) * 100}%` : "0%" }}
            />
            <div
              className="review-topic-progress-fill review-topic-progress-shallow"
              style={{ width: totalTopics > 0 ? `${(topicsByState.shallow / totalTopics) * 100}%` : "0%" }}
            />
            <div
              className="review-topic-progress-fill review-topic-progress-seed"
              style={{ width: totalTopics > 0 ? `${(topicsByState.seed / totalTopics) * 100}%` : "0%" }}
            />
          </div>
          <div className="review-topic-progress-legend">
            <span><b className="review-dot review-dot-saturated" /> Complete ({topicsByState.saturated})</span>
            <span><b className="review-dot review-dot-deep" /> Well Covered ({topicsByState.deep})</span>
            <span><b className="review-dot review-dot-shallow" /> Getting Started ({topicsByState.shallow})</span>
            <span><b className="review-dot review-dot-seed" /> New ({topicsByState.seed})</span>
          </div>
        </div>

        <div className="review-summary-stats">
          <span className="review-summary-stat">
            {topicsByState.deep} deep · {topicsByState.shallow} shallow · {topicsByState.seed} seed · {topicsByState.saturated} saturated
          </span>
          {topicsWithGaps > 0 ? (
            <span className="review-summary-stat review-summary-stat-warn">
              {topicsWithGaps} topic{topicsWithGaps !== 1 ? "s" : ""} with coverage gaps
            </span>
          ) : null}
          {topicsQueued > 0 ? (
            <span className="review-summary-stat review-summary-stat-info">
              {topicsQueued} queued for deepening
            </span>
          ) : null}
          {topicsParked > 0 || topicsSettled > 0 ? (
            <span className="review-summary-stat review-summary-stat-muted">
              {topicsParked > 0 ? `${topicsParked} parked` : ""}{topicsParked > 0 && topicsSettled > 0 ? " · " : ""}{topicsSettled > 0 ? `${topicsSettled} settled` : ""}
            </span>
          ) : null}
        </div>
      </section>

      {/* ── Questions Section ──────────────────── */}
      <section className="review-summary-card review-summary-questions" onClick={() => onSwitchTab("questions")}>
        <div className="review-summary-card-header">
          <h3 className="review-summary-card-title">Questions for You</h3>
          <button
            className="review-summary-cta"
            onClick={() => onSwitchTab("questions")}
            type="button"
          >
            View Questions →
          </button>
        </div>

        {blockingCount > 0 ? (
          <div className="review-summary-hero review-summary-hero-blocking">
            <span className="review-summary-hero-number">{blockingCount}</span>
            <span className="review-summary-hero-label">need your input</span>
          </div>
        ) : null}

        <div className="review-summary-stats">
          <span className="review-summary-stat">
            {blockingCount} need your input · {importantCount} recommended · {informationalCount} optional
          </span>
          <span className="review-summary-stat">
            {answeredQuestions.length} of {questions.length} answered
          </span>
        </div>

        {latestQuestion ? (
          <div className="review-summary-preview">
            <span className="review-summary-preview-label">Latest</span>
            <p className="review-summary-preview-text">{truncate(latestQuestion.text, 120)}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/* ── Review Workspace ─────────────────────────────────────────────── */

export function ReviewWorkspace({
  models,
  onModelChange,
  onNavigateToFile,
  projectSlug,
  selectedModelId,
}: {
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  onNavigateToFile: (path: string) => void;
  projectSlug: string;
  selectedModelId: string;
}) {
  const [activeTab, setActiveTabState] = useState<ReviewTab>(parseTabFromHash);

  const setActiveTab = useCallback((tab: ReviewTab) => {
    setActiveTabState(tab);
    setTabInHash(tab);
  }, []);

  // Sync tab from URL on hashchange
  useEffect(() => {
    const onHashChange = () => {
      const t = parseTabFromHash();
      setActiveTabState(t);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  // Fetch summary counts for the header and summary dashboard
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
  const deepTopics = topics.filter((t) => t.state === "deep" || t.state === "saturated").length;
  const shallowTopics = topics.filter((t) => t.state === "shallow").length;
  const seedTopics = topics.filter((t) => t.state === "seed").length;

  // Tab order: Needs Attention, Topics, Questions
  const tabs: Array<{ id: ReviewTab; label: string; badge?: number; badgeClass?: string }> = [
    { id: "attention", label: "Overview" },
    { id: "topics", label: "Research Topics", badge: seedTopics > 0 ? seedTopics : undefined, badgeClass: "review-tab-badge-open" },
    { id: "questions", label: "Questions", badge: openQuestions > 0 ? openQuestions : undefined, badgeClass: blockingQuestions > 0 ? "review-tab-badge-blocking" : "review-tab-badge-open" },
  ];

  return (
    <div className="review-workspace">
      <header className="review-header">
        <h2>AI Review</h2>
        {summaryLoading ? (
          <p className="review-summary">Loading…</p>
        ) : (
          <p className="review-summary">
            {topics.length} topic{topics.length !== 1 ? "s" : ""}
            {topics.length > 0 ? ` (${deepTopics} well covered, ${shallowTopics} getting started${seedTopics > 0 ? `, ${seedTopics} new` : ""})` : ""}
            {" · "}
            {openQuestions} open question{openQuestions !== 1 ? "s" : ""}{blockingQuestions > 0 ? ` (${blockingQuestions} need your input)` : ""}
          </p>
        )}
      </header>

      <nav className="review-tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`review-tab${activeTab === tab.id ? " review-tab-active" : ""}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
            {tab.badge != null ? (
              <span className={`review-tab-badge ${tab.badgeClass ?? ""}`}>{tab.badge}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="review-tab-content" role="tabpanel">
        {activeTab === "attention" ? (
          summaryLoading ? (
            <div className="review-summary-dashboard"><p className="review-summary-loading">Loading summary…</p></div>
          ) : (
            <SummaryDashboard
              onSwitchTab={setActiveTab}
              questions={questions}
              topics={topics}
            />
          )
        ) : null}
        {activeTab === "topics" ? (
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
    </div>
  );
}

