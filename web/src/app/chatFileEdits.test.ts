import { describe, expect, it } from "vitest";
import { hashDraftContent, resolveChatFileEditApplication } from "./chatFileEdits";
import type { ChatMessageFileEdit, FileContent } from "../contracts/api";

const selected: FileContent = {
  annotation: false,
  content: "current\n",
  contentHash: "hash-a",
  editable: true,
  kind: "human",
  path: "human_goal_requirements.md",
};

function edit(overrides: Partial<ChatMessageFileEdit> = {}): ChatMessageFileEdit {
  return {
    path: selected.path,
    proposedContent: "next\n",
    status: "proposed",
    summary: "Update file.",
    ...overrides,
  };
}

describe("resolveChatFileEditApplication", () => {
  it("opens the proposed file before applying when a different file is selected", async () => {
    await expect(resolveChatFileEditApplication({ draft: selected.content, edit: edit({ path: "inputs_ai/source.md" }), selected })).resolves.toMatchObject({
      kind: "open-file",
      path: "inputs_ai/source.md",
    });
  });

  it("blocks stale proposals when the saved file hash changed", async () => {
    await expect(resolveChatFileEditApplication({ draft: selected.content, edit: edit({ contentHashBefore: "old-hash" }), selected })).resolves.toMatchObject({
      kind: "notice",
    });
  });

  it("blocks unsaved-draft proposals when the draft baseline is missing", async () => {
    await expect(
      resolveChatFileEditApplication({
        draft: "current draft\n",
        edit: edit({ contentHashBefore: selected.contentHash, draftStateBefore: "unsaved" }),
        selected,
      }),
    ).resolves.toMatchObject({
      kind: "notice",
      message: "This chat edit is missing the draft baseline. Ask chat to regenerate the edit.",
    });
  });

  it("blocks unsaved-draft proposals when the current draft changed", async () => {
    await expect(
      resolveChatFileEditApplication({
        draft: "changed draft\n",
        edit: edit({
          contentHashBefore: selected.contentHash,
          draftContentHashBefore: await hashDraftContent("original draft\n"),
          draftStateBefore: "unsaved",
        }),
        selected,
      }),
    ).resolves.toMatchObject({
      kind: "notice",
      message: "Your draft changed after chat proposed this edit. Ask chat to regenerate before applying it.",
    });
  });

  it("applies unsaved-draft proposals when the draft baseline still matches", async () => {
    const draft = "current draft\n";

    await expect(
      resolveChatFileEditApplication({
        draft,
        edit: edit({
          contentHashBefore: selected.contentHash,
          draftContentHashBefore: await hashDraftContent(draft),
          draftStateBefore: "unsaved",
        }),
        selected,
      }),
    ).resolves.toMatchObject({
      kind: "apply",
      content: "next\n",
    });
  });

  it("applies proposals that match the selected file state", async () => {
    await expect(resolveChatFileEditApplication({ draft: selected.content, edit: edit({ contentHashBefore: selected.contentHash }), selected })).resolves.toEqual({
      kind: "apply",
      content: "next\n",
      message: "Applied the chat edit to the unsaved editor draft. Review and save when ready.",
    });
  });
});
