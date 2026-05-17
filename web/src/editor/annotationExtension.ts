import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  GutterMarker,
  gutter,
} from "@codemirror/view";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type AnnotationKind = "feedback" | "ai_suggestion";

export type Annotation = {
  kind: AnnotationKind;
  text: string;
  lineFrom: number;
  lineTo: number;
};

// ─────────────────────────────────────────────────────────
// Regex patterns for HTML comment annotations
// Matches both COMMENT: (new) and FEEDBACK: (legacy) patterns
// ─────────────────────────────────────────────────────────

// Single-line: <!-- COMMENT: text --> or <!-- FEEDBACK: text -->
const COMMENT_SINGLE_RE = /^(\s*)<!--\s*(?:COMMENT|FEEDBACK):\s*(.*?)\s*-->\s*$/;
// Multi-line start: <!-- COMMENT: or <!-- FEEDBACK:
const COMMENT_START_RE = /^(\s*)<!--\s*(?:COMMENT|FEEDBACK):\s*(.*)/;
// Single-line: <!-- AI_SUGGESTION: some text -->
const AI_SUGGESTION_SINGLE_RE = /^(\s*)<!--\s*AI_SUGGESTION:\s*(.*?)\s*-->\s*$/;
// Multi-line start: <!-- AI_SUGGESTION:
const AI_SUGGESTION_START_RE = /^(\s*)<!--\s*AI_SUGGESTION:\s*(.*)/;
// Multi-line end
const MULTILINE_END_RE = /^(.*?)-->\s*$/;

// ─────────────────────────────────────────────────────────
// Parsing — find all annotations in the document
// ─────────────────────────────────────────────────────────

function parseAnnotations(doc: { lines: number; line(n: number): { text: string } }): Annotation[] {
  const annotations: Annotation[] = [];
  let lineNumber = 1;

  while (lineNumber <= doc.lines) {
    const lineText = doc.line(lineNumber).text;

    // Try single-line comment (COMMENT: or FEEDBACK:)
    const commentSingle = COMMENT_SINGLE_RE.exec(lineText);
    if (commentSingle) {
      annotations.push({ kind: "feedback", text: commentSingle[2], lineFrom: lineNumber, lineTo: lineNumber });
      lineNumber += 1;
      continue;
    }

    // Try single-line suggestion
    const suggestionSingle = AI_SUGGESTION_SINGLE_RE.exec(lineText);
    if (suggestionSingle) {
      annotations.push({ kind: "ai_suggestion", text: suggestionSingle[2], lineFrom: lineNumber, lineTo: lineNumber });
      lineNumber += 1;
      continue;
    }

    // Try multi-line comment
    const commentStart = COMMENT_START_RE.exec(lineText);
    if (commentStart) {
      const result = consumeMultiLine(doc, lineNumber, commentStart[2], "feedback");
      if (result) {
        annotations.push(result);
        lineNumber = result.lineTo + 1;
        continue;
      }
    }

    // Try multi-line suggestion
    const suggestionStart = AI_SUGGESTION_START_RE.exec(lineText);
    if (suggestionStart) {
      const result = consumeMultiLine(doc, lineNumber, suggestionStart[2], "ai_suggestion");
      if (result) {
        annotations.push(result);
        lineNumber = result.lineTo + 1;
        continue;
      }
    }

    lineNumber += 1;
  }

  return annotations;
}

