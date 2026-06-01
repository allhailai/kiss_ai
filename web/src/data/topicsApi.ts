import type { CreateTopicResponse } from "../contracts/api";
import { projectBase, request } from "./request";

export const topicsApi = {
  create: (projectSlug: string, label: string, justification?: string | null, conversationId?: string | null, force?: boolean) =>
    request<CreateTopicResponse>(`${projectBase(projectSlug)}/topics/create`, {
      method: "POST",
      body: JSON.stringify({ label, justification: justification ?? null, conversationId: conversationId ?? null, force: force ?? false }),
    }),
};
