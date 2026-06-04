import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  sectionForView,
  simplifiedNavSections,
  type SimplifiedNavSectionId,
} from "../../navigation/navigationModel";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { type View } from "../../navigation/views";
import type { ProjectFile } from "../../contracts/api";
import { KnowledgebaseSectionBody, OutputsSectionBody } from "./WorkflowSectionMenu";
import { useUxPreferences } from "../../app/contexts/UxPreferencesContext";

const defaultExpandedSections = new Set<SimplifiedNavSectionId>(
  simplifiedNavSections.filter((section) => section.id !== "ai").map((section) => section.id),
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
  const { preferences } = useUxPreferences();
  const activeSection = sectionForView(currentView, selectedPath);
  const [expandedSections, setExpandedSections] = useState<Set<SimplifiedNavSectionId>>(
    () => new Set(defaultExpandedSections),
  );

  // Track which numbered subsections (1-5) are expanded inside the parent groups.
  type SubsectionId = "define" | "source-data" | "wiki" | "reports" | "artifacts";
  const [expandedSubsections, setExpandedSubsections] = useState<Set<SubsectionId>>(
    () => new Set<SubsectionId>(["define", "source-data", "wiki", "reports", "artifacts"]),
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

  /**
   * Preserve the scroll position of a trigger button when a section
   * expands / collapses. We snapshot the button's viewport-Y before the
   * state change and restore it in a rAF after React re-renders.
   */
  function preserveScrollAroundToggle(
    button: HTMLButtonElement,
    doToggle: () => void,
  ) {
    const scrollContainer = button.closest(".sidebar") as HTMLElement | null;
    if (!scrollContainer) {
      doToggle();
      return;
    }

    const yBefore = button.getBoundingClientRect().top;
    doToggle();

    requestAnimationFrame(() => {
      const yAfter = button.getBoundingClientRect().top;
      scrollContainer.scrollTop += yAfter - yBefore;
    });
  }

  function toggleSection(sectionId: SimplifiedNavSectionId, event?: React.MouseEvent<HTMLButtonElement>) {
    const button = event?.currentTarget;
    const doToggle = () => {
      setExpandedSections((current) => {
        const next = new Set(current);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
    };

    if (button) {
      preserveScrollAroundToggle(button, doToggle);
    } else {
      doToggle();
    }
  }

  function toggleSubsection(subsectionId: string, event?: React.MouseEvent<HTMLButtonElement>) {
    const button = event?.currentTarget;
    const doToggle = () => {
      setExpandedSubsections((current) => {
        const next = new Set(current);
        const id = subsectionId as SubsectionId;
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    if (button) {
      preserveScrollAroundToggle(button, doToggle);
    } else {
      doToggle();
    }
  }

  // Sections that are direct-navigation only (no expand/collapse body)
  const directNavSections = new Set<SimplifiedNavSectionId>(["ai"]);

  return (
    <nav className="simple-nav" aria-label="Project workflow">
      {simplifiedNavSections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const isActiveSection = activeSection === section.id;
        const isDirectNav = directNavSections.has(section.id);
        const isAiSection = section.id === "ai";

        return (
          <section className={`nav-section${isActiveSection ? " active" : ""}${isAiSection ? " nav-section-ai" : ""}`} key={section.id}>
            <button
              className={`nav-section-trigger${isAiSection ? " nav-section-trigger-ai" : ""}`}
              onClick={(event) => {
                if (isAiSection) {
                  onOpenView("ai");
                } else {
                  toggleSection(section.id, event);
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
    if (sectionId === "knowledgebase") {
      return (
        <KnowledgebaseSectionBody
          currentView={currentView}
          expandedSubsections={expandedSubsections as Set<string>}
          humanInputEmptyDirectories={humanInputEmptyDirectories}
          humanInputFiles={humanInputFiles}
          loading={loading}
          onCreateFolder={onCreateFolder}
          onCreateTextFile={onCreateTextFile}
          onDeleteFolder={onDeleteFolder}
          onDeleteHumanInputFile={onDeleteHumanInputFile}
          onDeleteProjectFile={onDeleteProjectFile}
          onDeleteProjectFolder={onDeleteProjectFolder}
          onMoveFile={onMoveFile}
          onUploadFiles={onUploadFiles}
          onOpenFile={onOpenFile}
          onOpenView={onOpenView}
          selectedPath={selectedPath}
          showFileBrowser={preferences.showFileBrowser}
          sourceFiles={sourceFiles}
          toggleSubsection={toggleSubsection}
          wikiFiles={wikiFiles}
        />
      );
    }

    if (sectionId === "outputs") {
      return (
        <OutputsSectionBody
          currentView={currentView}
          expandedSubsections={expandedSubsections as Set<string>}
          loading={loading}
          onDeleteProjectFile={onDeleteProjectFile}
          onDeleteProjectFolder={onDeleteProjectFolder}
          onOpenFile={onOpenFile}
          onOpenView={onOpenView}
          projectSlug={projectSlug}
          rebuildRunning={rebuildRunning ?? false}
          reportFiles={reportFiles}
          selectedArtifactSlug={selectedArtifactSlug}
          selectedPath={selectedPath}
          showFileBrowser={preferences.showFileBrowser}
          toggleSubsection={toggleSubsection}
        />
      );
    }

    return null;
  }
}
