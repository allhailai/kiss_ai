import { agentsApi } from "./agentsApi";
import { aiApi } from "./aiApi";
import { chatApi } from "./chatApi";
import { filesApi } from "./filesApi";
import { projectsApi } from "./projectsApi";
import { rebuildApi } from "./rebuildApi";

export const api = {
  ...agentsApi,
  ...aiApi,
  ...chatApi,
  ...filesApi,
  ...projectsApi,
  ...rebuildApi,
};
