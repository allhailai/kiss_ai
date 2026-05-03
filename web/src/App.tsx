import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import {
  api,
  type DesignState,
  type FileContent,
  type FileDiff,
  type ProjectFile,
  type ProjectStatus,
  type ProjectSummary,
  type RebuildState,
} from "./api";
import { buildMarkdownTableExtension, parseMarkdownTableBlock } from "./markdownTableExtension";

type View = "dashboard" | "requirements" | "inputs" | "outputs" | "annotations" | "design" | "rebuild";
type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
};
type FileTreeNode =
  | {
      type: "directory";
      key: string;
      name: string;
      fullPath: string;
      children: FileTreeNode[];
    }
  | {
      type: "file";
      key: string;
      name: string;
      file: ProjectFile;
    };
type WikiLinkResolution =
  | { status: "resolved"; file: ProjectFile }
  | { status: "ambiguous"; matches: ProjectFile[] }
  | { status: "external"; href: string }
  | { status: "missing" };
type EditorDiffRange = {
  from: number;
  to: number;
};
type EditorDiffDeletion = {
  afterLine: number;
  count: number;
};
type EditorDiff = {
  ranges: EditorDiffRange[];
  deletions: EditorDiffDeletion[];
};
type DiffKind = "unsaved" | "saved";
type Toast = {
  id: string;
  message: string;
};
type DesignMarkdownSection = {
  title: string;
  content: string;
};
type DesignIdentityDraft = {
  frontmatter: Record<string, unknown>;
  opening: string;
  sections: DesignMarkdownSection[];
  parseError: string | null;
};

const views: Array<{ id: View; label: string; description: string }> = [
  { id: "requirements", label: "Requirements", description: "Human-owned source of truth" },
  { id: "annotations", label: "AI Input Files", description: "AI-managed files under inputs_ai/" },
  { id: "inputs", label: "Human Input Files", description: "Human source material" },
  { id: "outputs", label: "Outputs", description: "Generated research and reports" },
  { id: "design", label: "Design", description: "Project visual identity" },
  { id: "rebuild", label: "Rebuild", description: "Run the project loop" },
  { id: "dashboard", label: "Tech Dashboard", description: "Project state and readiness" },
];
const workflowMenuViews = views.filter((item) => item.id !== "design");
const viewIds = new Set<View>(views.map((item) => item.id));
const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "annotations", "design"]);
const defaultRoute: RouteState = { projectSlug: null, view: "dashboard", filePath: null };
const selectedProjectStorageKey = "kiss_ai.selectedProject";
const designProjectFile: ProjectFile = {
  path: "human_design_identity.md",
  name: "human_design_identity.md",
  kind: "design",
  editable: true,
  annotation: false,
};
const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;
const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
const projectPathRoots = ["inputs_human/", "inputs_ai/", "outputs_ai/", "change_logs/"];
const requirementsExplainer = "These files are the source of truth for the project. Saving here directly changes human-owned project intent.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function parseDesignMarkdownSections(body: string) {
  const sections: DesignMarkdownSection[] = [];
  const headingPattern = /^##\s+(.+)$/gm;
  let openingEnd = 0;
  let previousMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(body)) !== null) {
    if (!previousMatch) {
      openingEnd = match.index;
    } else {
      sections.push({
        title: previousMatch[1].trim(),
        content: body.slice(previousMatch.index + previousMatch[0].length, match.index).replace(/^\n+/, "").replace(/\n+$/, ""),
      });
    }

    previousMatch = match;
  }

  if (previousMatch) {
    sections.push({
      title: previousMatch[1].trim(),
      content: body.slice(previousMatch.index + previousMatch[0].length).replace(/^\n+/, "").replace(/\n+$/, ""),
    });
  }

  return {
    opening: previousMatch ? body.slice(0, openingEnd).replace(/\n+$/, "") : body.replace(/\n+$/, ""),
    sections,
  };
}

function parseDesignIdentityDraft(markdown: string): DesignIdentityDraft {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const rawFrontmatter = match?.[1] ?? "";
  const rawBody = match?.[2] ?? markdown;
  const parsedBody = parseDesignMarkdownSections(rawBody);

  try {
    const frontmatter = YAML.parse(rawFrontmatter) ?? {};

    return {
      frontmatter: asRecord(frontmatter),
      opening: parsedBody.opening,
      sections: parsedBody.sections,
      parseError: null,
    };
  } catch (error) {
    return {
      frontmatter: {},
      opening: rawBody,
      sections: [],
      parseError: error instanceof Error ? error.message : "Could not parse design identity frontmatter.",
    };
  }
}

function serializeDesignMarkdownBody(opening: string, sections: DesignMarkdownSection[]) {
  const chunks: string[] = [];

  if (opening.trim()) {
    chunks.push(opening.trimEnd());
  }

  chunks.push(
    ...sections.map((section) => {
      const content = section.content.trimEnd();
      return content ? `## ${section.title}\n\n${content}` : `## ${section.title}`;
    }),
  );

  return chunks.join("\n\n");
}

function serializeDesignIdentityDraft(draft: DesignIdentityDraft) {
  const frontmatter = YAML.stringify(draft.frontmatter).trimEnd();
  const body = serializeDesignMarkdownBody(draft.opening, draft.sections);

  return `---\n${frontmatter}\n---\n${body ? `\n${body}\n` : ""}`;
}

function parseRouteHash(hash: string): RouteState {
  const route = hash.replace(/^#\/?/, "");
  const [firstSegment, secondSegment, thirdSegment, ...remainingParts] = route.split("/");
  const isProjectRoute = firstSegment === "p" && Boolean(secondSegment);
  let projectSlug: string | null = null;

  try {
    projectSlug = isProjectRoute ? decodeURIComponent(secondSegment) : null;
  } catch {
    projectSlug = null;
  }

  const viewCandidate = isProjectRoute ? thirdSegment : firstSegment;
  const filePathParts = isProjectRoute ? remainingParts : [secondSegment, thirdSegment, ...remainingParts].filter(Boolean);

  if (!viewCandidate || !viewIds.has(viewCandidate as View)) {
    return { ...defaultRoute, projectSlug };
  }

  const view = viewCandidate as View;
  const rawFilePath = filePathParts.join("/");

  if (!fileBackedViews.has(view) || !rawFilePath) {
    return { projectSlug, view, filePath: null };
  }

  try {
    return { projectSlug, view, filePath: decodeURIComponent(rawFilePath) };
  } catch {
    return { projectSlug, view, filePath: null };
  }
}

function buildRouteHash(projectSlug: string | null, view: View, filePath?: string | null) {
  if (!projectSlug) return "#/projects";

  const base = `#/p/${encodeURIComponent(projectSlug)}/${view}`;

  if (filePath && fileBackedViews.has(view)) {
    return `${base}/${encodeURIComponent(filePath)}`;
  }

  return base;
}

function sortTreeNodes(nodes: FileTreeNode[]) {
  nodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  for (const node of nodes) {
    if (node.type === "directory") {
      sortTreeNodes(node.children);
    }
  }
}

function buildFileTree(files: ProjectFile[]) {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const segments = file.name.split("/").filter(Boolean);
    const pathSegments = file.path.split("/").filter(Boolean);
    const rootPathSegments = pathSegments.slice(0, Math.max(0, pathSegments.length - segments.length));
    const fileName = segments.at(-1) ?? file.name;
    let children = root;
    const directoryParts: string[] = [];

    for (const directoryName of segments.slice(0, -1)) {
      directoryParts.push(directoryName);
      const directoryKey = directoryParts.join("/");
      const fullPath = [...rootPathSegments, ...directoryParts].join("/");
      let directory = children.find(
        (node): node is Extract<FileTreeNode, { type: "directory" }> =>
          node.type === "directory" && node.key === directoryKey,
      );

      if (!directory) {
        directory = {
          type: "directory",
          key: directoryKey,
          name: directoryName,
          fullPath,
          children: [],
        };
        children.push(directory);
      }

      children = directory.children;
    }

    children.push({
      type: "file",
      key: file.path,
      name: fileName,
      file,
    });
  }

  sortTreeNodes(root);
  return root;
}

