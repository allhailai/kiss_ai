import { useRef, useState } from "react";
import type { FileContent, FileDiff, ProjectFile } from "../../contracts/api";
import { countDeletedLines, countDiffRangeLines } from "../../domain/diffs";
import { humanizeFilePath } from "../../domain/files";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { MarkdownEditor } from "../../editor/MarkdownEditor";

export function FileWorkspace({
  title,
  explainer,
  selected,
  selectedDiff,
  draft,
  aiFileAssistDisabled = false,
  hasUnsavedChanges,
  projectFiles,
  onDraft,
  onAiFileAssist,
  onNotice,
  onOpenRequirementsSync,
  onOpenFile,
  onUploadFiles,
  onRevert,
  onSave,
}: {
  title: string;
  explainer?: string;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  aiFileAssistDisabled?: boolean;
  hasUnsavedChanges: boolean;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onAiFileAssist?: () => void;
  onNotice: (message: string) => void;
  onOpenRequirementsSync?: () => void;
  onOpenFile: (path: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onRevert: () => void;
  onSave: () => void;
}) {
  return (
    <div className={onUploadFiles ? "document-workspace has-upload-dropzone" : "document-workspace"}>
      <header className="document-header">
        <div>
          <span className="eyebrow">{title}</span>
          {explainer ? <p>{explainer}</p> : null}
        </div>
        {onOpenRequirementsSync ? (
          <button className="editor-secondary-button" onClick={onOpenRequirementsSync} type="button">
            Sync Requirements
          </button>
        ) : null}
      </header>
      {onUploadFiles ? <HumanInputDropzone onUploadFiles={onUploadFiles} onNotice={onNotice} /> : null}
      <EditorPane
        selected={selected}
        selectedDiff={selectedDiff}
        draft={draft}
        aiFileAssistDisabled={aiFileAssistDisabled}
        hasUnsavedChanges={hasUnsavedChanges}
        projectFiles={projectFiles}
        onDraft={onDraft}
        onAiFileAssist={onAiFileAssist}
        onNotice={onNotice}
        onOpenFile={onOpenFile}
        onRevert={onRevert}
        onSave={onSave}
      />
    </div>
  );
}

function HumanInputDropzone({
  onUploadFiles,
  onNotice,
}: {
  onUploadFiles: (files: File[]) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;

    setUploading(true);
    try {
      await onUploadFiles(files);
    } catch {
      // The parent upload handler owns the user-facing error notice.
    } finally {
      setUploading(false);
      dragDepthRef.current = 0;
      setDragActive(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section
      className={dragActive ? "human-input-dropzone active" : "human-input-dropzone"}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      <div>
        <strong>{uploading ? "Uploading files..." : "Drop files into Human Inputs"}</strong>
        <p>Files are saved directly to {projectPathPrefixes.humanInput} for this project. Any file type is accepted.</p>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        type="button"
        disabled={uploading}
      >
        Choose Files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(event) => {
          if (!event.target.files) {
            onNotice("No files selected.");
            return;
          }
          void uploadFiles(event.target.files);
        }}
      />
    </section>
  );
}

function EditorPane({
  selected,
  selectedDiff,
  draft,
  aiFileAssistDisabled,
  hasUnsavedChanges,
  projectFiles,
  onDraft,
  onAiFileAssist,
  onNotice,
  onOpenFile,
  onRevert,
  onSave,
}: {
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  aiFileAssistDisabled: boolean;
  hasUnsavedChanges: boolean;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onAiFileAssist?: () => void;
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
  const savedDiffLabel =
    hasSavedDiff
      ? `${(savedChangedLineCount + savedDeletedLineCount).toLocaleString()} saved Git diff ${
          savedChangedLineCount + savedDeletedLineCount === 1 ? "line" : "lines"
        }`
      : "No saved Git diff";
  const showAiFileAssist = Boolean(onAiFileAssist && selected.editable && (hasUnsavedChanges || hasSavedDiff));

  return (
    <section className={selected.annotation ? "editor-pane annotation-mode" : "editor-pane"}>
      <div className="editor-toolbar">
        <div>
          <h2 className="editor-title" title={selected.path}>
            <span className="eyebrow editor-title-kind">{selected.kind}</span>
            <span>{humanizeFilePath(selected.path)}</span>
          </h2>
        </div>
        <div className="editor-toolbar-actions">
          {showAiFileAssist ? (
            <button className="ai-assist-trigger" disabled={aiFileAssistDisabled} onClick={onAiFileAssist} type="button">
              AI File Assist
            </button>
          ) : null}
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

      <div className="editor-meta">
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
