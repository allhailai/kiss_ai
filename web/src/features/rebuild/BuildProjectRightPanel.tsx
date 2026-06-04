import { useEffect, useRef } from "react";
import type { AgentRunEvent, ProjectStatus, RebuildModel, RebuildState } from "../../contracts/api";
import { formatLocalDateTime, formatLocalTime } from "../../domain/formatters";
import { formatModelLabel, modelTierLabels } from "../../domain/modelLabels";
import { CompactModelPicker } from "../../shared/CompactModelPicker";
import { renderMarkdownMessageContent } from "../../shared/chat/chatRendering";
import { RightPanelModeSwitch, type RightPanelModeKind } from "../../shared/rightPanel/RightPanelModeSwitch";
import { BuildPhaseTracker } from "./BuildPhaseTracker";
import { useUxPreferences } from "../../app/contexts/UxPreferencesContext";

function formatRunDuration(rebuild: RebuildState | null) {
  if (!rebuild?.startedAt) return "Not started";

  const startedAt = new Date(rebuild.startedAt).getTime();
  const finishedAt = rebuild.finishedAt ? new Date(rebuild.finishedAt).getTime() : Date.now();

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt < startedAt) return "Unknown";

  const totalSeconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function getLatestLogEntry(rebuild: RebuildState | null) {
  return rebuild?.log.at(-1) ?? null;
}

function getLatestLogTimestamp(entry: string | null) {
  return entry?.match(/^\[([^\]]+)\]/)?.[1] ?? null;
}

function getLatestLogText(entry: string | null) {
  return entry?.replace(/^\[[^\]]+\]\s*/, "").trim() || "No log entries yet.";
}

function getEventLabel(event: AgentRunEvent) {
  if (event.type === "run_status" && event.status === "finished_with_attention") return "Research updated";
  if (event.type === "assistant_message") return "Update details";
  if (event.type === "error") return "Something went wrong";
  if (event.type === "run_status") return event.title || "Progress";
  if (event.type === "tool_activity") return event.title || "Working...";
  if (event.type === "artifact_change") return event.title || "Document update";
  return event.title || "Progress";
}

function getEventText(event: AgentRunEvent) {
  if (event.type === "run_status" && event.status === "finished_with_attention") {
    return "Research has been updated. Review notes are available if you want to improve source quality or project settings.";
  }
  if (event.type === "error") {
    return "The update couldn't finish. You can try again, or check the details below for more information.";
  }
  return event.text || event.title || event.status || "No details recorded.";
}

/** Statuses that should be collapsed when consecutive */
const COLLAPSIBLE_STATUSES = new Set(["fetching_sources", "generating_digests"]);

type CollapsedItem =
  | { type: "event"; event: AgentRunEvent }
  | { type: "collapsed"; id: string; latest: AgentRunEvent; count: number };

/**
 * Groups consecutive system events with the same collapsible status into a
 * single entry showing the latest progress value. Non-collapsible events
 * pass through unchanged.
 */
function collapseConsecutiveProgressEvents(events: AgentRunEvent[]): CollapsedItem[] {
  const result: CollapsedItem[] = [];

  let i = 0;
  while (i < events.length) {
    const event = events[i];
    if (event.type === "system" && event.status && COLLAPSIBLE_STATUSES.has(event.status)) {
      // Collect the run of consecutive events with this status
      const status = event.status;
      let j = i;
      while (j < events.length && events[j].type === "system" && events[j].status === status) {
        j++;
      }
      const count = j - i;
      const latest = events[j - 1];
      result.push({ type: "collapsed", id: `collapsed-${latest.id}`, latest, count });
      i = j;
    } else {
      result.push({ type: "event", event });
      i++;
    }
  }

  return result;
}

function completionTone(status: RebuildState["status"] | undefined) {
  switch (status) {
    case "finished":
    case "finished_with_attention":
      return "success";
    case "error":
    case "blocked":
    case "interrupted":
      return "danger";
    default:
      return null;
  }
}

function completionLabel(status: RebuildState["status"] | undefined) {
  switch (status) {
    case "finished":
    case "finished_with_attention":
      return "Research updated";
    case "error":
      return "Update error";
    case "blocked":
      return "Update blocked";
    case "interrupted":
      return "Update interrupted";
    default:
      return null;
  }
}

function CopyableValue({ value }: { value: string }) {
  const copyValue = () => {
    void navigator.clipboard?.writeText(value);
  };

  return (
    <span className="copyable-value">
      <code>{value}</code>
      <button aria-label={`Copy ${value}`} onClick={copyValue} title={`Copy ${value}`} type="button" />
    </span>
  );
}

