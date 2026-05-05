import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ProjectSummary } from "../../api";

function slugifyProjectName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function ProjectPicker({
  creatingProject,
  error,
  projects,
  projectsRoot,
  onCreateProject,
  onRefresh,
  onSelect,
}: {
  creatingProject: boolean;
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onCreateProject: (name: string, slug?: string) => Promise<void>;
  onRefresh: () => void;
  onSelect: (projectSlug: string) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState("");
  const derivedSlug = useMemo(() => slugifyProjectName(projectName), [projectName]);
  const selectedSlug = slugTouched ? projectSlug.trim() : derivedSlug;
  const slugIsValid = !selectedSlug || /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(selectedSlug);
  const canCreate = Boolean(projectName.trim() && selectedSlug && slugIsValid && !creatingProject);

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

    try {
      await onCreateProject(projectName.trim(), selectedSlug);
      setProjectName("");
      setProjectSlug("");
      setSlugTouched(false);
    } catch (submitError) {
      setCreateError(submitError instanceof Error ? submitError.message : "Could not create the project.");
    }
  };

  return (
    <section className="project-picker">
      <div className="project-picker-header">
        <span className="eyebrow">kiss_ai projects</span>
        <h1>Select a project</h1>
        <p>Choose an existing project under the projects folder to open the same workspace tools used by this lab.</p>
        {projectsRoot ? <code>{projectsRoot}</code> : null}
      </div>

      <form className="project-create-panel" onSubmit={submitProject}>
        <div>
          <span className="eyebrow">new project</span>
          <h2>Build a new project</h2>
          <p>Create a sibling project from the shared template, initialize Git, and open it in this workspace.</p>
        </div>

        <label>
          Project name
          <input
            autoComplete="off"
            disabled={creatingProject}
            onChange={(event) => {
              setProjectName(event.target.value);
              if (!slugTouched) setProjectSlug(slugifyProjectName(event.target.value));
            }}
            placeholder="Clinical Protocol Review"
            required
            type="text"
            value={projectName}
          />
        </label>

        <label>
          Folder name
          <input
            autoComplete="off"
            disabled={creatingProject}
            onChange={(event) => {
              setSlugTouched(true);
              setProjectSlug(event.target.value);
            }}
            placeholder="clinical_protocol_review"
            type="text"
            value={selectedSlug}
          />
        </label>

        {!slugIsValid ? <p className="field-error">Use only letters, numbers, underscores, or hyphens.</p> : null}
        {createError ? <p className="field-error">{createError}</p> : null}

        <div className="project-create-actions">
          <button disabled={!canCreate} type="submit">
            {creatingProject ? "Building project..." : "Build new project"}
          </button>
        </div>
      </form>

      <div className="section-heading">
        <h2>Available projects</h2>
        <button onClick={onRefresh} type="button">
          Refresh
        </button>
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
            <span>{project.slug}</span>
            <small>{project.path}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
