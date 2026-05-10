import type { AgentCapabilitiesResponse, AgentSession, SendAgentSessionMessageRequest } from "../contracts/api";
import { projectBase, request } from "./request";

export const agentsApi = {
  agentCapabilities: (projectSlug: string) => request<AgentCapabilitiesResponse>(`${projectBase(projectSlug)}/agent-capabilities`),
  agentSession: (projectSlug: string) => request<AgentSession>(`${projectBase(projectSlug)}/agent-sessions/default`),
  resetAgentSession: (projectSlug: string) =>
    request<AgentSession>(`${projectBase(projectSlug)}/agent-sessions/default/reset`, {
      method: "POST",
    }),
  sendAgentSessionMessage: (projectSlug: string, body: SendAgentSessionMessageRequest) =>
    request<AgentSession>(`${projectBase(projectSlug)}/agent-sessions/default/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