function getAncestorDirectoryKeys(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

function uniqueFiles(files: ProjectFile[]) {
  return [...new Map(files.map((file) => [file.path, file])).values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function normalizeWikiTarget(rawTarget: string) {
  const withoutAlias = rawTarget.split("|")[0]?.trim() ?? "";
  const withoutHeading = withoutAlias.split("#")[0]?.trim() ?? "";
  const withoutLeadingSlash = withoutHeading.replace(/^\/+/, "");

  if (!withoutLeadingSlash) return "";
  return withoutLeadingSlash.endsWith(".md") ? withoutLeadingSlash : `${withoutLeadingSlash}.md`;
}

function wikiLinkLabel(rawTarget: string) {
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

function fileBasename(path: string) {
  return path.split("/").at(-1) ?? path;
}

function humanizePathSegment(pathSegment: string) {
  const withoutExtension = pathSegment.replace(/\.[^.]+$/i, "");
  const spaced = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (!spaced) return pathSegment;

  return spaced
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function resolveWikiLink(rawTarget: string, files: ProjectFile[], selectedPath: string | null): WikiLinkResolution {
  const normalizedTarget = normalizeWikiTarget(rawTarget);
  if (!normalizedTarget) return { status: "missing" };

  const selectedDirectory = selectedPath?.includes("/") ? selectedPath.split("/").slice(0, -1).join("/") : "";
  const siblingTarget = selectedDirectory ? `${selectedDirectory}/${normalizedTarget}` : normalizedTarget;
  const targetWithoutExtension = normalizedTarget.replace(/\.md$/i, "");
  const exactMatches = files.filter(
    (file) => file.path === normalizedTarget || file.path === siblingTarget || file.name === normalizedTarget,
  );

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

function resolveMarkdownLink(rawTarget: string, files: ProjectFile[], selectedPath: string | null): WikiLinkResolution {
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

function viewForProjectPath(path: string, currentView: View): View | null {
  if (path === "human_design_identity.md") return "design";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith("inputs_human/")) return "inputs";
  if (path.startsWith("inputs_ai/")) return "annotations";
  if (path.startsWith("outputs_ai/")) return "outputs";
  return null;
}

function linkResolutionClass(resolution: WikiLinkResolution) {
  if (resolution.status === "resolved" || resolution.status === "external") return "cm-wiki-link-resolved";
  if (resolution.status === "ambiguous") return "cm-wiki-link-ambiguous";
  return "cm-wiki-link-missing";
}

function linkResolutionTitle(resolution: WikiLinkResolution) {
  if (resolution.status === "resolved") return resolution.file.path;
  if (resolution.status === "external") return resolution.href;
  if (resolution.status === "ambiguous") return "Multiple matching files";
  return "No matching file found";
}

function groupLineRanges(lineNumbers: number[]): EditorDiffRange[] {
  const sorted = [...new Set(lineNumbers)].sort((left, right) => left - right);
  const ranges: EditorDiffRange[] = [];

  for (const lineNumber of sorted) {
    const previous = ranges.at(-1);

    if (previous && lineNumber === previous.to + 1) {
      previous.to = lineNumber;
      continue;
    }

    ranges.push({ from: lineNumber, to: lineNumber });
  }

  return ranges;
}

function countDiffRangeLines(ranges: EditorDiffRange[]) {
  return ranges.reduce((total, range) => total + Math.max(0, range.to - range.from + 1), 0);
}

function countDeletedLines(deletions: EditorDiffDeletion[]) {
  return deletions.reduce((total, deletion) => total + deletion.count, 0);
}

function groupDeletions(deletions: EditorDiffDeletion[]): EditorDiffDeletion[] {
  const countsByLine = new Map<number, number>();

  for (const deletion of deletions) {
    countsByLine.set(deletion.afterLine, (countsByLine.get(deletion.afterLine) ?? 0) + deletion.count);
  }

  return [...countsByLine.entries()]
    .map(([afterLine, count]) => ({ afterLine, count }))
    .sort((left, right) => left.afterLine - right.afterLine);
}

function fallbackLineDiff(original: string[], current: string[]): EditorDiff {
  const changedLines: number[] = [];
  const sharedLength = Math.min(original.length, current.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (original[index] !== current[index]) {
      changedLines.push(index + 1);
    }
  }

  for (let index = sharedLength; index < current.length; index += 1) {
    changedLines.push(index + 1);
  }

  const deletionCount = Math.max(0, original.length - current.length);
  const deletions = deletionCount ? [{ afterLine: current.length, count: deletionCount }] : [];

  return { ranges: groupLineRanges(changedLines), deletions };
}

function buildLineDiff(originalText: string, currentText: string): EditorDiff {
  if (originalText === currentText) return { ranges: [], deletions: [] };

  const original = originalText.split("\n");
  const current = currentText.split("\n");

  if (original.length * current.length > 250_000) {
    return fallbackLineDiff(original, current);
  }

  const table = Array.from({ length: original.length + 1 }, () => new Uint32Array(current.length + 1));

  for (let originalIndex = original.length - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let currentIndex = current.length - 1; currentIndex >= 0; currentIndex -= 1) {
      table[originalIndex][currentIndex] =
        original[originalIndex] === current[currentIndex]
          ? table[originalIndex + 1][currentIndex + 1] + 1
          : Math.max(table[originalIndex + 1][currentIndex], table[originalIndex][currentIndex + 1]);
    }
  }

  const operations: Array<{ type: "equal" | "delete" | "insert"; lineNumber?: number }> = [];
  let originalIndex = 0;
  let currentIndex = 0;

  while (originalIndex < original.length && currentIndex < current.length) {
    if (original[originalIndex] === current[currentIndex]) {
      operations.push({ type: "equal" });
      originalIndex += 1;
      currentIndex += 1;
    } else if (table[originalIndex + 1][currentIndex] >= table[originalIndex][currentIndex + 1]) {
      operations.push({ type: "delete" });
      originalIndex += 1;
    } else {
      operations.push({ type: "insert", lineNumber: currentIndex + 1 });
      currentIndex += 1;
    }
  }

  while (currentIndex < current.length) {
    operations.push({ type: "insert", lineNumber: currentIndex + 1 });
    currentIndex += 1;
  }

  while (originalIndex < original.length) {
    operations.push({ type: "delete" });
    originalIndex += 1;
  }

  const changedLines: number[] = [];
  const deletions: EditorDiffDeletion[] = [];
  let hunkDeletes = 0;
  let hunkInserts: number[] = [];
  let previousCurrentLine = 0;

  const flushHunk = () => {
    if (!hunkDeletes && !hunkInserts.length) return;

    changedLines.push(...hunkInserts);

    const unmatchedDeletions = Math.max(0, hunkDeletes - hunkInserts.length);
    if (unmatchedDeletions > 0) {
      deletions.push({
        afterLine: hunkInserts.at(-1) ?? previousCurrentLine,
        count: unmatchedDeletions,
      });
    }

    hunkDeletes = 0;
    hunkInserts = [];
  };

  for (const operation of operations) {
    if (operation.type === "equal") {
      flushHunk();
      previousCurrentLine += 1;
    } else if (operation.type === "delete") {
      hunkDeletes += 1;
    } else {
      hunkInserts.push(operation.lineNumber ?? previousCurrentLine + 1);
      previousCurrentLine = operation.lineNumber ?? previousCurrentLine;
    }
  }

  flushHunk();

  return { ranges: groupLineRanges(changedLines), deletions: groupDeletions(deletions) };
}

function renderMarkdownTableCellText(cell: string) {
  return cell
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/\[\[([^\]\n]+)\]\]/g, (_match, rawTarget: string) => wikiLinkLabel(rawTarget));
}

class MarkdownLinkWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly resolution: WikiLinkResolution,
    private readonly onOpenFile: (path: string) => void,
  ) {
    super();
  }

  eq(other: MarkdownLinkWidget) {
    return this.label === other.label && linkResolutionTitle(this.resolution) === linkResolutionTitle(other.resolution);
  }

  toDOM() {
    const link = document.createElement("span");
    link.className = `cm-wiki-link ${linkResolutionClass(this.resolution)}`;
    link.textContent = this.label;
    link.role = "link";
    link.tabIndex = 0;
    link.title = linkResolutionTitle(this.resolution);

    const open = () => {
      if (this.resolution.status === "resolved") {
        this.onOpenFile(this.resolution.file.path);
      } else if (this.resolution.status === "external") {
        window.open(this.resolution.href, "_blank", "noopener,noreferrer");
      }
    };

    link.addEventListener("mousedown", (event) => event.preventDefault());
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open();
    });
    link.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });

    return link;
  }
}

