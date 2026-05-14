import type {
  KissAiUpdateCheckResponse,
  KissAiUpdateResponse,
  SaveCursorApiKeyRequest,
  SaveCursorApiKeyResponse,
  SystemSettingsResponse,
} from "../contracts/api";
import { request } from "./request";

export const systemApi = {
  systemSettings: () => request<SystemSettingsResponse>("/api/system/settings"),
  saveCursorApiKey: (body: SaveCursorApiKeyRequest) =>
    request<SaveCursorApiKeyResponse>("/api/system/settings/cursor-api-key", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  checkKissAiUpdate: () =>
    request<KissAiUpdateCheckResponse>("/api/system/update/check", {
      method: "POST",
    }),
  updateKissAi: () =>
    request<KissAiUpdateResponse>("/api/system/update", {
      method: "POST",
    }),
};
