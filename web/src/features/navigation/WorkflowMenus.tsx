import { useEffect, useMemo, useRef, useState } from "react";
import {
  aiSuggestionsNavLeaf,
  chatNavLeaf,
  openQuestionsNavLeaf,
  requirementNavLeaves,
  sectionForView,
  simplifiedNavSections,
  topicsNavLeaf,
  type SimplifiedNavSectionId,
} from "../../navigation/navigationModel";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { type View } from "../../navigation/views";
import type { ProjectFile } from "../../contracts/api";
import { FileTreeNav } from "./FileTreeNav";

const defaultExpandedSections = new Set<SimplifiedNavSectionId>(
  simplifiedNavSections.filter((section) => section.id !== "source-data").map((section) => section.id),
);

export function SimplifiedNavigator({
  currentView,
  humanInputEmptyDirectories,
  openQuestionsCount,
  blockingQuestionsCount,
  pendingSuggestionsCount,
  seedTopicsCount,
  projectFiles,
  loading,
  selectedPath,
  onCreateFolder,
  onCreateTextFile,
  onDeleteFolder,
  onDeleteHumanInputFile,
  onMoveFile,
  onUploadFiles,
  onOpenView,
  onOpenFile,
}: {
  currentView: View;
  humanInputEmptyDirectories?: string[];
  openQuestionsCount?: number;
  blockingQuestionsCount?: number;
  pendingSuggestionsCount?: number;
  seedTopicsCount?: number;
  projectFiles: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  onCreateFolder?: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDeleteHumanInputFile?: (path: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onOpenView: (view: View, path?: string | null) => void;
  onOpenFile: (path: string) => void;
}) {
  const activeSection = sectionForView(currentView);
  const [expandedSections, setExpandedSections] = useState<Set<SimplifiedNavSectionId>>(
    () => new Set(defaultExpandedSections),
  );
  const humanInputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.humanInput)), [projectFiles]);
  const sourceFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.sources)), [projectFiles]);
  const outputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.output)), [projectFiles]);

  useEffect(() => {
    setExpandedSections((current) => {
      if (current.has(activeSection)) return current;

      const next = new Set(current);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  function toggleSection(sectionId: SimplifiedNavSectionId) {
    setExpandedSections((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }

  return (
    <nav className="simple-nav" aria-label="Project workflow">
      {simplifiedNavSections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const isActiveSection = activeSection === section.id;
        const isChatSection = section.id === "chat";

        return (
          <section className={isActiveSection ? "nav-section active" : "nav-section"} key={section.id}>
            <button
              className="nav-section-trigger"
              onClick={() =>
                isChatSection
                    ? onOpenView(chatNavLeaf.view)
                    : toggleSection(section.id)
              }
              type="button"
              aria-expanded={isChatSection ? undefined : isExpanded}
            >
              <span className="nav-section-label">
                <strong>{section.label}</strong>
              </span>
              {isChatSection ? null : <b aria-hidden="true">{isExpanded ? "-" : "+"}</b>}
            </button>

            {!isChatSection && isExpanded ? <div className="nav-section-body">{renderSectionBody(section.id)}</div> : null}
          </section>
        );
      })}
    </nav>
  );

  function renderSectionBody(sectionId: SimplifiedNavSectionId) {
    if (sectionId === "define") {
      return (
        <>
          <div className="simple-nav-children">
            {requirementNavLeaves.map((leaf) => (
              <button
                className={selectedPath === leaf.path ? "simple-nav-item simple-nav-child active" : "simple-nav-item simple-nav-child"}
                key={leaf.id}
                onClick={() => onOpenView(leaf.view, leaf.path)}
                type="button"
              >
                <DefineNavLabel label={leaf.label} />
              </button>
            ))}
            <button
              className={currentView === "questions" ? "simple-nav-item simple-nav-child nav-questions-btn active" : "simple-nav-item simple-nav-child nav-questions-btn"}
              onClick={() => onOpenView(openQuestionsNavLeaf.view)}
              type="button"
            >
              <DefineNavLabel label={openQuestionsNavLeaf.label} />
              {(openQuestionsCount ?? 0) > 0 ? (
                <b className={(blockingQuestionsCount ?? 0) > 0 ? "nav-badge nav-badge-blocking" : "nav-badge nav-badge-open"}>
                  {openQuestionsCount}
                </b>
              ) : null}
            </button>
            <button
              className={currentView === "suggestions" ? "simple-nav-item simple-nav-child nav-questions-btn active" : "simple-nav-item simple-nav-child nav-questions-btn"}
              onClick={() => onOpenView(aiSuggestionsNavLeaf.view)}
              type="button"
            >
              <DefineNavLabel label={aiSuggestionsNavLeaf.label} />
              {(pendingSuggestionsCount ?? 0) > 0 ? (
                <b className="nav-badge nav-badge-open">
                  {pendingSuggestionsCount}
                </b>
              ) : null}
            </button>
            <button
              className={currentView === "topics" ? "simple-nav-item simple-nav-child nav-questions-btn active" : "simple-nav-item simple-nav-child nav-questions-btn"}
              onClick={() => onOpenView(topicsNavLeaf.view)}
              type="button"
            >
              <DefineNavLabel label={topicsNavLeaf.label} />
              {(seedTopicsCount ?? 0) > 0 ? (
                <b className="nav-badge nav-badge-open">
                  {seedTopicsCount}
                </b>
              ) : null}
            </button>
          </div>
        </>
      );
    }

    if (sectionId === "source-data") {
      return (
        <>
          <button
            className={
              currentView === "inputs" && !selectedPath
                ? "simple-nav-item simple-nav-subheader active"
                : "simple-nav-item simple-nav-subheader"
            }
            onClick={() => onOpenView("inputs")}
            type="button"
          >
            <span>Human sources</span>
          </button>

          {onCreateFolder ? (
            <HumanInputActions onCreateFolder={onCreateFolder} onCreateTextFile={onCreateTextFile} />
          ) : null}

          <FileTreeBlock
            emptyLabel="No human-acquired files yet."
            emptyDirectories={humanInputEmptyDirectories}
            files={humanInputFiles}
            loading={loading && currentView === "inputs"}
            onCreateTextFile={onCreateTextFile}
            onDeleteFile={onDeleteHumanInputFile}
            onDeleteFolder={onDeleteFolder}
            onMoveFile={onMoveFile}
            onUploadFiles={onUploadFiles}
            onOpenFile={onOpenFile}
            selectedPath={selectedPath}
          />

          <button
            className={
              selectedPath?.startsWith(projectPathPrefixes.sources)
                ? "simple-nav-item simple-nav-subheader active"
                : "simple-nav-item simple-nav-subheader"
            }
            onClick={() => onOpenView("inputs")}
            type="button"
          >
            <span>AI Sources</span>
          </button>
          <FileTreeBlock
            emptyLabel="No source files yet. Run a build to gather sources."
            files={sourceFiles}
            loading={loading && currentView === "inputs"}
            onOpenFile={onOpenFile}
            selectedPath={selectedPath}
          />
        </>
      );
    }

    return (
      <FileTreeBlock
        emptyLabel="No generated Markdown files yet."
        files={outputFiles}
        loading={loading && currentView === "outputs"}
        onOpenFile={onOpenFile}
        selectedPath={selectedPath}
      />
    );
  }
}

function HumanInputActions({
  onCreateFolder,
  onCreateTextFile,
}: {
  onCreateFolder: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
}) {
  const [activeForm, setActiveForm] = useState<"folder" | "file" | null>(null);
  const [newName, setNewName] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeForm && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [activeForm]);

  function handleSubmit() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (activeForm === "folder") {
      onCreateFolder(trimmed);
    } else if (activeForm === "file" && onCreateTextFile) {
      onCreateTextFile(trimmed);
    }

    setNewName("");
    setActiveForm(null);
  }

  function toggleForm(kind: "folder" | "file") {
    setActiveForm((current) => {
      if (current === kind) return null;
      setNewName("");
      return kind;
    });
  }

  return (
    <div className="human-input-actions">
      <div className="human-input-action-row">
        <button
          className="human-input-action-button"
          onClick={() => toggleForm("folder")}
          type="button"
          title="Create a new folder in human inputs"
          aria-expanded={activeForm === "folder"}
        >
          <span className="human-input-action-icon" aria-hidden="true">📁</span>
          <span>Add folder</span>
        </button>

        {onCreateTextFile ? (
          <button
            className="human-input-action-button"
            onClick={() => toggleForm("file")}
            type="button"
            title="Create a new Markdown text file"
            aria-expanded={activeForm === "file"}
          >
            <span className="human-input-action-icon" aria-hidden="true">📝</span>
            <span>New text file</span>
          </button>
        ) : null}
      </div>

      {activeForm ? (
        <form
          className="human-input-name-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <input
            ref={nameInputRef}
            className="human-input-name-input"
            type="text"
            placeholder={activeForm === "folder" ? "Folder name…" : "File name…"}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setActiveForm(null);
            }}
            maxLength={200}
          />
          <button
            className="human-input-name-submit"
            type="submit"
            disabled={!newName.trim()}
          >
            Create
          </button>
        </form>
      ) : null}
    </div>
  );
}

