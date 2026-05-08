import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.resolve(__dirname, "..", "src");
const SERVER_ROOT = path.resolve(__dirname, "..", "server");
const importPattern = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

const srcRules = [
  {
    from: "contracts",
    test: () => true,
    message: "contract modules must not import implementation modules",
  },
  {
    from: "features",
    test: (specifier) => specifier.includes("/app") || specifier.startsWith("../../app") || specifier.startsWith("../app"),
    message: "feature modules must not import from app-owned modules",
  },
  {
    from: "domain",
    test: (specifier) =>
      specifier === "react" ||
      specifier.startsWith("react/") ||
      specifier.includes("/app") ||
      specifier.includes("/features") ||
      specifier.includes("/editor") ||
      specifier.includes("/data") ||
      specifier === "../api" ||
      specifier === "../../api",
    message: "domain modules must stay pure and must not import React, app, feature, editor, or transport modules",
  },
  {
    from: "editor",
    test: (specifier) =>
      specifier.includes("/app") ||
      specifier.includes("/features") ||
      specifier.includes("/data") ||
      specifier === "../api" ||
      specifier === "../../api",
    message: "editor modules must not import app, feature, or transport modules",
  },
  {
    from: "navigation",
    test: (specifier) =>
      specifier.includes("/app") || specifier.includes("/data") || specifier.includes("/editor") || specifier.includes("/features"),
    message: "navigation modules must not import app, transport, editor, or feature modules",
  },
];

const serverRules = [
  {
    from: "routes",
    test: (specifier) => specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "node:child_process" || specifier === "@cursor/sdk",
    message: "server routes must use injected services rather than filesystem, process, or Cursor SDK adapters directly",
  },
];

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(entryPath);
      if (/\.(js|ts|tsx)$/.test(entry.name)) return [entryPath];
      return [];
    }),
  );

  return files.flat();
}

function firstPathSegment(filePath) {
  return path.relative(SRC_ROOT, filePath).split(path.sep)[0];
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
      if (rule.test(specifier)) {
        violations.push(`${path.relative(WEB_ROOT, filePath)} imports "${specifier}": ${rule.message}`);
      }
    }
  }
}

for (const filePath of await listSourceFiles(SERVER_ROOT)) {
  const layer = path.relative(SERVER_ROOT, filePath).split(path.sep)[0];
  const applicableRules = serverRules.filter((rule) => rule.from === layer);
  if (!applicableRules.length) continue;

  const content = await fs.readFile(filePath, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? "";
    for (const rule of applicableRules) {
      if (rule.test(specifier)) {
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
