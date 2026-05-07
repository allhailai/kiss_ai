import { useEffect, useMemo, useState } from "react";
import {
  openQuestionsNavLeaf,
  requirementNavLeaves,
  sectionForView,
  simplifiedNavSections,
  type SimplifiedNavSectionId,
} from "../../app/navigationModel";
import { type View } from "../../app/views";
import type { ProjectFile } from "../../api";
import { FileTreeNav } from "./FileTreeNav";

const humanInputPrefix = "inputs_human/";
const aiInputPrefix = "inputs_ai/";
const outputPrefix = "outputs_ai/";

export function SimplifiedNavigator({
  currentView,
  projectFiles,
  loading,
  selectedPath,
  showAiAutoUpdate,
  onAiAutoUpdate,
  onOpenView,
  onOpenFile,
}: {
  currentView: View;
  projectFiles: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  showAiAutoUpdate?: boolean;
  onAiAutoUpdate?: () => void;
  onOpenView: (view: View, path?: string | null) => void;
  onOpenFile: (path: string) => void;
}) {
  const activeSection = sectionForView(currentView);
  const [expandedSections, setExpandedSections] = useState<Set<SimplifiedNavSectionId>>(
    () => new Set(simplifiedNavSections.map((section) => section.id)),
  );
  const humanInputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(humanInputPrefix)), [projectFiles]);
  const aiInputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(aiInputPrefix)), [projectFiles]);
  const outputFiles = useMemo(() => projectFiles.filter((file) => file.path.startsWith(outputPrefix)), [projectFiles]);

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

        return (
          <section className={isActiveSection ? "nav-section active" : "nav-section"} key={section.id}>
            <button
              className="nav-section-trigger"
              onClick={() => (isBuildSection ? onOpenView("rebuild") : toggleSection(section.id))}
              type="button"
              aria-expanded={isBuildSection ? undefined : isExpanded}
            >
              <span className="nav-section-label">
                <strong>{section.label}</strong>
              </span>
              {isBuildSection ? null : <b aria-hidden="true">{isExpanded ? "-" : "+"}</b>}
            </button>

            {!isBuildSection && isExpanded ? <div className="nav-section-body">{renderSectionBody(section.id)}</div> : null}
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
          {showAiAutoUpdate ? (
            <button className="local-nav-action" onClick={onAiAutoUpdate} type="button">
              <strong>Align Files with AI</strong>
              <span>Use AI to keep related files consistent</span>
            </button>
          ) : null}
        </>
      );
    }

    if (sectionId === "source-data") {
      return (
        <>
          <button
            className={currentView === "inputs" && !selectedPath ? "simple-nav-item active" : "simple-nav-item"}
            onClick={() => onOpenView("inputs")}
            type="button"
          >
            <span>Human acquired</span>
            <small>{humanInputPrefix}</small>
          </button>
          <FileTreeBlock
            emptyLabel="No human-acquired Markdown files yet."
            files={humanInputFiles}
            loading={loading && currentView === "inputs"}
            onOpenFile={onOpenFile}
            selectedPath={selectedPath}
          />

          <button
            className={currentView === "annotations" && !selectedPath ? "simple-nav-item active" : "simple-nav-item"}
            onClick={() => onOpenView("annotations")}
            type="button"
          >
            <span>AI acquired</span>
            <small>{aiInputPrefix}</small>
          </button>
          <FileTreeBlock
            emptyLabel="No AI-acquired Markdown files yet."
            files={aiInputFiles}
            loading={loading && currentView === "annotations"}
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

function FileTreeBlock({
  emptyLabel,
  files,
  loading,
  selectedPath,
  onOpenFile,
}: {
  emptyLabel: string;
  files: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
}) {
  if (loading) return <p className="simple-nav-state">Loading...</p>;
  if (files.length === 0) return <p className="simple-nav-state">{emptyLabel}</p>;

  return <FileTreeNav files={files} selectedPath={selectedPath} onSelectFile={onOpenFile} />;
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
