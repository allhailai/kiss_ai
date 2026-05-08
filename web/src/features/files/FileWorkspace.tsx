import { useRef, useState } from "react";
import type { FileContent, FileDiff, ProjectFile, RebuildModel } from "../../contracts/api";
import { countDeletedLines, countDiffRangeLines } from "../../domain/diffs";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { AiAssistPanel } from "./AiAssistPanel";

export function FileWorkspace({
  projectSlug,
  models,
  selectedModelId,
  title,
  explainer,
  selected,
  selectedDiff,
  draft,
  projectFiles,
  onDraft,
  onModelChange,
  onNotice,
  onOpenFile,
  onUploadFiles,
  onRevert,
  onSave,
}: {
  projectSlug: string;
  models: RebuildModel[];
  selectedModelId: string;
  title: string;
  explainer?: string;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onRevert: () => void;
  onSave: () => void;
}) {
  return (
    <div className={onUploadFiles ? "document-workspace has-upload-dropzone" : "document-workspace"}>
      <header className="document-header">
        <span className="eyebrow">{title}</span>
        {explainer ? <p>{explainer}</p> : null}
      </header>
      {onUploadFiles ? <HumanInputDropzone onUploadFiles={onUploadFiles} onNotice={onNotice} /> : null}
      <EditorPane
        projectSlug={projectSlug}
        models={models}
        selectedModelId={selectedModelId}
        selected={selected}
        selectedDiff={selectedDiff}
        draft={draft}
        projectFiles={projectFiles}
        onDraft={onDraft}
        onModelChange={onModelChange}
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
        <p>Files are saved directly to inputs_human/ for this project. Any file type is accepted.</p>
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
  projectSlug,
  models,
  selectedModelId,
  selected,
  selectedDiff,
  draft,
  projectFiles,
  onDraft,
  onModelChange,
  onNotice,
  onOpenFile,
  onRevert,
  onSave,
}: {
  projectSlug: string;
  models: RebuildModel[];
  selectedModelId: string;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onModelChange: (modelId: string) => void;
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
  const hasUnsavedChanges = draft !== selected.content;
  const savedDiffLabel =
    hasSavedDiff
      ? `${(savedChangedLineCount + savedDeletedLineCount).toLocaleString()} saved Git diff ${
          savedChangedLineCount + savedDeletedLineCount === 1 ? "line" : "lines"
        }`
      : "No saved Git diff";

  return (
    <section className={selected.annotation ? "editor-pane annotation-mode" : "editor-pane"}>
      <div className="editor-toolbar">
        <div>
          <span className="eyebrow">{selected.kind}</span>
          <h2>{selected.path}</h2>
        </div>
        <div className="editor-toolbar-actions">
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

      {selected.annotation ? (
        <div className="annotation-callout">
          This AI-managed content is read-only here. Use the rebuild workflow to update annotation state.
        </div>
      ) : null}

      <div className="editor-meta">
        <AiAssistPanel
          projectSlug={projectSlug}
          models={models}
          selectedModelId={selectedModelId}
          selected={selected}
          onModelChange={onModelChange}
          onApplyDraft={onDraft}
          onNotice={onNotice}
        />
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
