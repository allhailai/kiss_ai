import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type {
  AgentContextFile,
  ChatContextFile,
  ChatContextTopic,
  ChatMessageArtifactProposal,
  ChatMessageArtifactRename,
  ChatMessageFileEdit,
  ChatMessageFileRename,
  ChatMessageTopicProposal,
  Conversation,
  ConversationSummary,
  EditProposal,
  ProjectFile,
  RebuildModel,
} from "../../contracts/api";
import { artifactsApi } from "../../data/artifactsApi";
import { labeledFileDisplayName, parseArtifactSpecPath, projectFileDisplayName, uniqueByPathPreserveFirst } from "../../domain/files";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";
import { ArtifactProposalCard } from "./ArtifactProposalCard";
import { AgentConversationHeader } from "./AgentConversationHeader";
import { AgentEditProposalPanel } from "./AgentEditProposalPanel";
import { latestAttentionEditProposal, canApplyProposal } from "./agentChatHelpers";

type ArtifactSession =
  | { phase: "idle" }
  | { phase: "editing"; slug: string; name: string };

type RightPanelChatController = {
  activeConversation: Conversation | null;
  applyEditProposal: (proposalId: string) => Promise<boolean>;
  cancelAgent: () => Promise<void>;
  conversationFilter: string;
  conversations: ConversationSummary[];
  filteredConversations: ConversationSummary[];

  handleThreadScroll: () => void;
  loading: boolean;
  messageDraft: string;
  openConversation: (conversationId: string) => Promise<void>;
  proposalUpdating: boolean;
  scrollToLatest: () => void;
  sendMessage: (options: {
    content?: string;
    context?: { currentFile?: AgentContextFile; ai_editable_files?: AgentContextFile[]; context_files?: ChatContextFile[]; context_topics?: ChatContextTopic[] };
  }) => Promise<boolean>;
  sending: boolean;
  setConversationFilter: (query: string) => void;
  setMessageDraft: (draft: string) => void;
  showJumpToLatest: boolean;
  startDraftConversation: (initialFileContext?: { ai_editable_files: AgentContextFile[]; context_files: ChatContextFile[] }) => void;
  threadRef: RefObject<HTMLDivElement | null>;
  updateEditProposal: (proposalId: string, conceptualDiffs: Array<{ id: string; status: "accepted" | "rejected" }>) => Promise<boolean>;
};

type VisibleEditableTarget = {
  file: AgentContextFile;
  isCurrent: boolean;
};



