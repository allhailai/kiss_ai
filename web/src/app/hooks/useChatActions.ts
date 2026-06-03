import { useCallback, useMemo, useState } from "react";
import { hashDraftContent, resolveChatFileEditApplication } from "../chatFileEdits";
import { filesApi } from "../../data/filesApi";
import { chatApi } from "../../data/chatApi";
import { topicsApi } from "../../data/topicsApi";
import { artifactsApi } from "../../data/artifactsApi";
import { makeEditableTargetForFile } from "./useAgentFileContext";
import type {
  ChatMessageFileEdit,
  ChatMessageFileRename,
  ChatMessageArtifactRename,
  ChatMessageTopicProposal,
} from "../../contracts/api";
import type { ProjectChatController } from "./useProjectChat";
import type { FileWorkspaceController, RebuildWorkspaceController, RouteController, ToastWorkspaceController } from "../workspaceControllers";

const aiFileAssistPrompt =
  "Review the saved annotations in this file. Interpret the Git diff as user guidance, then propose edits that integrate those annotations cleanly throughout the document while preserving the document's intent, structure, and voice.";

export function useChatActions({
  fileWorkspace,
  openAgentChatPanel,
  projectChat,
  projectSlug,
  rebuildWorkspace,
  route,
  toastWorkspace,
}: {
  fileWorkspace: FileWorkspaceController;
  openAgentChatPanel: () => void;
  projectChat: ProjectChatController;
  projectSlug: string | null;
  rebuildWorkspace: Pick<RebuildWorkspaceController, "refreshStatus" | "refreshRebuild" | "selectedModelId">;
  route: RouteController;
  toastWorkspace: ToastWorkspaceController;
}) {
  const [agentDraftSeed, setAgentDraftSeed] = useState<{ id: string; draft: string } | null>(null);

  const refreshAfterMutation = useCallback(async () => {
    await fileWorkspace.refreshProjectFiles();
    await fileWorkspace.refreshSelectedFile();
    await rebuildWorkspace.refreshStatus();
  }, [fileWorkspace, rebuildWorkspace]);

  const applyChatFileEdit = useCallback(
    async (edit: ChatMessageFileEdit, editIndex: number, messageId: string): Promise<boolean> => {
      const decision = await resolveChatFileEditApplication({ draft: fileWorkspace.draft, edit, selected: fileWorkspace.selected });

      if (decision.kind === "open-file") {
        route.openProjectFile(decision.path);
        toastWorkspace.setNotice(decision.message);
        return false;
      }

      if (decision.kind === "notice") {
        toastWorkspace.setNotice(decision.message);
        return false;
      }

      if (decision.kind === "create") {
        // Write the file — try creating first (hash of empty string for new files),
        // and fall back to reading the fresh hash for existing files.
        try {
          const emptyHash = await hashDraftContent("");
          try {
            await filesApi.saveFile(projectSlug!, decision.path, decision.content, emptyHash);
          } catch {
            // File likely already exists — read its current hash and update instead.
            const fresh = await filesApi.file(projectSlug!, decision.path);
            await filesApi.saveFile(projectSlug!, decision.path, decision.content, fresh.contentHash);
          }
          toastWorkspace.setNotice(`Applied and saved ${decision.path}.`);
          await fileWorkspace.refreshProjectFiles();
          // Record the file change for sidebar badge
          filesApi.recordFileChange(projectSlug!, decision.path, "new").catch(() => {});
          // Navigate to the file
          route.openProjectFile(decision.path);
          await rebuildWorkspace.refreshStatus();
        } catch (err) {
          toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to save ${decision.path}.`);
          return false;
        }
      } else {
        // Write the proposed content directly via the file API.
        // We MUST read the file's current hash from disk immediately before saving, because:
        //  1. fileWorkspace.selected is React state and may be stale (closure capture)
        //  2. A previous Apply in the same batch may have changed the file
        //  3. An auto-save timer from the annotation editor may have raced us
        try {
          const fresh = await filesApi.file(projectSlug!, edit.path);
          const saved = await filesApi.saveFile(projectSlug!, edit.path, decision.content, fresh.contentHash);

          fileWorkspace.setDraft(saved.content);
          toastWorkspace.setNotice(`Applied and saved ${edit.path}.`);

          // Record the file change for sidebar badge
          filesApi.recordFileChange(projectSlug!, edit.path, "edited").catch(() => {});

          // Refresh project files and the current file so left nav + editor update
          await fileWorkspace.refreshProjectFiles();
          await fileWorkspace.refreshSelectedFile();
          await rebuildWorkspace.refreshStatus();
        } catch (err) {
          console.error("[kiss_ai:apply] Apply failed for", edit.path, err);
          toastWorkspace.setNotice(`Could not apply edit to ${edit.path}. Try refreshing the file and asking chat to regenerate.`);
          return false;
        }
      }

      // Persist the "applied" status server-side so it survives refresh
      const conversationId = projectChat.activeConversation?.id;
      if (conversationId && projectSlug) {
        try {
          const updated = await chatApi.markFileEditApplied(projectSlug, conversationId, messageId, editIndex);
          projectChat.setActiveConversation(updated);
        } catch {
          // Non-critical — the edit was still applied to the file, just the status badge won't persist
          console.warn("[kiss_ai] Could not persist file edit applied status.");
        }
      }

      return true;
    },
    [fileWorkspace, projectChat, projectSlug, rebuildWorkspace, route, toastWorkspace],
  );

  const applyChatFileRename = useCallback(
    async (rename: ChatMessageFileRename, renameIndex: number, messageId: string): Promise<boolean> => {
      if (!projectSlug) return false;

      // Capture before async calls — React closures may be stale after awaits
      const wasViewingFrom = fileWorkspace.selected?.path === rename.from;

      try {
        await filesApi.renameOutputFile(projectSlug, rename.from, rename.to);
        toastWorkspace.setNotice(`Renamed ${rename.from.split("/").pop()} to ${rename.to.split("/").pop()}.`);
        await fileWorkspace.refreshProjectFiles();
        await rebuildWorkspace.refreshStatus();
        // If the renamed file was the currently viewed file, navigate to its new path
        if (wasViewingFrom) {
          route.openProjectFile(rename.to);
        }
      } catch (err) {
        toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to rename ${rename.from}.`);
        return false;
      }

      // Persist the "applied" status server-side
      const conversationId = projectChat.activeConversation?.id;
      if (conversationId) {
        try {
          const updated = await chatApi.markFileRenameApplied(projectSlug, conversationId, messageId, renameIndex);
          projectChat.setActiveConversation(updated);
        } catch {
          console.warn("[kiss_ai] Could not persist file rename applied status.");
        }
      }

      return true;
    },
    [fileWorkspace, projectChat, projectSlug, rebuildWorkspace, route, toastWorkspace],
  );

  const applyChatArtifactRename = useCallback(
    async (rename: ChatMessageArtifactRename, renameIndex: number, messageId: string): Promise<boolean> => {
      if (!projectSlug) return false;

      try {
        await artifactsApi.rename(projectSlug, rename.from, rename.to);
        toastWorkspace.setNotice(`Renamed artifact ${rename.from} to ${rename.to}.`);
        await fileWorkspace.refreshProjectFiles();
        await rebuildWorkspace.refreshStatus();
      } catch (err) {
        toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to rename artifact ${rename.from}.`);
        return false;
      }

      // Persist the "applied" status server-side
      const conversationId = projectChat.activeConversation?.id;
      if (conversationId) {
        try {
          const updated = await chatApi.markArtifactRenameApplied(projectSlug, conversationId, messageId, renameIndex);
          projectChat.setActiveConversation(updated);
        } catch {
          console.warn("[kiss_ai] Could not persist artifact rename applied status.");
        }
      }

      return true;
    },
    [fileWorkspace, projectChat, projectSlug, rebuildWorkspace, toastWorkspace],
  );

  const handleCreateTopic = useCallback(
    async (proposal: ChatMessageTopicProposal): Promise<void> => {
      if (!projectSlug) return;

      try {
        const result = await topicsApi.create(
          projectSlug,
          proposal.label,
          proposal.justification,
          projectChat.activeConversation?.id,
        );

        if (!result.created) {
          if (result.duplicates.length > 0) {
            toastWorkspace.setNotice(`Topic "${proposal.label}" may already exist. Similar: ${result.duplicates.map((d) => d.label).join(", ")}`);
          } else {
            toastWorkspace.setNotice(result.error || `Could not create topic "${proposal.label}".`);
          }
          return;
        }

        toastWorkspace.setNotice(`Created topic: ${proposal.label}.`);
        await rebuildWorkspace.refreshStatus();
      } catch (err) {
        toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to create topic "${proposal.label}".`);
      }
    },
    [projectChat, projectSlug, rebuildWorkspace, toastWorkspace],
  );

  const assistCurrentFile = useCallback(async () => {
    const selected = fileWorkspace.selected;
    if (!selected?.editable || projectChat.loading || projectChat.sending || projectChat.proposalUpdating) return;

    const savedFile = fileWorkspace.hasUnsavedChanges ? await fileWorkspace.saveSelected() : selected;
    if (!savedFile) return;

    const editableTarget = makeEditableTargetForFile(savedFile, savedFile.content);
    projectChat.startDraftConversation({ ai_editable_files: [editableTarget], context_files: [] });
    openAgentChatPanel();
    setAgentDraftSeed({ id: `${savedFile.path}:${Date.now()}`, draft: aiFileAssistPrompt });
    toastWorkspace.setNotice(`Prepared AI File Assist for ${savedFile.path}.`);
  }, [fileWorkspace, openAgentChatPanel, projectChat, toastWorkspace]);

  return useMemo(
    () => ({
      agentDraftSeed,
      applyChatArtifactRename,
      applyChatFileEdit,
      applyChatFileRename,
      assistCurrentFile,
      handleCreateTopic,
      refreshAfterMutation,
    }),
    [agentDraftSeed, applyChatArtifactRename, applyChatFileEdit, applyChatFileRename, assistCurrentFile, handleCreateTopic, refreshAfterMutation],
  );
}
