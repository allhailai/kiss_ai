import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function createProjectFileService({
  WEB_ROOT,
  MAX_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_SEARCH_RESULTS,
  humanFiles,
  hashText,
  humanizePathSegment,
  httpError,
}) {
  const previewableExtensions = new Set([
    ".css",
    ".csv",
    ".html",
    ".js",
    ".json",
    ".md",
    ".txt",
    ".ts",
    ".tsx",
    ".tsv",
    ".xml",
    ".yaml",
    ".yml",
  ]);

  function isPathInsideRoot(root, candidate) {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`);
  }

  function isPreviewablePath(relativePath) {
    return previewableExtensions.has(path.extname(relativePath).toLowerCase());
  }

  function isHiddenProjectPath(relativePath) {
    return relativePath.split("/").some((segment) => segment.startsWith("."));
  }

  function isChatContextReadablePath(relativePath, previewable = true) {
    if (!previewable) return false;
    return (
      /^human_[^/]+\.md$/i.test(relativePath) ||
      relativePath.startsWith("inputs_human/") ||
      relativePath.startsWith("inputs_ai/") ||
      relativePath.startsWith("outputs_ai/")
    );
  }

  function hasTraversalSegment(relativePath) {
    return String(relativePath ?? "")
      .replaceAll("\\", "/")
      .split("/")
      .some((segment) => segment === "..");
  }

  function projectFileItem(rootRelative, relative, meta, stat) {
    const previewable = isPreviewablePath(relative);

    return {
      path: meta.path,
      name: relative.replace(`${rootRelative}/`, ""),
      kind: meta.kind,
      editable: meta.editable && previewable,
      annotation: meta.annotation,
      chatContextReadable: isChatContextReadablePath(meta.path, previewable),
      modifiedAt: stat.mtime.toISOString(),
      previewable,
    };
  }

  async function fileExists(absolutePath) {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async function rejectSymlinkEntry(absolutePath) {
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      throw httpError("Symlinked project paths cannot be managed in the lab UI.", 403, "path_symlink");
    }
    return stat;
  }

  function projectPath(projectRoot, relativePath) {
    if (hasTraversalSegment(relativePath)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    const normalized = path.normalize(String(relativePath ?? ""));
    const absolute = path.resolve(projectRoot, normalized);

    if (!isPathInsideRoot(projectRoot, absolute)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    return { absolute, relative: path.relative(projectRoot, absolute).replaceAll(path.sep, "/") };
  }

  async function resolveProjectFileTarget(projectRoot, relativePath, { allowMissing = false } = {}) {
    const target = projectPath(projectRoot, relativePath);
    const projectRootReal = await fs.realpath(projectRoot);
    const parentReal = await fs.realpath(path.dirname(target.absolute));

    if (!isPathInsideRoot(projectRootReal, parentReal)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    try {
      const linkStat = await fs.lstat(target.absolute);
      if (linkStat.isSymbolicLink()) {
        throw httpError("Symlinked project files cannot be managed in the lab UI.", 403, "path_symlink");
      }

      const targetReal = await fs.realpath(target.absolute);
      if (!isPathInsideRoot(projectRootReal, targetReal)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      if (error?.code === "ENOENT" && allowMissing) return target;
      throw error;
    }

    return target;
  }

  async function resolveProjectDirectory(projectRoot, relativePath, { allowMissing = false } = {}) {
    const target = projectPath(projectRoot, relativePath);
    const projectRootReal = await fs.realpath(projectRoot);

    try {
      const linkStat = await fs.lstat(target.absolute);
      if (linkStat.isSymbolicLink()) {
        throw httpError("Symlinked project directories cannot be managed in the lab UI.", 403, "path_symlink");
      }

      const targetReal = await fs.realpath(target.absolute);
      if (!isPathInsideRoot(projectRootReal, targetReal)) {
        throw httpError("Path escapes the project root.", 403, "path_escape");
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      if (error?.code === "ENOENT" && allowMissing) return target;
      throw error;
    }

    return target;
  }

  function classifyPath(projectRoot, relativePath) {
    const normalized = projectPath(projectRoot, relativePath).relative;
    const human = humanFiles.get(normalized);

    if (human) {
      return { path: normalized, ...human };
    }

    if (/^human_[^/]+\.md$/i.test(normalized)) {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    if (normalized.startsWith("inputs_ai/")) {
      return { path: normalized, kind: "ai", editable: true, annotation: true };
    }

    if (normalized.startsWith("outputs_ai/")) {
      return { path: normalized, kind: "output", editable: true, annotation: true };
    }

    if (normalized.startsWith("inputs_human/")) {
      return { path: normalized, kind: "human", editable: true, annotation: false, previewable: isPreviewablePath(normalized) };
    }

    if (normalized.startsWith("change_logs/")) {
      return { path: normalized, kind: "log", editable: false, annotation: false };
    }

    throw httpError("Path is not allowlisted for the lab UI.", 403, "path_not_allowlisted");
  }

  async function readProjectJson(projectRoot, relativePath, fallback = null) {
    const { absolute } = await resolveProjectFileTarget(projectRoot, relativePath, { allowMissing: fallback !== undefined });
    try {
      return JSON.parse(await fs.readFile(absolute, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return fallback;
      if (error instanceof SyntaxError) {
        throw httpError(`Could not parse ${relativePath}. Fix or remove the corrupt JSON file.`, 500, "corrupt_project_json");
      }
      throw error;
    }
  }

  async function readTextFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be previewed in the lab UI.", 415, "file_not_previewable");
    }

    if (stat.size > MAX_FILE_BYTES) {
      throw httpError("File is too large to open in the lab UI.", 413, "file_too_large");
    }

    const content = await fs.readFile(absolute, "utf8");

    return {
      ...meta,
      content,
      contentHash: hashText(content),
    };
  }

  async function writeTextFile(projectRoot, relativePath, content, { expectedContentHash = null } = {}) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.editable) {
      throw httpError("This file is read-only in the lab UI.", 403, "file_read_only");
    }

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be edited in the lab UI.", 415, "file_not_previewable");
    }

    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path, { allowMissing: true });
    let currentContent = "";
    try {
      currentContent = await fs.readFile(absolute, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    if (!expectedContentHash) {
      throw httpError("Saving requires the content hash from the loaded file.", 428, "file_hash_required");
    }

    if (hashText(currentContent) !== expectedContentHash) {
      throw httpError("This file changed after it was loaded. Refresh the file before saving.", 409, "file_changed");
    }

    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      throw httpError("File is too large to save in the lab UI.", 413, "file_too_large");
    }

    await fs.writeFile(absolute, content, "utf8");
    return readTextFile(projectRoot, meta.path);
  }

  async function listMarkdownFiles(projectRoot, rootRelative, kind, editable, annotation) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative, { allowMissing: true });
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.name.endsWith(".md")) continue;

        const stat = await fs.stat(absolute);
        files.push({
          path: relative,
          name: relative.replace(`${root.relative}/`, ""),
          kind,
          editable,
          annotation,
          chatContextReadable: isChatContextReadablePath(relative),
          modifiedAt: stat.mtime.toISOString(),
          previewable: true,
        });
      }
    }

    try {
      await walk(root.absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async function listProjectFiles(projectRoot, rootRelative) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative, { allowMissing: true });
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (isHiddenProjectPath(relative)) continue;

        const meta = classifyPath(projectRoot, relative);
        const stat = await fs.stat(absolute);
        files.push(projectFileItem(root.relative, relative, meta, stat));
      }
    }

    try {
      await walk(root.absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  function safeUploadFileName(rawName) {
    const baseName = path.basename(String(rawName ?? "").replaceAll("\\", "/")).trim();
    const safeName = baseName.replace(/[\x00-\x1f<>:"|?*]/g, "_");

    if (!safeName || safeName === "." || safeName === "..") {
      throw httpError("Uploaded files need a valid filename.", 400, "invalid_upload_filename");
    }

    return safeName;
  }

  async function uploadHumanInputFiles(projectRoot, rawFiles) {
    const files = Array.isArray(rawFiles) ? rawFiles : [];

    if (!files.length) {
      throw httpError("Upload requires at least one file.", 400, "upload_empty");
    }

    const uploaded = [];

    for (const rawFile of files) {
      const name = safeUploadFileName(rawFile?.name);
      const contentBase64 = typeof rawFile?.contentBase64 === "string" ? rawFile.contentBase64 : "";
      const buffer = Buffer.from(contentBase64, "base64");

      if (!contentBase64 || buffer.length === 0) {
        throw httpError(`Uploaded file ${name} is empty or invalid.`, 400, "invalid_upload_content");
      }

      if (buffer.length > MAX_UPLOAD_BYTES) {
        throw httpError(`Uploaded file ${name} is too large.`, 413, "upload_too_large");
      }

      const target = projectPath(projectRoot, `inputs_human/${name}`);
      await fs.mkdir(path.dirname(target.absolute), { recursive: true });
      const { absolute, relative } = await resolveProjectFileTarget(projectRoot, target.relative, { allowMissing: true });
      await fs.writeFile(absolute, buffer);

      const meta = classifyPath(projectRoot, relative);
      const stat = await fs.stat(absolute);
      uploaded.push(projectFileItem("inputs_human", relative, meta, stat));
    }

    return { files: uploaded };
  }

  async function pruneEmptyDirectories(rootAbsolute, currentAbsolute) {
    if (currentAbsolute === rootAbsolute || !isPathInsideRoot(rootAbsolute, currentAbsolute)) return;

    const entries = await fs.readdir(currentAbsolute);
    if (entries.length > 0) return;

    await fs.rmdir(currentAbsolute);
    await pruneEmptyDirectories(rootAbsolute, path.dirname(currentAbsolute));
  }

  async function deleteHumanInputFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.path.startsWith("inputs_human/")) {
      throw httpError("Only human input files can be deleted here.", 403, "delete_not_allowed");
    }

    if (isHiddenProjectPath(meta.path)) {
      throw httpError("Hidden project files cannot be managed in the lab UI.", 403, "hidden_file");
    }

    const { absolute } = await resolveProjectFileTarget(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

    if (!stat.isFile()) {
      throw httpError("Only files can be deleted here.", 400, "delete_not_file");
    }

    await fs.unlink(absolute);
    const inputRoot = projectPath(projectRoot, "inputs_human");
    await pruneEmptyDirectories(inputRoot.absolute, path.dirname(absolute));

    return { path: meta.path };
  }

  async function readSearchAllowedPaths() {
    let lookup = {};

    try {
      lookup = JSON.parse(await fs.readFile(path.join(WEB_ROOT, "server/search-allowed-paths.json"), "utf8"));
    } catch {
      lookup = {};
    }

    return {
      directories: Array.isArray(lookup.directories) ? lookup.directories.map(String) : [],
      files: Array.isArray(lookup.files) ? lookup.files.map(String) : [],
    };
  }

  function fileMatchesPattern(fileName, pattern) {
    if (pattern === "human_*.md") {
      return /^human_[^/]+\.md$/i.test(fileName);
    }

    return fileName === pattern;
  }

  async function listSearchDirectoryFiles(projectRoot, rootRelative) {
    const root = await resolveProjectDirectory(projectRoot, rootRelative.replace(/\/+$/, ""), { allowMissing: true });
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");
        await rejectSymlinkEntry(absolute);
        if (isHiddenProjectPath(relative)) continue;

        if (entry.isDirectory()) {
          await walk(absolute);
          continue;
        }

        if (!entry.name.endsWith(".md")) continue;

        const meta = classifyPath(projectRoot, relative);
        const stat = await fs.stat(absolute);
        files.push({
          path: meta.path,
          name: relative.replace(`${root.relative}/`, ""),
          kind: meta.kind,
          editable: meta.editable,
          annotation: meta.annotation,
          chatContextReadable: isChatContextReadablePath(meta.path),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    try {
      await walk(root.absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    return files;
  }

  async function listSearchPatternFiles(projectRoot, pattern) {
    const root = projectPath(projectRoot, ".");
    const entries = await fs.readdir(root.absolute, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      await rejectSymlinkEntry(path.join(root.absolute, entry.name));
      if (!entry.isFile() || !fileMatchesPattern(entry.name, pattern)) continue;

      const meta = classifyPath(projectRoot, entry.name);
      const stat = await fs.stat(path.join(root.absolute, entry.name));
      files.push({
        path: meta.path,
        name: meta.path,
        kind: meta.kind,
        editable: meta.editable,
        annotation: meta.annotation,
        chatContextReadable: isChatContextReadablePath(meta.path),
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    return files;
  }

  async function searchFiles(projectRoot, query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const allowlist = await readSearchAllowedPaths();
    const candidates = [
      ...(await Promise.all(allowlist.directories.map((directory) => listSearchDirectoryFiles(projectRoot, directory)))).flat(),
      ...(await Promise.all(allowlist.files.map((pattern) => listSearchPatternFiles(projectRoot, pattern)))).flat(),
    ];
    const uniqueCandidates = [...new Map(candidates.map((file) => [file.path, file])).values()];

    return uniqueCandidates
      .filter((file) => {
        const searchableText = [
          file.path,
          file.name,
          ...file.path.split("/").map(humanizePathSegment),
          humanizePathSegment(file.name.split("/").at(-1) ?? file.name),
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      })
      .sort((left, right) => left.path.localeCompare(right.path))
      .slice(0, MAX_SEARCH_RESULTS);
  }

  async function gitStatus(projectRoot) {
    return new Promise((resolve) => {
      execFile("git", ["status", "--short"], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve([`git status unavailable: ${error.message}`]);
          return;
        }

        resolve(stdout.split("\n").filter(Boolean));
      });
    });
  }

  function parseGitDiff(relativePath, diffText) {
    const ranges = [];
    const deletions = [];
    const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
    let match;

    while ((match = hunkPattern.exec(diffText)) !== null) {
      const oldStart = Number(match[1]);
      const oldCount = Number(match[2] ?? "1");
      const newStart = Number(match[3]);
      const newCount = Number(match[4] ?? "1");

      if (newCount > 0) {
        ranges.push({ from: newStart, to: newStart + newCount - 1 });
      }

      if (oldCount > 0 && newCount === 0) {
        deletions.push({ afterLine: Math.max(0, newStart), count: oldCount });
      }

      if (oldCount > newCount && newCount > 0) {
        deletions.push({ afterLine: newStart + newCount - 1, count: oldCount - newCount });
      }
    }

    return { path: relativePath, ranges, deletions };
  }

  async function gitFileDiff(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    await resolveProjectFileTarget(projectRoot, meta.path);

    return new Promise((resolve) => {
      execFile("git", ["diff", "--unified=0", "--", meta.path], { cwd: projectRoot }, (error, stdout) => {
        if (error) {
          resolve({ path: meta.path, ranges: [], deletions: [] });
          return;
        }

        resolve(parseGitDiff(meta.path, stdout));
      });
    });
  }

  async function restoreFileFromHead(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.editable) {
      throw httpError("This file is read-only in the lab UI.", 403, "file_read_only");
    }

    if (meta.previewable === false) {
      throw httpError("This file type is saved in the project but cannot be restored in the lab UI.", 415, "file_not_previewable");
    }

    await resolveProjectFileTarget(projectRoot, meta.path);

    await new Promise((resolve, reject) => {
      execFile("git", ["restore", "--source=HEAD", "--staged", "--worktree", "--", meta.path], { cwd: projectRoot }, (error) => {
        if (error) {
          reject(httpError("Could not restore this file from Git HEAD.", 500, "git_restore_failed"));
          return;
        }

        resolve(null);
      });
    });

    return readTextFile(projectRoot, meta.path);
  }

  return {
    classifyPath,
    deleteHumanInputFile,
    fileExists,
    gitFileDiff,
    gitStatus,
    isPathInsideRoot,
    listMarkdownFiles,
    listProjectFiles,
    projectPath,
    readProjectJson,
    readTextFile,
    restoreFileFromHead,
    searchFiles,
    uploadHumanInputFiles,
    writeTextFile,
  };
}
