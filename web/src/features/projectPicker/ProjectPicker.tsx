import type { ProjectSummary } from "../../api";

export function ProjectPicker({
  error,
  projects,
  projectsRoot,
  onRefresh,
  onSelect,
}: {
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onRefresh: () => void;
  onSelect: (projectSlug: string) => void;
}) {
  return (
    <section className="project-picker">
      <div className="project-picker-header">
        <span className="eyebrow">kiss_ai projects</span>
        <h1>Select a project</h1>
        <p>Choose an existing project under the projects folder to open the same workspace tools used by this lab.</p>
        {projectsRoot ? <code>{projectsRoot}</code> : null}
      </div>

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
