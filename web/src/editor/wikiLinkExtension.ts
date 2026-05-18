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
            resolution: resolveWikiLinkWithIndex(rawTarget, linkIndex),
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
            resolution: resolveMarkdownLinkWithIndex(rawTarget, linkIndex),
          });
        }

        let lastLinkEnd = -1;
        linkDecorations
          .sort((left, right) => left.from - right.from || left.to - right.to)
          .filter((link) => {
            if (link.from < lastLinkEnd) return false;
            lastLinkEnd = link.to;
            return true;
          })
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
  return cell.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1").replace(/\[\[([^\]\n]+)\]\]/g, (_match, rawTarget: string) => wikiLinkLabel(rawTarget));
}
