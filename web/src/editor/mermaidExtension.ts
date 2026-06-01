import { RangeSetBuilder, StateField, type EditorState, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

/**
 * Mermaid diagram live-preview extension for CodeMirror 6.
 *
 * Detects fenced code blocks with the `mermaid` language tag, hides the raw
 * source when the cursor is not inside the block, and renders the diagram
 * as inline SVG using the mermaid library (loaded from CDN on first use).
 *
 * Follows the same StateField + WidgetType pattern as markdownTableExtension.
 */

// ---------------------------------------------------------------------------
// Mermaid block parser
// ---------------------------------------------------------------------------

export type MermaidBlock = {
  /** Absolute character offset of the opening ``` line start. */
  from: number;
  /** Absolute character offset of the closing ``` line end. */
  to: number;
  /** 1-indexed line number of the opening ``` line. */
  startLineNumber: number;
  /** 1-indexed line number of the closing ``` line. */
  endLineNumber: number;
  /** The raw diagram source (lines between opening and closing fences). */
  source: string;
};

/**
 * Try to parse a mermaid fenced code block starting at the given line.
 * Returns null if the line is not a mermaid fence opener.
 */
export function parseMermaidBlock(doc: Text, lineNumber: number): MermaidBlock | null {
  if (lineNumber > doc.lines) return null;

  const openLine = doc.line(lineNumber);
  const openText = openLine.text.trimStart();

  // Must be an opening fence: ``` or ~~~ followed by "mermaid"
  const fenceMatch = openText.match(/^(`{3,}|~{3,})\s*mermaid\s*$/);
  if (!fenceMatch) return null;

  const fenceChar = fenceMatch[1][0]; // ` or ~
  const fenceLen = fenceMatch[1].length;

  // Walk forward to find the closing fence
  const sourceLines: string[] = [];
  let endLine = openLine;
  let currentLineNumber = lineNumber + 1;

  while (currentLineNumber <= doc.lines) {
    const line = doc.line(currentLineNumber);
    const trimmed = line.text.trimStart();

    // Closing fence: same char, at least as many repetitions, nothing else
    const closePattern = new RegExp(`^${fenceChar === "`" ? "`" : "~"}{${fenceLen},}\\s*$`);
    if (closePattern.test(trimmed)) {
      endLine = line;
      break;
    }

    sourceLines.push(line.text);
    endLine = line;
    currentLineNumber += 1;
  }

  // If we reached end-of-doc without a closing fence, treat the block as unclosed — skip
  if (endLine === openLine || (currentLineNumber > doc.lines && endLine.text.trimStart().match(/^(`{3,}|~{3,})\s*$/) === null)) {
    return null;
  }

  return {
    from: openLine.from,
    to: endLine.to,
    startLineNumber: openLine.number,
    endLineNumber: endLine.number,
    source: sourceLines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Mermaid CDN loader
// ---------------------------------------------------------------------------

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
let mermaidApi: typeof import("mermaid")["default"] | null = null;
let renderCounter = 0;

async function loadMermaid() {
  if (mermaidApi) return mermaidApi;
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      // Dynamic import from CDN — cached by the browser after first load
      const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
      const api = mod.default;
      api.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      });
      mermaidApi = api;
      return api;
    })();
  }
  return mermaidPromise;
}

// ---------------------------------------------------------------------------
// Mermaid widget
// ---------------------------------------------------------------------------

class MermaidWidget extends WidgetType {
  constructor(
    private readonly source: string,
  ) {
    super();
  }

  eq(other: MermaidWidget) {
    return this.source === other.source;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-mermaid-wrapper";

    // Show a loading placeholder
    const placeholder = document.createElement("div");
    placeholder.className = "cm-mermaid-placeholder";
    placeholder.textContent = "Rendering diagram…";
    wrapper.appendChild(placeholder);

    // Render asynchronously
    void this.renderDiagram(wrapper, placeholder);

    return wrapper;
  }

  private async renderDiagram(wrapper: HTMLElement, placeholder: HTMLElement) {
    try {
      const api = await loadMermaid();
      const id = `cm-mermaid-${++renderCounter}`;
      const { svg } = await api.render(id, this.source);

      placeholder.remove();

      const diagramContainer = document.createElement("div");
      diagramContainer.className = "cm-mermaid-diagram";
      diagramContainer.innerHTML = svg;

      // Make the SVG responsive
      const svgEl = diagramContainer.querySelector("svg");
      if (svgEl) {
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";
      }

      wrapper.appendChild(diagramContainer);
    } catch (error) {
      placeholder.remove();

      const errorContainer = document.createElement("div");
      errorContainer.className = "cm-mermaid-error";

      const errorLabel = document.createElement("span");
      errorLabel.className = "cm-mermaid-error-label";
      errorLabel.textContent = "Mermaid error";

      const errorMessage = document.createElement("span");
      errorMessage.className = "cm-mermaid-error-message";
      errorMessage.textContent = error instanceof Error ? error.message : "Failed to render diagram";

      errorContainer.appendChild(errorLabel);
      errorContainer.appendChild(errorMessage);
      wrapper.appendChild(errorContainer);
    }
  }

  ignoreEvent() {
    return true;
  }
}

class EmptyMermaidWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-mermaid-hidden-source";
    return span;
  }
}

// ---------------------------------------------------------------------------
// Cursor-line detection (same pattern as livePreviewExtension)
// ---------------------------------------------------------------------------

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
// Decoration builder
// ---------------------------------------------------------------------------

function buildMermaidDecorations(state: EditorState, editable: boolean): DecorationSet {
  const doc = state.doc;
  const cursorLines = cursorLineNumbers(state, editable);
  const builder = new RangeSetBuilder<Decoration>();
  let position = 0;

  while (position <= doc.length) {
    const line = doc.lineAt(position);
    const block = parseMermaidBlock(doc, line.number);

    if (block) {
      // Check if any cursor line falls within this mermaid block
      let cursorInBlock = false;
      for (let ln = block.startLineNumber; ln <= block.endLineNumber; ln++) {
        if (cursorLines.has(ln)) {
          cursorInBlock = true;
          break;
        }
      }

      if (!cursorInBlock && block.source.trim().length > 0) {
        // Render the diagram widget — placed before the first line
        builder.add(
          block.from,
          block.from,
          Decoration.widget({
            block: true,
            side: -1,
            widget: new MermaidWidget(block.source),
          }),
        );

        // Hide all source lines
        for (let ln = block.startLineNumber; ln <= block.endLineNumber; ln++) {
          const sourceLine = doc.line(ln);

          builder.add(
            sourceLine.from,
            sourceLine.from,
            Decoration.line({
              class: "cm-mermaid-hidden-line",
            }),
          );

          builder.add(
            sourceLine.from,
            sourceLine.to,
            Decoration.replace({
              widget: new EmptyMermaidWidget(),
            }),
          );
        }
      }

      position = block.to + 1;
      continue;
    }

    if (line.to >= doc.length) break;
    position = line.to + 1;
  }

  return builder.finish();
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export function buildMermaidExtension({ editable }: { editable: boolean }): Extension {
  const mermaidDecorations = StateField.define<DecorationSet>({
    create(state) {
      return buildMermaidDecorations(state, editable);
    },
    update(decorations, transaction) {
      // Rebuild on doc changes or selection changes (to toggle raw/rendered)
      if (transaction.docChanged || transaction.selection) {
        return buildMermaidDecorations(transaction.state, editable);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return mermaidDecorations;
}

