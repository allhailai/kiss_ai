import { useEffect, useRef, useState } from "react";
import type { AgentCapability, AgentSession, ProjectFile, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { ChatComposer } from "../chat/ChatComposer";
import { ChatThread } from "../chat/ChatThread";

export function RightPanelAgentChat({
  models,
  onModelChange,
  projectFiles,
  projectSlug,
  selectedModelId,
}: {
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string;
  selectedModelId: string;
}) {
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [capabilityError, setCapabilityError] = useState("");
  const [draft, setDraft] = useState("");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCapabilityError("");

    void (async () => {
      try {
        const [capabilityResponse, sessionResponse] = await Promise.all([
          api.agentCapabilities(projectSlug),
          api.agentSession(projectSlug),
        ]);
        if (!cancelled) {
          setCapabilities(capabilityResponse.capabilities);
          setSession(sessionResponse);
        }
      } catch (error) {
        if (!cancelled) {
          setCapabilities([]);
          setCapabilityError(error instanceof Error ? error.message : "Could not load agent capabilities.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectSlug]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setCapabilityError("");
    try {
      setSession(await api.sendAgentSessionMessage(projectSlug, { content, modelId: selectedModelId || undefined }));
      setDraft("");
    } catch (error) {
      setCapabilityError(error instanceof Error ? error.message : "Could not send the agent message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="right-panel-agent-chat">
      <div className="right-panel-agent-thread">
        {capabilityError ? <p className="agent-event-status">Agent capabilities unavailable: {capabilityError}</p> : null}
        {!capabilityError && capabilities.length ? (
          <p className="agent-event-status">{capabilities.length} read-only agent capabilities available.</p>
        ) : null}
        <ChatThread
          disabled={sending}
          editable={false}
          emptyDescription="Ask the side-panel agent about this project."
          emptyTitle={session ? "Start agent chat" : "Loading agent session..."}
          messages={session?.messages ?? []}
        />
      </div>
      <ChatComposer
        contextFiles={projectFiles}
        contextRefs={[]}
        disabled={sending}
        draft={draft}
        models={models}
        onAddContextRef={() => undefined}
        onChangeDraft={(event) => setDraft(event.currentTarget.value)}
        onModelChange={onModelChange}
        onRemoveContextRef={() => undefined}
        onSelectedContextPathChange={() => undefined}
        onSubmit={() => void sendMessage()}
        placeholder="Ask the side-panel agent..."
        selectedContextPath=""
        selectedModelId={selectedModelId}
        showContextControls={false}
        submitLabel="Ask"
        textareaRef={textareaRef}
      />
    </div>
  );
}
