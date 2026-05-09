import type {
  AiAssistProposal,
  AiAssistRequest,
  DesignState,
  RequirementsAutoUpdateAcceptRequest,
  RequirementsAutoUpdateAcceptResponse,
  RequirementsAutoUpdateProposeRequest,
  RequirementsAutoUpdateProposeResponse,
} from "../contracts/api";
import { projectBase, request } from "./request";

export const aiApi = {
  aiAssistPropose: (projectSlug: string, body: AiAssistRequest) =>
    request<AiAssistProposal>(`${projectBase(projectSlug)}/ai-assist/propose`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  aiAssistRefine: (projectSlug: string, body: AiAssistRequest) =>
    request<AiAssistProposal>(`${projectBase(projectSlug)}/ai-assist/refine`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requirementsAutoUpdatePropose: (projectSlug: string, body: RequirementsAutoUpdateProposeRequest) =>
    request<RequirementsAutoUpdateProposeResponse>(`${projectBase(projectSlug)}/requirements/auto-update/propose`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requirementsAutoUpdateAccept: (projectSlug: string, body: RequirementsAutoUpdateAcceptRequest) =>
    request<RequirementsAutoUpdateAcceptResponse>(`${projectBase(projectSlug)}/requirements/auto-update/accept`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  design: (projectSlug: string) => request<DesignState>(`${projectBase(projectSlug)}/design`),
};
