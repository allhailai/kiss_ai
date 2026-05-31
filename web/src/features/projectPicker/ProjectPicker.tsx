import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "../../contracts/api";
import { systemApi } from "../../data/systemApi";
import { errorMessage } from "../../domain/errors";
import { formatLocalDate, formatLocalTimeShort } from "../../domain/formatters";

const projectNameTakenMessage = "That project name is taken. Please use another one.";

type ViewMode = "cards" | "table";

function slugifyProjectName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function DateRow({ label, timestamp }: { label: string; timestamp: string | null }) {
  if (!timestamp) return null;
  return (
    <tr>
      <td>{label}</td>
      <td><strong>{formatLocalDate(timestamp)}</strong> {formatLocalTimeShort(timestamp)}</td>
    </tr>
  );
}

function DateCell({ timestamp }: { timestamp: string | null }) {
  if (!timestamp) return <td className="project-table-date">—</td>;
  return (
    <td className="project-table-date">
      <strong>{formatLocalDate(timestamp)}</strong>{" "}
      <span>{formatLocalTimeShort(timestamp)}</span>
    </td>
  );
}

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={pinned ? "Unpin project" : "Pin project"}
      className={`project-pin-button${pinned ? " pinned" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={pinned ? "Unpin" : "Pin to top"}
      type="button"
    >
      {/* Pin icon */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M9.828 1.172a1 1 0 0 1 1.414 0l3.586 3.586a1 1 0 0 1 0 1.414l-2.293 2.293-.707.707-1 1L9.414 11.586l-3-3L7.828 7.172l1-1 .707-.707 2.293-2.293ZM6.414 8.586l-3 3L2 13.5l1.914-1.414 3-3Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="project-view-toggle" role="radiogroup" aria-label="View mode">
      <button
        aria-checked={view === "cards"}
        aria-label="Card view"
        className={view === "cards" ? "active" : ""}
        onClick={() => onChange("cards")}
        role="radio"
        title="Card view"
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor"/>
          <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor"/>
          <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor"/>
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button
        aria-checked={view === "table"}
        aria-label="Table view"
        className={view === "table" ? "active" : ""}
        onClick={() => onChange("table")}
        role="radio"
        title="Table view"
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor"/>
          <rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor"/>
          <rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
}

/** Sort projects: pinned first (preserving pin order), then by modifiedAt descending. */
function sortProjects(projects: ProjectSummary[], pinnedSlugs: Set<string>): ProjectSummary[] {
  return [...projects].sort((a, b) => {
    const aPinned = pinnedSlugs.has(a.slug);
    const bPinned = pinnedSlugs.has(b.slug);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function ProjectTable({
  projects,
  pinnedSlugs,
  onSelect,
  onTogglePin,
}: {
  projects: ProjectSummary[];
  pinnedSlugs: Set<string>;
  onSelect: (slug: string) => void;
  onTogglePin: (slug: string) => void;
}) {
  const sorted = sortProjects(projects, pinnedSlugs);

  return (
    <div className="project-table-wrapper">
      <table className="project-table">
        <thead>
          <tr>
            <th className="project-table-pin-col" aria-label="Pin" />
            <th>Name</th>
            <th>Status</th>
            <th>Created</th>
            <th>Last Build</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((project) => (
            <tr key={project.slug} onClick={() => onSelect(project.slug)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onSelect(project.slug); }}>
              <td className="project-table-pin-cell">
                <PinButton pinned={pinnedSlugs.has(project.slug)} onToggle={() => onTogglePin(project.slug)} />
              </td>
              <td className="project-table-name">{project.name}</td>
              <td className="project-table-status"><span className="eyebrow">{project.setupStatus}</span></td>
              <DateCell timestamp={project.createdAt} />
              <DateCell timestamp={project.lastBuildAt} />
              <DateCell timestamp={project.modifiedAt} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProjectPicker({
  creatingProject,
  error,
  projects,
  projectsRoot,
  onCreateProject,
  onSelect,
  settingsSlot,
  logoutSlot,
  updateCheckerSlot,
}: {
  creatingProject: boolean;
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onCreateProject: (name: string, slug?: string) => Promise<void>;
  onSelect: (projectSlug: string) => void;
  settingsSlot?: React.ReactNode;
  logoutSlot?: React.ReactNode;
  updateCheckerSlot?: React.ReactNode;
}) {
  const [projectName, setProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [viewLoaded, setViewLoaded] = useState(false);
  const [pinnedSlugs, setPinnedSlugs] = useState<Set<string>>(new Set());
  const selectedSlug = slugifyProjectName(projectName);
  const slugIsValid = !selectedSlug || /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(selectedSlug);
  const projectNameIsTaken = Boolean(selectedSlug && projects.some((project) => project.slug === selectedSlug));
  const liveCreateError = projectNameIsTaken ? projectNameTakenMessage : "";
  const visibleCreateError = liveCreateError || createError;
  const canCreate = Boolean(projectName.trim() && selectedSlug && slugIsValid && !projectNameIsTaken && !creatingProject);

  useEffect(() => {
    Promise.all([
      systemApi.projectsView(),
      systemApi.pinnedProjects(),
    ]).then(([viewResult, pinnedResult]) => {
      setViewMode(viewResult.view);
      setPinnedSlugs(new Set(pinnedResult.pinned));
      setViewLoaded(true);
    }).catch(() => setViewLoaded(true));
  }, []);

  const handleViewChange = (newView: ViewMode) => {
    setViewMode(newView);
    void systemApi.setProjectsView(newView);
  };

  const handleTogglePin = (slug: string) => {
    setPinnedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      void systemApi.setPinnedProjects([...next]);
      return next;
    });
  };

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");

    if (!projectName.trim()) {
      setCreateError("Project name is required.");
      return;
    }

    if (!selectedSlug || !slugIsValid) {
      setCreateError("Folder name must start with a letter or number and contain only letters, numbers, underscores, or hyphens.");
      return;
    }

    if (projectNameIsTaken) {
      setCreateError(projectNameTakenMessage);
      return;
    }

    try {
      await onCreateProject(projectName.trim(), selectedSlug);
      setProjectName("");
      setCreateError("");
    } catch (submitError) {
      setCreateError(errorMessage(submitError, "Could not create the project."));
    }
  };

  const sortedProjects = sortProjects(projects, pinnedSlugs);

  return (
    <section className="project-picker">
      <div className="project-picker-header">
        <div className="project-picker-title">
          <h1>Projects</h1>
          {projectsRoot ? <code>{projectsRoot}</code> : null}
        </div>
        <div className="project-picker-update">
          {settingsSlot}
          {updateCheckerSlot}
          {logoutSlot}
        </div>
      </div>

      <form className="project-create-panel" onSubmit={submitProject}>
        <div>
          <span className="eyebrow">new project</span>
        </div>

        <label className={projectNameIsTaken ? "project-name-field has-error" : "project-name-field"}>
          <span>Project Name:</span>
          <input
            autoComplete="off"
            disabled={creatingProject}
            onChange={(event) => {
              setProjectName(event.target.value);
              setCreateError("");
            }}
            placeholder="Clinical Protocol Review"
            required
            type="text"
            value={projectName}
          />
        </label>

        <div className="project-create-actions">
          <button disabled={!canCreate} type="submit">
            {creatingProject ? "Building..." : "Build"}
          </button>
        </div>
      </form>
      {!slugIsValid || visibleCreateError ? (
        <div className="project-create-error" role="alert">
          {!slugIsValid ? <p>Use only letters, numbers, underscores, or hyphens.</p> : null}
          {visibleCreateError ? <p>{visibleCreateError}</p> : null}
        </div>
      ) : null}

      <div className="section-heading">
        <h2>Available projects</h2>
        {viewLoaded ? <ViewToggle view={viewMode} onChange={handleViewChange} /> : null}
      </div>

      {error ? (
        <div className="warning-callout">
          <strong>Project discovery failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {!error && projects.length === 0 ? <p>No kiss_ai projects were found under the configured projects root.</p> : null}

      {viewMode === "cards" ? (
        <div className="project-card-grid">
          {sortedProjects.map((project) => (
            <button className={`project-card${pinnedSlugs.has(project.slug) ? " project-card-pinned" : ""}`} key={project.slug} onClick={() => onSelect(project.slug)} type="button">
              <div className="project-card-top-row">
                <span className="eyebrow">{project.setupStatus}</span>
                <PinButton pinned={pinnedSlugs.has(project.slug)} onToggle={() => handleTogglePin(project.slug)} />
              </div>
              <strong>{project.name}</strong>
              <table className="project-card-dates">
                <tbody>
                  <DateRow label="Created" timestamp={project.createdAt} />
                  <DateRow label="Last build" timestamp={project.lastBuildAt} />
                  <DateRow label="Updated" timestamp={project.modifiedAt} />
                </tbody>
              </table>
            </button>
          ))}
        </div>
      ) : (
        <ProjectTable projects={projects} pinnedSlugs={pinnedSlugs} onSelect={onSelect} onTogglePin={handleTogglePin} />
      )}
    </section>
  );
}
