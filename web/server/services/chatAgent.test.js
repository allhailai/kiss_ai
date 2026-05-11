import { describe, expect, it } from "vitest";
import { extractFileEditProposals } from "./chatAgent.js";

const conversation = {
  messages: [
    {
      context: {
        editableFiles: [
          {
            path: "human_goal_requirements.md",
            contentHash: "hash-before",
            draftState: "saved",
          },
        ],
      },
    },
  ],
};

const unsavedDraftConversation = {
  messages: [
    {
      context: {
        editableFiles: [
          {
            path: "human_goal_requirements.md",
            contentHash: "hash-before",
            draftContent: "unsaved draft\n",
            draftState: "unsaved",
          },
        ],
      },
    },
  ],
};

describe("extractFileEditProposals", () => {
  it("extracts authorized file edit proposals", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal",
      "details</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))).toEqual([
      {
        path: "human_goal_requirements.md",
        summary: "Update goal.",
        proposedContent: "New goal\ndetails",
        contentHashBefore: "hash-before",
        draftStateBefore: "saved",
        status: "proposed",
      },
    ]);
  });

  it("preserves proposed replacement content exactly", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>  Leading space",
      "Trailing newline",
      "</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))[0]).toMatchObject({
      proposedContent: "  Leading space\nTrailing newline\n",
    });
  });

  it("records a draft baseline hash for edits based on unsaved drafts", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, unsavedDraftConversation, new Set(["human_goal_requirements.md"]))).toEqual([
      expect.objectContaining({
        draftContentHashBefore: "875c617c41c20743135952b42908802b8ca4679103faac5dfaf13b11ff3b9a22",
        draftStateBefore: "unsaved",
      }),
    ]);
  });

  it("drops proposals for paths not authorized by server-side validation", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set())).toEqual([]);
  });

  it("drops malformed proposals", () => {
    const text = "<file_edit><path>human_goal_requirements.md</path><summary>Missing content.</summary></file_edit>";

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))).toEqual([]);
  });
});
