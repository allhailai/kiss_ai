import { authApi } from "./authApi";
import { chatApi } from "./chatApi";
import { filesApi } from "./filesApi";
import { projectsApi } from "./projectsApi";
import { rebuildApi } from "./rebuildApi";
import { systemApi } from "./systemApi";

export const api = {
  ...authApi,
  ...chatApi,
  ...filesApi,
  ...projectsApi,
  ...rebuildApi,
  ...systemApi,
};
