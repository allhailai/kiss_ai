import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCallback, useEffect, useMemo, useState } from "react";
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
}) {
  // Annotation-mode files are read-only for direct typing but allow annotation-driven onChange
  const allowAnnotationEdits = !editable && annotation;

  const [diffInput, setDiffInput] = useState({ baselineValue, value });
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDiffInput({ baselineValue, value }), 120);
    return () => window.clearTimeout(timeoutId);
  }, [baselineValue, value]);
  const unsavedDiff = useMemo(() => buildLineDiff(diffInput.baselineValue, diffInput.value), [diffInput.baselineValue, diffInput.value]);
  const handleAcceptSuggestion = useCallback((lineFrom: number, lineTo: number) => {
    const lines = value.split("\n");
    const filtered = lines.filter((_, i) => {
      const lineNum = i + 1;
      return lineNum < lineFrom || lineNum > lineTo;
    });
    onChange(filtered.join("\n"));
    onNotice("Suggestion accepted and removed.");
  }, [value, onChange, onNotice]);

  const handleDismissSuggestion = useCallback((lineFrom: number, lineTo: number) => {
    const lines = value.split("\n");
    const filtered = lines.filter((_, i) => {
      const lineNum = i + 1;
      return lineNum < lineFrom || lineNum > lineTo;
    });
    onChange(filtered.join("\n"));
    onNotice("Suggestion dismissed.");
  }, [value, onChange, onNotice]);

  const handleEditComment = useCallback((lineFrom: number, lineTo: number, newText: string) => {
    const lines = value.split("\n");
    // Produce single or multi-line HTML comment depending on content
    const hasNewlines = newText.includes("\n");
    const commentLines = hasNewlines
      ? [`<!-- COMMENT:`, ...newText.split("\n"), `-->`]
      : [`<!-- COMMENT: ${newText} -->`];
    lines.splice(lineFrom - 1, lineTo - lineFrom + 1, ...commentLines);
    onChange(lines.join("\n"));
  }, [value, onChange]);

  const handleDeleteComment = useCallback((lineFrom: number, lineTo: number) => {
    const lines = value.split("\n");
    const filtered = lines.filter((_, i) => {
      const lineNum = i + 1;
      return lineNum < lineFrom || lineNum > lineTo;
    });
    onChange(filtered.join("\n"));
    onNotice("Comment removed.");
  }, [value, onChange, onNotice]);

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
      ...buildAnnotationExtension({
        editable: editable || allowAnnotationEdits,
        isAiManaged,
        onEditComment: handleEditComment,
        onDeleteComment: handleDeleteComment,
        onAcceptSuggestion: handleAcceptSuggestion,
        onDismissSuggestion: handleDismissSuggestion,
      }),
    ],
    [allowAnnotationEdits, editable, files, handleAcceptSuggestion, handleDeleteComment, handleDismissSuggestion, handleEditComment, isAiManaged, onNotice, onOpenFile, savedDiff, selectedPath, unsavedDiff],
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

