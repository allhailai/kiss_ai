import type { AgentRunEvent } from "../../contracts/api";

function formatLocalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
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

function renderParagraphs(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) return <p>No details recorded.</p>;

  return paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>);
}

export function AgentTranscript({ events, log }: { events: AgentRunEvent[]; log: string[] }) {
  const hasEvents = events.length > 0;

  return (
    <section className="content-card agent-transcript-card">
      <div className="section-heading">
        <div>
          <h3>Agent conversation</h3>
          <p>Live feedback is grouped into readable agent messages and compact run milestones.</p>
        </div>
      </div>

      <div className="agent-transcript" aria-live="polite">
        {hasEvents ? (
          events.map((event) => (
            <article className={`agent-event agent-event-${event.type}`} key={event.id}>
              <header>
                <strong>{getEventLabel(event)}</strong>
                <span>{formatLocalTime(event.updatedAt)}</span>
              </header>
              <div className="agent-event-body">{renderParagraphs(getEventText(event))}</div>
              {event.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
            </article>
          ))
        ) : (
          <p className="agent-transcript-empty">No UI-started rebuild conversation yet.</p>
        )}
      </div>

      <details className="agent-debug-log">
        <summary>Raw runner log</summary>
        <pre className="run-log">{log.length ? log.join("\n\n") : "No UI-started rebuild log yet."}</pre>
      </details>
    </section>
  );
}
