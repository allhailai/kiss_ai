import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.resolve(__dirname, "..", "src");
const SERVER_ROOT = path.resolve(__dirname, "..", "server");
const importPattern = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function resolvesUnderRoot(filePath, specifier, root) {
  if (!specifier.startsWith(".")) return null;
  const targetPath = path.normalize(path.resolve(path.dirname(filePath), specifier));
  const relativeTarget = path.relative(root, targetPath);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) return null;
  return relativeTarget.split(path.sep);
}

function featureSegment(filePath) {
  const relativePath = path.relative(SRC_ROOT, filePath).split(path.sep);
  return relativePath[0] === "features" ? relativePath[1] : null;
}

function importsLayer(specifier, filePath, layer) {
  const resolvedParts = resolvesUnderRoot(filePath, specifier, SRC_ROOT);
  if (resolvedParts) return resolvedParts[0] === layer;
  return specifier.includes(`/${layer}`) || specifier.startsWith(layer);
}

function importsOtherFeature(specifier, filePath) {
  const currentFeature = featureSegment(filePath);
  if (!currentFeature) return false;
  const resolvedParts = resolvesUnderRoot(filePath, specifier, SRC_ROOT);
  return Boolean(resolvedParts && resolvedParts[0] === "features" && resolvedParts[1] && resolvedParts[1] !== currentFeature);
}

function importsFeatureSubdirectory(specifier, filePath) {
  const resolvedParts = resolvesUnderRoot(filePath, specifier, SRC_ROOT);
  if (!resolvedParts || resolvedParts[0] !== "features") return false;
  return resolvedParts.length > 3;
}

const srcRules = [
  {
    from: "main.tsx",
    test: (specifier) => !["react", "react-dom/client", "./app/App", "./styles.css", "./editor/MarkdownEditor.css", "./editor/annotationExtension.css", "./editor/markdownTableExtension.css"].includes(specifier),
    message: "main.tsx must stay a thin entrypoint that imports only React, the app shell, and global styles",
  },
  {
    from: "contracts",
    test: (specifier) => !specifier.startsWith("./") && !specifier.startsWith("../contracts/"),
    message: "contract modules must not import implementation modules",
  },
  {
    from: "features",
    test: (specifier, filePath) => importsLayer(specifier, filePath, "app") || importsOtherFeature(specifier, filePath),
    message: "feature modules must not import app-owned modules or other feature implementations",
  },
  {
    from: "data",
    test: (specifier, filePath) => importsLayer(specifier, filePath, "app") || importsLayer(specifier, filePath, "features"),
    message: "data modules must not import app or feature modules",
  },
  {
    from: "domain",
    test: (specifier, filePath) =>
      specifier === "react" ||
      specifier.startsWith("react/") ||
      importsLayer(specifier, filePath, "app") ||
      importsLayer(specifier, filePath, "features") ||
      importsLayer(specifier, filePath, "editor") ||
      importsLayer(specifier, filePath, "data") ||
      specifier === "../api" ||
      specifier === "../../api",
    message: "domain modules must stay pure and must not import React, app, feature, editor, or transport modules",
  },
  {
    from: "editor",
    test: (specifier, filePath) =>
      importsLayer(specifier, filePath, "app") ||
      importsLayer(specifier, filePath, "features") ||
      importsLayer(specifier, filePath, "data") ||
      specifier === "../api" ||
      specifier === "../../api",
    message: "editor modules must not import app, feature, or transport modules",
  },
  {
    from: "navigation",
    test: (specifier, filePath) =>
      importsLayer(specifier, filePath, "app") ||
      importsLayer(specifier, filePath, "data") ||
      importsLayer(specifier, filePath, "editor") ||
      importsLayer(specifier, filePath, "features"),
    message: "navigation modules must not import app, data, editor, or feature modules",
  },
  {
    from: "shared",
    test: (specifier, filePath) =>
      importsLayer(specifier, filePath, "app") || importsLayer(specifier, filePath, "features") || importsLayer(specifier, filePath, "data"),
    message: "shared modules must not import app, features, or data modules",
  },
  {
    from: "app",
    test: (specifier, filePath) => importsFeatureSubdirectory(specifier, filePath),
    message: "app modules must not import feature implementation subdirectories",
  },
];