export function RightPanelAgentChat({
  aiEditableFiles,
  chat,
  contextFiles,
  contextTopics,
  currentFile,
  draftSeed,
  highlightedContext,
  models,
  onAddContextFile,
  onApplyFileEdit,
  onApplyFileRename,
  onApplyArtifactRename,
  onUndoFileEdit,
  onContextFilesChange,
  onContextTopicsChange,
  onCreateTopic,
  onModelChange,
  onRefreshAfterMutation,
  onModifyCurrentFile,
  onNavigateToArtifact,
  onRebuildArtifact,
  onRemoveAiEditableFile,
  projectFiles,
  projectSlug,
  selectedModelId,
}: {
  aiEditableFiles: AgentContextFile[];
  chat: RightPanelChatController;
  contextFiles: ChatContextFile[];
  contextTopics: ChatContextTopic[];
  currentFile: AgentContextFile | null;
  draftSeed: { id: string; draft: string } | null;
  highlightedContext: { path: string; target: "editable" | "context" } | null;
  models: RebuildModel[];
  onAddContextFile: (path: string) => void;
  onApplyFileEdit: (edit: ChatMessageFileEdit, editIndex: number, messageId: string) => Promise<boolean>;
  onApplyFileRename: (rename: ChatMessageFileRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onApplyArtifactRename: (rename: ChatMessageArtifactRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onUndoFileEdit: (edit: ChatMessageFileEdit, editIndex: number, messageId: string) => Promise<boolean>;
  onContextFilesChange: Dispatch<SetStateAction<ChatContextFile[]>>;
  onContextTopicsChange: Dispatch<SetStateAction<ChatContextTopic[]>>;
  onCreateTopic: (proposal: ChatMessageTopicProposal) => Promise<void>;
  onModelChange: (modelId: string) => void;
  onRefreshAfterMutation: () => Promise<void>;
  onModifyCurrentFile: () => void;
  onNavigateToArtifact: (slug: string) => void;
  onRebuildArtifact: (slug: string, modelId: string) => void;
  onRemoveAiEditableFile: (path: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string;
  selectedModelId: string;
}) {
  const draft = chat.messageDraft;
  const setDraft = chat.setMessageDraft;
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [artifactSession, setArtifactSession] = useState<ArtifactSession>({ phase: "idle" });
  const [activeArtifactProposal, setActiveArtifactProposal] = useState<ChatMessageArtifactProposal | null>(null);
  const [localCreatedArtifactTitles, setLocalCreatedArtifactTitles] = useState<Set<string>>(new Set());
  // Derive artifact titles from project files so the "created" state survives refresh.
  // Union with local optimistic set for instant feedback on creation.
  const createdArtifactTitles = useMemo(() => {
    const fromFiles = new Set<string>();
    for (const file of projectFiles) {
      const parsed = parseArtifactSpecPath(file.path);
      if (parsed) fromFiles.add(parsed.name.toLowerCase());
    }
    for (const title of localCreatedArtifactTitles) fromFiles.add(title);
    return fromFiles;
  }, [projectFiles, localCreatedArtifactTitles]);
  const [specModified, setSpecModified] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number | null>(null);
  const bottomDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const bottomPanelRef = useRef<HTMLDivElement | null>(null);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const onBottomResizePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const panel = bottomPanelRef.current;
    if (!panel) return;
    const startHeight = panel.getBoundingClientRect().height;
    bottomDragRef.current = { startY: event.clientY, startHeight };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  const onBottomResizePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = bottomDragRef.current;
    if (!drag) return;
    const delta = drag.startY - event.clientY;
    const newHeight = Math.max(120, Math.min(drag.startHeight + delta, window.innerHeight * 0.75));
    setBottomPanelHeight(newHeight);
  }, []);

  const onBottomResizePointerUp = useCallback(() => {
    bottomDragRef.current = null;
  }, []);
  const currentFileInAiEditable = Boolean(currentFile && aiEditableFiles.some((file) => file.path === currentFile.path));
  const currentFileInContext = Boolean(currentFile && contextFiles.some((file) => file.path === currentFile.path));
  const currentFileArtifact = useMemo(() => currentFile ? parseArtifactSpecPath(currentFile.path) : null, [currentFile]);

  // Restore artifact editing mode on page refresh:
  // If the current file is an artifact spec that's already in AI editable files,
  // the user was in editing mode before the refresh. Re-enter it.
  useEffect(() => {
    if (artifactSession.phase !== "idle") return;
    if (!currentFileArtifact || !currentFileInAiEditable) return;
    setArtifactSession({ phase: "editing", slug: currentFileArtifact.slug, name: currentFileArtifact.name });
  }, [currentFileArtifact, currentFileInAiEditable]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleEditableTargets = useMemo<VisibleEditableTarget[]>(() => {
    const seen = new Set<string>();
    const targets: VisibleEditableTarget[] = [];

    aiEditableFiles.forEach((file) => {
      if (seen.has(file.path)) return;
      seen.add(file.path);
      targets.push({
        file,
        isCurrent: currentFile?.path === file.path,
      });
    });

    return targets;
  }, [aiEditableFiles, currentFile]);
  const requestAiEditableFiles = useMemo(
    () => uniqueByPathPreserveFirst(visibleEditableTargets.map((target) => target.file).filter((file) => file.editable === true)),
    [visibleEditableTargets],
  );
  const selectedProposal = chat.activeConversation?.editProposals.find((proposal) => proposal.id === selectedProposalId) ?? null;
  const activeProposal = selectedProposal ?? latestAttentionEditProposal(chat.activeConversation);
  const proposalReadOnly = Boolean(selectedProposal);
  const controlsDisabled = chat.loading || chat.sending || chat.proposalUpdating;
  const filePickerOptions = useMemo(() => {
    if (!filePickerOpen) return [];
    const selectedPaths = new Set(contextFiles.map((file) => file.path));
    const query = filePickerQuery.trim().toLowerCase();
    return projectFiles
      .filter((file) => file.chatContextReadable)
      .filter((file) => !selectedPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      });
  }, [contextFiles, filePickerOpen, filePickerQuery, projectFiles]);

  useEffect(() => {
    if (!draftSeed) return;

    chat.setMessageDraft(draftSeed.draft);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [draftSeed?.id]);

  const startNewConversation = () => {
    if (controlsDisabled) return;
    chat.startDraftConversation();
    setDraft("");
    setFilePickerQuery("");
    setFilePickerOpen(false);
    setHistoryOpen(false);
    setArtifactSession({ phase: "idle" });
    setActiveArtifactProposal(null);
    textareaRef.current?.focus();
  };


  const selectConversation = (conversationId: string) => {
    if (controlsDisabled) return;
    setHistoryOpen(false);
    void chat.openConversation(conversationId);
    titleTriggerRef.current?.focus();
  };

  const toggleFilePicker = () => {
    if (controlsDisabled) return;
    setFilePickerQuery("");
    setFilePickerOpen((current) => !current);
  };

  const addPickerFile = (path: string) => {
    if (!filePickerOpen) return;
    onAddContextFile(path);
    setFilePickerQuery("");
    setFilePickerOpen(false);
  };

  const addContextFile = (path: string) => {
    if (controlsDisabled) return;
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file || contextFiles.some((contextFile) => contextFile.path === file.path)) return;

    onContextFilesChange((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
  };

  const removeContextFile = (path: string) => {
    onContextFilesChange((current) => current.filter((file) => file.path !== path));
  };

  const pinCurrentFileAsEditableTarget = () => {
    if (!currentFile) return;
    onModifyCurrentFile();
  };

  const enterArtifactEditingMode = () => {
    if (!currentFile || !currentFileArtifact || controlsDisabled) return;
    setArtifactSession({ phase: "editing", slug: currentFileArtifact.slug, name: currentFileArtifact.name });
    onModifyCurrentFile();
    onNavigateToArtifact(currentFileArtifact.slug);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || controlsDisabled) return;

    const sent = await chat.sendMessage({
      content,
      context:
        currentFile || requestAiEditableFiles.length || contextFiles.length || contextTopics.length
          ? {
              currentFile: currentFile ?? undefined,
              ai_editable_files: requestAiEditableFiles.length ? requestAiEditableFiles : undefined,
              context_files: contextFiles.length ? contextFiles : undefined,
              context_topics: contextTopics.length ? contextTopics : undefined,
            }
          : undefined,
    });
    if (sent) {
      setDraft("");
    }
  };



  const setProposalDiffStatus = (proposal: EditProposal, diffId: string, status: "accepted" | "rejected") => {
    if (controlsDisabled) return;
    void chat.updateEditProposal(
      proposal.id,
      proposal.conceptualDiffs.map((diff) => ({
        id: diff.id,
        status: diff.id === diffId ? status : diff.status,
      })),
    );
  };

  const setAllProposalDiffs = (proposal: EditProposal, status: "accepted" | "rejected") => {
    if (controlsDisabled) return;
    void chat.updateEditProposal(
      proposal.id,
      proposal.conceptualDiffs.map((diff) => ({ id: diff.id, status })),
    );
  };

  const applyProposal = (proposal: EditProposal) => {
    if (controlsDisabled || !canApplyProposal(proposal)) return;
    void chat.applyEditProposal(proposal.id);
  };



  const handleCreateArtifact = (proposal: ChatMessageArtifactProposal) => {
    setActiveArtifactProposal(proposal);
  };

  const handleArtifactCreated = (slug: string, name: string) => {
    setArtifactSession({ phase: "editing", slug, name });
    setActiveArtifactProposal(null);
    setLocalCreatedArtifactTitles((prev) => new Set(prev).add(name.toLowerCase()));
    setSpecModified(false);
    // Auto-add the spec file as AI Editable so the agent can edit it
    const specPath = `artifacts/artifact_specs/${slug}.artifact.md`;
    onAddContextFile(specPath);
    onNavigateToArtifact(slug);
    // Refresh file tree and status so the new artifact spec appears in left nav
    void onRefreshAfterMutation();
  };

  const exitEditingMode = () => {
    if (artifactSession.phase === "editing") {
      // Remove the auto-added editable file
      const specPath = `artifacts/artifact_specs/${artifactSession.slug}.artifact.md`;
      onRemoveAiEditableFile(specPath);
    }
    setArtifactSession({ phase: "idle" });
    setActiveArtifactProposal(null);
    setSpecModified(false);
  };

  const handleRebuildArtifact = () => {
    if (artifactSession.phase !== "editing" || !selectedModelId) return;
    onRebuildArtifact(artifactSession.slug, selectedModelId);
  };

  // Composer mode based on artifact session phase
  const composerPlaceholder = artifactSession.phase === "editing"
    ? "Describe changes to the artifact..."
    : "Ask the side-panel agent...";
  const composerSubmitLabel = artifactSession.phase === "editing" ? "Update" : "Send";

  return (
    <div className="right-panel-agent-chat">
      <AgentConversationHeader
        activeConversationId={chat.activeConversation?.id}
        activeTitle={chat.activeConversation?.title || "New AI Chat"}
        controlsDisabled={controlsDisabled}
        conversationFilter={chat.conversationFilter}
        filteredConversations={chat.filteredConversations}
        onFilterChange={chat.setConversationFilter}
        onNewConversation={startNewConversation}
        onSelectConversation={(id) => {
          if (controlsDisabled) return;
          void chat.openConversation(id);
        }}
      />
      <div className="right-panel-agent-thread">
        <ChatThread
          createdArtifactTitles={createdArtifactTitles}
          disabled={chat.sending}
          editable={false}
          emptyDescription="Ask the side-panel agent about this project."
          emptyTitle={chat.loading ? "Loading conversation..." : "Start AI chat"}
          editProposals={chat.activeConversation?.editProposals ?? []}
          footer={activeProposal ? (
            <AgentEditProposalPanel
              activeProposal={activeProposal}
              controlsDisabled={controlsDisabled}
              onApply={applyProposal}
              onHide={() => setSelectedProposalId(null)}
              onSetAllDiffs={setAllProposalDiffs}
              onSetDiffStatus={setProposalDiffStatus}
              proposalReadOnly={proposalReadOnly}
              sending={chat.sending}
            />
          ) : undefined}
          messages={chat.activeConversation?.messages ?? []}
          onApplyFileEdit={onApplyFileEdit}
          onApplyFileRename={onApplyFileRename}
          onApplyArtifactRename={onApplyArtifactRename}
          onUndoFileEdit={onUndoFileEdit}
          onCreateArtifact={handleCreateArtifact}
          onCreateTopic={onCreateTopic}
          onJumpToLatest={() => chat.scrollToLatest()}
          onScroll={chat.handleThreadScroll}
          onViewEditProposal={(proposalId) => setSelectedProposalId((current) => (current === proposalId ? null : proposalId))}
          showJumpToLatest={chat.showJumpToLatest}
          showThinking={chat.sending}
          threadRef={chat.threadRef}
        />
      </div>
      <div
        className="agent-bottom-panel"
        ref={bottomPanelRef}
        style={bottomPanelHeight ? { height: `${bottomPanelHeight}px` } : undefined}
      >
        <div
          className="agent-bottom-panel-handle"
          onPointerDown={onBottomResizePointerDown}
          onPointerMove={onBottomResizePointerMove}
          onPointerUp={onBottomResizePointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize bottom panel"
          tabIndex={0}
        />
        <div className="agent-bottom-panel-content">
          <div className="agent-current-file" aria-label="Current file context">
            <span className="agent-context-label">Viewing</span>
            {currentFile ? (
              <div className="agent-current-file-main">
                <code title={currentFile.path}>
                  {labeledFileDisplayName(currentFile)}
                  {currentFile.draftState === "unsaved" ? " (unsaved)" : ""}
                </code>
                {!currentFileInContext || (currentFile.editable && !currentFileInAiEditable) ? (
                  <div className="agent-current-file-actions" aria-label="Current file actions">
                    <details className="agent-current-file-help">
                      <summary aria-label="Explain Context and Editable targets">?</summary>
                      <span className="agent-current-file-help-text" role="tooltip">
                        <strong>Current file</strong>
                        The open file is sent as the current file so AI knows what you are viewing.
                        <strong>Context</strong> tells AI this file may be helpful when answering your questions. AI can still look at other project
                        files if needed.
                        <strong>Editable targets</strong>
                        Editable files will be updated by AI. Add files that you want AI to update & edit.
                      </span>
                    </details>
                    {!currentFileInContext ? (
                      <button className="agent-current-file-action-button" disabled={controlsDisabled} onClick={() => onAddContextFile(currentFile.path)} type="button">
                        + Context
                      </button>
                    ) : null}
                    {currentFile.editable && !currentFileInAiEditable ? (
                      currentFileArtifact && artifactSession.phase !== "editing" ? (
                        <button
                          className="agent-current-file-action-button agent-current-file-edit-artifact"
                          disabled={controlsDisabled}
                          onClick={enterArtifactEditingMode}
                          title={`Edit artifact: ${currentFileArtifact.name}`}
                          type="button"
                        >
                          + Edit
                        </button>
                      ) : (
                        <button className="agent-current-file-action-button" disabled={controlsDisabled} onClick={pinCurrentFileAsEditableTarget} type="button">
                          + Editable
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <span className="agent-current-file-status">No file open</span>
            )}
          </div>
          {visibleEditableTargets.length ? (
            <div className="agent-file-context agent-file-context-editable" aria-label="Editable target files">
              <div className="agent-context-header">
                <span className="agent-context-label">AI Editable</span>
              </div>
              <div className="agent-context-chips">
                {visibleEditableTargets.map(({ file, isCurrent }) => (
                  <span
                    className={
                      highlightedContext?.target === "editable" && highlightedContext.path === file.path
                        ? "agent-context-chip highlighted"
                        : "agent-context-chip"
                    }
                    key={file.path}
                  >
                    <code title={file.path}>
                      {labeledFileDisplayName(file)}
                      {file.draftState === "unsaved" ? " (unsaved)" : ""}
                    </code>
                    {isCurrent ? <small>Current</small> : null}
                    <button
                      aria-label={`Remove ${file.path} from editable targets`}
                      disabled={controlsDisabled}
                      onClick={() => onRemoveAiEditableFile(file.path)}
                      type="button"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {contextFiles.length ? (
            <div className="agent-file-context" aria-label="Source context files">
              <div className="agent-context-header">
                <button className="agent-context-label agent-context-label-button" onClick={toggleFilePicker} type="button">
                  Context
                </button>
                {contextFiles.length > 1 ? (
                  <button
                    aria-label="Clear all context files"
                    className="agent-context-clear-all"
                    disabled={controlsDisabled}
                    onClick={() => onContextFilesChange([])}
                    type="button"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <div className="agent-context-chips">
                {contextFiles.map((file) => (
                  <span
                    className={
                      highlightedContext?.target === "context" && highlightedContext.path === file.path
                        ? "agent-context-chip highlighted"
                        : "agent-context-chip"
                    }
                    key={file.path}
                  >
                    <code title={file.path}>{labeledFileDisplayName(file)}</code>
                    <button aria-label={`Remove ${file.path} from context`} disabled={controlsDisabled} onClick={() => removeContextFile(file.path)} type="button">
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {contextTopics.length ? (
            <div className="agent-file-context agent-topic-context" aria-label="Topic context">
              <div className="agent-context-header">
                <span className="agent-context-label">Viewing topics</span>
                {contextTopics.length > 1 ? (
                  <button
                    aria-label="Clear all topic context"
                    className="agent-context-clear-all"
                    disabled={controlsDisabled}
                    onClick={() => onContextTopicsChange([])}
                    type="button"
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <div className="agent-context-chips">
                {contextTopics.map((topic) => (
                  <span className="agent-context-chip agent-context-chip-topic" key={topic.topicId}>
                    <code title={topic.topicId}>{topic.label}</code>
                    <button
                      aria-label={`Remove ${topic.label} from context`}
                      disabled={controlsDisabled}
                      onClick={() => onContextTopicsChange((current) => current.filter((t) => t.topicId !== topic.topicId))}
                      type="button"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {contextFiles.length && filePickerOpen ? (
            <section className="agent-file-picker" aria-label="Add context file">
              <div className="agent-file-picker-topbar">
                <strong>Add context file</strong>
                <button onClick={() => setFilePickerOpen(false)} type="button">
                  Close
                </button>
              </div>
              <input
                aria-label="Search project files"
                autoComplete="off"
                onChange={(event) => setFilePickerQuery(event.currentTarget.value)}
                placeholder="Search files..."
                type="search"
                value={filePickerQuery}
              />
              <div className="agent-file-picker-results">
                {filePickerOptions.length ? (
                  filePickerOptions.map((file) => (
                    <button key={file.path} onClick={() => addPickerFile(file.path)} title={file.path} type="button">
                      <strong>{projectFileDisplayName(file)}</strong>
                      <span>{file.path}</span>
                    </button>
                  ))
                ) : (
                  <p>No matching files.</p>
                )}
              </div>
            </section>
          ) : null}
          {activeArtifactProposal ? (
            <section className="agent-artifact-proposal-section" aria-label="Artifact Proposal">
              <ArtifactProposalCard
                disabled={controlsDisabled}
                onCreated={handleArtifactCreated}
                projectSlug={projectSlug}
                proposal={activeArtifactProposal}
                selectedBuildModelId={selectedModelId}
              />
            </section>
          ) : null}
          <ChatComposer
            attachedContextFiles={contextFiles}
            contextFiles={projectFiles}
            disabled={controlsDisabled}
            draft={draft}
            editingIndicator={
              artifactSession.phase === "editing" ? (
                <div className="agent-artifact-editing-banner">
                  <span className="agent-artifact-editing-icon" aria-hidden="true">✏️</span>
                  <span className="agent-artifact-editing-label">
                    Editing: <strong>{artifactSession.name}</strong>
                  </span>
                  <button
                    aria-label="Rebuild artifact"
                    className="agent-artifact-rebuild-button"
                    disabled={controlsDisabled || !selectedModelId}
                    onClick={handleRebuildArtifact}
                    title="Rebuild the artifact with the current spec"
                    type="button"
                  >
                    🔄 Rebuild
                  </button>
                  <button
                    aria-label="Exit artifact editing mode"
                    className="agent-artifact-editing-close"
                    onClick={exitEditingMode}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ) : undefined
            }
            models={models}
            onAddContextFile={addContextFile}
            onChangeDraft={(event) => chat.setMessageDraft(event.currentTarget.value)}
            onModelChange={onModelChange}
            onRemoveContextFile={removeContextFile}
            onSubmit={() => void sendMessage()}
            placeholder={composerPlaceholder}
            modelAdjacentAction={{
              ariaLabel: "New AI Chat",
              disabled: controlsDisabled,
              label: "New chat",
              onClick: startNewConversation,
              title: "New AI Chat",
            }}

            selectedModelId={selectedModelId}
            showContextControls={false}
            stopAction={chat.sending ? {
              label: "Stop",
              onClick: () => void chat.cancelAgent(),
            } : undefined}
            submitLabel={composerSubmitLabel}
            textareaRef={textareaRef}
          />
        </div>
      </div>
    </div>
  );
}
