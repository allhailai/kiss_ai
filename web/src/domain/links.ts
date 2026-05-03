import type { ProjectFile } from "../api";
import type { View } from "../app/views";
import { fileBasename } from "./files";

export type WikiLinkResolution =
  | { status: "resolved"; file: ProjectFile }
  | { status: "ambiguous"; matches: ProjectFile[] }
  | { status: "external"; href: string }
  | { status: "missing" };

export const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;
export const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

const projectPathRoots = ["inputs_human/", "inputs_ai/", "outputs_ai/", "change_logs/"];

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

export function resolveWikiLink(rawTarget: string, files: ProjectFile[], selectedPath: string | null): WikiLinkResolution {
  const normalizedTarget = normalizeWikiTarget(rawTarget);
  if (!normalizedTarget) return { status: "missing" };

  const selectedDirectory = selectedPath?.includes("/") ? selectedPath.split("/").slice(0, -1).join("/") : "";
  const siblingTarget = selectedDirectory ? `${selectedDirectory}/${normalizedTarget}` : normalizedTarget;
  const targetWithoutExtension = normalizedTarget.replace(/\.md$/i, "");
  const exactMatches = files.filter((file) => file.path === normalizedTarget || file.path === siblingTarget || file.name === normalizedTarget);

  if (exactMatches.length === 1) return { status: "resolved", file: exactMatches[0] };
  if (exactMatches.length > 1) return { status: "ambiguous", matches: exactMatches };

  const basenameMatches = files.filter((file) => {
    const basename = fileBasename(file.path);
    return basename === normalizedTarget || basename.replace(/\.md$/i, "") === targetWithoutExtension;
  });

  if (basenameMatches.length === 1) return { status: "resolved", file: basenameMatches[0] };
  if (basenameMatches.length > 1) return { status: "ambiguous", matches: basenameMatches };

  return { status: "missing" };
}

export function resolveMarkdownLink(rawTarget: string, files: ProjectFile[], selectedPath: string | null): WikiLinkResolution {
  const cleanedTarget = cleanMarkdownTarget(rawTarget);
  if (!cleanedTarget) return { status: "missing" };
  if (isExternalTarget(cleanedTarget)) return { status: "external", href: cleanedTarget };

  const normalizedTarget = normalizeRelativeProjectPath(cleanedTarget, selectedPath);
  if (!normalizedTarget) return { status: "missing" };

  const candidates = normalizedTarget.endsWith(".md") ? [normalizedTarget] : [normalizedTarget, `${normalizedTarget}.md`];
  const exactMatches = files.filter((file) => candidates.includes(file.path) || candidates.includes(file.name));

  if (exactMatches.length === 1) return { status: "resolved", file: exactMatches[0] };
  if (exactMatches.length > 1) return { status: "ambiguous", matches: exactMatches };

  const basenameMatches = files.filter((file) => candidates.includes(fileBasename(file.path)));

  if (basenameMatches.length === 1) return { status: "resolved", file: basenameMatches[0] };
  if (basenameMatches.length > 1) return { status: "ambiguous", matches: basenameMatches };

  return { status: "missing" };
}

export function viewForProjectPath(path: string, currentView: View): View | null {
  void currentView;
  if (path === "human_design_identity.md") return "design";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith("inputs_human/")) return "inputs";
  if (path.startsWith("inputs_ai/")) return "annotations";
  if (path.startsWith("outputs_ai/")) return "outputs";
  return null;
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
