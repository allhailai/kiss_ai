import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defineNavTarget,
  sectionForView,
  simplifiedNavSections,
  type SimplifiedNavSectionId,
} from "../../navigation/navigationModel";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { type View } from "../../navigation/views";
import type { ArtifactSpec, ProjectFile } from "../../contracts/api";
import { FileTreeNav } from "./FileTreeNav";
import { artifactsApi } from "../../data/artifactsApi";

const defaultExpandedSections = new Set<SimplifiedNavSectionId>(
  simplifiedNavSections.filter((section) => section.id !== "source-data" && section.id !== "wiki").map((section) => section.id),
);

export function SimplifiedNavigator({
  currentView,
  humanInputEmptyDirectories,
  projectFiles,
  projectSlug,
  loading,
  selectedPath,
  selectedArtifactSlug,
  rebuildRunning,
  onCreateFolder,
  onCreateTextFile,
  onDeleteFolder,
  onDeleteHumanInputFile,
  onDeleteProjectFile,
  onDeleteProjectFolder,
  onMoveFile,
  onUploadFiles,
  onOpenView,
  onOpenFile,
}: {
  currentView: View;
  humanInputEmptyDirectories?: string[];
  projectFiles: ProjectFile[];
  projectSlug: string;
  loading: boolean;
  selectedPath: string | null;
  selectedArtifactSlug: string | null;
  rebuildRunning?: boolean;
  onCreateFolder?: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDeleteHumanInputFile?: (path: string) => void;
  onDeleteProjectFile?: (path: string) => void;
  onDeleteProjectFolder?: (folder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onOpenView: (view: View, path?: string | null) => void;
  onOpenFile: (path: string) => void;
}) {
  const activeSection = sectionForView(currentView, selectedPath);
  const [expandedSections, setExpandedSections] = useState<Set<SimplifiedNavSectionId>>(
    () => new Set(defaultExpandedSections),
  );
  const humanInputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.humanInput)), [projectFiles]);
  const sourceFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.sources)), [projectFiles]);
  const outputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(projectPathPrefixes.output)), [projectFiles]);
  const wikiFiles = useMemo(
    () =>
      outputFiles
        .filter((file) => file.path.startsWith("outputs_ai/wiki/"))
        .map((file) => ({ ...file, name: file.name.replace(/^wiki\//, "") })),
    [outputFiles],
  );
  const reportFiles = useMemo(
    () =>
      outputFiles
        .filter((file) => file.path.startsWith("outputs_ai/reports/"))
        .map((file) => ({ ...file, name: file.name.replace(/^reports\//, "") })),
    [outputFiles],
  );

  const headerClickRef = useRef(false);

  useEffect(() => {
    if (headerClickRef.current) {
      // Navigation was triggered by a section header click — it handles
      // its own expand/collapse, so skip auto-expand.
      headerClickRef.current = false;
      return;
    }
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

  // Sections where clicking the header should navigate to a view (not just toggle)
  // "ai" navigates to the AI hub, "define" navigates directly to project.md,
  // "reports" and "artifacts" navigate to their list views.
  const navigableSections: Partial<Record<SimplifiedNavSectionId, { view: View; path?: string }>> = {
    ai: { view: "ai" },
    define: { view: defineNavTarget.view, path: defineNavTarget.path },
    reports: { view: "reports" },
    artifacts: { view: "artifacts" },
  };

  // Sections that are direct-navigation only (no expand/collapse body)
  const directNavSections = new Set<SimplifiedNavSectionId>(["ai", "define"]);

  return (
    <nav className="simple-nav" aria-label="Project workflow">
      {simplifiedNavSections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const isActiveSection = activeSection === section.id;
        const isDirectNav = directNavSections.has(section.id);
        const isAiSection = section.id === "ai";
        const navTarget = navigableSections[section.id];

        return (
          <section className={`nav-section${isActiveSection ? " active" : ""}${isAiSection ? " nav-section-ai" : ""}`} key={section.id}>
            <button
              className={`nav-section-trigger${isAiSection ? " nav-section-trigger-ai" : ""}`}
              onClick={() => {
                if (navTarget) {
                  if (!isDirectNav) {
                    headerClickRef.current = true;
                    toggleSection(section.id);
                  }
                  onOpenView(navTarget.view, navTarget.path);
                } else {
                  toggleSection(section.id);
                }
              }}
              type="button"
              aria-expanded={isDirectNav ? undefined : isExpanded}
            >
              <span className="nav-section-label">
                {isAiSection ? <span className="nav-ai-icon" aria-hidden="true">✦</span> : null}
                <strong>{section.label}</strong>
              </span>
              {isDirectNav ? null : <b aria-hidden="true">{isExpanded ? "-" : "+"}</b>}
            </button>

            {!isDirectNav && isExpanded ? <div className="nav-section-body">{renderSectionBody(section.id)}</div> : null}
          </section>
        );
      })}
    </nav>
  );

  function renderSectionBody(sectionId: SimplifiedNavSectionId) {
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
            <HumanInputActions onCreateFolder={onCreateFolder} onCreateTextFile={onCreateTextFile} onUploadFiles={onUploadFiles} />
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
            onDeleteFile={onDeleteProjectFile}
            onDeleteFolder={onDeleteProjectFolder}
            onOpenFile={onOpenFile}
            selectedPath={selectedPath}
          />
        </>
      );
    }

    if (sectionId === "wiki") {
      return (
        <>
          <button
            className={
              currentView === "outputs" && !selectedPath
                ? "simple-nav-item simple-nav-subheader active"
                : "simple-nav-item simple-nav-subheader"
            }
            onClick={() => onOpenView("outputs")}
            type="button"
          >
            <span>Wiki Pages</span>
          </button>
          <FileTreeBlock
            emptyLabel="No wiki pages yet. Run a knowledge build first."
            files={wikiFiles}
            loading={loading && currentView === "outputs"}
            onDeleteFile={onDeleteProjectFile}
            onDeleteFolder={onDeleteProjectFolder}
            onOpenFile={onOpenFile}
            selectedPath={selectedPath}
          />
        </>
      );
    }

    if (sectionId === "reports") {
      return (
        <FileTreeBlock
          emptyLabel="No reports yet. Create one with the chat agent."
          files={reportFiles}
          loading={loading && currentView === "reports"}
          onDeleteFile={onDeleteProjectFile}
          onDeleteFolder={onDeleteProjectFolder}
          onOpenFile={onOpenFile}
          selectedPath={selectedPath}
        />
      );
    }

    if (sectionId === "artifacts") {
      return (
        <ArtifactNavSection
          projectSlug={projectSlug}
          selectedArtifactSlug={selectedArtifactSlug}
          isActive={currentView === "artifacts"}
          rebuildRunning={rebuildRunning ?? false}
          onOpenView={onOpenView}
        />
      );
    }

    return null;
  }
}

/* ─── Artifact Navigation Section ──────────────────────────────── */

function ArtifactNavSection({
  projectSlug,
  selectedArtifactSlug,
  isActive,
  rebuildRunning,
  onOpenView,
}: {
  projectSlug: string;
  selectedArtifactSlug: string | null;
  isActive: boolean;
  rebuildRunning: boolean;
  onOpenView: (view: View, path?: string | null) => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactSpec[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const wasRunningRef = useRef(false);

  const refreshList = useCallback(async () => {
    try {
      const result = await artifactsApi.list(projectSlug);
      setArtifacts(result.artifacts);
    } catch {
      setArtifacts([]);
    }
  }, [projectSlug]);

  // Load artifact list on mount and when section becomes active
  useEffect(() => {
    void refreshList();
  }, [refreshList, isActive]);

  // Poll artifact list every 15s while a build is running
  useEffect(() => {
    if (!rebuildRunning) return;
    const interval = window.setInterval(() => void refreshList(), 15_000);
    return () => window.clearInterval(interval);
  }, [rebuildRunning, refreshList]);

  // Auto-refresh when build transitions from running → finished
  useEffect(() => {
    if (wasRunningRef.current && !rebuildRunning) {
      void refreshList();
    }
    wasRunningRef.current = rebuildRunning;
  }, [rebuildRunning, refreshList]);

  useEffect(() => {
    if (showForm && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showForm]);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const result = await artifactsApi.create(projectSlug, trimmed, "## Goal\n\nDescribe the goal of this artifact...\n");
      await refreshList();
      onOpenView("artifacts", result.slug);
      setNewName("");
      setShowForm(false);
    } catch {
      // Ignore — inline form, no toast access
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {artifacts.length === 0 && !showForm ? (
        <p className="simple-nav-state">No artifacts yet.</p>
      ) : (
        <div className="simple-nav-children">
          {artifacts.map((artifact) => (
            <button
              className={
                selectedArtifactSlug === artifact.slug
                  ? "simple-nav-item simple-nav-child active"
                  : "simple-nav-item simple-nav-child"
              }
              key={artifact.slug}
              onClick={() => onOpenView("artifacts", artifact.slug)}
              type="button"
            >
              <span className="artifact-nav-label">
                <span className={`artifact-nav-status artifact-nav-status-${artifact.status}`}>
                  {artifact.status === "built" ? "●" : "○"}
                </span>
                <span>{artifact.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="human-input-actions">
        <div className="human-input-action-row">
          <button
            className="human-input-action-button"
            onClick={() => setShowForm((prev) => !prev)}
            type="button"
            title="Create a new artifact"
            aria-expanded={showForm}
          >
            <span className="human-input-action-icon" aria-hidden="true">+</span>
            <span>New artifact</span>
          </button>
        </div>

        {showForm ? (
          <form
            className="human-input-name-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <input
              ref={nameInputRef}
              className="human-input-name-input"
              type="text"
              placeholder="Artifact name…"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setShowForm(false);
              }}
              maxLength={120}
            />
            <button
              className="human-input-name-submit"
              type="submit"
              disabled={!newName.trim() || creating}
            >
              Create
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
}

/* ─── Existing helper components ───────────────────────────────── */

function HumanInputActions({
  onCreateFolder,
  onCreateTextFile,
  onUploadFiles,
}: {
  onCreateFolder: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
}) {
  const [activeForm, setActiveForm] = useState<"folder" | "file" | null>(null);
  const [newName, setNewName] = useState("");
  const [uploading, setUploading] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0 || !onUploadFiles) return;

    setUploading(true);
    try {
      await onUploadFiles(Array.from(files));
    } catch {
      // Parent handler owns user-facing error notice.
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

      {onUploadFiles ? (
        <div className="human-input-action-row">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="human-input-file-input-hidden"
            onChange={handleFileInputChange}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            className="human-input-action-button human-input-upload-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
            title="Upload files from your computer"
            disabled={uploading}
          >
            <span className="human-input-action-icon" aria-hidden="true">📎</span>
            <span>{uploading ? "Uploading…" : "Upload files"}</span>
          </button>
        </div>
      ) : null}

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
      className={`file-tree-upload-zone${dragActive ? " drag-active" : ""}${uploading ? " uploading" : ""}`}
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
      {(dragActive || uploading) && hasContent ? (
        <p className="file-tree-upload-overlay">
          {uploading ? "Uploading…" : "Drop files here"}
        </p>
      ) : null}
    </div>
  );
}

