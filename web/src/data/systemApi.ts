import type { KissAiUpdateResponse } from "../contracts/api";
import { request } from "./request";

export const systemApi = {
  updateKissAi: () =>
    request<KissAiUpdateResponse>("/api/system/update", {
      method: "POST",
    }),
};
