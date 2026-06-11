import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_STORED_MESSAGE_BYTES, MAX_USER_MESSAGE_BYTES } from "../../contracts/chatLimits.js";
import { normalizeChatContext } from "../chatContext.js";
import { prepareCursorAgentRun } from "../cursorAgentRun.js";
import { updateTopic } from "../topicsService.js";
import {
  extractFileEditProposals,
  extractFileRenameProposals,
  extractArtifactRenameProposals,
  extractTopicProposals,
  extractTopicDetailEdits,
  extractArtifactProposals,
  hashText,
} from "./chatParsers.js";
import { extractApplyResult } from "../chatAgent.js";
import { createChatPrompt, createApplyProposalPrompt } from "./chatPromptBuilder.js";
import {
  activeRejectionRecords,
  annotateConceptualDiffsWithMemory,
  buildRejectionMemoryPromptContext,
  emptyConceptualDiffMemory,
  filterSuppressedConceptualDiffs,
  normalizeConceptualDiffMemoryFile,
  updateConceptualDiffRejectionMemory,
} from "../conceptualDiffMemory.js";

function nowIso() {
  return new Date().toISOString();
}

function createMessageId() {
  return `msg_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function summarizeAssistantText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function requireSendRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const context = normalizeChatContext(body?.context, { maxDraftContentLength: 120_000 });

  if (!modelId) throw httpError("Chat requires a model.");
  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return { modelId, content, context };
}

function requireEditRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return { modelId: modelId || undefined, content };
}

function editableContentHashByPath(conversation) {
  return new Map((conversation.fileContext?.ai_editable_files ?? []).filter((file) => file?.path && file.contentHash).map((file) => [file.path, file.contentHash]));
}

const conceptualDiffMemoryPath = ".conceptual-diff-memory.json";

export function createChatAgentPipelines({
  appendMessage,
  displayProjectName,
  editUserMessage,
  gitFileDiffText,
  gitFileDiffTexts = null,
  httpError,
  listCursorModels,
  notifyConversation,
  pickRebuildModelId,
  projectAgentLock,
  readConversation,
  readProjectJson,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
  writeProjectJson,
}) {
  const activeChatControllers = new Map();

  async function prepareAgentRun(project, requestedModelId, label) {
    return prepareCursorAgentRun({
      httpError,
      label,
      listCursorModels,
      noApiKeyMessage: "No Cursor API key found. Chat is unavailable from the UI.",
      noModelsMessage: "No Cursor models are available for chat.",
      pickRebuildModelId,
      project,
      projectAgentLock,
      requestedModelId,
      resolveCursorApiKey,
    });
  }

  function startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId }) {
    const controller = new AbortController();
    activeChatControllers.set(project.slug, controller);

    void (async () => {
      const assistantTextChunks = [];
      let assistantTextBytes = 0;
      try {
        const { authorizedEditablePaths, prompt } = await createChatPrompt({
          project,
          conversation: conversationWithUser,
          displayProjectName,
          readProjectHarness,
          readTextFile,
        });

        const fileSnapshots = new Map();
        if (authorizedEditablePaths.size > 0) {
          for (const relPath of authorizedEditablePaths) {
            const absPath = path.resolve(project.path, relPath);
            try {
              fileSnapshots.set(absPath, await fs.readFile(absPath, "utf8"));
            } catch {
              fileSnapshots.set(absPath, null);
            }
          }
        }

        await runCursorAgent({
          project,
          apiKey: cursorApiKey.apiKey,
          modelId,
          prompt,
          signal: controller.signal,
          onEvent: async (event) => {
            if (event.type !== "assistant_delta" || !event.text) return;
            assistantTextBytes += Buffer.byteLength(event.text, "utf8");
            if (assistantTextBytes > MAX_STORED_MESSAGE_BYTES) {
              throw httpError("Assistant response is too large.", 413, "chat_message_too_large");
            }
            assistantTextChunks.push(event.text);
            notifyConversation(project.slug, conversationId, {
              type: "message_delta",
              conversationId,
              messageId: assistantMessageId,
              delta: event.text,
              updatedAt: nowIso(),
            });
          },
        });

        for (const [absPath, originalContent] of fileSnapshots) {
          try {
            if (originalContent === null) {
              await fs.unlink(absPath).catch(() => {});
            } else {
              const current = await fs.readFile(absPath, "utf8").catch(() => null);
              if (current !== originalContent) {
                await fs.writeFile(absPath, originalContent, "utf8");
              }
            }
          } catch {
            // Best-effort
          }
        }

        const assistantText = assistantTextChunks.join("");
        const promptBytes = Buffer.byteLength(prompt, "utf8");
        console.log(`[kiss_ai chat] model=${modelId} prompt=~${Math.round(promptBytes / 4)} tokens (${(promptBytes / 1024).toFixed(1)} KB) output=~${Math.round(assistantTextBytes / 4)} tokens (${(assistantTextBytes / 1024).toFixed(1)} KB)`);
        const fileEdits = extractFileEditProposals(assistantText, conversationWithUser, authorizedEditablePaths);
        const fileRenames = extractFileRenameProposals(assistantText);
        const artifactRenames = extractArtifactRenameProposals(assistantText);
        const topicProposals = extractTopicProposals(assistantText);
        const topicDetailEdits = extractTopicDetailEdits(assistantText);
        const artifactProposals = extractArtifactProposals(assistantText);

        for (const edit of topicDetailEdits) {
          try {
            await updateTopic(project.path, edit.topicId, { details: edit.details });
          } catch {}
        }
        const finalConversation = await appendMessage(project, conversationId, {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText.trim() || "No assistant response was returned.",
          createdAt: nowIso(),
          modelId,
          status: "complete",
          metadata: {
            cursorApiKeySource: cursorApiKey.source,
            ...(fileEdits.length ? { fileEdits } : {}),
            ...(fileRenames.length ? { fileRenames } : {}),
            ...(artifactRenames.length ? { artifactRenames } : {}),
            ...(topicProposals.length ? { topicProposals } : {}),
            ...(artifactProposals.length ? { artifactProposals } : {}),
          },
        });
        const nextConversation =
          finalConversation.summary || !assistantText
            ? finalConversation
            : await writeConversation(project, {
                ...finalConversation,
                summary: summarizeAssistantText(assistantText),
                updatedAt: nowIso(),
              });
        const message = nextConversation.messages.find((candidate) => candidate.id === assistantMessageId) ?? nextConversation.messages.at(-1);

        notifyConversation(project.slug, conversationId, {
          type: "message_complete",
          conversation: nextConversation,
          message,
        });
      } catch (error) {
        const isCancelled = error?.name === "AbortError";
        const assistantText = assistantTextChunks.join("");

        if (isCancelled && assistantText.trim()) {
          try {
            const partialConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: assistantText.trim(),
              createdAt: nowIso(),
              modelId,
              status: "complete",
              metadata: { cancelled: true },
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: partialConversation,
              message: partialConversation.messages.find((m) => m.id === assistantMessageId) ?? partialConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: "Chat was cancelled.",
              updatedAt: nowIso(),
            });
          }
        } else if (isCancelled) {
          try {
            const cancelledConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: "Chat was cancelled.",
              createdAt: nowIso(),
              modelId,
              status: "complete",
              metadata: { cancelled: true },
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: cancelledConversation,
              message: cancelledConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: "Chat was cancelled.",
              updatedAt: nowIso(),
            });
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : "Chat failed.";
          try {
            const finalConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: errorMessage,
              createdAt: nowIso(),
              modelId,
              status: "error",
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: finalConversation,
              message: finalConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: errorMessage,
              updatedAt: nowIso(),
            });
          }
        }
      } finally {
        activeChatControllers.delete(project.slug);
        releaseProjectAgent();
      }
    })();
  }

  async function sendChatMessage(project, conversationId, body) {
    const request = requireSendRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");

    const userMessage = {
      id: createMessageId(),
      role: "user",
      content: request.content,
      createdAt: nowIso(),
      modelId: null,
      status: "complete",
      context: request.context,
    };
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await appendMessage(project, conversationId, userMessage);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function editChatMessage(project, conversationId, messageId, body) {
    const request = requireEditRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await editUserMessage(project, conversationId, messageId, request.content);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function updateEditProposal(project, conversationId, proposalId, body) {
    const conversation = await readConversation(project, conversationId);
    const updates = new Map((body?.conceptualDiffs ?? []).map((diff) => [diff.id, diff.status]));
    const timestamp = nowIso();
    let foundProposal = false;
    const memoryDiffs = [];
    const editProposals = (conversation.editProposals ?? []).map((proposal) => {
      if (proposal.id !== proposalId) return proposal;
      foundProposal = true;
      const conceptualDiffs = proposal.conceptualDiffs.map((diff) => {
        const nextStatus = updates.get(diff.id) === "rejected" ? "rejected" : updates.get(diff.id) === "accepted" ? "accepted" : diff.status;
        if ((nextStatus === "rejected" && diff.status !== "rejected") || (nextStatus === "accepted" && diff.memory?.reconsidersRejectedId)) {
          memoryDiffs.push({ ...diff, status: nextStatus });
        }
        return {
          ...diff,
          status: nextStatus,
        };
      });
      return {
        ...proposal,
        updatedAt: timestamp,
        conceptualDiffs,
      };
    });

    if (!foundProposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

    if (memoryDiffs.length) {
      const memory = normalizeConceptualDiffMemoryFile(await readProjectJson(project.path, conceptualDiffMemoryPath, emptyConceptualDiffMemory()));
      await writeProjectJson(project.path, conceptualDiffMemoryPath, updateConceptualDiffRejectionMemory(memory, {
        conceptualDiffs: memoryDiffs,
        flow: "ai_file_assist",
        now: timestamp,
        sourceContentHashByPath: editableContentHashByPath(conversation),
      }));
    }

    const nextConversation = await writeConversation(project, {
      ...conversation,
      editProposals,
      updatedAt: timestamp,
    });
    notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: nextConversation });
    return nextConversation;
  }

  async function applyEditProposal(project, conversationId, proposalId, body) {
    const requestedModelId = String(body?.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Applying a proposal requires a model.");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId, "edit_proposal_apply");
    try {
      const conversation = await readConversation(project, conversationId);
      const proposal = (conversation.editProposals ?? []).find((candidate) => candidate.id === proposalId);
      if (!proposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

      const applyingAt = nowIso();
      const applyingConversation = await writeConversation(project, {
        ...conversation,
        editProposals: conversation.editProposals.map((candidate) =>
          candidate.id === proposalId ? { ...candidate, status: "applying", updatedAt: applyingAt, appliedAt: undefined } : candidate,
        ),
        updatedAt: applyingAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: applyingConversation });

      const applyingProposal = applyingConversation.editProposals.find((candidate) => candidate.id === proposalId);
      const reconsideredAcceptedDiffs = (applyingProposal?.conceptualDiffs ?? []).filter((diff) => diff.status === "accepted" && diff.memory?.reconsidersRejectedId);
      if (reconsideredAcceptedDiffs.length) {
        const memory = normalizeConceptualDiffMemoryFile(await readProjectJson(project.path, conceptualDiffMemoryPath, emptyConceptualDiffMemory()));
        await writeProjectJson(project.path, conceptualDiffMemoryPath, updateConceptualDiffRejectionMemory(memory, {
          conceptualDiffs: reconsideredAcceptedDiffs,
          flow: "ai_file_assist",
          now: applyingAt,
          sourceContentHashByPath: editableContentHashByPath(applyingConversation),
        }));
      }
      const { approvedConceptualDiffIds = [], prompt, notice } = await createApplyProposalPrompt({
        project,
        conversation: applyingConversation,
        gitFileDiffText,
        gitFileDiffTexts,
        proposal: applyingProposal,
        readTextFile,
      });

      if (!prompt) {
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...applyingConversation,
          editProposals: applyingConversation.editProposals.map((candidate) =>
            candidate.id === proposalId ? { ...candidate, status: "failed", notice, updatedAt: failedAt, appliedAt: undefined } : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      }

      let assistantText = "";
      const applyController = new AbortController();
      activeChatControllers.set(project.slug, applyController);
      let runResult;
      try {
        runResult = await runCursorAgent({
          project,
          apiKey: cursorApiKey.apiKey,
          modelId,
          prompt,
          signal: applyController.signal,
          onEvent: async (event) => {
            if (event.type === "assistant_delta" && event.text) assistantText += event.text;
          },
        });
      } finally {
        activeChatControllers.delete(project.slug);
      }

      const promptBytes = Buffer.byteLength(prompt, "utf8");
      const outputBytes = runResult?.outputBytes ?? 0;
      console.log(`[kiss_ai apply] model=${modelId} prompt=~${Math.round(promptBytes / 4)} tokens (${(promptBytes / 1024).toFixed(1)} KB) output=~${Math.round(outputBytes / 4)} tokens (${(outputBytes / 1024).toFixed(1)} KB)`);

      const applyResult = extractApplyResult(assistantText, approvedConceptualDiffIds);
      const completedAt = nowIso();
      const status = !applyResult.valid ? "failed" : applyResult.failedConceptualDiffIds.length ? "partial" : "applied";
      const completedConversation = await writeConversation(project, {
        ...applyingConversation,
        editProposals: applyingConversation.editProposals.map((candidate) =>
          candidate.id === proposalId
            ? {
                ...candidate,
                status,
                notice:
                  applyResult.notice ||
                  (status === "applied"
                    ? "Applied the approved proposed changes."
                    : status === "partial"
                      ? "Applied some approved proposed changes. Some items need review."
                      : "The apply run did not return a valid result summary. Review the files before trying again."),
                updatedAt: completedAt,
                appliedAt: status === "applied" || status === "partial" ? completedAt : undefined,
              }
            : candidate,
        ),
        updatedAt: completedAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: completedConversation });
      return completedConversation;
    } catch (error) {
      try {
        const conversation = await readConversation(project, conversationId);
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...conversation,
          editProposals: (conversation.editProposals ?? []).map((candidate) =>
            candidate.id === proposalId
              ? {
                  ...candidate,
                  status: "failed",
                  notice: error instanceof Error ? error.message : "Could not apply the proposal.",
                  updatedAt: failedAt,
                  appliedAt: undefined,
                }
              : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      } catch {
        throw error;
      }
    } finally {
      releaseProjectAgent();
    }
  }

  function cancelChatAgent(projectSlug) {
    const controller = activeChatControllers.get(projectSlug);
    if (!controller) return { ok: true, cancelled: false };
    controller.abort();
    return { ok: true, cancelled: true };
  }

  return { applyEditProposal, cancelChatAgent, editChatMessage, sendChatMessage, updateEditProposal };
}
