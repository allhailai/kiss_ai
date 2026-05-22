import { spawn } from "node:child_process";
import path from "node:path";

function normalizeCommandOutput(output) {
  return String(output ?? "").trim();
}

function truncateOutput(output) {
  const normalized = normalizeCommandOutput(output);
  return normalized.length > 4000 ? `${normalized.slice(0, 4000)}\n...` : normalized;
}

export function createKissAiUpdateService({ HUB_ROOT, WEB_ROOT, PORT, execFileText, httpError }) {
  const SCRIPTS_ROOT = path.resolve(HUB_ROOT, "scripts");

  async function git(args) {
    return execFileText("git", args, { cwd: HUB_ROOT });
  }

  async function currentShortRevision(ref) {
    return normalizeCommandOutput(await git(["rev-parse", "--short", ref]));
  }

  async function ensureGitCheckout() {
    try {
      const insideWorkTree = normalizeCommandOutput(await git(["rev-parse", "--is-inside-work-tree"]));
      if (insideWorkTree !== "true") {
        throw httpError("_kiss_ai is not a Git checkout, so the app cannot update it automatically.", 409, "kiss_ai_not_git_checkout");
      }
    } catch (error) {
      if (error?.code === "kiss_ai_not_git_checkout") throw error;
      throw httpError("_kiss_ai is not a Git checkout, so the app cannot update it automatically.", 409, "kiss_ai_not_git_checkout");
    }
  }

  async function ensureCleanWorkingTree() {
    const status = normalizeCommandOutput(await git(["status", "--porcelain"]));
    if (!status) return;

    throw httpError(
      "_kiss_ai has local file changes. Ask a maintainer to save or clear those changes before getting the latest version.",
      409,
      "kiss_ai_working_tree_dirty",
    );
  }

  async function upstreamBranch() {
    try {
      const upstream = normalizeCommandOutput(await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]));
      if (upstream) return upstream;
    } catch {
      // Handled below with a user-facing error.
    }

    throw httpError("_kiss_ai is not connected to a GitHub branch for updates. Ask a maintainer to set the Git upstream.", 409, "kiss_ai_upstream_missing");
  }

  async function fetchUpstream(upstream) {
    const [remoteName] = upstream.split("/");
    if (!remoteName) {
      throw httpError("_kiss_ai is not connected to a GitHub branch for updates. Ask a maintainer to set the Git upstream.", 409, "kiss_ai_upstream_missing");
    }

    try {
      await git(["fetch", "--prune", remoteName]);
    } catch {
      throw httpError("Could not check for the latest KISS AI version. Ask a maintainer to check the Git repository connection.", 500, "kiss_ai_update_check_failed");
    }
  }

  async function checkKissAiUpdate() {
    await ensureGitCheckout();
    await ensureCleanWorkingTree();

    const upstream = await upstreamBranch();
    await fetchUpstream(upstream);

    const localRevision = await currentShortRevision("HEAD");
    const remoteRevision = await currentShortRevision(upstream);

    return {
      status: localRevision === remoteRevision ? "up_to_date" : "update_available",
      updateAvailable: localRevision !== remoteRevision,
      localRevision,
      remoteRevision,
      upstream,
    };
  }

  async function changedDependencyFiles(beforeRevision, afterRevision) {
    if (!beforeRevision || !afterRevision || beforeRevision === afterRevision) return [];

    const output = normalizeCommandOutput(
      await git(["diff", "--name-only", beforeRevision, afterRevision, "--", "web/package.json", "web/package-lock.json"]),
    );
    return output ? output.split("\n").filter(Boolean) : [];
  }

  async function updateKissAi() {
    await ensureGitCheckout();
    await ensureCleanWorkingTree();

    const beforeRevision = await currentShortRevision("HEAD");
    let pullOutput = "";

    try {
      pullOutput = truncateOutput(await git(["pull", "--ff-only"]));
    } catch {
      throw httpError("Could not get the latest kiss_ai files. Ask a maintainer to check the Git repository connection.", 500, "kiss_ai_update_failed");
    }

    const afterRevision = await currentShortRevision("HEAD");
    const dependencyFiles = await changedDependencyFiles(beforeRevision, afterRevision);
    let dependencyInstall = null;

    if (dependencyFiles.length) {
      let output = "";
      try {
        output = truncateOutput(await execFileText("npm", ["install"], { cwd: WEB_ROOT }));
      } catch {
        throw httpError("kiss_ai updated, but app dependencies could not be refreshed. Ask a maintainer to run npm install in _kiss_ai/web.", 500, "kiss_ai_dependency_install_failed");
      }

      dependencyInstall = {
        ran: true,
        output,
      };
    }

    return {
      status: beforeRevision === afterRevision ? "up_to_date" : "updated",
      beforeRevision,
      afterRevision,
      pullOutput,
      dependencyInstall: dependencyInstall ?? { ran: false, output: "" },
    };
  }

  async function updateAndRestart() {
    await ensureGitCheckout();
    await ensureCleanWorkingTree();

    const beforeRevision = await currentShortRevision("HEAD");
    let pullOutput = "";

    try {
      pullOutput = truncateOutput(await git(["pull", "--ff-only"]));
    } catch {
      throw httpError("Could not get the latest kiss_ai files. Ask a maintainer to check the Git repository connection.", 500, "kiss_ai_update_failed");
    }

    const afterRevision = await currentShortRevision("HEAD");

    if (beforeRevision === afterRevision) {
      return {
        status: "up_to_date",
        restarting: false,
        beforeRevision,
        afterRevision,
        pullOutput,
      };
    }

    // Spawn the restart script as a fully detached process.
    // It will wait for this process to exit, run npm install, then start npm run dev.
    const scriptPath = path.join(SCRIPTS_ROOT, "restart.sh");
    const apiPort = String(PORT);

    const child = spawn("bash", [scriptPath, WEB_ROOT, apiPort, String(process.pid)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Schedule self-exit shortly after the HTTP response is sent.
    setTimeout(() => process.exit(0), 500);

    return {
      status: "updated",
      restarting: true,
      beforeRevision,
      afterRevision,
      pullOutput,
    };
  }

  return {
    checkKissAiUpdate,
    updateAndRestart,
    updateKissAi,
  };
}
