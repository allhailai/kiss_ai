import { useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "../../contracts/api";
import { errorMessage } from "../../domain/errors";
import { formatLocalDate, formatLocalTimeShort } from "../../domain/formatters";

const projectNameTakenMessage = "That project name is taken. Please use another one.";

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

export function ProjectPicker({
  creatingProject,
  error,
  projects,
  projectsRoot,
  onCreateProject,
  onSelect,
  settingsSlot,
  updateCheckerSlot,
}: {
  creatingProject: boolean;
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onCreateProject: (name: string, slug?: string) => Promise<void>;
  onSelect: (projectSlug: string) => void;
  settingsSlot?: React.ReactNode;
  updateCheckerSlot?: React.ReactNode;
}) {
  const [projectName, setProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const selectedSlug = slugifyProjectName(projectName);
  const slugIsValid = !selectedSlug || /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(selectedSlug);
  const projectNameIsTaken = Boolean(selectedSlug && projects.some((project) => project.slug === selectedSlug));
  const liveCreateError = projectNameIsTaken ? projectNameTakenMessage : "";
  const visibleCreateError = liveCreateError || createError;
  const canCreate = Boolean(projectName.trim() && selectedSlug && slugIsValid && !projectNameIsTaken && !creatingProject);

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
      </div>

      {error ? (
        <div className="warning-callout">
          <strong>Project discovery failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {!error && projects.length === 0 ? <p>No kiss_ai projects were found under the configured projects root.</p> : null}

      <div className="project-card-grid">
        {projects.map((project) => (
          <button className="project-card" key={project.slug} onClick={() => onSelect(project.slug)} type="button">
            <span className="eyebrow">{project.setupStatus}</span>
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
    </section>
  );
}
