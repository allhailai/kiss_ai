import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileDiff, ProjectFile } from "../contracts/api";
import { buildLineDiff } from "../domain/diffs";
import { buildAnnotationExtension } from "./annotationExtension";
import { buildEditorDiffExtension } from "./diffExtension";
import { buildMarkdownTableExtension } from "./markdownTableExtension";
import { buildWikiLinkExtension, renderMarkdownTableCellText } from "./wikiLinkExtension";

export function MarkdownEditor({
  baselineValue,
  editable,
  annotation = false,
  files,
  isAiManaged = false,
  savedDiff,
  selectedPath,
  value,
  onChange,
  onNotice,
  onOpenFile,
  onSave,
}: {
  baselineValue: string;
  editable: boolean;
  annotation?: boolean;
  files: ProjectFile[];
  isAiManaged?: boolean;
  savedDiff: FileDiff | null;
  selectedPath: string;
  value: string;
  onChange: (value: string) => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
  onSave?: () => void;
}) {
  // Annotation-mode files are read-only for direct typing but allow annotation-driven onChange
  const allowAnnotationEdits = !editable && annotation;

  // --- Refs for volatile data so extensions can read the latest values ---
  // --- without forcing the extensions array to be recreated.            ---
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const onNoticeRef = useRef(onNotice);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);

  const onOpenFileRef = useRef(onOpenFile);
  useEffect(() => { onOpenFileRef.current = onOpenFile; }, [onOpenFile]);

  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  const savedDiffRef = useRef(savedDiff);
  useEffect(() => { savedDiffRef.current = savedDiff; }, [savedDiff]);

  const [diffInput, setDiffInput] = useState({ baselineValue, value });
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDiffInput({ baselineValue, value }), 120);
    return () => window.clearTimeout(timeoutId);
  }, [baselineValue, value]);
  const unsavedDiff = useMemo(() => buildLineDiff(diffInput.baselineValue, diffInput.value), [diffInput.baselineValue, diffInput.value]);

  const unsavedDiffRef = useRef(unsavedDiff);
  useEffect(() => { unsavedDiffRef.current = unsavedDiff; }, [unsavedDiff]);

  // Stable callback wrappers that read from refs — these never change identity.
  const stableHandleAcceptSuggestion = useCallback((lineFrom: number, lineTo: number) => {
    const lines = valueRef.current.split("\n");
    // Rewrite the marker with [ACCEPTED] so the build scope scanner can detect it
    // and the synthesis agent will execute the suggestion on the next build.
    const updatedLines = lines.map((line, i) => {
      const lineNum = i + 1;
      if (lineNum === lineFrom) {
        return line.replace(/AI_SUGGESTION:\s*/, "AI_SUGGESTION: [ACCEPTED] ");
      }
      return line;
    });
    onChangeRef.current(updatedLines.join("\n"));
    onNoticeRef.current("Suggestion accepted — will be executed on next build.");
    // Auto-save so the [ACCEPTED] flag persists to disk
    window.setTimeout(() => onSaveRef.current?.(), 500);
  }, []);

  const stableHandleDismissSuggestion = useCallback((lineFrom: number, lineTo: number) => {
    const lines = valueRef.current.split("\n");
    // Rewrite the marker with [DISMISSED] instead of deleting — keeps it reversible.
    const updatedLines = lines.map((line, i) => {
      const lineNum = i + 1;
      if (lineNum === lineFrom) {
        return line.replace(/AI_SUGGESTION:\s*/, "AI_SUGGESTION: [DISMISSED] ");
      }
      return line;
    });
    onChangeRef.current(updatedLines.join("\n"));
    onNoticeRef.current("Suggestion dismissed — undo available until next build.");
    // Auto-save so the [DISMISSED] flag persists to disk
    window.setTimeout(() => onSaveRef.current?.(), 500);
  }, []);

  const stableHandleUndoSuggestion = useCallback((lineFrom: number, lineTo: number) => {
    const lines = valueRef.current.split("\n");
    // Strip [ACCEPTED] or [DISMISSED] flag to revert to the original suggestion.
    const updatedLines = lines.map((line, i) => {
      const lineNum = i + 1;
      if (lineNum === lineFrom) {
        return line.replace(/AI_SUGGESTION:\s*\[(ACCEPTED|DISMISSED)\]\s*/, "AI_SUGGESTION: ");
      }
      return line;
    });
    onChangeRef.current(updatedLines.join("\n"));
    onNoticeRef.current("Suggestion restored.");
    window.setTimeout(() => onSaveRef.current?.(), 500);
  }, []);

  const stableHandleEditComment = useCallback((lineFrom: number, lineTo: number, newText: string) => {
    const lines = valueRef.current.split("\n");
    // Produce single or multi-line HTML comment depending on content
    const hasNewlines = newText.includes("\n");
    const commentLines = hasNewlines
      ? [`<!-- COMMENT:`, ...newText.split("\n"), `-->`]
      : [`<!-- COMMENT: ${newText} -->`];
    lines.splice(lineFrom - 1, lineTo - lineFrom + 1, ...commentLines);
    onChangeRef.current(lines.join("\n"));
    // Auto-save after annotation edit (delay lets React process the state update)
    window.setTimeout(() => onSaveRef.current?.(), 500);
  }, []);

  const stableHandleDeleteComment = useCallback((lineFrom: number, lineTo: number) => {
    const lines = valueRef.current.split("\n");
    const filtered = lines.filter((_, i) => {
      const lineNum = i + 1;
      return lineNum < lineFrom || lineNum > lineTo;
    });
    onChangeRef.current(filtered.join("\n"));
    onNoticeRef.current("Comment removed.");
    // Auto-save after annotation delete
    window.setTimeout(() => onSaveRef.current?.(), 500);
  }, []);

  // Stable accessor functions for extension builders — read from refs on each call.
  const getFiles = useCallback(() => filesRef.current, []);
  const getUnsavedDiff = useCallback(() => unsavedDiffRef.current, []);
  const getSavedDiff = useCallback(() => savedDiffRef.current, []);
  const getOnOpenFile = useCallback(() => onOpenFileRef.current, []);
  const stableOnNotice = useCallback((message: string) => onNoticeRef.current(message), []);

  // Extensions are rebuilt only when structural editor config changes (selectedPath,
  // editable, isAiManaged, annotation mode). Volatile data (files, diffs, value,
  // callbacks) is accessed via refs so extensions stay stable during builds/polling.
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
      buildMarkdownTableExtension({ editable, renderCellText: renderMarkdownTableCellText, onNotice: stableOnNotice }),
      buildEditorDiffExtension({ getUnsavedDiff, getSavedDiff }),
      buildWikiLinkExtension({ getFiles, selectedPath, getOnOpenFile }),
      ...buildAnnotationExtension({
        editable: editable || allowAnnotationEdits,
        isAiManaged,
        onEditComment: stableHandleEditComment,
        onDeleteComment: stableHandleDeleteComment,
        onAcceptSuggestion: stableHandleAcceptSuggestion,
        onDismissSuggestion: stableHandleDismissSuggestion,
        onUndoSuggestion: stableHandleUndoSuggestion,
      }),
    ],
    [allowAnnotationEdits, editable, getFiles, getOnOpenFile, getSavedDiff, getUnsavedDiff, isAiManaged, selectedPath, stableHandleAcceptSuggestion, stableHandleDeleteComment, stableHandleDismissSuggestion, stableHandleEditComment, stableHandleUndoSuggestion, stableOnNotice],
  );

  return (
    <div className="markdown-editor-shell">
      <CodeMirror
        basicSetup={{
          foldGutter: false,
          lineNumbers: true,
          highlightActiveLine: editable,
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

