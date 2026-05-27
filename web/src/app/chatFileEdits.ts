import type { ChatMessageFileEdit, FileContent } from "../contracts/api";

export type ChatFileEditDecision =
  | { kind: "notice"; message: string }
  | { kind: "open-file"; path: string; message: string }
  | { kind: "apply"; content: string; message: string }
  | { kind: "create"; path: string; content: string; message: string };

export async function hashDraftContent(content: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveChatFileEditApplication({
  draft,
  edit,
  selected,
}: {
  draft: string;
  edit: ChatMessageFileEdit;
  selected: FileContent | null;
}): Promise<ChatFileEditDecision> {
  if (!edit.proposedContent) {
    return { kind: "notice", message: "This chat edit does not include draft content to apply." };
  }

  // File creation: contentHashBefore is null AND path is under a creatable prefix
  // (only outputs_ai/reports/ files can be created from chat edits)
  const creatablePrefixes = ["outputs_ai/reports/"];
  if (!edit.contentHashBefore && creatablePrefixes.some((p) => edit.path.startsWith(p))) {
    return {
      kind: "create",
      path: edit.path,
      content: edit.proposedContent,
      message: `Created ${edit.path}.`,
    };
  }

  if (selected?.path !== edit.path) {
    return { kind: "open-file", path: edit.path, message: `Opened ${edit.path}. Apply the chat edit again after the file loads.` };
  }

  if (edit.contentHashBefore && selected.contentHash !== edit.contentHashBefore) {
    return { kind: "notice", message: "The saved file changed after this chat edit was proposed. Ask chat to regenerate the edit." };
  }

  if (edit.draftStateBefore === "unsaved") {
    if (!edit.draftContentHashBefore) {
      return { kind: "notice", message: "This chat edit is missing the draft baseline. Ask chat to regenerate the edit." };
    }

    if ((await hashDraftContent(draft)) !== edit.draftContentHashBefore) {
      return { kind: "notice", message: "Your draft changed after chat proposed this edit. Ask chat to regenerate before applying it." };
    }
  } else if (draft !== selected.content) {
    return { kind: "notice", message: "You have unsaved edits that chat did not see. Save or ask chat to regenerate before applying this edit." };
  }

  return {
    kind: "apply",
    content: edit.proposedContent,
    message: "Applied the chat edit to the unsaved editor draft. Review and save when ready.",
  };
}

