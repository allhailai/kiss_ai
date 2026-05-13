import type { ProjectFile } from "../contracts/api";
import { fileBasename } from "./files";
import { projectPathRoots } from "./projectPaths";

export type WikiLinkResolution =
  | { status: "resolved"; file: ProjectFile }
  | { status: "ambiguous"; matches: ProjectFile[] }
  | { status: "external"; href: string }
  | { status: "missing" };

export const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;
export const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

export type LinkResolutionIndex = {
  basename: Map<string, ProjectFile[]>;
  basenameStem: Map<string, ProjectFile[]>;
  exact: Map<string, ProjectFile[]>;
  selectedDirectory: string;
};

function normalizeWikiTarget(rawTarget: string) {
  const withoutAlias = rawTarget.split("|")[0]?.trim() ?? "";
  const withoutHeading = withoutAlias.split("#")[0]?.trim() ?? "";
  const withoutLeadingSlash = withoutHeading.replace(/^\/+/, "");

  if (!withoutLeadingSlash) return "";
  return withoutLeadingSlash.endsWith(".md") ? withoutLeadingSlash : `${withoutLeadingSlash}.md`;
}

export function wikiLinkLabel(rawTarget: string) {
  const [target, alias] = rawTarget.split("|").map((part) => part.trim());
  if (alias) return alias;

  const withoutHeading = (target ?? "").split("#")[0] ?? "";
  return withoutHeading.split("/").at(-1)?.replace(/\.md$/i, "") || withoutHeading;
}

function cleanMarkdownTarget(rawTarget: string) {
  const trimmed = rawTarget.trim().replace(/^<|>$/g, "");
  const withoutTitle = trimmed.match(/^(\S+)/)?.[1] ?? trimmed;
  const withoutHash = withoutTitle.split("#")[0] ?? "";

  try {
    return decodeURIComponent(withoutHash);
  } catch {
    return withoutHash;
  }
}

function isExternalTarget(target: string) {
  return /^(https?:|mailto:)/i.test(target);
}

function normalizeRelativeProjectPath(target: string, selectedPath: string | null) {
  const cleaned = cleanMarkdownTarget(target).replace(/^\/+/, "");
  if (!cleaned) return "";

  const isProjectRooted = cleaned.startsWith("human_") || projectPathRoots.some((root) => cleaned.startsWith(root));
  const selectedDirectory = selectedPath?.includes("/") ? selectedPath.split("/").slice(0, -1).join("/") : "";
  const parts = (isProjectRooted || !selectedDirectory ? cleaned : `${selectedDirectory}/${cleaned}`).split("/");
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalizedParts.pop();
      continue;
    }
    normalizedParts.push(part);
  }

  return normalizedParts.join("/");
}

function addMatch(map: Map<string, ProjectFile[]>, key: string, file: ProjectFile) {
  if (!key) return;
  map.set(key, [...(map.get(key) ?? []), file]);
}

function selectedDirectoryFromPath(selectedPath: string | null) {
  return selectedPath?.includes("/") ? selectedPath.split("/").slice(0, -1).join("/") : "";
}

function uniqueFiles(files: ProjectFile[]) {
  return [...new Map(files.map((file) => [file.path, file])).values()];
}

function resolutionFromMatches(matches: ProjectFile[]): WikiLinkResolution {
  const uniqueMatches = uniqueFiles(matches);
  if (uniqueMatches.length === 1) return { status: "resolved", file: uniqueMatches[0] };
  if (uniqueMatches.length > 1) return { status: "ambiguous", matches: uniqueMatches };
  return { status: "missing" };
}

function matchesForKeys(map: Map<string, ProjectFile[]>, keys: string[]) {
  return keys.flatMap((key) => map.get(key) ?? []);
}

export function createLinkResolutionIndex(files: ProjectFile[], selectedPath: string | null): LinkResolutionIndex {
  const index: LinkResolutionIndex = {
    basename: new Map(),
    basenameStem: new Map(),
    exact: new Map(),
    selectedDirectory: selectedDirectoryFromPath(selectedPath),
  };

  for (const file of files) {
    const basename = fileBasename(file.path);
    addMatch(index.exact, file.path, file);
    addMatch(index.exact, file.name, file);
    addMatch(index.basename, basename, file);
    addMatch(index.basenameStem, basename.replace(/\.md$/i, ""), file);
  }

  return index;
}

export function resolveWikiLinkWithIndex(rawTarget: string, index: LinkResolutionIndex): WikiLinkResolution {
  const normalizedTarget = normalizeWikiTarget(rawTarget);
  if (!normalizedTarget) return { status: "missing" };

  const siblingTarget = index.selectedDirectory ? `${index.selectedDirectory}/${normalizedTarget}` : normalizedTarget;
  const targetWithoutExtension = normalizedTarget.replace(/\.md$/i, "");
  const exactMatches = matchesForKeys(index.exact, [normalizedTarget, siblingTarget]);
  const exactResolution = resolutionFromMatches(exactMatches);

  if (exactResolution.status !== "missing") return exactResolution;

  return resolutionFromMatches([
    ...matchesForKeys(index.basename, [normalizedTarget]),
    ...matchesForKeys(index.basenameStem, [targetWithoutExtension]),
  ]);
}

export function resolveMarkdownLinkWithIndex(rawTarget: string, index: LinkResolutionIndex): WikiLinkResolution {
  const cleanedTarget = cleanMarkdownTarget(rawTarget);
  if (!cleanedTarget) return { status: "missing" };
  if (isExternalTarget(cleanedTarget)) return { status: "external", href: cleanedTarget };

  const normalizedTarget = normalizeRelativeProjectPath(cleanedTarget, index.selectedDirectory ? `${index.selectedDirectory}/current.md` : null);
  if (!normalizedTarget) return { status: "missing" };

  const candidates = normalizedTarget.endsWith(".md") ? [normalizedTarget] : [normalizedTarget, `${normalizedTarget}.md`];
  const exactResolution = resolutionFromMatches(matchesForKeys(index.exact, candidates));

  if (exactResolution.status !== "missing") return exactResolution;

  return resolutionFromMatches(matchesForKeys(index.basename, candidates));
}

export function linkResolutionClass(resolution: WikiLinkResolution) {
  if (resolution.status === "resolved" || resolution.status === "external") return "cm-wiki-link-resolved";
  if (resolution.status === "ambiguous") return "cm-wiki-link-ambiguous";
  return "cm-wiki-link-missing";
}

export function linkResolutionTitle(resolution: WikiLinkResolution) {
  if (resolution.status === "resolved") return resolution.file.path;
  if (resolution.status === "external") return resolution.href;
  if (resolution.status === "ambiguous") return "Multiple matching files";
  return "No matching file found";
}
