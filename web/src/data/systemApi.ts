import type {
  Keybindings,
  KissAiUpdateAndRestartResponse,
  KissAiUpdateCheckResponse,
  KissAiUpdateResponse,
  SaveCursorApiKeyRequest,
  SaveCursorApiKeyResponse,
  SystemSettingsResponse,
} from "../contracts/api";
import { request } from "./request";

export const systemApi = {
  keybindings: () => request<Keybindings>("/api/system/keybindings"),
  projectsView: () => request<{ view: "cards" | "table" }>("/api/system/projects-view"),
  setProjectsView: (view: "cards" | "table") =>
    request<{ view: "cards" | "table" }>("/api/system/projects-view", {
      method: "PUT",
      body: JSON.stringify({ view }),
    }),
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
  updateAndRestartKissAi: () =>
    request<KissAiUpdateAndRestartResponse>("/api/system/update-and-restart", {
      method: "POST",
    }),
};
