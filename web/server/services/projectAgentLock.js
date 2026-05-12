export function createProjectAgentLock({ httpError }) {
  const activeProjectRuns = new Map();

  function projectKey(project) {
    return project.slug ?? project.path;
  }

  function acquire(project, label) {
    const key = projectKey(project);
    const activeLabel = activeProjectRuns.get(key);
    if (activeLabel) {
      throw httpError("This project already has an AI task in progress.", 409, "project_agent_already_running");
    }

    activeProjectRuns.set(key, label);
    return () => {
      if (activeProjectRuns.get(key) === label) {
        activeProjectRuns.delete(key);
      }
    };
  }

  return { acquire };
}
