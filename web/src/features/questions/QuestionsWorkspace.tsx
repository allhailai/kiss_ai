import { useCallback, useEffect, useRef, useState } from "react";
import type { BuildQuestion, RebuildModel } from "../../contracts/api";
import { projectsApi } from "../../data/projectsApi";
import { formatLocalDateTime } from "../../domain/formatters";
import { renderMarkdownMessageContent } from "../../shared/chat/chatRendering";
import { CompactModelPicker } from "../../shared/CompactModelPicker";

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
  models,
  onAnswer,
  onNavigateToFile,
  projectSlug,
  selectedModelId,
  onModelChange,
}: {
  question: BuildQuestion;
  models: RebuildModel[];
  onAnswer: (questionId: string, answer: string) => void;
  onNavigateToFile: (path: string) => void;
  projectSlug: string;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<string | null>(null);
  const [aiConfidenceReason, setAiConfidenceReason] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isOpen = question.status === "open";

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

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

  const handleAiAssist = useCallback(async () => {
    if (aiLoading || !selectedModelId) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnswer(null);
    setAiConfidence(null);
    setAiConfidenceReason(null);
    try {
      const result = await projectsApi.questionAiAssist(projectSlug, {
        modelId: selectedModelId,
        questionText: question.text,
        questionContext: question.context,
        userDraft: draft,
        relatedFiles: question.relatedFiles ?? [],
      });
      setAiAnswer(result.answer);
      setAiConfidence(result.confidence);
      setAiConfidenceReason(result.confidenceReason);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI Assist failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, selectedModelId, projectSlug, question.text, question.context, draft, question.relatedFiles]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyAnswer = useCallback(() => {
    if (!aiAnswer) return;
    onAnswer(question.id, aiAnswer);
    setDraft("");
    setAiAnswer(null);
    setAiConfidence(null);
    setAiConfidenceReason(null);
    setAiError(null);
  }, [aiAnswer, onAnswer, question.id]);

  const handleDismissAiAnswer = useCallback(() => {
    setAiAnswer(null);
    setAiConfidence(null);
    setAiConfidenceReason(null);
    setAiError(null);
  }, []);

  return (
    <article
      className={`question-card question-card-${question.status} question-card-priority-${question.priority}`}
    >
      <header className="question-card-header">
        <span className={`question-priority-pill question-priority-${question.priority}`}>
          {priorityLabel(question.priority)}
        </span>
        <span className={`question-status-pill question-status-${question.status}`}>
          {isOpen ? "Open" : question.status === "applied" ? "Applied" : question.answeredBy === "ai_auto" ? "AI Answered" : "Answered"}
        </span>
      </header>

      <p className="question-card-text">{question.text}</p>

      {question.context ? (
        <p className="question-card-context">{question.context}</p>
      ) : null}

      {question.relatedFiles?.length ? (
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
        {question.askedDuring?.phase ? <span>Phase {question.askedDuring.phase}</span> : null}
        {question.askedDuring?.modelId ? <span>{question.askedDuring.modelId}</span> : null}
      </div>

      {isOpen ? (
        <div className="question-card-answer-form">
          <textarea
            ref={textareaRef}
            className="question-card-answer-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer…"
            rows={3}
          />
          <div className="question-card-answer-actions">
            <button
              className="question-card-answer-submit"
              disabled={!draft.trim() || saving}
              onClick={handleSubmit}
              type="button"
            >
              {saving ? "Saving…" : "Save Answer"}
            </button>
            <div className="question-card-ai-controls">
              <CompactModelPicker
                disabled={aiLoading}
                models={models}
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
              <button
                className="question-card-ai-assist-button"
                disabled={aiLoading || !selectedModelId || !models.length}
                onClick={handleAiAssist}
                type="button"
              >
                {aiLoading ? "Working…" : "AI Assist"}
              </button>
            </div>
          </div>

          {aiLoading ? (
            <div className="question-card-ai-thinking" aria-label="AI is thinking">
              <div className="chat-thinking-indicator" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="question-card-ai-thinking-label">AI is thinking…</span>
            </div>
          ) : null}

          {aiError ? (
            <div className="question-card-ai-error">
              <span>{aiError}</span>
            </div>
          ) : null}

          {aiAnswer ? (
            <div className="question-card-ai-answer">
              <div className="question-card-ai-answer-header">
                <div className="question-card-ai-answer-meta">
                  <span className="question-card-ai-answer-label">AI Suggested Answer</span>
                  {aiConfidence ? (
                    <span className={`question-card-ai-confidence question-card-ai-confidence-${aiConfidence}`}>
                      Confidence: {aiConfidence.charAt(0).toUpperCase() + aiConfidence.slice(1)}
                    </span>
                  ) : null}
                </div>
                <div className="question-card-ai-answer-actions">
                  <button
                    className="question-card-ai-apply-button"
                    onClick={handleApplyAnswer}
                    type="button"
                  >
                    Apply Answer
                  </button>
                  <button
                    className="question-card-ai-dismiss-button"
                    onClick={handleDismissAiAnswer}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              {aiConfidenceReason ? (
                <p className="question-card-ai-confidence-reason">{aiConfidenceReason}</p>
              ) : null}
              <p className="question-card-ai-answer-text">{aiAnswer}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="question-card-answer-display">
          <div className="question-card-answer-display-header">
            <span className="question-card-answer-label">Answer</span>
            {!editing ? (
              <button
                className="question-card-edit-answer-button"
                onClick={() => {
                  setDraft(question.answer ?? "");
                  setEditing(true);
                }}
                type="button"
              >
                Edit Answer
              </button>
            ) : null}
          </div>
          {editing ? (
            <div className="question-card-answer-form">
              <textarea
                ref={textareaRef}
                className="question-card-answer-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Update your answer…"
                rows={4}
              />
              <div className="question-card-answer-actions">
                <div className="question-card-edit-actions">
                  <button
                    className="question-card-answer-submit"
                    disabled={!draft.trim() || saving}
                    onClick={async () => {
                      if (!draft.trim() || saving) return;
                      setSaving(true);
                      try {
                        onAnswer(question.id, draft.trim());
                        setEditing(false);
                        setDraft("");
                      } finally {
                        setSaving(false);
                      }
                    }}
                    type="button"
                  >
                    {saving ? "Saving…" : "Update Answer"}
                  </button>
                  <button
                    className="question-card-ai-dismiss-button"
                    onClick={() => {
                      setEditing(false);
                      setDraft("");
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                <div className="question-card-ai-controls">
                  <CompactModelPicker
                    disabled={aiLoading}
                    models={models}
                    onModelChange={onModelChange}
                    selectedModelId={selectedModelId}
                  />
                  <button
                    className="question-card-ai-assist-button"
                    disabled={aiLoading || !selectedModelId || !models.length}
                    onClick={handleAiAssist}
                    type="button"
                  >
                    {aiLoading ? "Working…" : "AI Assist"}
                  </button>
                </div>
              </div>

              {aiLoading ? (
                <div className="question-card-ai-thinking" aria-label="AI is thinking">
                  <div className="chat-thinking-indicator" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="question-card-ai-thinking-label">AI is thinking…</span>
                </div>
              ) : null}

              {aiError ? (
                <div className="question-card-ai-error">
                  <span>{aiError}</span>
                </div>
              ) : null}

              {aiAnswer ? (
                <div className="question-card-ai-answer">
                  <div className="question-card-ai-answer-header">
                    <div className="question-card-ai-answer-meta">
                      <span className="question-card-ai-answer-label">AI Suggested Answer</span>
                      {aiConfidence ? (
                        <span className={`question-card-ai-confidence question-card-ai-confidence-${aiConfidence}`}>
                          Confidence: {aiConfidence.charAt(0).toUpperCase() + aiConfidence.slice(1)}
                        </span>
                      ) : null}
                    </div>
                    <div className="question-card-ai-answer-actions">
                      <button
                        className="question-card-ai-apply-button"
                        onClick={handleApplyAnswer}
                        type="button"
                      >
                        Apply Answer
                      </button>
                      <button
                        className="question-card-ai-dismiss-button"
                        onClick={handleDismissAiAnswer}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                  {aiConfidenceReason ? (
                    <p className="question-card-ai-confidence-reason">{aiConfidenceReason}</p>
                  ) : null}
                  <p className="question-card-ai-answer-text">{aiAnswer}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="chat-markdown">{renderMarkdownMessageContent(question.answer ?? "")}</div>
          )}
          {question.answeredAt ? (
            <span className="question-card-answered-at">
              {question.answeredBy === "ai_auto" ? "Auto-answered by AI" : "Answered"}{" "}
              {formatLocalDateTime(question.answeredAt, "")}
            </span>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function QuestionsWorkspace({
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
  const answeredCount = questions.filter((q) => q.status === "answered" || q.status === "applied").length;

  const filteredQuestions = questions.filter((q) => {
    if (filter === "open") return q.status === "open";
    if (filter === "answered") return q.status === "answered" || q.status === "applied";
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
              models={models}
              onAnswer={handleAnswer}
              onModelChange={onModelChange}
              onNavigateToFile={onNavigateToFile}
              projectSlug={projectSlug}
              question={q}
              selectedModelId={selectedModelId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
