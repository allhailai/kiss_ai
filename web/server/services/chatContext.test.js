import { describe, expect, it } from "vitest";
import { normalizeChatContext } from "./chatContext.js";

describe("normalizeChatContext", () => {
  it("preserves unsaved draft content whitespace", () => {
    expect(
      normalizeChatContext({
        currentFile: {
          path: "human_goal_requirements.md",
          draftContent: "  Draft with intentional whitespace\n",
          draftState: "unsaved",
        },
      }),
    ).toMatchObject({
      currentFile: {
        draftContent: "  Draft with intentional whitespace\n",
      },
    });
  });
});
