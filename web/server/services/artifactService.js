import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const ARTIFACT_SPECS_DIR = "artifacts/artifact_specs";
const ARTIFACT_BUILDS_DIR = "artifacts/builds";

/**
 * Simple glob-like file matching using Node's native fs.
 * Supports patterns like: outputs_ai/wiki/*.md, outputs_ai/**\/*.md
 */
async function simpleGlob(pattern, cwd) {
  // Split pattern into directory prefix and file pattern
  const parts = pattern.split("/");
  const hasGlob = parts.findIndex((p) => p.includes("*"));

  if (hasGlob === -1) {
    // No glob — it's a literal file path
    try {
      await fs.access(path.join(cwd, pattern));
      return [pattern];
    } catch {
      return [];
    }
  }

  // Get the fixed prefix (directories before the first glob segment)
  const fixedPrefix = parts.slice(0, hasGlob).join("/");
  const globParts = parts.slice(hasGlob);

  // Read all files recursively from the fixed prefix
  const baseDir = path.join(cwd, fixedPrefix);
  const allFiles = await readDirRecursive(baseDir, fixedPrefix);

  // Build a simple regex from the remaining glob pattern
  const globRegex = globPartsToRegex(globParts);
  return allFiles.filter((f) => {
    const relative = fixedPrefix ? f.slice(fixedPrefix.length + 1) : f;
    return globRegex.test(relative);
  });
}

async function readDirRecursive(dir, prefix) {
  const results = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...(await readDirRecursive(fullPath, relativePath)));
    } else {
      results.push(relativePath);
    }
  }

  return results;
}

function globPartsToRegex(parts) {
  const regexStr = parts
    .map((part) => {
      if (part === "**") return ".*";
      return part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*");
    })
    .join("/");

  return new RegExp(`^${regexStr}$`);
}

/**
 * Ensure the artifact directory structure exists.
 */
export async function ensureArtifactDirs(projectPath) {
  await fs.mkdir(path.join(projectPath, ARTIFACT_SPECS_DIR), { recursive: true });
  await fs.mkdir(path.join(projectPath, ARTIFACT_BUILDS_DIR), { recursive: true });
}

/**
 * List all artifact specs in a project.
 * Returns an array of { slug, name, format, lifecycle, sources, lastBuilt, status }.
 */
export async function listArtifactSpecs(projectPath) {
  const specsDir = path.join(projectPath, ARTIFACT_SPECS_DIR);

  let files;
  try {
    files = await fs.readdir(specsDir);
  } catch {
    return [];
  }

  const specs = [];

  for (const file of files) {
    if (!file.endsWith(".artifact.md")) continue;

    const slug = file.replace(/\.artifact\.md$/, "");

    try {
      const raw = await fs.readFile(path.join(specsDir, file), "utf8");
      const { data: frontmatter } = matter(raw);
      const buildStatus = await getArtifactBuildStatus(projectPath, slug);

      specs.push({
        slug,
        name: frontmatter.name || slug,
        format: frontmatter.format || "html",
        lifecycle: frontmatter.lifecycle || "manual",
        sources: frontmatter.sources || [],
        lastBuilt: buildStatus?.builtAt || null,
        status: buildStatus ? "built" : "not_built",
      });
    } catch {
      specs.push({
        slug,
        name: slug,
        format: "html",
        lifecycle: "manual",
        sources: [],
        lastBuilt: null,
        status: "error",
      });
    }
  }

  return specs;
}

/**
 * Read a single artifact spec. Returns { slug, frontmatter, body, rawContent }.
 */
export async function readArtifactSpec(projectPath, slug) {
  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  const rawContent = await fs.readFile(filePath, "utf8");
  const { data: frontmatter, content: body } = matter(rawContent);

  return {
    slug,
    frontmatter,
    body: body.trim(),
    rawContent,
  };
}

/**
 * Write or update an artifact spec file.
 * Accepts frontmatter (object) and body (markdown string).
 */
export async function writeArtifactSpec(projectPath, slug, frontmatter, body) {
  await ensureArtifactDirs(projectPath);

  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  const content = matter.stringify(body.trim() + "\n", frontmatter);
  await fs.writeFile(filePath, content, "utf8");

  return { slug, filePath };
}

/**
 * Delete an artifact spec file.
 */
export async function deleteArtifactSpec(projectPath, slug) {
  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  await fs.unlink(filePath);
}

/**
 * Read the build manifest for a built artifact.
 * Returns the manifest object or null if not built.
 */
export async function getArtifactBuildStatus(projectPath, slug) {
  const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, slug, ".artifact-manifest.json");

  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolve source globs from the artifact spec into actual file paths and contents.
 * Returns an array of { relativePath, content }.
 */
export async function resolveArtifactSources(projectPath, sourceGlobs) {
  if (!sourceGlobs || sourceGlobs.length === 0) return [];

  const resolvedFiles = new Set();

  for (const pattern of sourceGlobs) {
    // Handle "all" shorthand — read everything in outputs_ai/
    if (pattern === "all") {
      const allFiles = await simpleGlob("outputs_ai/**/*.md", projectPath);
      allFiles.forEach((f) => resolvedFiles.add(f));
      continue;
    }

    const matches = await simpleGlob(pattern, projectPath);
    matches.forEach((f) => resolvedFiles.add(f));
  }

  const results = [];

  for (const relativePath of resolvedFiles) {
    try {
      const content = await fs.readFile(path.join(projectPath, relativePath), "utf8");
      results.push({ relativePath, content });
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Get the path where a built artifact's index.html lives.
 */
export function getArtifactBuildPath(projectPath, slug) {
  return path.join(projectPath, ARTIFACT_BUILDS_DIR, slug);
}

/**
 * Slugify a name into a valid artifact slug.
 */
export function slugifyArtifactName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