function consumeMultiLine(
  doc: { lines: number; line(n: number): { text: string } },
  startLine: number,
  firstLineContent: string,
  kind: AnnotationKind,
): Annotation | null {
  const lines = [firstLineContent];
  for (let i = startLine + 1; i <= Math.min(startLine + 20, doc.lines); i++) {
    const text = doc.line(i).text;
    const endMatch = MULTILINE_END_RE.exec(text);
    if (endMatch) {
      lines.push(endMatch[1]);
      return {
        kind,
        text: lines.join("\n").trim(),
        lineFrom: startLine,
        lineTo: i,
      };
    }
    lines.push(text);
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Widgets — rendered in place of the raw HTML comment
// ─────────────────────────────────────────────────────────

class CommentWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly lineFrom: number,
    private readonly lineTo: number,
    private readonly onEdit?: (lineFrom: number, lineTo: number, newText: string) => void,
    private readonly onDelete?: (lineFrom: number, lineTo: number) => void,
  ) {
    super();
  }

  eq(other: CommentWidget) {
    return this.text === other.text && this.lineFrom === other.lineFrom;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-annotation cm-annotation-comment";
    wrapper.setAttribute("aria-label", "Comment");

    const content = document.createElement("span");
    content.className = "cm-annotation-text";
    content.style.whiteSpace = "pre-wrap";
    content.textContent = this.text || "Add a comment…";
    if (!this.text) content.classList.add("cm-annotation-text-placeholder");

    const actions = document.createElement("span");
    actions.className = "cm-annotation-hover-actions";

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "cm-annotation-hover-action";
    editBtn.type = "button";
    editBtn.title = "Edit comment";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.enterEditMode(wrapper, content, actions);
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "cm-annotation-hover-action cm-annotation-hover-action-delete";
    deleteBtn.type = "button";
    deleteBtn.title = "Delete comment";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onDelete?.(this.lineFrom, this.lineTo);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(content);
    wrapper.appendChild(actions);

    // Click on the comment to enter edit mode directly
    wrapper.addEventListener("click", (event) => {
      // Don't trigger if clicking action buttons or already editing
      if (wrapper.classList.contains("cm-annotation-editing")) return;
      if ((event.target as HTMLElement).closest(".cm-annotation-hover-actions")) return;
      event.stopPropagation();
      this.enterEditMode(wrapper, content, actions);
    });

    return wrapper;
  }

  private enterEditMode(wrapper: HTMLElement, contentEl: HTMLElement, actionsEl: HTMLElement) {
    contentEl.style.display = "none";
    actionsEl.style.display = "none";
    wrapper.classList.add("cm-annotation-editing");

    const textarea = document.createElement("textarea");
    textarea.className = "cm-annotation-edit-input";
    textarea.value = this.text;
    textarea.placeholder = "Type your comment…";
    textarea.rows = Math.max(2, this.text.split("\n").length);

    // Auto-resize as user types
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    };

    const cleanup = () => {
      contentEl.style.display = "";
      actionsEl.style.display = "";
      wrapper.classList.remove("cm-annotation-editing");
      textarea.remove();
      editActions.remove();
    };

    const commitEdit = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== this.text) {
        this.onEdit?.(this.lineFrom, this.lineTo, newText);
      } else {
        cleanup();
      }
    };

    textarea.addEventListener("input", autoSize);

    textarea.addEventListener("keydown", (e) => {
      // Prevent CM6 from intercepting keystrokes meant for the textarea
      e.stopPropagation();

      // Shift+Enter inserts a newline
      if (e.key === "Enter" && e.shiftKey) {
        // Allow default textarea newline behavior
        return;
      }
      // Enter (no modifier) saves and exits
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
        return;
      }
      // Escape cancels
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
      }
    });

    // Save / Cancel buttons
    const editActions = document.createElement("span");
    editActions.className = "cm-annotation-edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "cm-annotation-hover-action";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.title = "Save (Ctrl+Enter)";
    saveBtn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur
      commitEdit();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cm-annotation-hover-action";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.title = "Cancel (Escape)";
    cancelBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      cleanup();
    });

    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);

    wrapper.insertBefore(textarea, actionsEl);
    wrapper.insertBefore(editActions, actionsEl);
    textarea.focus();
    textarea.select();
    requestAnimationFrame(autoSize);
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown";
  }
}

class AiSuggestionWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly lineFrom: number,
    private readonly onAccept?: (lineFrom: number, lineTo: number) => void,
    private readonly onDismiss?: (lineFrom: number, lineTo: number) => void,
    private readonly lineTo?: number,
  ) {
    super();
  }

  eq(other: AiSuggestionWidget) {
    return this.text === other.text && this.lineFrom === other.lineFrom;
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-annotation cm-annotation-suggestion";
    wrapper.setAttribute("aria-label", "AI suggestion");

    const label = document.createElement("span");
    label.className = "cm-annotation-label";
    label.textContent = "Suggestion";

    const content = document.createElement("span");
    content.className = "cm-annotation-text";
    content.textContent = this.text;

    const actions = document.createElement("span");
    actions.className = "cm-annotation-actions";

    const acceptButton = document.createElement("button");
    acceptButton.className = "cm-annotation-action cm-annotation-accept";
    acceptButton.textContent = "Accept";
    acceptButton.type = "button";
    acceptButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onAccept?.(this.lineFrom, this.lineTo ?? this.lineFrom);
    });

    const dismissButton = document.createElement("button");
    dismissButton.className = "cm-annotation-action cm-annotation-dismiss";
    dismissButton.textContent = "Dismiss";
    dismissButton.type = "button";
    dismissButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.onDismiss?.(this.lineFrom, this.lineTo ?? this.lineFrom);
    });

    actions.appendChild(acceptButton);
    actions.appendChild(dismissButton);
    wrapper.appendChild(label);
    wrapper.appendChild(content);
    wrapper.appendChild(actions);
    return wrapper;
  }

  ignoreEvent(event: Event) {
    return event.type === "mousedown";
  }
}

// ─────────────────────────────────────────────────────────
// Gutter marker — the [+] button for adding comments
// ─────────────────────────────────────────────────────────

class CommentGutterMarker extends GutterMarker {
  toDOM() {
    const button = document.createElement("button");
    button.className = "cm-feedback-gutter-button";
    button.textContent = "+";
    button.title = "Add comment";
    button.type = "button";
    return button;
  }
}

// Persistent indicator shown in the gutter where a comment already exists
class CommentIndicatorGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-feedback-gutter-indicator";
    el.title = "Comment";
    el.textContent = "+";
    el.setAttribute("aria-label", "Has comment");
    return el;
  }
}

const commentGutterMarker = new CommentGutterMarker();
const commentIndicatorGutterMarker = new CommentIndicatorGutterMarker();

// ─────────────────────────────────────────────────────────
// State effect for inserting feedback
// ─────────────────────────────────────────────────────────

export const insertFeedbackEffect = StateEffect.define<{ line: number }>();

// ─────────────────────────────────────────────────────────
// Main extension builder
// ─────────────────────────────────────────────────────────