const serverRules = [
  {
    from: "routes",
    test: (specifier) => specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "node:child_process" || specifier === "@cursor/sdk",
    message: "server routes must use injected services rather than filesystem, process, or Cursor SDK adapters directly",
  },
  {
    from: "services",
    test: (specifier, filePath) =>
      (specifier === "node:fs" || specifier === "node:fs/promises") &&
      !new Set([
        "agentJobs.js",
        "buildLogs.js",
        "buildScope.js",
        "capabilities.js",
        "conversations.js",
        "cursorModels.js",
        "harnessState.js",
        "projectFiles.js",
        "projectUiState.js",
        "projects.js",
        "questionsService.js",
        "sourceMapping.js",
        "webResearch.js",
      ]).has(path.basename(filePath)),
    message: "server services must keep filesystem access in approved service modules",
  },
  {
    from: "services",
    test: (specifier, filePath) =>
      specifier === "node:child_process" && !new Set(["buildScope.js", "cursorModels.js", "designIdentity.js", "projectFiles.js"]).has(path.basename(filePath)),
    message: "server services must keep process execution in approved service modules",
  },
  {
    from: "services",
    test: (specifier, filePath) => specifier === "@cursor/sdk" && path.basename(filePath) !== "cursorModels.js",
    message: "server services must keep Cursor SDK access in approved service modules",
  },
  {
    from: "agentRuntimes",
    test: (specifier, filePath) => specifier === "@cursor/sdk" && path.basename(filePath) !== "cursorSdk.js",
    message: "server runtime adapters must keep Cursor SDK access in cursorSdk.js",
  },
  {
    from: "adapters",
    test: (specifier) => specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "node:child_process" || specifier === "@cursor/sdk",
    message: "server adapters must stay thin and avoid filesystem, process, or Cursor SDK access",
  },
  {
    from: "utils",
    test: (specifier) => specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "node:child_process" || specifier === "@cursor/sdk",
    message: "server utilities must stay framework-neutral and avoid filesystem, process, or Cursor SDK access",
  },
  {
    from: "root",
    test: (specifier, filePath) =>
      !new Set(["index.js", "agentRuns.js"]).has(path.basename(filePath)) &&
      (specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "node:child_process" || specifier === "@cursor/sdk"),
    message: "server root files must not bypass route, service, adapter, or runtime ownership",
  },
];

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(entryPath);
      if (/\.(test|spec)\.(js|ts|tsx)$/.test(entry.name)) return [];
      if (/\.(js|ts|tsx)$/.test(entry.name)) return [entryPath];
      return [];
    }),
  );

  return files.flat();
}

function firstPathSegment(filePath) {
  return path.relative(SRC_ROOT, filePath).split(path.sep)[0];
}

function serverLayer(filePath) {
  const parts = path.relative(SERVER_ROOT, filePath).split(path.sep);
  return parts.length === 1 ? "root" : parts[0];
}

const violations = [];
for (const filePath of await listSourceFiles(SRC_ROOT)) {
  const layer = firstPathSegment(filePath);
  const applicableRules = srcRules.filter((rule) => rule.from === layer);
  if (!applicableRules.length) continue;

  const content = await fs.readFile(filePath, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? "";
    for (const rule of applicableRules) {
      if (rule.test(specifier, filePath)) {
        violations.push(`${path.relative(WEB_ROOT, filePath)} imports "${specifier}": ${rule.message}`);
      }
    }
  }
}

for (const filePath of await listSourceFiles(SERVER_ROOT)) {
  const layer = serverLayer(filePath);
  const applicableRules = serverRules.filter((rule) => rule.from === layer);
  if (!applicableRules.length) continue;

  const content = await fs.readFile(filePath, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? "";
    for (const rule of applicableRules) {
      if (rule.test(specifier, filePath)) {
        violations.push(`${path.relative(WEB_ROOT, filePath)} imports "${specifier}": ${rule.message}`);
      }
    }
  }
}

if (violations.length) {
  console.error("Boundary check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Boundary check passed.");
