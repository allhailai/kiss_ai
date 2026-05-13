import { useEffect, useRef } from "react";
import type { AgentRunEvent, ProjectStatus, RebuildModel, RebuildState } from "../../contracts/api";
import { formatLocalDateTime, formatLocalTime } from "../../domain/formatters";
import { formatModelLabel, modelTierLabels } from "../../domain/modelLabels";
import { CompactModelPicker } from "../../shared/CompactModelPicker";
import { renderMarkdownMessageContent } from "../../shared/chat/chatRendering";
import { RightPanelModeSwitch, type RightPanelModeKind } from "../../shared/rightPanel/RightPanelModeSwitch";

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
  if (event.type === "assistant_message") return "Agent";
  if (event.type === "error") return "Error";
  if (event.type === "run_status") return event.title || "Run status";
  if (event.type === "tool_activity") return event.title || "Tool activity";
  if (event.type === "artifact_change") return event.title || "Artifact";
  return event.title || "System";
}

function getEventText(event: AgentRunEvent) {
  return event.text || event.title || event.status || "No details recorded.";
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
      return "Build complete";
    case "error":
      return "Build error";
    case "blocked":
      return "Build blocked";
    case "interrupted":
      return "Build interrupted";
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

export function BuildProjectRightPanel({
  models,
  onModelChange,
  onSelectPanel,
  onStart,
  rebuild,
  selectedModelId,
  status,
}: {
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  onSelectPanel: (kind: RightPanelModeKind) => void;
  onStart: () => void;
  rebuild: RebuildState | null;
  selectedModelId: string;
  status: ProjectStatus | null;
}) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const latestLogEntry = getLatestLogEntry(rebuild);
  const latestLogTimestamp = getLatestLogTimestamp(latestLogEntry);
  const buildRunning = Boolean(rebuild?.running);
  const startDisabled = buildRunning || !status?.cursorApiKeyAvailable || !selectedModelId || !models.length;
  const tone = completionTone(rebuild?.status);
  const completion = completionLabel(rebuild?.status);
  const completionMessage =
    rebuild?.status === "finished_with_attention" ? "The latest project build completed." : rebuild?.message || "The latest project build has reached a terminal state.";
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
          <h2>Build: requirements &gt; inputs &gt; outputs</h2>
        </div>
      </header>

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
                Build Project
              </button>
              <p>Start a build to stream agent progress here.</p>
            </div>
          ) : null}

          {rebuild?.events.map((event) => (
            <article className={`build-project-event build-project-event-${event.type}`} key={event.id}>
              <header>
                <strong>{getEventLabel(event)}</strong>
                <span>{formatLocalTime(event.updatedAt)}</span>
              </header>
              <div className="build-project-event-body">{renderMarkdownMessageContent(getEventText(event))}</div>
              {event.status === "streaming" ? <span className="build-project-event-status">Streaming</span> : null}
            </article>
          ))}

          {buildRunning ? <AgentThinkingCard /> : null}
        </div>
      </section>

      <section className="build-project-details" aria-label="Build details">
        <details>
          <summary>Runner details</summary>
          <div className="build-project-runner-grid">
            <div>
              <span>Status</span>
              <strong>{rebuild?.status ?? "idle"}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{rebuild?.modelId ?? (selectedModelId || "Not selected")}</strong>
            </div>
            <div>
              <span>Started</span>
              <strong>{formatLocalDateTime(rebuild?.startedAt, "Not recorded")}</strong>
            </div>
            <div>
              <span>{buildRunning ? "Elapsed" : "Duration"}</span>
              <strong>{formatRunDuration(rebuild)}</strong>
            </div>
            <div>
              <span>Last update</span>
              <strong>{formatLocalDateTime(latestLogTimestamp, "Not recorded")}</strong>
            </div>
          </div>
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
        </details>

        <details className="agent-debug-log">
          <summary>Raw runner log</summary>
          <pre className="run-log">{rebuild?.log.length ? rebuild.log.join("\n\n") : "No UI-started build log yet."}</pre>
        </details>
      </section>

      <section className="build-project-run-controls" aria-label="Run build project">
        <CompactModelPicker disabled={buildRunning || !status?.cursorApiKeyAvailable} models={models} onModelChange={onModelChange} selectedModelId={selectedModelId} />
        <div className="build-project-run-actions">
          {selectedModel ? (
            <p title={selectedModel.description}>
              {formatModelLabel(selectedModel)} · {modelTierLabels[selectedModel.tier]}
            </p>
          ) : null}
          <button className="build-project-build-button" disabled={startDisabled} onClick={onStart} type="button">
            {buildRunning ? "BUILDING" : "BUILD"}
          </button>
        </div>
      </section>
    </div>
  );
}
