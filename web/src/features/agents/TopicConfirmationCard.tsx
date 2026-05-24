import { useCallback, useState } from "react";
import type { CreateTopicResponse, TopicDuplicate } from "../../contracts/api";
import { projectsApi } from "../../data/projectsApi";

type TopicConfirmationCardProps = {
  projectSlug: string;
  /** Pre-filled label from the agent conversation */
  initialLabel?: string;
  /** Pre-filled justification from the agent */
  initialJustification?: string;
  /** Whether a build/deepen is currently running */
  isBuilding?: boolean;
  /** Conversation ID to link back to discovery context */
  conversationId?: string | null;
  /** Called after successful topic creation */
  onCreated?: (topic: CreateTopicResponse) => void;
  /** Called when the user clicks "View in Topics" */
  onNavigateToTopics?: () => void;
  /** Called when the user clicks "Go Deeper Now" */
  onDeepenNow?: (topicId: string) => void;
  /** Called when the user cancels the card */
  onCancel?: () => void;
};

type CardState = "input" | "duplicates" | "created" | "error";

export function TopicConfirmationCard({
  projectSlug,
  initialLabel = "",
  initialJustification = "",
  isBuilding = false,
  conversationId = null,
  onCreated,
  onNavigateToTopics,
  onDeepenNow,
  onCancel,
}: TopicConfirmationCardProps) {
  const [label, setLabel] = useState(initialLabel);
  const [justification, setJustification] = useState(initialJustification);
  const [cardState, setCardState] = useState<CardState>("input");
  const [duplicates, setDuplicates] = useState<TopicDuplicate[]>([]);
  const [forceCreate, setForceCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTopic, setCreatedTopic] = useState<CreateTopicResponse | null>(null);
  const [requestedDeepen, setRequestedDeepen] = useState(false);

  const handleCreate = useCallback(
    async (force: boolean, andDeepen: boolean) => {
      if (!label.trim() || saving) return;
      setSaving(true);
      setError(null);

      try {
        const result = await projectsApi.createTopic(projectSlug, {
          label: label.trim(),
          justification: justification.trim() || undefined,
          conversationId,
          force,
        });

        if (!result.created && result.duplicates.length > 0) {
          setDuplicates(result.duplicates);
          setCardState("duplicates");
          setSaving(false);
          return;
        }

        if (result.error) {
          setError(result.error);
          setCardState("error");
          setSaving(false);
          return;
        }

        setCreatedTopic(result);
        setCardState("created");
        setRequestedDeepen(andDeepen);
        onCreated?.(result);

        if (andDeepen && result.topic?.id) {
          onDeepenNow?.(result.topic.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create topic.");
        setCardState("error");
      } finally {
        setSaving(false);
      }
    },
    [label, justification, conversationId, projectSlug, saving, onCreated, onDeepenNow],
  );

  if (cardState === "created" && createdTopic?.topic) {
    const deepeningActive = requestedDeepen && isBuilding;
    return (
      <div className={`topic-confirmation-card topic-confirmation-created${deepeningActive ? " topic-confirmation-deepening" : ""}`}>
        <div className="topic-confirmation-header">
          <span className="topic-confirmation-icon" aria-hidden="true">{deepeningActive ? "⏳" : "✅"}</span>
          <strong>{deepeningActive ? "Topic Created — Deepening" : "Topic Created"}</strong>
        </div>
        <p className="topic-confirmation-created-label">{createdTopic.topic.label}</p>
        <div className="topic-confirmation-created-meta">
          <span>State: Shallow</span>
          <span>Origin: Chat</span>
          {deepeningActive ? (
            <span className="topic-confirmation-deepening-badge">Deepening in progress…</span>
          ) : requestedDeepen ? (
            <span>Deepening queued</span>
          ) : null}
        </div>
        <div className="topic-confirmation-actions">
          {onDeepenNow && !requestedDeepen ? (
            <button
              className="topic-confirmation-deepen-button"
              disabled={isBuilding}
              onClick={() => {
                setRequestedDeepen(true);
                onDeepenNow(createdTopic.topic!.id);
              }}
              type="button"
            >
              {isBuilding ? "Build running…" : "Go Deeper Now"}
            </button>
          ) : null}
          {onNavigateToTopics ? (
            <button
              className="topic-confirmation-view-button"
              onClick={onNavigateToTopics}
              type="button"
            >
              View in Topics
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (cardState === "duplicates") {
    return (
      <div className="topic-confirmation-card topic-confirmation-duplicates">
        <div className="topic-confirmation-header">
          <span className="topic-confirmation-icon" aria-hidden="true">⚠️</span>
          <strong>Potentially Similar Topics</strong>
        </div>
        <p className="topic-confirmation-notice">
          These existing topics look similar to &ldquo;{label.trim()}&rdquo;:
        </p>
        <ul className="topic-confirmation-duplicate-list">
          {duplicates.map((dup) => (
            <li key={dup.id}>
              <strong>{dup.label}</strong>
              <span className={`topic-state-pill topic-state-${dup.state}`}>{dup.state}</span>
              {dup.disposition ? (
                <span className={`topic-disposition-pill topic-disposition-${dup.disposition}`}>{dup.disposition}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <label className="topic-confirmation-force-label">
          <input
            checked={forceCreate}
            onChange={(e) => setForceCreate(e.target.checked)}
            type="checkbox"
          />
          Create anyway — I know this is different
        </label>
        <div className="topic-confirmation-actions">
          <button
            className="topic-confirmation-create-button"
            disabled={!forceCreate || saving}
            onClick={() => void handleCreate(true, false)}
            type="button"
          >
            {saving ? "Creating…" : "Create Topic"}
          </button>
          <button
            className="topic-confirmation-cancel-button"
            disabled={saving}
            onClick={() => {
              setCardState("input");
              setForceCreate(false);
            }}
            type="button"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="topic-confirmation-card">
      <div className="topic-confirmation-header">
        <span className="topic-confirmation-icon" aria-hidden="true">🔬</span>
        <strong>New Topic</strong>
      </div>
      {error ? <p className="topic-confirmation-error">{error}</p> : null}
      <div className="topic-confirmation-field">
        <label htmlFor="topic-label-input">Topic Name</label>
        <input
          autoFocus
          disabled={saving}
          id="topic-label-input"
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g., Market dynamics in renewable energy"
          type="text"
          value={label}
        />
      </div>
      <div className="topic-confirmation-field">
        <label htmlFor="topic-justification-input">Why is this a topic? <small>(optional)</small></label>
        <textarea
          disabled={saving}
          id="topic-justification-input"
          onChange={(e) => setJustification(e.target.value)}
          placeholder="How does this connect to your project goals?"
          rows={2}
          value={justification}
        />
      </div>
      <div className="topic-confirmation-actions">
        <button
          className="topic-confirmation-deepen-button"
          disabled={!label.trim() || saving}
          onClick={() => void handleCreate(false, true)}
          type="button"
        >
          {saving ? "Creating…" : "Create & Deepen"}
        </button>
        <button
          className="topic-confirmation-create-button"
          disabled={!label.trim() || saving}
          onClick={() => void handleCreate(false, false)}
          type="button"
        >
          {saving ? "Creating…" : "Create"}
        </button>
        {onCancel ? (
          <button
            className="topic-confirmation-cancel-button"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
