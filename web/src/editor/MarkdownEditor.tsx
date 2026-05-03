import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import type { FileDiff, ProjectFile } from "../api";
import { buildLineDiff } from "../domain/diffs";
import { buildEditorDiffExtension } from "./diffExtension";
import { buildMarkdownTableExtension } from "./markdownTableExtension";
import { buildWikiLinkExtension, renderMarkdownTableCellText } from "./wikiLinkExtension";

export function MarkdownEditor({
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
