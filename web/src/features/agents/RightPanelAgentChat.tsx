import { useEffect, useRef, useState } from "react";
import type { AgentCapability, AgentContextFile, AgentContextRef, AgentSession, ProjectFile, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";

function contextFileLabel(file: AgentContextFile) {
  return file.label || file.path;
}

export function RightPanelAgentChat({
  activeFiles,
  models,
  onModelChange,
  projectFiles,
  projectSlug,
  selectedModelId,
}: {
  activeFiles: AgentContextFile[];
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string;
  selectedModelId: string;
}) {
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [capabilityError, setCapabilityError] = useState("");
  const [contextRefs, setContextRefs] = useState<AgentContextRef[]>([]);
  const [draft, setDraft] = useState("");
  const [session, setSession] = useState<AgentSession | null>(null);
  const [selectedContextPath, setSelectedContextPath] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCapabilityError("");
    setContextRefs([]);
    setSelectedContextPath("");

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
          setCapabilityError(errorMessage(error, "Could not load agent capabilities."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectSlug]);

  const addContextRef = () => {
    if (sending) return;
    const file = projectFiles.find((candidate) => candidate.path === selectedContextPath);
    if (!file || contextRefs.some((ref) => ref.path === file.path)) return;

    setContextRefs((current) => [...current, { path: file.path, label: file.name, kind: file.kind, source: "manual" }]);
    setSelectedContextPath("");
  };

  const removeContextRef = (path: string) => {
    setContextRefs((current) => current.filter((ref) => ref.path !== path));
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setCapabilityError("");
    try {
      setSession(
        await api.sendAgentSessionMessage(projectSlug, {
          content,
          modelId: selectedModelId || undefined,
          context: activeFiles.length || contextRefs.length ? { activeFiles, fileRefs: contextRefs } : undefined,
        }),
      );
      setDraft("");
    } catch (error) {
      setCapabilityError(errorMessage(error, "Could not send the agent message."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="right-panel-agent-chat">
      <div className="right-panel-agent-thread">
        {capabilityError ? <p className="agent-event-status">Agent capabilities unavailable: {capabilityError}</p> : null}
        {!capabilityError && capabilities.length ? (
          <p className="agent-event-status">{capabilities.filter((capability) => capability.available).length} agent capabilities available.</p>
        ) : null}
        <ChatThread
          disabled={sending}
          editable={false}
          emptyDescription="Ask the side-panel agent about this project."
          emptyTitle={session ? "Start agent chat" : "Loading agent session..."}
          messages={session?.messages ?? []}
        />
      </div>
      <div className="agent-active-context" aria-label="Active agent context">
        <span className="agent-context-label">Active context</span>
        {activeFiles.length ? (
          <div className="agent-context-chips">
            {activeFiles.map((file) => (
              <code key={file.path} title={file.path}>
                {contextFileLabel(file)}
                {file.draftState === "unsaved" ? " (unsaved)" : ""}
              </code>
            ))}
          </div>
        ) : (
          <p>No active file selected.</p>
        )}
      </div>
      <ChatComposer
        contextFiles={projectFiles}
        contextRefs={contextRefs}
        disabled={sending}
        draft={draft}
        models={models}
        onAddContextRef={addContextRef}
        onChangeDraft={(event) => setDraft(event.currentTarget.value)}
        onModelChange={onModelChange}
        onRemoveContextRef={removeContextRef}
        onSelectedContextPathChange={setSelectedContextPath}
        onSubmit={() => void sendMessage()}
        placeholder="Ask the side-panel agent..."
        selectedContextPath={selectedContextPath}
        selectedModelId={selectedModelId}
        submitLabel="Ask"
        textareaRef={textareaRef}
      />
    </div>
  );
}
