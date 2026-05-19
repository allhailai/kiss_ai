import { useCallback, useEffect, useState } from "react";
import type { BuildQuestion } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import "./QuestionsWorkspace.css";

type QuestionsFilter = "all" | "open" | "answered";

function priorityLabel(priority: BuildQuestion["priority"]) {
  switch (priority) {
    case "blocking":
      return "Blocking";
    case "important":
      return "Important";
    default:
      return "Informational";
  }
}

function QuestionCard({
  question,
  onAnswer,
  onNavigateToFile,
}: {
  question: BuildQuestion;
  onAnswer: (questionId: string, answer: string) => void;
  onNavigateToFile: (path: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const isOpen = question.status === "open";

  const handleSubmit = useCallback(async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      onAnswer(question.id, draft.trim());
      setDraft("");
    } finally {
      setSaving(false);
    }
  }, [draft, saving, onAnswer, question.id]);

  return (
    <article
      className={`question-card question-card-${question.status} question-card-priority-${question.priority}`}
    >
      <header className="question-card-header">
        <span className={`question-priority-pill question-priority-${question.priority}`}>
          {priorityLabel(question.priority)}
        </span>
        <span className={`question-status-pill question-status-${question.status}`}>
          {isOpen ? "Open" : "Answered"}
        </span>
      </header>

      <p className="question-card-text">{question.text}</p>

      {question.context ? (
        <p className="question-card-context">{question.context}</p>
      ) : null}

      {question.relatedFiles.length > 0 ? (
        <div className="question-card-related">
          <span className="question-card-related-label">Related files:</span>
          {question.relatedFiles.map((file) => (
            <button
              className="question-card-file-link"
              key={file}
              onClick={() => onNavigateToFile(file)}
              type="button"
            >
              {file.split("/").pop()}
            </button>
          ))}
        </div>
      ) : null}

      <div className="question-card-meta">
        <span>Asked {formatLocalDateTime(question.askedAt, "Unknown")}</span>
        {question.askedDuring.phase ? <span>Phase {question.askedDuring.phase}</span> : null}
        {question.askedDuring.modelId ? <span>{question.askedDuring.modelId}</span> : null}
      </div>

      {isOpen ? (
        <div className="question-card-answer-form">
          <textarea
            className="question-card-answer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer…"
            rows={3}
          />
          <button
            className="question-card-answer-submit"
            disabled={!draft.trim() || saving}
            onClick={handleSubmit}
            type="button"
          >
            {saving ? "Saving…" : "Save Answer"}
          </button>
        </div>
      ) : (
        <div className="question-card-answer-display">
          <span className="question-card-answer-label">Answer</span>
          <p>{question.answer}</p>
          {question.answeredAt ? (
            <span className="question-card-answered-at">
              Answered {formatLocalDateTime(question.answeredAt, "")}
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function QuestionsWorkspace({
  projectSlug,
  onNavigateToFile,
}: {
  projectSlug: string;
  onNavigateToFile: (path: string) => void;
}) {
  const [questions, setQuestions] = useState<BuildQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuestionsFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/questions`);
      if (!response.ok) throw new Error("Failed to load questions");
      const data = await response.json();
      setQuestions(data.questions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  const handleAnswer = useCallback(
    async (questionId: string, answer: string) => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/questions/${encodeURIComponent(questionId)}/answer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer }),
          },
        );
        if (!response.ok) throw new Error("Failed to save answer");

        // Refresh the list
        await fetchQuestions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save answer");
      }
    },
    [projectSlug, fetchQuestions],
  );

  const openCount = questions.filter((q) => q.status === "open").length;
  const answeredCount = questions.filter((q) => q.status === "answered").length;

  const filteredQuestions = questions.filter((q) => {
    if (filter === "open") return q.status === "open";
    if (filter === "answered") return q.status === "answered";
    return true;
  });

  // Sort: open first, then by priority (blocking > important > informational), then by date
  const priorityOrder = { blocking: 0, important: 1, informational: 2 };
  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const pa = priorityOrder[a.priority] ?? 2;
    const pb = priorityOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime();
  });

  if (loading) {
    return (
      <div className="questions-workspace">
        <p className="questions-loading">Loading questions…</p>
      </div>
    );
  }

  return (
    <div className="questions-workspace">
      <header className="questions-header">
        <h2>Questions</h2>
        <p className="questions-summary">
          {openCount} open · {answeredCount} resolved · {questions.length} total
        </p>
        <div className="questions-filter-bar">
          {(["all", "open", "answered"] as const).map((f) => (
            <button
              className={`questions-filter-button${filter === f ? " active" : ""}`}
              key={f}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === "all" ? "All" : f === "open" ? "Open" : "Answered"}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="questions-error">{error}</p> : null}

      {sortedQuestions.length === 0 ? (
        <div className="questions-empty">
          <p>
            {questions.length === 0
              ? "No questions yet. Run a build to generate questions from the AI."
              : `No ${filter} questions.`}
          </p>
        </div>
      ) : (
        <div className="questions-list">
          {sortedQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              onAnswer={handleAnswer}
              onNavigateToFile={onNavigateToFile}
              question={q}
            />
          ))}
        </div>
      )}
    </div>
  );
}
