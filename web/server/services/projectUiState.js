import fs from "node:fs/promises";
import path from "node:path";

const uiStateDirectory = ".kiss_ai";
const uiStateFile = "ui_state.json";
const defaultProjectUiState = Object.freeze({ version: 1 });

export function createProjectUiStateService({ httpError, isPathInsideRoot }) {
  async function uiStatePath(projectRoot) {
    const projectRootReal = await fs.realpath(projectRoot);
    const directory = path.resolve(projectRootReal, uiStateDirectory);
    const file = path.resolve(directory, uiStateFile);

    if (!isPathInsideRoot(projectRootReal, directory) || !isPathInsideRoot(projectRootReal, file)) {
      throw httpError("Project UI state path escapes the project root.", 403, "ui_state_path_escape");
    }

    return { directory, file };
  }

  async function readProjectUiStateFile(file) {
    try {
      const state = JSON.parse(await fs.readFile(file, "utf8"));
      return { ...defaultProjectUiState, ...state, version: 1 };
    } catch (error) {
      if (error?.code === "ENOENT") return { ...defaultProjectUiState };
      if (error instanceof SyntaxError) {
        throw httpError("Could not parse .kiss_ai/ui_state.json. Fix or remove the corrupt JSON file.", 500, "corrupt_project_ui_state");
      }
      throw error;
    }
  }

  async function readProjectUiState(projectRoot) {
    const { file } = await uiStatePath(projectRoot);
    return readProjectUiStateFile(file);
  }

  async function writeProjectUiState(projectRoot, patch) {
    const { directory, file } = await uiStatePath(projectRoot);
    const current = await readProjectUiStateFile(file);
    const next = {
      ...current,
      ...patch,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  return {
    readProjectUiState,
    writeProjectUiState,
  };
}