function AgentThinkingCard() {
  return (
    <article className="build-project-agent-thinking" aria-label="Agent is building">
      <header>
        <strong>Agent</strong>
      </header>
      <div className="chat-thinking-indicator" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function BuildProjectEventBody({ event }: { event: AgentRunEvent }) {
  const content = getEventText(event);

  if (event.type === "assistant_message" || event.type === "error") {
    const technicalText = event.text || event.title || event.status || "";
    return (
      <div className="build-project-event-body">
        <p>
          {event.type === "error"
            ? "The update stopped before finishing. You can try again, or expand this section if you need the technical runner message."
            : "The agent recorded update details. Expand this section if you need the technical log."}
        </p>
        {technicalText ? (
          <details className="build-project-technical-event">
            <summary>Technical details</summary>
            <div>{renderMarkdownMessageContent(technicalText)}</div>
          </details>
        ) : null}
      </div>
    );
  }

  return <div className="build-project-event-body">{renderMarkdownMessageContent(content)}</div>;
}

export function BuildProjectRightPanel({
  models,
  onCancel,
  onModelChange,
  onOpenQuestions,
  onSelectPanel,
  onStart,
  rebuild,
  selectedModelId,
  status,
}: {
  models: RebuildModel[];
  onCancel: () => void;
  onModelChange: (modelId: string) => void;
  onOpenQuestions: () => void;
  onSelectPanel: (kind: RightPanelModeKind) => void;
  onStart: () => void;
  rebuild: RebuildState | null;
  selectedModelId: string;
  status: ProjectStatus | null;
}) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const { preferences } = useUxPreferences();
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const latestLogEntry = getLatestLogEntry(rebuild);
  const latestLogTimestamp = getLatestLogTimestamp(latestLogEntry);
  const buildRunning = Boolean(rebuild?.running);
  const startDisabled = buildRunning || !status?.cursorApiKeyAvailable || !selectedModelId || !models.length;
  const tone = completionTone(rebuild?.status);
  const completion = completionLabel(rebuild?.status);
  const completionMessage =
    rebuild?.status === "finished_with_attention"
      ? "Research has been updated. Review notes are available if you want to improve source quality or project settings."
      : rebuild?.message || "The latest research update has reached a terminal state.";
  const hasEvents = Boolean(rebuild?.events.length);
  const hasLog = Boolean(rebuild?.log.length);

  useEffect(() => {
    if (!streamRef.current || !buildRunning) return;
    streamRef.current.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [buildRunning, rebuild?.events.length, rebuild?.log.length]);

  return (
    <div className="build-project-panel">
      <header className="build-project-panel-header">
        <RightPanelModeSwitch activeKind="build-project" onSelect={onSelectPanel} />
        <div>
          <h2>Update Research</h2>
        </div>
      </header>

      {(status?.openQuestionsCount ?? 0) > 0 ? (
        <div className={`build-project-questions-callout${(status?.blockingQuestionsCount ?? 0) > 0 ? " build-project-questions-blocking" : ""}`}>
          <div>
            <strong>
              {(status?.blockingQuestionsCount ?? 0) > 0
                ? `${status!.blockingQuestionsCount} blocking question${status!.blockingQuestionsCount === 1 ? "" : "s"}`
                : `${status!.openQuestionsCount} unanswered question${status!.openQuestionsCount === 1 ? "" : "s"}`}
            </strong>
            <p>Answer before the next update for best results.</p>
          </div>
          <button onClick={onOpenQuestions} type="button">Answer</button>
        </div>
      ) : null}

      <section className="build-project-stream-shell">
        {tone && completion ? (
          <div className={`build-project-completion build-project-completion-${tone}`} role="status">
            <strong>{completion}</strong>
            <p>{completionMessage}</p>
          </div>
        ) : null}

        <div className="build-project-stream" aria-live="polite" ref={streamRef}>
          {!hasEvents && !hasLog && !buildRunning ? (
            <div className="build-project-empty">
              <button className="build-project-empty-action" disabled={startDisabled} onClick={onStart} type="button">
              Update Research
            </button>
            <p>Start a research update to gather sources and build knowledge pages.</p>
            </div>
          ) : null}

          {collapseConsecutiveProgressEvents(rebuild?.events ?? []).map((item) =>
            item.type === "collapsed" ? (
              <article className="build-project-event build-project-event-system build-project-event-collapsed" key={item.id}>
                <header>
                  <strong>{item.latest.title}</strong>
                  <span>{formatLocalTime(item.latest.updatedAt)}</span>
                </header>
                {item.count > 1 ? (
                  <div className="build-project-event-body build-project-collapsed-count">
                    {item.count} progress updates collapsed
                  </div>
                ) : null}
              </article>
            ) : (
              <article className={`build-project-event build-project-event-${item.event.type}`} key={item.event.id}>
                <header>
                  <strong>{getEventLabel(item.event)}</strong>
                  <span>{formatLocalTime(item.event.updatedAt)}</span>
                </header>
                <BuildProjectEventBody event={item.event} />
                {item.event.status === "streaming" ? <span className="build-project-event-status">Streaming</span> : null}
              </article>
            ),
          )}

          {buildRunning ? <AgentThinkingCard /> : null}
        </div>
      </section>

      <BuildPhaseTracker rebuild={rebuild} />

      <section className="build-project-details" aria-label="Update details">
        <details>
          <summary>Update Details</summary>

          <div className="build-project-details-compact">
            <span className="build-project-detail-item">
              <span className="build-project-detail-label">Status</span>
              <strong>{rebuild?.status ?? "idle"}</strong>
            </span>
            <span className="build-project-detail-item">
              <span className="build-project-detail-label">Model</span>
              <strong>{rebuild?.modelId ?? (selectedModelId || "—")}</strong>
            </span>
            <span className="build-project-detail-item">
              <span className="build-project-detail-label">Started</span>
              <strong>{formatLocalDateTime(rebuild?.startedAt, "—")}</strong>
            </span>
            <span className="build-project-detail-item">
              <span className="build-project-detail-label">{buildRunning ? "Elapsed" : "Duration"}</span>
              <strong>{formatRunDuration(rebuild)}</strong>
            </span>
          </div>
          <p className="build-project-detail-footnote">
            Last update: {formatLocalDateTime(latestLogTimestamp, "Not recorded")}
          </p>

          {status?.annotationCounts ? (
            <div className="build-project-details-annotation-section">
              <strong className="build-project-details-annotation-heading">Annotation Summary</strong>
              {status.buildNotes ? <p className="build-project-annotation-notes">{status.buildNotes}</p> : null}
              <div className="build-project-annotation-stats">
                <div className="build-project-annotation-stat" title="Human [FEEDBACK] comments found in output files that will be incorporated into the next build.">
                  <span className="build-project-annotation-stat-value">{status.annotationCounts.feedbackApplied}</span>
                  <span className="build-project-annotation-stat-label">Comments applied</span>
                </div>
                <div className="build-project-annotation-stat" title="Coverage gaps written to topics.json for the pipeline to auto-fetch on the next build.">
                  <span className="build-project-annotation-stat-value">{status.annotationCounts.coverageGapsWritten}</span>
                  <span className="build-project-annotation-stat-label">Coverage gaps</span>
                </div>
                <div className="build-project-annotation-stat" title="Actions the AI took autonomously (file splits, wiki pages created, etc.).">
                  <span className="build-project-annotation-stat-value">{status.annotationCounts.autonomousActions}</span>
                  <span className="build-project-annotation-stat-label">Autonomous actions</span>
                </div>
              </div>
            </div>
          ) : null}

          <details className="build-project-extra-details">
            <summary>Even more details =)</summary>
            <p className="build-project-technical-details">
              <span>
                Run ID: <CopyableValue value={rebuild?.runId ?? "Not started yet"} />
              </span>
              <span>
                Cursor SDK agent: <CopyableValue value={rebuild?.agentId ?? "Not created yet"} />
              </span>
            </p>
            <div className="build-project-latest-log">
              <span>Latest runner message</span>
              <p>{getLatestLogText(latestLogEntry)}</p>
            </div>
            <details className="agent-debug-log">
              <summary>Raw runner log</summary>
              <pre className="run-log">{rebuild?.log.length ? rebuild.log.join("\n\n") : "No UI-started build log yet."}</pre>
            </details>
          </details>
        </details>
      </section>

      <section className="build-project-run-controls" aria-label="Update research">
        {preferences.showModelPicker ? (
          <CompactModelPicker disabled={buildRunning || !status?.cursorApiKeyAvailable} models={models} onModelChange={onModelChange} selectedModelId={selectedModelId} />
        ) : null}
        <div className="build-project-run-actions">
          {preferences.showModelPicker && selectedModel ? (
            <p title={selectedModel.description}>
              {formatModelLabel(selectedModel)} · {modelTierLabels[selectedModel.tier]}
            </p>
          ) : null}
          {buildRunning ? (
            <button className="build-project-stop-button" onClick={onCancel} type="button">
              STOP
            </button>
          ) : (
            <button className="build-project-build-button" disabled={startDisabled} onClick={onStart} type="button">
              UPDATE RESEARCH
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
