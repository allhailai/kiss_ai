import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { ProjectFile } from "../contracts/api";
import {
  linkResolutionClass,
  linkResolutionTitle,
  markdownLinkPattern,
  createLinkResolutionIndex,
  resolveMarkdownLinkWithIndex,
  resolveWikiLinkWithIndex,
  wikiLinkLabel,
  wikiLinkPattern,
  type WikiLinkResolution,
} from "../domain/links";
import { parseMarkdownTableBlock } from "./markdownTableExtension";

/** Source-file path pattern: sources/web_research/domain_com__slug.md or sources/digests/... */
const sourcePathPattern = /^`?sources\/(web_research|digests)\/([^`]+)\.md`?$/;

/**
 * Converts a source file path label into a compact human-readable domain label.
 * E.g. "sources/web_research/bostonglobe_com__2026_05_17_...md" → "Boston Globe"
 */
function humanizeSourceLabel(label: string): string | null {
  const match = label.match(sourcePathPattern);
  if (!match) return null;

  const filename = match[2];
  // Extract the domain part (everything before the first "__")
  const domainPart = filename.split("__")[0] ?? filename;
  // Convert domain underscores to readable: "bostonglobe_com" → "bostonglobe.com" → "Boston Globe"
  const domain = domainPart.replace(/_com$/, ".com").replace(/_org$/, ".org").replace(/_gov$/, ".gov").replace(/_net$/, ".net").replace(/_io$/, ".io");
  // Capitalize and clean: "bostonglobe.com" → "Bostonglobe" (strip TLD for display)
  const name = domain.replace(/\.(com|org|gov|net|io)$/, "");
  // Split camelCase-ish or remaining underscores, capitalize each word
  const words = name.split(/[_-]+/).filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
    const humanized = humanizeSourceLabel(this.label);
    const isSourceCitation = humanized !== null;
    const displayLabel = humanized ?? this.label;

    const link = document.createElement("span");
    link.className = `cm-wiki-link ${linkResolutionClass(this.resolution)}${isSourceCitation ? " cm-source-citation" : ""}`;
    link.textContent = isSourceCitation ? `📄 ${displayLabel}` : displayLabel;
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

export function buildWikiLinkExtension({
  getFiles,
  selectedPath,
  getOnOpenFile,
}: {
  getFiles: () => ProjectFile[];
  selectedPath: string | null;
  getOnOpenFile: () => (path: string) => void;
}): Extension {
  function buildDecorations(view: import("@codemirror/view").EditorView) {
    const files = getFiles();
    const onOpenFile = getOnOpenFile();
    const linkIndex = createLinkResolutionIndex(files, selectedPath);

    // Collect all link decorations across all visible ranges first
    const allLinks: Array<{ from: number; to: number; label: string; resolution: WikiLinkResolution }> = [];

    for (const { from, to } of view.visibleRanges) {
      let position = from;

      while (position <= to) {
        const line = view.state.doc.lineAt(position);
        const table = parseMarkdownTableBlock(view.state.doc, line.number);

        if (table) {
          position = table.to + 1;
          continue;
        }

        const lineLinks: Array<{ from: number; to: number; label: string; resolution: WikiLinkResolution }> = [];
        wikiLinkPattern.lastIndex = 0;
        markdownLinkPattern.lastIndex = 0;

        for (const match of line.text.matchAll(wikiLinkPattern)) {
          const matchIndex = match.index ?? 0;
          const rawTarget = match[1] ?? "";
          let linkTo = line.from + matchIndex + match[0].length;
          let resolution: WikiLinkResolution = resolveWikiLinkWithIndex(rawTarget, linkIndex);
          let label = wikiLinkLabel(rawTarget);

          // Handle hybrid Obsidian-style links: [[wiki-link]](url)
          // When a wiki link is immediately followed by (url), consume
          // the whole construct and use the external URL for navigation.
          const afterMatch = line.text.slice(matchIndex + match[0].length);
          const urlSuffix = afterMatch.match(/^\(([^)\n]+)\)/);
          if (urlSuffix) {
            linkTo += urlSuffix[0].length;
            const href = urlSuffix[1] ?? "";
            if (/^(https?:|mailto:)/i.test(href)) {
              resolution = { status: "external", href };
            }
            // Use the full raw target as label so humanizeSourceLabel
            // can match source paths (e.g. sources/web_research/...).
            label = rawTarget;
          }

          lineLinks.push({
            from: line.from + matchIndex,
            to: linkTo,
            label,
            resolution,
          });
        }

        for (const match of line.text.matchAll(markdownLinkPattern)) {
          const matchIndex = match.index ?? 0;
          const label = match[1] ?? "";
          const rawTarget = match[2] ?? "";
          const linkFrom = line.from + matchIndex;
          const linkTo = linkFrom + match[0].length;

          if (lineLinks.some((decoration) => linkFrom < decoration.to && linkTo > decoration.from)) continue;

          lineLinks.push({
            from: linkFrom,
            to: linkTo,
            label,
            resolution: resolveMarkdownLinkWithIndex(rawTarget, linkIndex),
          });
        }

        allLinks.push(...lineLinks);

        if (line.to >= to) break;
        position = line.to + 1;
      }
    }

    // Sort globally by position, then deduplicate overlaps
    allLinks.sort((left, right) => left.from - right.from || left.to - right.to);

    const builder = new RangeSetBuilder<Decoration>();
    let lastEnd = -1;
    for (const link of allLinks) {
      if (link.from < lastEnd) continue; // skip overlapping
      lastEnd = link.to;
      builder.add(
        link.from,
        link.to,
        Decoration.replace({
          widget: new MarkdownLinkWidget(link.label, link.resolution, onOpenFile),
        }),
      );
    }

    return builder.finish();
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: import("@codemirror/view").EditorView) {
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

export function renderMarkdownTableCellText(cell: string) {
  return cell
    .replace(/\[\[([^\]\n]+)\]\]\([^)\n]+\)/g, (_match, rawTarget: string) => wikiLinkLabel(rawTarget))
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/\[\[([^\]\n]+)\]\]/g, (_match, rawTarget: string) => wikiLinkLabel(rawTarget));
}

/**
 * Appends text with inline markdown formatting (bold, italic, code) to a
 * container element. Text that doesn't match any formatting pattern is
 * appended as plain text nodes.
 */
function appendFormattedText(text: string, container: HTMLElement) {
  // Bold first (greedy over single *), then italic, then inline code
  const formattingPattern = /\*\*(.+?)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;
  let lastIndex = 0;

  for (const match of text.matchAll(formattingPattern)) {
    const matchStart = match.index ?? 0;

    if (matchStart > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, matchStart)));
    }

    if (match[1] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[1];
      container.appendChild(strong);
    } else if (match[2] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[2];
      container.appendChild(em);
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.className = "cm-table-inline-code";
      code.textContent = match[3];
      container.appendChild(code);
    }

    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

/**
 * Builds a renderCellDisplay callback for the markdown table extension.
 * Parses cell text for wiki links and markdown links, and creates clickable
 * DOM elements using the same resolution logic as the inline link extension.
 */
export function buildTableCellDisplayRenderer({
  getFiles,
  selectedPath,
  getOnOpenFile,
}: {
  getFiles: () => ProjectFile[];
  selectedPath: string | null;
  getOnOpenFile: () => (path: string) => void;
}): (cell: string, container: HTMLElement) => void {
  return (cell: string, container: HTMLElement) => {
    const files = getFiles();
    const onOpenFile = getOnOpenFile();
    const linkIndex = createLinkResolutionIndex(files, selectedPath);

    // Combined pattern matching wiki links and markdown links
    const combinedPattern = /\[\[([^\]\n]+)\]\]|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    let lastIndex = 0;

    for (const match of cell.matchAll(combinedPattern)) {
      const matchStart = match.index ?? 0;

      // Append any plain text before this match (with formatting)
      if (matchStart > lastIndex) {
        appendFormattedText(cell.slice(lastIndex, matchStart), container);
      }

      if (match[1] !== undefined) {
        // Wiki link: [[target]] — possibly hybrid [[target]](url)
        const rawTarget = match[1];
        let label = wikiLinkLabel(rawTarget);
        let resolution: WikiLinkResolution = resolveWikiLinkWithIndex(rawTarget, linkIndex);
        let consumedLength = match[0].length;

        // Check for hybrid format: [[wiki-link]](url)
        const afterMatch = cell.slice(matchStart + match[0].length);
        const urlSuffix = afterMatch.match(/^\(([^)\n]+)\)/);
        if (urlSuffix) {
          consumedLength += urlSuffix[0].length;
          const href = urlSuffix[1] ?? "";
          if (/^(https?:|mailto:)/i.test(href)) {
            resolution = { status: "external", href };
          }
          label = rawTarget;
        }

        container.appendChild(createLinkElement(label, resolution, onOpenFile));
        lastIndex = matchStart + consumedLength;
        continue;
      } else if (match[2] !== undefined && match[3] !== undefined) {
        // Markdown link: [label](target)
        const label = match[2];
        const rawTarget = match[3];
        const resolution = resolveMarkdownLinkWithIndex(rawTarget, linkIndex);
        const humanized = humanizeSourceLabel(label);
        const displayLabel = humanized ?? label;
        container.appendChild(createLinkElement(displayLabel, resolution, onOpenFile, humanized !== null));
      }

      lastIndex = matchStart + match[0].length;
    }

    // Append any remaining text after the last match (with formatting)
    if (lastIndex < cell.length) {
      appendFormattedText(cell.slice(lastIndex), container);
    }
  };
}

function createLinkElement(
  label: string,
  resolution: WikiLinkResolution,
  onOpenFile: (path: string) => void,
  isSourceCitation = false,
): HTMLElement {
  const link = document.createElement("span");
  link.className = `cm-wiki-link ${linkResolutionClass(resolution)}${isSourceCitation ? " cm-source-citation" : ""}`;
  link.textContent = isSourceCitation ? `📄 ${label}` : label;
  link.role = "link";
  link.tabIndex = 0;
  link.title = linkResolutionTitle(resolution);

  const open = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (resolution.status === "resolved") {
      onOpenFile(resolution.file.path);
    } else if (resolution.status === "external") {
      window.open(resolution.href, "_blank", "noopener,noreferrer");
    }
  };

  link.addEventListener("mousedown", (event) => event.preventDefault());
  link.addEventListener("click", open);
  link.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    open(event);
  });

  return link;
}

