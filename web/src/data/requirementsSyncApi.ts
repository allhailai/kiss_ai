import type {
  ApplyRequirementsSyncRequest,
  ApplyRequirementsSyncResponse,
  ProposeRequirementsSyncRequest,
  ProposeRequirementsSyncResponse,
  ReviewRequirementsSyncRequest,
  ReviewRequirementsSyncResponse,
  RequirementsSyncSignalsResponse,
} from "../contracts/api";
import { projectBase, request } from "./request";

export const requirementsSyncApi = {
  requirementsSyncSignals: (projectSlug: string) =>
    request<RequirementsSyncSignalsResponse>(`${projectBase(projectSlug)}/requirements-sync/signals`),
  proposeRequirementsSync: (projectSlug: string, body: ProposeRequirementsSyncRequest) =>
    request<ProposeRequirementsSyncResponse>(`${projectBase(projectSlug)}/requirements-sync/propose`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applyRequirementsSync: (projectSlug: string, body: ApplyRequirementsSyncRequest) =>
    request<ApplyRequirementsSyncResponse>(`${projectBase(projectSlug)}/requirements-sync/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reviewRequirementsSync: (projectSlug: string, body: ReviewRequirementsSyncRequest) =>
    request<ReviewRequirementsSyncResponse>(`${projectBase(projectSlug)}/requirements-sync/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
