import type { FileContent, FileDiff, ProjectFile } from "../../contracts/api";
import { downloadProjectFile } from "../../data/downloadFile";
import { countDeletedLines, countDiffRangeLines } from "../../domain/diffs";
import { humanizeFilePath } from "../../domain/files";
import { isAiManagedPath } from "../../domain/projectPaths";
import { MarkdownEditor } from "../../editor/MarkdownEditor";

export function FileWorkspace({
  title,

  selected,
  selectedDiff,
  draft,
  aiFileAssistDisabled = false,
  hasUnsavedChanges,
  projectFiles,
  onDraft,
  onAiFileAssist,
  onNotice,

  onOpenFile,
  onRevert,
  onSave,
  projectSlug,
  canUndoAgentEdit = false,
  onUndoAgentEdit,
}: {
  title?: string;

  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  aiFileAssistDisabled?: boolean;
  hasUnsavedChanges: boolean;
  projectFiles: ProjectFile[];
  onDraft: (value: string) => void;
  onAiFileAssist?: () => void;
  onNotice: (message: string) => void;

  onOpenFile: (path: string) => void;
  onRevert: () => void;
  onSave: () => void;
  projectSlug: string;
  canUndoAgentEdit?: boolean;
  onUndoAgentEdit?: () => void;
}) {
  return (
    <div className="document-workspace">
      {title ? (
        <header className="document-header">
          <div>
            <span className="eyebrow">{title}</span>
          </div>
        </header>
      ) : null}
      <EditorPane
        selected={selected}
        selectedDiff={selectedDiff}
        draft={draft}
        aiFileAssistDisabled={aiFileAssistDisabled}
        hasUnsavedChanges={hasUnsavedChanges}
        projectFiles={projectFiles}
        projectSlug={projectSlug}
        onDraft={onDraft}
        onAiFileAssist={onAiFileAssist}
        onNotice={onNotice}
        onOpenFile={onOpenFile}
        onRevert={onRevert}
        onSave={onSave}
        canUndoAgentEdit={canUndoAgentEdit}
        onUndoAgentEdit={onUndoAgentEdit}
      />
    </div>
  );
}

function EditorPane({
  selected,
  selectedDiff,
  draft,
  aiFileAssistDisabled,
  hasUnsavedChanges,
  projectFiles,
  projectSlug,
  onDraft,
  onAiFileAssist,
  onNotice,
  onOpenFile,
  onRevert,
  onSave,
  canUndoAgentEdit,
  onUndoAgentEdit,
}: {
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  aiFileAssistDisabled: boolean;
  hasUnsavedChanges: boolean;
  projectFiles: ProjectFile[];
  projectSlug: string;
  onDraft: (value: string) => void;
  onAiFileAssist?: () => void;
  onNotice: (message: string) => void;
  onOpenFile: (path: string) => void;
  onRevert: () => void;
  onSave: () => void;
  canUndoAgentEdit: boolean;
  onUndoAgentEdit?: () => void;
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
  const canWrite = selected.editable || selected.annotation;
  const showAiFileAssist = Boolean(onAiFileAssist && canWrite && (hasUnsavedChanges || hasSavedDiff));

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
          <button
            className="editor-secondary-button"
            onClick={() => downloadProjectFile(projectSlug, selected.path)}
            title="Download this file"
            type="button"
          >
            ↓ Download
          </button>
          {canUndoAgentEdit ? (
            <button className="editor-secondary-button" onClick={onUndoAgentEdit} type="button">
              Undo Agent Edit
            </button>
          ) : null}
          {hasSavedDiff ? (
            <button className="editor-secondary-button" disabled={!canWrite} onClick={onRevert} type="button">
              Revert to Committed State
            </button>
          ) : null}
          {canWrite && hasUnsavedChanges ? (
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
        annotation={selected.annotation}
        baselineValue={selected.content}
        editable={selected.editable}
        files={projectFiles}
        isAiManaged={isAiManagedPath(selected.path)}
        onChange={onDraft}
        onNotice={onNotice}
        onOpenFile={onOpenFile}
        onSave={onSave}
        projectSlug={projectSlug}
        savedDiff={selectedDiff}
        selectedPath={selected.path}
        value={draft}
      />
    </section>
  );
}
