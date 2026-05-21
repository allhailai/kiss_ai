import { describe, expect, it } from "vitest";
import { hasSettledAssistantReply } from "./conversation";
import type { Conversation } from "../contracts/api";

function makeConversation(messages: Array<{ role: string; status?: string }>): Conversation {
  return {
    id: "test-conv",
    title: "Test",
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      role: m.role,
      content: "Hello",
      status: m.status ?? "complete",
      createdAt: new Date().toISOString(),
    })),
  } as unknown as Conversation;
}

describe("hasSettledAssistantReply", () => {
  it("returns true when latest message is a complete assistant reply", () => {
    const conv = makeConversation([
      { role: "user" },
      { role: "assistant", status: "complete" },
    ]);
    expect(hasSettledAssistantReply(conv)).toBe(true);
  });

  it("returns false when latest message is a streaming assistant reply", () => {
    const conv = makeConversation([
      { role: "user" },
      { role: "assistant", status: "streaming" },
    ]);
    expect(hasSettledAssistantReply(conv)).toBe(false);
  });

  it("returns false when latest message is from user", () => {
    const conv = makeConversation([
      { role: "assistant" },
      { role: "user" },
    ]);
    expect(hasSettledAssistantReply(conv)).toBe(false);
  });

  it("returns false for empty conversations", () => {
    const conv = makeConversation([]);
    expect(hasSettledAssistantReply(conv)).toBe(false);
  });
});
