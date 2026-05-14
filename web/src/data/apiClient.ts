import { chatApi } from "./chatApi";
import { filesApi } from "./filesApi";
import { projectsApi } from "./projectsApi";
import { rebuildApi } from "./rebuildApi";
import { requirementsSyncApi } from "./requirementsSyncApi";
import { systemApi } from "./systemApi";

export const api = {
  ...chatApi,
  ...filesApi,
  ...projectsApi,
  ...rebuildApi,
  ...requirementsSyncApi,
  ...systemApi,
};