export function buildAnnotationExtension({
  editable,
  isAiManaged,
  onEditComment,
  onDeleteComment,
  onAcceptSuggestion,
  onDismissSuggestion,
}: {
  editable: boolean;
  isAiManaged: boolean;
  onEditComment?: (lineFrom: number, lineTo: number, newText: string) => void;
  onDeleteComment?: (lineFrom: number, lineTo: number) => void;
  onAcceptSuggestion?: (lineFrom: number, lineTo: number) => void;
  onDismissSuggestion?: (lineFrom: number, lineTo: number) => void;
}): Extension[] {
  const extensions: Extension[] = [];

  // StateField-based decoration — required because Decoration.replace that spans
  // line breaks is forbidden from ViewPlugins but allowed from StateFields.
  function buildAnnotationDecorations(doc: { lines: number; line(n: number): { text: string; from: number; to: number } }): DecorationSet {
    const entries: Array<{ from: number; to: number; decoration: Decoration }> = [];
    const annotations = parseAnnotations(doc);

    for (const annotation of annotations) {
      const from = doc.line(annotation.lineFrom).from;
      const to = doc.line(annotation.lineTo).to;

      if (annotation.kind === "feedback") {
        entries.push({
          from,
          to,
          decoration: Decoration.replace({
            widget: new CommentWidget(
              annotation.text,
              annotation.lineFrom,
              annotation.lineTo,
              onEditComment,
              onDeleteComment,
            ),
          }),
        });
      } else if (annotation.kind === "ai_suggestion") {
        entries.push({
          from,
          to,
          decoration: Decoration.replace({
            widget: new AiSuggestionWidget(
              annotation.text,
              annotation.lineFrom,
              onAcceptSuggestion,
              onDismissSuggestion,
              annotation.lineTo,
            ),
          }),
        });
      }
    }

    return Decoration.set(
      entries.map((e) => e.decoration.range(e.from, e.to)),
      true,
    );
  }

  const annotationField = StateField.define<DecorationSet>({
    create(state) {
      return buildAnnotationDecorations(state.doc);
    },
    update(decorations, transaction) {
      if (transaction.docChanged) {
        return buildAnnotationDecorations(transaction.state.doc);
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  extensions.push(annotationField);

  // Comment gutter — [+] button to add comments (on AI-managed files with annotation enabled)
  if (editable && isAiManaged) {
    const commentGutter = gutter({
      class: "cm-feedback-gutter",
      lineMarker(view, line) {
        const lineNumber = view.state.doc.lineAt(line.from).number;
        const annotations = parseAnnotations(view.state.doc);
        const isAnnotationLine = annotations.some(
          (a) => lineNumber >= a.lineFrom && lineNumber <= a.lineTo,
        );
        if (isAnnotationLine) return commentIndicatorGutterMarker;
        const lineText = view.state.doc.lineAt(line.from).text;
        if (!lineText.trim()) return null;
        return commentGutterMarker;
      },
      domEventHandlers: {
        click(view, line) {
          const lineNumber = view.state.doc.lineAt(line.from).number;
          const annotations = parseAnnotations(view.state.doc);
          const existingAnnotation = annotations.find(
            (a) => a.kind === "feedback" && lineNumber >= a.lineFrom && lineNumber <= a.lineTo,
          );

          if (existingAnnotation) {
            // Find the rendered annotation widget and click it to enter edit mode
            const annotationFrom = view.state.doc.line(existingAnnotation.lineFrom).from;
            const coords = view.coordsAtPos(annotationFrom);
            if (coords) {
              const widgetEl = view.dom.querySelector(
                `.cm-annotation-comment`,
              ) as HTMLElement | null;
              // Walk all comment widgets to find the one at this line
              const widgets = view.dom.querySelectorAll(".cm-annotation-comment");
              for (const w of widgets) {
                const wRect = w.getBoundingClientRect();
                if (Math.abs(wRect.top - coords.top) < 30) {
                  (w as HTMLElement).click();
                  return true;
                }
              }
            }
            return true;
          }

          // New comment — insert and immediately enter edit mode
          const lineEnd = view.state.doc.line(lineNumber).to;
          const commentTemplate = `\n<!-- COMMENT:  -->`;
          view.dispatch({
            changes: { from: lineEnd, insert: commentTemplate },
          });
          // After the doc update, find the newly created widget and click it
          window.setTimeout(() => {
            const newAnnotations = parseAnnotations(view.state.doc);
            const newAnnotation = newAnnotations.find(
              (a) => a.kind === "feedback" && a.lineFrom === lineNumber + 1,
            );
            if (newAnnotation) {
              const newFrom = view.state.doc.line(newAnnotation.lineFrom).from;
              const newCoords = view.coordsAtPos(newFrom);
              if (newCoords) {
                const widgets = view.dom.querySelectorAll(".cm-annotation-comment");
                for (const w of widgets) {
                  const wRect = w.getBoundingClientRect();
                  if (Math.abs(wRect.top - newCoords.top) < 30) {
                    (w as HTMLElement).click();
                    break;
                  }
                }
              }
            }
          }, 80);
          return true;
        },
      },
    });

    extensions.push(commentGutter);
  }

  return extensions;
}

