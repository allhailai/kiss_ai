function normalizeCommandOutput(output) {
  return String(output ?? "").trim();
}

function truncateOutput(output) {
  const normalized = normalizeCommandOutput(output);
  return normalized.length > 4000 ? `${normalized.slice(0, 4000)}\n...` : normalized;
}

export function createKissAiUpdateService({ HUB_ROOT, WEB_ROOT, execFileText, httpError }) {
  async function git(args) {
    return execFileText("git", args, { cwd: HUB_ROOT });
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

    const beforeRevision = normalizeCommandOutput(await git(["rev-parse", "--short", "HEAD"]));
    let pullOutput = "";

    try {
      pullOutput = truncateOutput(await git(["pull", "--ff-only"]));
    } catch {
      throw httpError("Could not get the latest kiss_ai files. Ask a maintainer to check the Git repository connection.", 500, "kiss_ai_update_failed");
    }

    const afterRevision = normalizeCommandOutput(await git(["rev-parse", "--short", "HEAD"]));
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

  return {
    updateKissAi,
  };
}
