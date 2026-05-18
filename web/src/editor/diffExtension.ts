import { type Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { FileDiff } from "../contracts/api";
import type { DiffKind, EditorDiff, EditorDiffDeletion, EditorDiffRange } from "../domain/diffs";

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

export function buildEditorDiffExtension({
  getUnsavedDiff,
  getSavedDiff,
}: {
  getUnsavedDiff: () => EditorDiff;
  getSavedDiff: () => FileDiff | null;
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
    const unsavedDiff = getUnsavedDiff();
    const savedDiff = getSavedDiff();
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

