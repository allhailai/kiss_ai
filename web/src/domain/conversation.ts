import type { Conversation } from "../contracts/api";

export function hasSettledAssistantReply(conversation: Conversation) {
  const latestMessage = conversation.messages.at(-1);
  return latestMessage?.role === "assistant" && latestMessage.status !== "streaming";
}
