import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";

/**
 * Gets the current commit hash for a local Git repository.
 * Runs `git -C <path> rev-parse HEAD` asynchronously.
 * Returns null if it is not a Git repo or an error occurs.
 */
export function getGitCommitHash(repoPath) {
  return new Promise((resolve) => {
    execFile("git", ["-C", repoPath, "rev-parse", "HEAD"], (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Parses the ## External Repositories section of project.md, or .kiss_ai/external_repos.json.
 * Supports:
 * - JSON config (array of { name, path } or key-value map)
 * - Markdown links and key-value entries in project.md (fallback)
 */
export async function parseExternalRepos(projectPath) {
  // 1. Try parsing from .kiss_ai/external_repos.json
  const jsonPath = path.join(projectPath, ".kiss_ai", "external_repos.json");
  try {
    const jsonContent = await fs.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(jsonContent);
    const repos = [];
    
    const processPath = (rawPath) => {
      let repoPath = String(rawPath).trim();
      if (repoPath.startsWith("file://")) {
        repoPath = repoPath.slice(7);
      }
      return path.isAbsolute(repoPath) ? repoPath : path.resolve(projectPath, repoPath);
    };

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === "object" && item.name && item.path) {
          repos.push({
            name: String(item.name).trim(),
            path: processPath(item.path)
          });
        }
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [name, rawPath] of Object.entries(parsed)) {
        if (rawPath) {
          repos.push({
            name: name.trim(),
            path: processPath(rawPath)
          });
        }
      }
    }
    
    if (repos.length > 0) {
      return repos;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to project.md
  }

  // 2. Fallback to project.md parsing
  const projectMdPath = path.join(projectPath, "project.md");
  try {
    const content = await fs.readFile(projectMdPath, "utf8");
    const sectionMatch = content.match(/## External Repositories\s*\n([\s\S]*?)(?=\n##|$)/);
    if (!sectionMatch) return [];
    
    const lines = sectionMatch[1].split("\n");
    const repos = [];
    for (const line of lines) {
      // 1. Markdown link format: - [name](path)
      const linkMatch = line.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        let repoPath = linkMatch[2].trim();
        if (repoPath.startsWith("file://")) {
          repoPath = repoPath.slice(7);
        }
        repos.push({
          name: linkMatch[1].trim(),
          path: path.isAbsolute(repoPath) ? repoPath : path.resolve(projectPath, repoPath)
        });
        continue;
      }
      
      // 2. Key-value format: - name: path
      const kvMatch = line.match(/^\s*[-*]\s*([^:]+):\s*(.*)/);
      if (kvMatch) {
        let repoPath = kvMatch[2].trim();
        if (repoPath.startsWith("file://")) {
          repoPath = repoPath.slice(7);
        }
        repos.push({
          name: kvMatch[1].trim(),
          path: path.isAbsolute(repoPath) ? repoPath : path.resolve(projectPath, repoPath)
        });
      }
    }
    return repos;
  } catch {
    return [];
  }
}

/**
 * Resolves current commit hashes for all external repositories listed in project.md.
 * Returns a map of { [repoName]: commitHash }.
 */
export async function getCurrentRepoHashes(projectPath) {
  const repos = await parseExternalRepos(projectPath);
  const hashes = {};
  for (const repo of repos) {
    const hash = await getGitCommitHash(repo.path);
    if (hash) {
      hashes[repo.name] = hash;
    }
  }
  return hashes;
}

/**
 * Recursively lists all files in the docs/ directory of an external repository.
 * Returns an array of absolute file paths.
 */
export async function listDocsFiles(repoPath) {
  const docsDir = path.join(repoPath, "docs");
  const files = [];
  
  async function walk(currentPath) {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist or is not readable
    }
    
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  
  await walk(docsDir);
  return files;
}
