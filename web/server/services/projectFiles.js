import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function createProjectFileService({
  WEB_ROOT,
  MAX_FILE_BYTES,
  MAX_SEARCH_RESULTS,
  humanFiles,
  hashText,
  humanizePathSegment,
  httpError,
}) {
  function isPathInsideRoot(root, candidate) {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`);
  }

  async function fileExists(absolutePath) {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  function projectPath(projectRoot, relativePath) {
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const absolute = path.resolve(projectRoot, normalized);

    if (!isPathInsideRoot(projectRoot, absolute)) {
      throw httpError("Path escapes the project root.", 403, "path_escape");
    }

    return { absolute, relative: path.relative(projectRoot, absolute).replaceAll(path.sep, "/") };
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
      return { path: normalized, kind: "ai", editable: false, annotation: true };
    }

    if (normalized.startsWith("outputs_ai/")) {
      return { path: normalized, kind: "output", editable: true, annotation: false };
    }

    if (normalized.startsWith("inputs_human/")) {
      return { path: normalized, kind: "human", editable: true, annotation: false };
    }

    if (normalized.startsWith("change_logs/")) {
      return { path: normalized, kind: "log", editable: false, annotation: false };
    }

    throw httpError("Path is not allowlisted for the lab UI.", 403, "path_not_allowlisted");
  }

  async function readProjectJson(projectRoot, relativePath, fallback = null) {
    try {
      const { absolute } = projectPath(projectRoot, relativePath);
      return JSON.parse(await fs.readFile(absolute, "utf8"));
    } catch {
      return fallback;
    }
  }

  async function readTextFile(projectRoot, relativePath) {
    const meta = classifyPath(projectRoot, relativePath);
    const { absolute } = projectPath(projectRoot, meta.path);
    const stat = await fs.stat(absolute);

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

  async function writeTextFile(projectRoot, relativePath, content) {
    const meta = classifyPath(projectRoot, relativePath);

    if (!meta.editable) {
      throw httpError("This file is read-only in the lab UI.", 403, "file_read_only");
    }

    const { absolute } = projectPath(projectRoot, meta.path);
    await fs.writeFile(absolute, content, "utf8");
    return readTextFile(projectRoot, meta.path);
  }

  async function listMarkdownFiles(projectRoot, rootRelative, kind, editable, annotation) {
    const root = projectPath(projectRoot, rootRelative);
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");

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
          modifiedAt: stat.mtime.toISOString(),
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
    const root = projectPath(projectRoot, rootRelative.replace(/\/+$/, ""));
    const files = [];

    async function walk(currentAbsolute) {
      const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;

        const absolute = path.join(currentAbsolute, entry.name);
        const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");

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
      if (!entry.isFile() || !fileMatchesPattern(entry.name, pattern)) continue;

      const meta = classifyPath(projectRoot, entry.name);
      const stat = await fs.stat(path.join(root.absolute, entry.name));
      files.push({
        path: meta.path,
        name: meta.path,
        kind: meta.kind,
        editable: meta.editable,
        annotation: meta.annotation,
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

    await new Promise((resolve, reject) => {
      execFile("git", ["restore", "--source=HEAD", "--staged", "--worktree", "--", meta.path], { cwd: projectRoot }, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(null);
      });
    });

    return readTextFile(projectRoot, meta.path);
  }

  return {
    classifyPath,
    fileExists,
    gitFileDiff,
    gitStatus,
    isPathInsideRoot,
    listMarkdownFiles,
    projectPath,
    readProjectJson,
    readTextFile,
    restoreFileFromHead,
    searchFiles,
    writeTextFile,
  };
}
