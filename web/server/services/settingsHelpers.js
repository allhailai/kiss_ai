import fs from "node:fs/promises";
import path from "node:path";

const defaultKeybindings = {
  toggleLeftPanel: "Ctrl+Shift+Meta+ArrowLeft",
  toggleRightPanel: "Ctrl+Shift+Meta+ArrowRight",
};

/**
 * Create a service for reading and writing .kiss_ai_settings.json preferences.
 *
 * @param {{ projectsRoot: string }} deps
 */
export function createSettingsService({ projectsRoot }) {
  const settingsPath = path.join(projectsRoot, ".kiss_ai_settings.json");

  async function readSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function writeSettings(settings) {
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }

  async function readKeybindings() {
    const parsed = await readSettings();
    const userBindings = parsed?.keybindings ?? {};
    return { ...defaultKeybindings, ...userBindings };
  }

  async function readProjectsViewPreference() {
    const parsed = await readSettings();
    const view = parsed?.projects_view;
    return { view: view === "table" ? "table" : "cards" };
  }

  async function writeProjectsViewPreference(view) {
    const settings = await readSettings();
    settings.projects_view = view === "table" ? "table" : "cards";
    await writeSettings(settings);
    return { view: settings.projects_view };
  }

  async function readPinnedProjects() {
    const parsed = await readSettings();
    const pinned = parsed?.pinned_projects;
    return { pinned: Array.isArray(pinned) ? pinned : [] };
  }

  async function writePinnedProjects(pinned) {
    const settings = await readSettings();
    settings.pinned_projects = Array.isArray(pinned) ? pinned.filter((s) => typeof s === "string") : [];
    await writeSettings(settings);
    return { pinned: settings.pinned_projects };
  }

  return {
    readKeybindings,
    readPinnedProjects,
    readProjectsViewPreference,
    writePinnedProjects,
    writeProjectsViewPreference,
  };
}
