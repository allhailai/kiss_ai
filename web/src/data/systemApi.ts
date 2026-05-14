import type { KissAiUpdateCheckResponse, KissAiUpdateResponse } from "../contracts/api";
import { request } from "./request";

export const systemApi = {
  checkKissAiUpdate: () =>
    request<KissAiUpdateCheckResponse>("/api/system/update/check", {
      method: "POST",
    }),
  updateKissAi: () =>
    request<KissAiUpdateResponse>("/api/system/update", {
      method: "POST",
    }),
};
