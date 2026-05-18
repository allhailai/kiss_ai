import { useEffect, useMemo, useRef, useState } from "react";
import {
  chatNavLeaf,
  openQuestionsNavLeaf,
  requirementNavLeaves,
  sectionForView,
  simplifiedNavSections,
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
  projectFiles,
  loading,
  selectedPath,
  onCreateFolder,
  onCreateTextFile,
  onDeleteFolder,
  onDeleteHumanInputFile,
  onMoveFile,
  onOpenView,
  onOpenFile,
}: {
  currentView: View;
  humanInputEmptyDirectories?: string[];
  projectFiles: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  onCreateFolder?: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDeleteHumanInputFile?: (path: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
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
        const isBuildSection = section.id === "build";
        const isChatSection = section.id === "chat";
        const isDirectViewSection = isChatSection || isBuildSection;

        return (
          <section className={isActiveSection ? "nav-section active" : "nav-section"} key={section.id}>
            <button
              className="nav-section-trigger"
              onClick={() =>
                isChatSection
                    ? onOpenView(chatNavLeaf.view)
                    : isBuildSection
                      ? onOpenView("rebuild")
                      : toggleSection(section.id)
              }
              type="button"
              aria-expanded={isDirectViewSection ? undefined : isExpanded}
            >
              <span className="nav-section-label">
                <strong>{section.label}</strong>
              </span>
              {isDirectViewSection ? null : <b aria-hidden="true">{isExpanded ? "-" : "+"}</b>}
            </button>

            {!isDirectViewSection && isExpanded ? <div className="nav-section-body">{renderSectionBody(section.id)}</div> : null}
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
              className={
                selectedPath === openQuestionsNavLeaf.path ? "simple-nav-item simple-nav-child active" : "simple-nav-item simple-nav-child"
              }
              onClick={() => onOpenView(openQuestionsNavLeaf.view, openQuestionsNavLeaf.path)}
              type="button"
            >
              <DefineNavLabel label={openQuestionsNavLeaf.label} />
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
            <span>Human acquired</span>
            <small>{projectPathPrefixes.humanInput}</small>
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
            <span>Sources</span>
            <small>{projectPathPrefixes.sources}</small>
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
  onOpenFile: (path: string) => void;
}) {
  if (loading) return <p className="simple-nav-state">Loading...</p>;
  if (files.length === 0 && (!emptyDirectories || emptyDirectories.length === 0)) return <p className="simple-nav-state">{emptyLabel}</p>;

  return <FileTreeNav files={files} emptyDirectories={emptyDirectories} selectedPath={selectedPath} onCreateTextFile={onCreateTextFile} onDeleteFile={onDeleteFile} onDeleteFolder={onDeleteFolder} onMoveFile={onMoveFile} onSelectFile={onOpenFile} />;
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