class DiffDeletionWidget extends WidgetType {
  constructor(
    private readonly count: number,
    private readonly kind: DiffKind,
  ) {
    super();
  }

  eq(other: DiffDeletionWidget) {
    return this.count === other.count && this.kind === other.kind;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = `cm-diff-deletion cm-diff-${this.kind}-deletion`;
    marker.textContent = `${this.count.toLocaleString()} deleted ${this.count === 1 ? "line" : "lines"}`;
    return marker;
  }
}

function buildEditorDiffExtension({
  unsavedDiff,
  savedDiff,
}: {
  unsavedDiff: EditorDiff;
  savedDiff: FileDiff | null;
}): Extension {
  type DiffDecorationEntry = {
    from: number;
    to: number;
    decoration: Decoration;
  };

  function addRangeDecorations(entries: DiffDecorationEntry[], view: EditorView, ranges: EditorDiffRange[], className: string) {
    for (const range of ranges) {
      const fromLine = Math.max(1, range.from);
      const toLine = Math.min(view.state.doc.lines, range.to);

      for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
        const line = view.state.doc.line(lineNumber);
        entries.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({ class: className }),
        });
      }
    }
  }

  function addDeletionWidgets(entries: DiffDecorationEntry[], view: EditorView, deletions: EditorDiffDeletion[], kind: DiffKind) {
    for (const deletion of deletions) {
      const lineNumber = Math.min(Math.max(1, deletion.afterLine), view.state.doc.lines);
      const position = deletion.afterLine <= 0 ? 0 : view.state.doc.line(lineNumber).to;

      entries.push({
        from: position,
        to: position,
        decoration: Decoration.widget({
          widget: new DiffDeletionWidget(deletion.count, kind),
          side: deletion.afterLine <= 0 ? -1 : 1,
        }),
      });
    }
  }

  function buildDecorations(view: EditorView) {
    const entries: DiffDecorationEntry[] = [];

    addRangeDecorations(entries, view, savedDiff?.ranges ?? [], "cm-diff-line cm-diff-saved-line");
    addRangeDecorations(entries, view, unsavedDiff.ranges, "cm-diff-line cm-diff-unsaved-line");
    addDeletionWidgets(entries, view, savedDiff?.deletions ?? [], "saved");
    addDeletionWidgets(entries, view, unsavedDiff.deletions, "unsaved");

    return Decoration.set(
      entries.map((entry) => entry.decoration.range(entry.from, entry.to)),
      true,
    );
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

function buildWikiLinkExtension({
  files,
  selectedPath,
  onOpenFile,
}: {
  files: ProjectFile[];
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
}): Extension {
  function buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
      let position = from;

      while (position <= to) {
        const line = view.state.doc.lineAt(position);
        const table = parseMarkdownTableBlock(view.state.doc, line.number);

        if (table) {
          position = table.to + 1;
          continue;
        }

        const linkDecorations: Array<{ from: number; to: number; label: string; resolution: WikiLinkResolution }> = [];
        wikiLinkPattern.lastIndex = 0;
        markdownLinkPattern.lastIndex = 0;

        for (const match of line.text.matchAll(wikiLinkPattern)) {
          const matchIndex = match.index ?? 0;
          const rawTarget = match[1] ?? "";
          linkDecorations.push({
            from: line.from + matchIndex,
            to: line.from + matchIndex + match[0].length,
            label: wikiLinkLabel(rawTarget),
            resolution: resolveWikiLink(rawTarget, files, selectedPath),
          });
        }

        for (const match of line.text.matchAll(markdownLinkPattern)) {
          const matchIndex = match.index ?? 0;
          const label = match[1] ?? "";
          const rawTarget = match[2] ?? "";
          const linkFrom = line.from + matchIndex;
          const linkTo = linkFrom + match[0].length;

          if (linkDecorations.some((decoration) => linkFrom < decoration.to && linkTo > decoration.from)) continue;

          linkDecorations.push({
            from: linkFrom,
            to: linkTo,
            label,
            resolution: resolveMarkdownLink(rawTarget, files, selectedPath),
          });
        }

        linkDecorations
          .sort((left, right) => left.from - right.from)
          .forEach((link) => {
            builder.add(
              link.from,
              link.to,
              Decoration.replace({
                widget: new MarkdownLinkWidget(link.label, link.resolution, onOpenFile),
              }),
            );
          });

        if (line.to >= to) break;
        position = line.to + 1;
      }
    }

    return builder.finish();
  }

  const wikiLinkPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );

  return wikiLinkPlugin;
}

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [projectsRoot, setProjectsRoot] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(() =>
    window.localStorage.getItem(selectedProjectStorageKey),
  );
  const [projectsError, setProjectsError] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [rebuild, setRebuild] = useState<RebuildState | null>(null);
  const [design, setDesign] = useState<DesignState | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([designProjectFile]);
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [draft, setDraft] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const selectedProject = useMemo(
    () => projects.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projects, selectedProjectSlug],
  );

  const themeStyle = useMemo(() => {
    const colors = design?.parsed.colors ?? {};
    return {
      "--color-primary": colors.primary ?? "#17202A",
      "--color-secondary": colors.secondary ?? "#5D6D7E",
      "--color-accent": colors.accent ?? "#A45C40",
      "--color-background": colors.background ?? "#F8F6F1",
      "--color-surface": colors.surface ?? "#FFFFFF",
      "--color-border": colors.border ?? "#D8D2C4",
      "--color-annotation": colors.annotation ?? "#6D5BD0",
      "--color-success": colors.success ?? "#2F6F4E",
      "--color-warning": colors.warning ?? "#9A6B1F",
    } as CSSProperties;
  }, [design]);

  const setNotice = useCallback((message: string) => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setToasts([]);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, message: trimmedMessage }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectSlug) {
      window.localStorage.removeItem(selectedProjectStorageKey);
      setStatus(null);
      setRebuild(null);
      setDesign(null);
      setFiles([]);
      setProjectFiles([designProjectFile]);
      setSelected(null);
      setSelectedDiff(null);
      setDraft("");
      return;
    }

    window.localStorage.setItem(selectedProjectStorageKey, selectedProjectSlug);
    void refreshStatus();
    void refreshDesign();
    void refreshRebuild();
    void refreshProjectFiles();
  }, [selectedProjectSlug]);

  useEffect(() => {
    if (!projects.length || !selectedProjectSlug) return;
    if (projects.some((project) => project.slug === selectedProjectSlug)) return;

    setSelectedProjectSlug(null);
    window.history.replaceState(null, "", "#/projects");
    setNotice("The previously selected project is no longer available.");
  }, [projects, selectedProjectSlug]);

  useEffect(() => {
    const syncRoute = () => {
      const route = parseRouteHash(window.location.hash);
      const routeProjectSlug = route.projectSlug ?? selectedProjectSlug;

      if (!routeProjectSlug) {
        if (window.location.hash !== "#/projects") {
          window.history.replaceState(null, "", "#/projects");
        }
        return;
      }

      if (route.projectSlug !== routeProjectSlug) {
        const normalized = buildRouteHash(routeProjectSlug, route.view, route.filePath);
        if (window.location.hash !== normalized) {
          window.history.replaceState(null, "", normalized);
        }
      }

      if (selectedProjectSlug !== routeProjectSlug) {
        setSelectedProjectSlug(routeProjectSlug);
        return;
      }

      void applyRoute({ ...route, projectSlug: routeProjectSlug });
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    return () => window.removeEventListener("hashchange", syncRoute);
  }, [selectedProjectSlug]);

  useEffect(() => {
    if (!rebuild?.running) return;

    const interval = window.setInterval(() => {
      void refreshRebuild();
      void refreshStatus();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [rebuild?.running]);

  function requireSelectedProjectSlug() {
    if (!selectedProjectSlug) {
      throw new Error("Select a project first.");
    }

    return selectedProjectSlug;
  }

  async function refreshProjects() {
    setProjectsError("");
    try {
      const response = await api.projects();
      setProjectsRoot(response.projectsRoot);
      setProjects(response.projects);
    } catch (error) {
      setProjects([]);
      setProjectsError(error instanceof Error ? error.message : "Could not load projects.");
    }
  }

  async function refreshStatus() {
    setStatus(await api.status(requireSelectedProjectSlug()));
  }

  async function refreshDesign() {
    setDesign(await api.design(requireSelectedProjectSlug()));
  }

  async function refreshRebuild() {
    setRebuild(await api.rebuildState(requireSelectedProjectSlug()));
  }

  async function refreshProjectFiles() {
    const projectSlug = requireSelectedProjectSlug();
    const [requirements, human, inputsAi, outputs] = await Promise.all([
      api.tree(projectSlug, "requirements"),
      api.tree(projectSlug, "human"),
      api.tree(projectSlug, "inputs-ai"),
      api.tree(projectSlug, "outputs"),
    ]);

    setProjectFiles(uniqueFiles([...requirements.files, ...human.files, ...inputsAi.files, ...outputs.files, designProjectFile]));
  }

  function navigateTo(view: View, filePath?: string | null) {
    const nextHash = buildRouteHash(selectedProjectSlug, view, filePath);

    if (window.location.hash === nextHash) {
      void applyRoute({ projectSlug: selectedProjectSlug, view, filePath: filePath ?? null });
      return;
    }

    window.location.hash = nextHash;
  }

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const openProjectFile = useCallback(
    (path: string) => {
      const nextView = viewForProjectPath(path, view);

      if (!nextView) {
        setNotice("This link points to a file that is not available in the lab UI yet.");
        return;
      }

      navigateTo(nextView, path);
    },
    [setNotice, view],
  );

  function selectProject(projectSlug: string) {
    setSelectedProjectSlug(projectSlug);
    window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
    window.location.hash = buildRouteHash(projectSlug, "dashboard");
  }

  function clearSelectedProject() {
    setSelectedProjectSlug(null);
    window.localStorage.removeItem(selectedProjectStorageKey);
    window.location.hash = "#/projects";
  }

  async function applyRoute(route: RouteState) {
    if (!route.projectSlug || route.projectSlug !== selectedProjectSlug) return;

    const nextView = route.view;
    setView(nextView);
    setWorkflowMenuOpen(false);
    setNotice("");
    setSelected(null);
    setSelectedDiff(null);
    setDraft("");

    if (nextView === "requirements") {
      await loadTree("requirements");
    } else if (nextView === "inputs") {
      await loadTree("human");
    } else if (nextView === "outputs") {
      await loadTree("outputs");
    } else if (nextView === "annotations") {
      setFiles((await api.tree(route.projectSlug, "inputs-ai")).files);
    } else {
      setFiles([]);
    }

    if (nextView === "design") {
      setFiles([designProjectFile]);
      await refreshDesign();
      await selectFile(route.filePath ?? "human_design_identity.md");
    }

    if (nextView === "rebuild") {
      await refreshRebuild();
    }

    if (route.filePath && nextView !== "design") {
      await selectFile(route.filePath);
    }
  }

  async function loadTree(section: string) {
    const projectSlug = requireSelectedProjectSlug();
    setLoading(true);
    try {
      setFiles((await api.tree(projectSlug, section)).files);
    } finally {
      setLoading(false);
    }
  }

  async function selectFile(path: string) {
    const projectSlug = requireSelectedProjectSlug();
    setLoading(true);
    setNotice("");
    try {
      const file = await api.file(projectSlug, path);
      const diff = await api.fileDiff(projectSlug, path);
      setSelected(file);
      setSelectedDiff(diff);
      setDraft(file.content);
    } catch (error) {
      setSelected(null);
      setSelectedDiff(null);
      setDraft("");
      setNotice(error instanceof Error ? error.message : "Could not open the selected file.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSelected() {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const saved = await api.saveFile(projectSlug, selected.path, draft);
    const diff = await api.fileDiff(projectSlug, saved.path);
    setSelected(saved);
    setSelectedDiff(diff);
    setDraft(saved.content);

    if (saved.path === "human_design_identity.md") {
      await refreshDesign();
    }

    await refreshStatus();
  }

  async function revertSelected() {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const reverted = await api.revertFile(projectSlug, selected.path);
    const diff = await api.fileDiff(projectSlug, reverted.path);
    setSelected(reverted);
    setSelectedDiff(diff);
    setDraft(reverted.content);

    if (reverted.path === "human_design_identity.md") {
      await refreshDesign();
    }

    await refreshStatus();
  }

  async function startRebuild() {
    setNotice("");
    const next = await api.startRebuild(requireSelectedProjectSlug());
    setRebuild(next);

    if (next.status === "blocked") {
      setNotice(next.message);
    }
  }

  if (!selectedProjectSlug || !selectedProject) {
    return (
      <main className="app-shell project-picker-shell" style={themeStyle}>
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
        <ProjectPicker
          error={projectsError}
          onRefresh={() => void refreshProjects()}
          onSelect={selectProject}
          projects={projects}
          projectsRoot={projectsRoot}
        />
      </main>
    );
  }

  return (
    <main className="app-shell" style={themeStyle}>
      <GlobalFileSearch projectSlug={selectedProjectSlug} onOpenFile={openProjectFile} onSwitchProject={clearSelectedProject} />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <aside className="sidebar">
        <div className="brand">
          <span className="eyebrow">kiss_ai lab</span>
          <button className="home-link" onClick={() => navigateTo("dashboard")}>
            {status?.projectName ?? selectedProject.name}
          </button>
        </div>

        {view === "dashboard" ? (
          <MainWorkflowMenu currentView={view} onOpen={(nextView) => navigateTo(nextView)} />
        ) : (
          <ContextualNavigator
            currentView={view}
            files={files}
            loading={loading}
            menuOpen={workflowMenuOpen}
            selectedPath={selected?.path ?? null}
            onToggleMenu={() => setWorkflowMenuOpen((isOpen) => !isOpen)}
            onOpenView={(nextView) => navigateTo(nextView)}
            onSelectFile={(path) => navigateTo(view, path)}
          />
        )}
      </aside>

      <section className="workspace">
        {view === "dashboard" ? (
          <Dashboard
            status={status}
            design={design}
            onOpenAnnotations={() => navigateTo("annotations")}
            onOpenDesign={() => navigateTo("design")}
            onRefresh={() => void refreshStatus()}
          />
        ) : null}
        {view === "requirements" ? (
          <FileWorkspace
            title="Human-Owned Requirements"
            selected={selected}
            selectedDiff={selectedDiff}
            draft={draft}
            projectFiles={projectFiles}
            onDraft={setDraft}
            onNotice={setNotice}
            onOpenFile={openProjectFile}
            onRevert={() => void revertSelected()}
            onSave={() => void saveSelected()}
          />
        ) : null}
        {view === "inputs" ? (
          <FileWorkspace
            title="Human Inputs"
            explainer="Human source material belongs under inputs_human/. Upload support comes later; this lab currently browses and edits Markdown."
            selected={selected}
            selectedDiff={selectedDiff}
            draft={draft}
            projectFiles={projectFiles}
            onDraft={setDraft}
            onNotice={setNotice}
            onOpenFile={openProjectFile}
            onRevert={() => void revertSelected()}
            onSave={() => void saveSelected()}
          />
        ) : null}
        {view === "outputs" ? (
          <FileWorkspace
            title="Outputs"
            explainer="Generated outputs can be reviewed and edited here. Saves write directly to outputs_ai/."
            selected={selected}
            selectedDiff={selectedDiff}
            draft={draft}
            projectFiles={projectFiles}
            onDraft={setDraft}
            onNotice={setNotice}
            onOpenFile={openProjectFile}
            onRevert={() => void revertSelected()}
            onSave={() => void saveSelected()}
          />
        ) : null}
        {view === "annotations" ? (
          <FileWorkspace
            title="Annotation Workspace"
            explainer="Files under inputs_ai/ are AI-managed. Human edits here are intentionally visualized as annotations and detected through Git diff."
            selected={selected}
            selectedDiff={selectedDiff}
            draft={draft}
            projectFiles={projectFiles}
            onDraft={setDraft}
            onNotice={setNotice}
            onOpenFile={openProjectFile}
            onRevert={() => void revertSelected()}
            onSave={() => void saveSelected()}
          />
        ) : null}
        {view === "design" ? (
          <DesignWorkspace
            design={design}
            selected={selected}
            selectedDiff={selectedDiff}
            draft={draft}
            loading={loading}
            onDraft={setDraft}
            onRevert={() => void revertSelected()}
            onSave={() => void saveSelected()}
            onRefresh={() => void refreshDesign()}
          />
        ) : null}
        {view === "rebuild" ? (
          <RebuildWorkspace
            status={status}
            rebuild={rebuild}
            onStart={() => void startRebuild()}
            onRefresh={() => {
              void refreshRebuild();
              void refreshStatus();
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          <button className="toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

function ProjectPicker({
  error,
  projects,
  projectsRoot,
  onRefresh,
  onSelect,
}: {
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onRefresh: () => void;
  onSelect: (projectSlug: string) => void;
}) {
  return (
    <section className="project-picker">
      <div className="project-picker-header">
        <span className="eyebrow">kiss_ai projects</span>
        <h1>Select a project</h1>
        <p>Choose an existing project under the projects folder to open the same workspace tools used by this lab.</p>
        {projectsRoot ? <code>{projectsRoot}</code> : null}
      </div>

      <div className="section-heading">
        <h2>Available projects</h2>
        <button onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>

      {error ? (
        <div className="warning-callout">
          <strong>Project discovery failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {!error && projects.length === 0 ? <p>No kiss_ai projects were found under the configured projects root.</p> : null}

      <div className="project-card-grid">
        {projects.map((project) => (
          <button className="project-card" key={project.slug} onClick={() => onSelect(project.slug)} type="button">
            <span className="eyebrow">{project.setupStatus}</span>
            <strong>{project.name}</strong>
            <span>{project.slug}</span>
            <small>{project.path}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function MainWorkflowMenu({
  currentView,
  onOpen,
}: {
  currentView: View;
  onOpen: (view: View) => void;
}) {
  return (
    <nav className="nav-list" aria-label="Main workflows">
      {workflowMenuViews.map((item) => (
        <button
          className={item.id === currentView ? "nav-item active" : "nav-item"}
          key={item.id}
          onClick={() => onOpen(item.id)}
        >
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </button>
      ))}
    </nav>
  );
}

function GlobalFileSearch({
  projectSlug,
  onOpenFile,
  onSwitchProject,
}: {
  projectSlug: string;
  onOpenFile: (path: string) => void;
  onSwitchProject: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setLoading(false);
      setError("");
      setActiveResultIndex(-1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const timeoutId = window.setTimeout(() => {
      api
        .searchFiles(projectSlug, trimmedQuery)
        .then((response) => {
          if (cancelled) return;
          setResults(response.files);
          setActiveResultIndex(response.files.length ? 0 : -1);
          setIsOpen(true);
        })
        .catch((searchError) => {
          if (cancelled) return;
          setResults([]);
          setActiveResultIndex(-1);
          setError(searchError instanceof Error ? searchError.message : "Could not search project files.");
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [projectSlug, trimmedQuery]);

  function openResult(path: string) {
    onOpenFile(path);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setActiveResultIndex(-1);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      setIsOpen(true);
      setActiveResultIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      setIsOpen(true);
      setActiveResultIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      const activeResult = results[activeResultIndex] ?? results[0];
      if (!activeResult) return;
      event.preventDefault();
      openResult(activeResult.path);
    }
  }

  const showResults = isOpen && Boolean(trimmedQuery);

  return (
    <header className="global-topbar">
      <div className="global-search" role="search">
        <label className="global-search-label" htmlFor="global-file-search">
          Search files
        </label>
        <div className="global-search-field">
          <input
            autoComplete="off"
            id="global-file-search"
            onBlur={() => {
              window.setTimeout(() => setIsOpen(false), 120);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search inputs, outputs, and human files..."
            type="search"
            value={query}
          />
          {showResults ? (
            <div className="global-search-results" role="listbox">
              {loading ? <p className="global-search-state">Searching...</p> : null}
              {!loading && error ? <p className="global-search-state">{error}</p> : null}
              {!loading && !error && results.length === 0 ? <p className="global-search-state">No matching files found.</p> : null}
              {!loading && !error
                ? results.map((file, index) => (
                    <button
                      aria-selected={index === activeResultIndex}
                      className={index === activeResultIndex ? "global-search-result active" : "global-search-result"}
                      key={file.path}
                      onMouseEnter={() => setActiveResultIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openResult(file.path)}
                      role="option"
                      title={file.path}
                      type="button"
                    >
                      <strong>{humanizePathSegment(fileBasename(file.path))}</strong>
                      <span>{file.path}</span>
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </div>
      <button className="project-switch-button" onClick={onSwitchProject} type="button">
        Switch project
      </button>
    </header>
  );
}

function ContextualNavigator({
  currentView,
  files,
  loading,
  menuOpen,
  selectedPath,
  onToggleMenu,
  onOpenView,
  onSelectFile,
}: {
  currentView: View;
  files: ProjectFile[];
  loading: boolean;
  menuOpen: boolean;
  selectedPath: string | null;
  onToggleMenu: () => void;
  onOpenView: (view: View) => void;
  onSelectFile: (path: string) => void;
}) {
  const current = views.find((item) => item.id === currentView) ?? views[0];
  const showLocalFiles = ["requirements", "inputs", "outputs", "annotations", "design"].includes(currentView);
  const showFileTree = currentView === "inputs" || currentView === "outputs" || currentView === "annotations";

  return (
    <div className="context-nav">
      <div className="workflow-switcher">
        <button className="workflow-trigger" onClick={onToggleMenu} aria-expanded={menuOpen}>
          <span>
            <strong>{current.label}</strong>
            <em>{current.description}</em>
          </span>
          <b>⌄</b>
        </button>

        {menuOpen ? (
          <nav className="workflow-menu" aria-label="Switch workflow">
            {workflowMenuViews.map((item) => (
              <button
                className={item.id === currentView ? "workflow-option active" : "workflow-option"}
                key={item.id}
                onClick={() => onOpenView(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      {showLocalFiles ? (
        <nav className="local-nav" aria-label={`${current.label} items`}>
          <span className="eyebrow">{files.length} items</span>
          {loading ? <p>Loading...</p> : null}
          {files.length === 0 && !loading ? <p>No Markdown files found for this workflow yet.</p> : null}
          {showFileTree ? (
            <FileTreeNav files={files} selectedPath={selectedPath} onSelectFile={onSelectFile} />
          ) : (
            files.map((file) => {
              const visibleName = humanizePathSegment(file.name);

              return (
                <button
                  className={["local-nav-item", selectedPath === file.path ? "active" : ""].filter(Boolean).join(" ")}
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  title={file.path}
                >
                  <span>{visibleName}</span>
                </button>
              );
            })
          )}
          {currentView === "requirements" ? <p className="local-nav-note">{requirementsExplainer}</p> : null}
        </nav>
      ) : (
        <div className="local-nav-empty">
          <span className="eyebrow">{current.label}</span>
          <p>This workflow uses the main workspace and does not need a file list yet.</p>
        </div>
      )}
    </div>
  );
}

function FileTreeNav({
  files,
  selectedPath,
  onSelectFile,
}: {
  files: ProjectFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selectedAncestorKeys = useMemo(() => {
    const selectedFile = files.find((file) => file.path === selectedPath);
    return selectedFile ? getAncestorDirectoryKeys(selectedFile.name) : [];
  }, [files, selectedPath]);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedAncestorKeys.length === 0) return;

    setExpandedDirectories((current) => {
      const next = new Set(current);
      let changed = false;

      for (const directoryKey of selectedAncestorKeys) {
        if (next.has(directoryKey)) continue;
        next.add(directoryKey);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [selectedAncestorKeys]);

  function toggleDirectory(directoryKey: string) {
    setExpandedDirectories((current) => {
      const next = new Set(current);

      if (next.has(directoryKey)) {
        next.delete(directoryKey);
      } else {
        next.add(directoryKey);
      }

      return next;
    });
  }

  return (
    <div className="file-tree" role="tree">
      {tree.map((node) => (
        <FileTreeNodeRow
          depth={0}
          expandedDirectories={expandedDirectories}
          key={node.key}
          node={node}
          onSelectFile={onSelectFile}
          onToggleDirectory={toggleDirectory}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

function FileTreeNodeRow({
  node,
  depth,
  expandedDirectories,
  selectedPath,
  onSelectFile,
  onToggleDirectory,
}: {
  node: FileTreeNode;
  depth: number;
  expandedDirectories: Set<string>;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onToggleDirectory: (directoryKey: string) => void;
}) {
  const depthStyle = { "--tree-depth": String(Math.min(depth, 6)) } as CSSProperties;

  if (node.type === "directory") {
    const isExpanded = expandedDirectories.has(node.key);
    const visibleName = humanizePathSegment(node.name);

    return (
      <div className="file-tree-node">
        <button
          aria-expanded={isExpanded}
          className="file-tree-row file-tree-directory"
          onClick={() => onToggleDirectory(node.key)}
          role="treeitem"
          style={depthStyle}
          title={node.fullPath}
        >
          <span className="file-tree-toggle">{isExpanded ? "▾" : "▸"}</span>
          <span className="file-tree-label">{visibleName}</span>
        </button>

        {isExpanded ? (
          <div className="file-tree-children" role="group">
            {node.children.map((child) => (
              <FileTreeNodeRow
                depth={depth + 1}
                expandedDirectories={expandedDirectories}
                key={child.key}
                node={child}
                onSelectFile={onSelectFile}
                onToggleDirectory={onToggleDirectory}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      className={selectedPath === node.file.path ? "file-tree-row file-tree-file active" : "file-tree-row file-tree-file"}
      onClick={() => onSelectFile(node.file.path)}
      role="treeitem"
      style={depthStyle}
      title={node.file.path}
    >
      <span className="file-tree-toggle" aria-hidden="true" />
      <span className="file-tree-label">{humanizePathSegment(node.name)}</span>
    </button>
  );
}

function formatLocalDateTime(timestamp: string | null | undefined) {
  if (!timestamp) return "None";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLocalCompactDateTime(timestamp: string | null | undefined) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function Dashboard({
  status,
  design,
  onOpenAnnotations,
  onOpenDesign,
  onRefresh,
}: {
  status: ProjectStatus | null;
  design: DesignState | null;
  onOpenAnnotations: () => void;
  onOpenDesign: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project dashboard</span>
        <h2>Current project state</h2>
        <p>Readiness, rebuild history, annotation status, and local runtime availability.</p>
      </header>

      <div className="card-grid">
        <StatusCard label="Last successful run" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
        <StatusCard label="Scaling mode" value={status?.scalingMode ?? "Unknown"} />
        <StatusCard label="Rebuild scope" value={status?.rebuildStatus ?? "Unknown"} />
        <StatusCard label="Lint" value={status?.lintStatus ?? "Unknown"} />
      </div>

      <div className="card-grid dashboard-action-grid">
        <StatusCard label="Annotation files" value={String(status?.annotationFiles ?? 0)} onClick={onOpenAnnotations} />
        <StatusCard label="Design identity" value={design?.parsed.name ?? "Loading"} onClick={onOpenDesign} />
      </div>

      <section className="content-card">
        <div className="section-heading">
          <h3>Runtime readiness</h3>
          <button onClick={onRefresh}>Refresh</button>
        </div>
        <p>
          Cursor SDK rebuilds are{" "}
          <strong>
            {status?.cursorApiKeyAvailable
              ? `available from ${status.cursorApiKeySource}`
              : "blocked until a Cursor API key is available"}
          </strong>
          .
        </p>
        {status?.cursorApiKeyWarnings?.length ? (
          <div className="warning-callout">
            <strong>Cursor API key warning</strong>
            <ul>
              {status.cursorApiKeyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <p className="dashboard-setup-note">
          Project initialized <strong>{formatLocalDateTime(status?.setupInitializedAt)}</strong>.
        </p>
        <h3>Git working tree</h3>
        {status?.gitStatus.length ? (
          <ul className="compact-list">
            {status.gitStatus.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>No local changes reported.</p>
        )}
      </section>
    </div>
  );
}

function FileWorkspace({
  title,
  explainer,
  selected,
  selectedDiff,
  draft,
  projectFiles,
  onDraft,
  onNotice,
  onOpenFile,
  onRevert,
  onSave,
}: {
  title: string;
  explainer?: string;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  return (
    <div className="document-workspace">
      <header className="document-header">
        <span className="eyebrow">{title}</span>
        {explainer ? <p>{explainer}</p> : null}
      </header>
      <EditorPane
        selected={selected}
        selectedDiff={selectedDiff}
        draft={draft}
        projectFiles={projectFiles}
        onDraft={onDraft}
        onNotice={onNotice}
        onOpenFile={onOpenFile}
        onRevert={onRevert}
        onSave={onSave}
      />
    </div>
  );
}

function EditorPane({
  selected,
  selectedDiff,
  draft,
  projectFiles,
  onDraft,
  onNotice,
  onOpenFile,
  onRevert,
  onSave,
}: {
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  if (!selected) {
    return (
      <section className="editor-pane empty">
        <h2>Select a file</h2>
        <p>Choose a file from the left to review or edit it.</p>
      </section>
    );
  }

  const savedChangedLineCount = countDiffRangeLines(selectedDiff?.ranges ?? []);
  const savedDeletedLineCount = countDeletedLines(selectedDiff?.deletions ?? []);
  const hasSavedDiff = savedChangedLineCount > 0 || savedDeletedLineCount > 0;
  const hasUnsavedChanges = draft !== selected.content;
  const savedDiffLabel =
    hasSavedDiff
      ? `${(savedChangedLineCount + savedDeletedLineCount).toLocaleString()} saved Git diff ${savedChangedLineCount + savedDeletedLineCount === 1 ? "line" : "lines"}`
      : "No saved Git diff";

  return (
    <section className={selected.annotation ? "editor-pane annotation-mode" : "editor-pane"}>
      <div className="editor-toolbar">
        <div>
          <span className="eyebrow">{selected.kind}</span>
          <h2>{selected.path}</h2>
        </div>
        <div className="editor-toolbar-actions">
          {hasSavedDiff ? (
            <button className="editor-secondary-button" disabled={!selected.editable} onClick={onRevert} type="button">
              Revert to Committed State
            </button>
          ) : null}
          {selected.editable && hasUnsavedChanges ? (
            <>
              <button className="editor-secondary-button" onClick={() => onDraft(selected.content)} type="button">
                Undo Changes
              </button>
              <button className="editor-save-button" onClick={onSave} type="button">
                Save
              </button>
            </>
          ) : null}
        </div>
      </div>

      {selected.annotation ? (
        <div className="annotation-callout">
          This AI-managed content is read-only here. Use the rebuild workflow and review gates to update annotation state.
        </div>
      ) : null}

      <div className="editor-meta">
        <span>Loaded {draft.length.toLocaleString()} characters across {draft.split("\n").length.toLocaleString()} lines.</span>
        <span className="editor-diff-legend" aria-label="Editor diff highlight legend">
          <span className="editor-diff-key editor-diff-key-unsaved">Unsaved edits</span>
          <span className="editor-diff-key editor-diff-key-saved">{savedDiffLabel}</span>
        </span>
      </div>

      <MarkdownEditor
        baselineValue={selected.content}
        editable={selected.editable}
        files={projectFiles}
        onChange={onDraft}
        onNotice={onNotice}
        onOpenFile={onOpenFile}
        savedDiff={selectedDiff}
        selectedPath={selected.path}
        value={draft}
      />
    </section>
  );
}

function MarkdownEditor({
  baselineValue,
  editable,
  files,
  savedDiff,
  selectedPath,
  value,
  onChange,
  onNotice,
  onOpenFile,
}: {
  baselineValue: string;
  editable: boolean;
  files: ProjectFile[];
  savedDiff: FileDiff | null;
  selectedPath: string;
  value: string;
  onChange: (value: string) => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const unsavedDiff = useMemo(() => buildLineDiff(baselineValue, value), [baselineValue, value]);
  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          color: "var(--color-primary)",
          backgroundColor: "white",
        },
        ".cm-content": {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "1rem",
          lineHeight: "1.7",
          padding: "20px",
        },
        ".cm-scroller": {
          overflow: "auto",
        },
      }),
      buildMarkdownTableExtension({ editable, renderCellText: renderMarkdownTableCellText, onNotice }),
      buildEditorDiffExtension({ unsavedDiff, savedDiff }),
      buildWikiLinkExtension({ files, selectedPath, onOpenFile }),
    ],
    [editable, files, onNotice, onOpenFile, savedDiff, selectedPath, unsavedDiff],
  );

  return (
    <div className="markdown-editor-shell">
      <CodeMirror
        basicSetup={{
          foldGutter: false,
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: false,
        }}
        editable={editable}
        extensions={extensions}
        height="100%"
        key={selectedPath}
        onChange={onChange}
        readOnly={!editable}
        theme="light"
        value={value}
      />
    </div>
  );
}

function DesignWorkspace({
  design,
  selected,
  selectedDiff,
  draft,
  loading,
  onDraft,
  onRevert,
  onSave,
  onRefresh,
}: {
  design: DesignState | null;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  loading: boolean;
  onDraft: (value: string) => void;
  onRevert: () => void;
  onSave: () => void;
  onRefresh: () => void;
}) {
  const colors = design?.parsed.colors ?? {};
  const parsedDraft = useMemo(() => parseDesignIdentityDraft(draft), [draft]);
  const savedChangedLineCount = countDiffRangeLines(selectedDiff?.ranges ?? []);
  const savedDeletedLineCount = countDeletedLines(selectedDiff?.deletions ?? []);
  const hasSavedDiff = savedChangedLineCount > 0 || savedDeletedLineCount > 0;
  const hasUnsavedChanges = Boolean(selected && draft !== selected.content);
  const [activeDesignTab, setActiveDesignTab] = useState<"preview" | "edit">("preview");
  const savedDiffLabel =
    hasSavedDiff
      ? `${(savedChangedLineCount + savedDeletedLineCount).toLocaleString()} saved Git diff ${savedChangedLineCount + savedDeletedLineCount === 1 ? "line" : "lines"}`
      : "No saved Git diff";

  function updateDesignDraft(nextDraft: DesignIdentityDraft) {
    onDraft(serializeDesignIdentityDraft(nextDraft));
  }

  function updateFrontmatterValue(key: string, value: unknown) {
    updateDesignDraft({
      ...parsedDraft,
      frontmatter: {
        ...parsedDraft.frontmatter,
        [key]: value,
      },
    });
  }

  function updateTokenValue(group: string, key: string, value: string) {
    updateFrontmatterValue(group, {
      ...asRecord(parsedDraft.frontmatter[group]),
      [key]: value,
    });
  }

  function updateNestedTokenValue(group: string, parentKey: string, key: string, value: string) {
    const groupValue = asRecord(parsedDraft.frontmatter[group]);

    updateFrontmatterValue(group, {
      ...groupValue,
      [parentKey]: {
        ...asRecord(groupValue[parentKey]),
        [key]: value,
      },
    });
  }

  function updateOpening(value: string) {
    updateDesignDraft({
      ...parsedDraft,
      opening: value,
    });
  }

  function updateSection(index: number, section: DesignMarkdownSection) {
    updateDesignDraft({
      ...parsedDraft,
      sections: parsedDraft.sections.map((currentSection, currentIndex) =>
        currentIndex === index ? section : currentSection,
      ),
    });
  }

  if (!selected) {
    return (
      <div className="design-workspace">
        <section className="editor-pane empty">
          <h2>Select the design identity file</h2>
          <p>Choose `human_design_identity.md` from the left panel to edit project design tokens.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="design-workspace">
      <header className="page-header">
        <span className="eyebrow">Human-owned design identity</span>
        <h2>{design?.parsed.name ?? "Project Design Identity"}</h2>
        <p>{design?.parsed.description || "Customize DESIGN.md tokens and rationale for this project."}</p>
      </header>

      <div className="design-tab-shell">
        <div className="design-tabs" role="tablist" aria-label="Design identity views">
          <button
            aria-selected={activeDesignTab === "preview"}
            className={activeDesignTab === "preview" ? "design-tab active" : "design-tab"}
            onClick={() => setActiveDesignTab("preview")}
            role="tab"
            type="button"
          >
            Token Preview
          </button>
          <button
            aria-selected={activeDesignTab === "edit"}
            className={activeDesignTab === "edit" ? "design-tab active" : "design-tab"}
            onClick={() => setActiveDesignTab("edit")}
            role="tab"
            type="button"
          >
            Edit Design
          </button>
        </div>

        {activeDesignTab === "preview" ? (
          <section className="content-card design-tab-panel" role="tabpanel">
            <h3>Token preview</h3>
            <div className="swatch-grid">
              {Object.entries(colors).map(([name, value]) => (
                <div className="swatch" key={name}>
                  <span style={{ background: value }} />
                  <strong>{name}</strong>
                  <code>{value}</code>
                </div>
              ))}
            </div>
            <p className={design?.lint.ok ? "lint-ok" : "lint-warning"}>{design?.lint.message ?? "Design lint not run."}</p>
          </section>
        ) : null}

        {activeDesignTab === "edit" ? (
          <section className="editor-pane design-editor-pane design-tab-panel" role="tabpanel">
        <div className="editor-toolbar">
          <div>
            <span className="eyebrow">Structured DESIGN.md-compatible file</span>
            <h2>{selected?.path ?? "human_design_identity.md"}</h2>
          </div>
          <div className="editor-toolbar-actions">
            {hasSavedDiff ? (
              <button className="editor-secondary-button" disabled={!selected.editable || loading} onClick={onRevert} type="button">
                Revert to Committed State
              </button>
            ) : null}
            {selected.editable && hasUnsavedChanges ? (
              <>
                <button
                  className="editor-secondary-button"
                  disabled={loading}
                  onClick={() => onDraft(selected.content)}
                  type="button"
                >
                  Undo Changes
                </button>
                <button className="editor-save-button" disabled={loading} onClick={onSave} type="button">
                  Save Design Identity
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="editor-meta">
          <span>
            Loaded {draft.length.toLocaleString()} characters across {draft.split("\n").length.toLocaleString()} lines.
          </span>
          <span className="editor-diff-legend" aria-label="Design editor diff highlight legend">
            <span className="editor-diff-key editor-diff-key-unsaved">Unsaved edits</span>
            <span className="editor-diff-key editor-diff-key-saved">{savedDiffLabel}</span>
          </span>
        </div>

        {parsedDraft.parseError ? (
          <div className="design-form-scroll">
            <div className="warning-callout">
              <strong>Frontmatter parse error</strong>
              <p>{parsedDraft.parseError}</p>
            </div>
            <label className="design-field">
              <span>Raw design identity file</span>
              <textarea value={draft} onChange={(event) => onDraft(event.target.value)} spellCheck="true" />
            </label>
          </div>
        ) : (
          <div className="design-form-scroll">
            <div className="design-form-grid">
              <section className="design-form-card">
                <div>
                  <span className="eyebrow">Identity</span>
                  <h3>Project identity</h3>
                </div>
                <DesignTextField
                  label="Version"
                  onChange={(value) => updateFrontmatterValue("version", value)}
                  value={asString(parsedDraft.frontmatter.version)}
                />
                <DesignTextField
                  label="Name"
                  onChange={(value) => updateFrontmatterValue("name", value)}
                  value={asString(parsedDraft.frontmatter.name)}
                />
                <DesignTextField
                  label="Description"
                  multiline
                  onChange={(value) => updateFrontmatterValue("description", value)}
                  value={asString(parsedDraft.frontmatter.description)}
                />
              </section>

              <section className="design-form-card design-form-card-wide">
                <div>
                  <span className="eyebrow">Colors</span>
                  <h3>Color tokens</h3>
                </div>
                <ColorTokenFields colors={asRecord(parsedDraft.frontmatter.colors)} onChange={(key, value) => updateTokenValue("colors", key, value)} />
              </section>

              <ScalarTokenFields
                title="Rounded corners"
                tokens={asRecord(parsedDraft.frontmatter.rounded)}
                onChange={(key, value) => updateTokenValue("rounded", key, value)}
              />
              <ScalarTokenFields
                title="Spacing"
                tokens={asRecord(parsedDraft.frontmatter.spacing)}
                onChange={(key, value) => updateTokenValue("spacing", key, value)}
              />

              <NestedTokenFields
                groupLabel="Typography"
                groups={asRecord(parsedDraft.frontmatter.typography)}
                onChange={(group, key, value) => updateNestedTokenValue("typography", group, key, value)}
              />
              <NestedTokenFields
                groupLabel="Components"
                groups={asRecord(parsedDraft.frontmatter.components)}
                onChange={(group, key, value) => updateNestedTokenValue("components", group, key, value)}
              />

              <section className="design-form-card design-form-card-wide">
                <div>
                  <span className="eyebrow">Markdown</span>
                  <h3>Body sections</h3>
                </div>
                {parsedDraft.opening ? (
                  <DesignTextField label="Opening text" multiline onChange={updateOpening} value={parsedDraft.opening} />
                ) : null}
                {parsedDraft.sections.map((section, index) => (
                  <div className="design-markdown-section" key={`${section.title}-${index}`}>
                    <DesignTextField
                      label="Section title"
                      onChange={(value) => updateSection(index, { ...section, title: value })}
                      value={section.title}
                    />
                    <DesignTextField
                      label={`${section.title || "Section"} content`}
                      multiline
                      onChange={(value) => updateSection(index, { ...section, content: value })}
                      value={section.content}
                    />
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}
      </section>
        ) : null}
      </div>
    </div>
  );
}

function DesignTextField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="design-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck="true" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} type="text" />
      )}
    </label>
  );
}

function ColorTokenFields({
  colors,
  onChange,
}: {
  colors: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(colors);

  if (!entries.length) {
    return <p>No color tokens found.</p>;
  }

  return (
    <div className="design-token-list">
      {entries.map(([key, value]) => {
        const stringValue = asString(value);
        const pickerValue = isHexColor(stringValue) ? stringValue : "#000000";

        return (
          <label className="design-color-row" key={key}>
            <span>{key}</span>
            <input
              aria-label={`${key} color picker`}
              disabled={!isHexColor(stringValue)}
              onChange={(event) => onChange(key, event.target.value)}
              type="color"
              value={pickerValue}
            />
            <input
              aria-label={`${key} color value`}
              onChange={(event) => onChange(key, event.target.value)}
              type="text"
              value={stringValue}
            />
          </label>
        );
      })}
    </div>
  );
}

function ScalarTokenFields({
  title,
  tokens,
  onChange,
}: {
  title: string;
  tokens: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(tokens);

  return (
    <section className="design-form-card">
      <div>
        <span className="eyebrow">Tokens</span>
        <h3>{title}</h3>
      </div>
      {entries.length ? (
        <div className="design-token-list">
          {entries.map(([key, value]) => (
            <DesignTextField key={key} label={key} onChange={(nextValue) => onChange(key, nextValue)} value={asString(value)} />
          ))}
        </div>
      ) : (
        <p>No {title.toLowerCase()} tokens found.</p>
      )}
    </section>
  );
}

function NestedTokenFields({
  groupLabel,
  groups,
  onChange,
}: {
  groupLabel: string;
  groups: Record<string, unknown>;
  onChange: (group: string, key: string, value: string) => void;
}) {
  const entries = Object.entries(groups);

  return (
    <section className="design-form-card design-form-card-wide">
      <div>
        <span className="eyebrow">Tokens</span>
        <h3>{groupLabel}</h3>
      </div>
      {entries.length ? (
        <div className="design-nested-list">
          {entries.map(([group, values]) => (
            <fieldset className="design-token-fieldset" key={group}>
              <legend>{group}</legend>
              <div className="design-token-list">
                {Object.entries(asRecord(values)).map(([key, value]) => (
                  <DesignTextField
                    key={key}
                    label={key}
                    onChange={(nextValue) => onChange(group, key, nextValue)}
                    value={asString(value)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <p>No {groupLabel.toLowerCase()} tokens found.</p>
      )}
    </section>
  );
}

function RebuildWorkspace({
  status,
  rebuild,
  onStart,
  onRefresh,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onStart: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project rebuild</span>
        <h2>Run the kiss_ai rebuild loop</h2>
        <p>The backend starts one local Cursor SDK agent from the project root and asks it to follow the project rebuild command.</p>
      </header>

      <section className="content-card">
        <div className="section-heading">
          <h3>Runner status</h3>
          <button onClick={onRefresh}>Refresh</button>
        </div>
        <p>
          Current state: <strong>{rebuild?.status ?? "idle"}</strong>
        </p>
        <p>{rebuild?.message ?? "No rebuild state loaded."}</p>
        <button disabled={Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable} onClick={onStart}>
          {rebuild?.running ? "Rebuild Running" : "Start Rebuild"}
        </button>
        {!status?.cursorApiKeyAvailable ? (
          <p className="lint-warning">
            Add a Cursor API key using `CURSOR_API_KEY`, `web/.env`, or macOS Keychain item `cursor_api_key` to enable
            UI-triggered rebuilds.
          </p>
        ) : (
          <p>Using Cursor API key from <strong>{status.cursorApiKeySource}</strong>.</p>
        )}
        {status?.cursorApiKeyWarnings?.length ? (
          <div className="warning-callout">
            <strong>Cursor API key warning</strong>
            <ul>
              {status.cursorApiKeyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <h3>Run log</h3>
        <pre className="run-log">{rebuild?.log.length ? rebuild.log.join("\n\n") : "No UI-started rebuild log yet."}</pre>
      </section>
    </div>
  );
}

function StatusCard({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </>
  );

  return onClick ? (
    <button className="status-card status-card-button" onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <section className="status-card">
      {content}
    </section>
  );
}
