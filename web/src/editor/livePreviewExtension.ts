import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { parseMarkdownTableBlock } from "./markdownTableExtension";

/**
 * Obsidian-style "live preview" extension for CodeMirror 6.
 *
 * Hides markdown syntax markers (##, **, *, ~~) when the cursor is NOT on
 * that line, and reveals the raw markdown when the cursor moves to that line.
 *
 * Phase 1: Headings (H1–H6), bold, italic, strikethrough.
 */

// ---------------------------------------------------------------------------
// Heading level → node name mapping
// ---------------------------------------------------------------------------

const headingNodeNames = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

function headingLevel(nodeName: string): number {
  switch (nodeName) {
    case "ATXHeading1": return 1;
    case "ATXHeading2": return 2;
    case "ATXHeading3": return 3;
    case "ATXHeading4": return 4;
    case "ATXHeading5": return 5;
    case "ATXHeading6": return 6;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Decoration cache (avoid creating new Decoration objects every rebuild)
// ---------------------------------------------------------------------------

const headingMarkDecorations = [
  /* 0 — unused */ Decoration.mark({ class: "cm-live-heading-1" }),
  Decoration.mark({ class: "cm-live-heading-1" }),
  Decoration.mark({ class: "cm-live-heading-2" }),
  Decoration.mark({ class: "cm-live-heading-3" }),
  Decoration.mark({ class: "cm-live-heading-4" }),
  Decoration.mark({ class: "cm-live-heading-5" }),
  Decoration.mark({ class: "cm-live-heading-6" }),
];

const boldMarkDecoration = Decoration.mark({ class: "cm-live-bold" });
const italicMarkDecoration = Decoration.mark({ class: "cm-live-italic" });
const strikethroughMarkDecoration = Decoration.mark({ class: "cm-live-strikethrough" });
const inlineCodeMarkDecoration = Decoration.mark({ class: "cm-live-inline-code" });
const blockquoteLineDecoration = Decoration.line({ class: "cm-live-blockquote-line" });
const listBulletDecoration = Decoration.mark({ class: "cm-live-list-bullet" });

const replaceDecoration = Decoration.replace({});
const horizontalRuleLineDecoration = Decoration.line({ class: "cm-live-hr-line" });

// ---------------------------------------------------------------------------
// Cursor-line detection
// ---------------------------------------------------------------------------

/**
 * Returns a Set of 1-indexed line numbers that contain any part of the
 * editor's selection ranges. When the editor is not editable (read-only /
 * annotation mode), returns an empty set so all lines stay in preview.
 */
function cursorLineNumbers(state: EditorState, editable: boolean): Set<number> {
  if (!editable) return new Set();

  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber++) {
      lines.add(lineNumber);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Table-line detection (avoid conflicts with markdownTableExtension)
// ---------------------------------------------------------------------------

/**
 * Builds a Set of 1-indexed line numbers that belong to a markdown table
 * block. These lines are already handled by `markdownTableExtension` and
 * should be skipped by live preview.
 */
function tableLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  let position = 0;

  while (position <= state.doc.length) {
    const line = state.doc.lineAt(position);
    const table = parseMarkdownTableBlock(state.doc, line.number);

    if (table) {
      for (let lineNumber = table.startLineNumber; lineNumber <= table.endLineNumber; lineNumber++) {
        lines.add(lineNumber);
      }
      position = table.to + 1;
      continue;
    }

    if (line.to >= state.doc.length) break;
    position = line.to + 1;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

type DecorationEntry = { from: number; to: number; decoration: Decoration };

function buildDecorations(view: EditorView, editable: boolean): DecorationSet {
  const { state } = view;
  const cursorLines = cursorLineNumbers(state, editable);
  const tableLines = tableLineNumbers(state);
  const entries: DecorationEntry[] = [];

  // Walk the syntax tree only within visible ranges for performance.
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        // ---------------------------------------------------------------
        // Headings: ATXHeading1 … ATXHeading6
        // ---------------------------------------------------------------
        if (headingNodeNames.has(node.name)) {
          const level = headingLevel(node.name);
          if (!level) return;

          const headingFrom = node.from;
          const headingTo = node.to;
          const headingLine = state.doc.lineAt(headingFrom);

          // Skip if the line is a cursor line or table line
          if (cursorLines.has(headingLine.number) || tableLines.has(headingLine.number)) return;

          // Mark the entire heading line content with the heading class
          if (headingFrom < headingTo) {
            entries.push({
              from: headingFrom,
              to: headingTo,
              decoration: headingMarkDecorations[level],
            });
          }

          // Now walk child nodes to find and hide HeaderMark nodes
          // (the `#` characters and trailing space)
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "HeaderMark") {
                // Hide the `##` marker. Also hide the space after it if present.
                let replaceEnd = cursor.to;
                const afterMark = state.doc.sliceString(cursor.to, cursor.to + 1);
                if (afterMark === " ") {
                  replaceEnd = cursor.to + 1;
                }
                entries.push({
                  from: cursor.from,
                  to: replaceEnd,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          // Don't descend further — we've handled children manually
          return false;
        }

        // ---------------------------------------------------------------
        // Bold: StrongEmphasis
        // ---------------------------------------------------------------
        if (node.name === "StrongEmphasis") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return false;

          // Mark the content (between the markers) as bold
          entries.push({
            from: node.from,
            to: node.to,
            decoration: boldMarkDecoration,
          });

          // Hide the EmphasisMark children (** or __)
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "EmphasisMark") {
                entries.push({
                  from: cursor.from,
                  to: cursor.to,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          return false;
        }

        // ---------------------------------------------------------------
        // Italic: Emphasis
        // ---------------------------------------------------------------
        if (node.name === "Emphasis") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return false;

          entries.push({
            from: node.from,
            to: node.to,
            decoration: italicMarkDecoration,
          });

          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "EmphasisMark") {
                entries.push({
                  from: cursor.from,
                  to: cursor.to,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          return false;
        }

        // ---------------------------------------------------------------
        // Strikethrough: Strikethrough
        // ---------------------------------------------------------------
        if (node.name === "Strikethrough") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return false;

          entries.push({
            from: node.from,
            to: node.to,
            decoration: strikethroughMarkDecoration,
          });

          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "StrikethroughMark") {
                entries.push({
                  from: cursor.from,
                  to: cursor.to,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          return false;
        }

        // ---------------------------------------------------------------
        // Inline Code: InlineCode
        // ---------------------------------------------------------------
        if (node.name === "InlineCode") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return false;

          // Mark the whole range with code styling
          entries.push({
            from: node.from,
            to: node.to,
            decoration: inlineCodeMarkDecoration,
          });

          // Hide the CodeMark children (backticks)
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "CodeMark") {
                entries.push({
                  from: cursor.from,
                  to: cursor.to,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          return false;
        }

        // ---------------------------------------------------------------
        // Blockquote: hide QuoteMark (>) and style the line
        // ---------------------------------------------------------------
        if (node.name === "Blockquote") {
          // Process each line within the blockquote
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "QuoteMark") {
                const quoteLine = state.doc.lineAt(cursor.from);
                if (cursorLines.has(quoteLine.number) || tableLines.has(quoteLine.number)) continue;

                // Add blockquote line styling
                entries.push({
                  from: quoteLine.from,
                  to: quoteLine.from,
                  decoration: blockquoteLineDecoration,
                });

                // Hide the ">" marker and trailing space
                let replaceEnd = cursor.to;
                const afterMark = state.doc.sliceString(cursor.to, cursor.to + 1);
                if (afterMark === " ") {
                  replaceEnd = cursor.to + 1;
                }
                entries.push({
                  from: cursor.from,
                  to: replaceEnd,
                  decoration: replaceDecoration,
                });
              }
            } while (cursor.nextSibling());
          }

          // Continue descending — blockquotes contain paragraphs, headings,
          // etc. that should also get live-preview treatment.
          return;
        }

        // ---------------------------------------------------------------
        // List items: style the bullet/number marker
        // ---------------------------------------------------------------
        if (node.name === "ListMark") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return;

          entries.push({
            from: node.from,
            to: node.to,
            decoration: listBulletDecoration,
          });

          return;
        }

        // ---------------------------------------------------------------
        // Horizontal rule: replace --- / *** / ___ with styled <hr>
        // ---------------------------------------------------------------
        if (node.name === "HorizontalRule") {
          const line = state.doc.lineAt(node.from);
          if (cursorLines.has(line.number) || tableLines.has(line.number)) return false;

          // Style the line as a horizontal rule
          entries.push({
            from: line.from,
            to: line.from,
            decoration: horizontalRuleLineDecoration,
          });

          // Hide the --- / *** / ___ text
          entries.push({
            from: node.from,
            to: node.to,
            decoration: replaceDecoration,
          });

          return false;
        }
      },
    });
  }

  // CM6 requires decorations sorted by position, with replace decorations
  // ordered before mark decorations at the same position.
  return Decoration.set(
    entries.map((entry) => entry.decoration.range(entry.from, entry.to)),
    true, // sort
  );
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export function buildLivePreviewExtension({ editable }: { editable: boolean }): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, editable);
      }

      update(update: ViewUpdate) {
        // Rebuild when:
        // - document content changes
        // - cursor/selection moves (to show/hide syntax on active line)
        // - viewport scrolls (we only decorate visible ranges)
        // - syntax tree updates (Lezer parses large files incrementally —
        //   the bottom of the file may not be parsed on initial load)
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = buildDecorations(update.view, editable);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
