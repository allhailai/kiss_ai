import { randomUUID, createHash } from "node:crypto";
import { firstTagContent } from "../conceptualDiffs.js";

export function allTagContent(text, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
  return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

export function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function extractFileEditProposals(rawText, conversation, authorizedEditablePaths = null) {
  const conversationEditableTargets = conversation.fileContext?.ai_editable_files?.length
    ? conversation.fileContext.ai_editable_files
    : conversation.messages.flatMap((message) => message.context?.ai_editable_files ?? []);
  const editableTargets = new Map(
    conversationEditableTargets
      .filter((file) => file?.path)
      .map((file) => [file.path, file]),
  );

  // Paths under these prefixes can be created by the agent even when not in ai_editable_files.
  const creatablePrefixes = ["outputs_ai/reports/"];
  function isCreatablePath(path) {
    return creatablePrefixes.some((prefix) => path.startsWith(prefix));
  }

  return allTagContent(rawText, "file_edit")
    .map((editText) => {
      const path = firstTagContent(editText, "path");
      const proposedContent = firstTagContent(editText, "proposedContent", { trim: false });
      if (!path || !proposedContent) return null;

      const target = editableTargets.get(path);
      const isCreation = !target && isCreatablePath(path);

      // For existing editable files: enforce authorization
      if (!isCreation) {
        if (authorizedEditablePaths && !authorizedEditablePaths.has(path)) return null;
        if (!target) return null;
      }

      return {
        path,
        summary: firstTagContent(editText, "summary") || `Proposed edit for ${path}.`,
        proposedContent,
        contentHashBefore: target?.contentHash ?? null,
        draftStateBefore: target?.draftState ?? null,
        ...(target?.draftState === "unsaved" && typeof target.draftContent === "string"
          ? { draftContentHashBefore: hashText(target.draftContent) }
          : {}),
        status: "proposed",
      };
    })
    .filter(Boolean);
}

export function extractTopicProposals(rawText) {
  return allTagContent(rawText, "topic_proposal")
    .map((proposalText) => {
      const label = firstTagContent(proposalText, "label");
      const justification = firstTagContent(proposalText, "justification");
      if (!label) return null;
      return { label, justification: justification || "" };
    })
    .filter(Boolean);
}

export function extractTopicDetailEdits(rawText) {
  return allTagContent(rawText, "topic_detail_edit")
    .map((editText) => {
      const topicId = firstTagContent(editText, "topic_id");
      if (!topicId) return null;
      const details = firstTagContent(editText, "details");
      return { topicId, details: details || null };
    })
    .filter(Boolean);
}

export function extractArtifactProposals(rawText) {
  return allTagContent(rawText, "artifact_proposal")
    .map((proposalText) => {
      const title = firstTagContent(proposalText, "title");
      const summary = firstTagContent(proposalText, "summary");
      const detailsRaw = firstTagContent(proposalText, "details");
      const specBody = firstTagContent(proposalText, "spec_body");
      if (!title) return null;
      const details = detailsRaw
        ? detailsRaw.split("\n").map((line) => line.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean)
        : [];
      return {
        title,
        summary: summary || "",
        details,
        ...(specBody ? { specBody } : {}),
      };
    })
    .filter(Boolean);
}

const renameablePrefixes = ["outputs_ai/reports/", "outputs_ai/artifacts/"];

export function extractFileRenameProposals(rawText) {
  return allTagContent(rawText, "file_rename")
    .map((renameText) => {
      const from = firstTagContent(renameText, "from");
      const to = firstTagContent(renameText, "to");
      if (!from || !to) return null;

      const fromAllowed = renameablePrefixes.some((prefix) => from.startsWith(prefix));
      const toAllowed = renameablePrefixes.some((prefix) => to.startsWith(prefix));
      if (!fromAllowed || !toAllowed) return null;

      if (from === to) return null;

      return {
        from,
        to,
        summary: firstTagContent(renameText, "summary") || `Rename ${from} -> ${to}`,
        status: "proposed",
      };
    })
    .filter(Boolean);
}

const VALID_SLUG_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

export function extractArtifactRenameProposals(rawText) {
  return allTagContent(rawText, "artifact_rename")
    .map((renameText) => {
      const from = firstTagContent(renameText, "from")?.trim();
      const to = firstTagContent(renameText, "to")?.trim();
      if (!from || !to) return null;
      if (from === to) return null;
      if (!VALID_SLUG_PATTERN.test(from) || !VALID_SLUG_PATTERN.test(to)) return null;

      return {
        from,
        to,
        summary: firstTagContent(renameText, "summary") || `Rename artifact ${from} -> ${to}`,
        status: "proposed",
      };
    })
    .filter(Boolean);
}