function FileTreeBlock({
  emptyLabel,
  emptyDirectories,
  files,
  loading,
  selectedPath,
  onCreateTextFile,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onUploadFiles,
  onOpenFile,
}: {
  emptyLabel: string;
  emptyDirectories?: string[];
  files: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onOpenFile: (path: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragDepthRef = useRef(0);

  if (loading) return <p className="simple-nav-state">Loading...</p>;

  const hasContent = files.length > 0 || (emptyDirectories && emptyDirectories.length > 0);

  async function handleUpload(fileList: FileList | File[]) {
    const uploadFiles = Array.from(fileList);
    if (!uploadFiles.length || !onUploadFiles) return;

    setUploading(true);
    try {
      await onUploadFiles(uploadFiles);
    } catch {
      // Parent upload handler owns the user-facing error notice.
    } finally {
      setUploading(false);
      dragDepthRef.current = 0;
      setDragActive(false);
    }
  }

  const content = hasContent ? (
    <FileTreeNav
      files={files}
      emptyDirectories={emptyDirectories}
      selectedPath={selectedPath}
      onCreateTextFile={onCreateTextFile}
      onDeleteFile={onDeleteFile}
      onDeleteFolder={onDeleteFolder}
      onMoveFile={onMoveFile}
      onSelectFile={onOpenFile}
    />
  ) : (
    <p className="simple-nav-state">
      {uploading ? "Uploading..." : dragActive ? "Drop files here" : emptyLabel}
    </p>
  );

  // Without upload support, render content directly (no drop wrapper needed).
  if (!onUploadFiles) return content;

  return (
    <div
      className={`file-tree-upload-zone${dragActive ? " drag-active" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        if (event.dataTransfer.files.length > 0) {
          void handleUpload(event.dataTransfer.files);
        }
      }}
    >
      {content}
    </div>
  );
}

function DefineNavLabel({ label }: { label: string }) {
  const [prefix, emphasized] = label.split(/:\s+/, 2);

  if (!emphasized) return <span>{label}</span>;

  return (
    <span>
      {prefix}: <strong>{emphasized}</strong>
    </span>
  );
}
