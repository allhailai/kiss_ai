import { useState } from "react";
import type { FormEvent } from "react";
import type { KissAiUpdateCheckResponse, ProjectSummary, SystemSettingsResponse } from "../../contracts/api";
import { errorMessage } from "../../domain/errors";

const projectNameTakenMessage = "That project name is taken. Please use another one.";

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
  onCheckLatest,
  onCloseUpdateModal,
  onDownloadLatest,
  onOpenSettings,
  onCloseSettings,
  onSelect,
  onSaveCursorApiKey,
  updateCheck,
  updateCheckLoading,
  updateDownloadLoading,
  updateError,
  updateModalOpen,
  settings,
  settingsError,
  settingsLoading,
  settingsMessage,
  settingsModalOpen,
  settingsSaving,
}: {
  creatingProject: boolean;
  error: string;
  projects: ProjectSummary[];
  projectsRoot: string;
  onCreateProject: (name: string, slug?: string) => Promise<void>;
  onCheckLatest: () => void;
  onCloseUpdateModal: () => void;
  onDownloadLatest: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSelect: (projectSlug: string) => void;
  onSaveCursorApiKey: (cursorApiKey: string) => Promise<void>;
  updateCheck: KissAiUpdateCheckResponse | null;
  updateCheckLoading: boolean;
  updateDownloadLoading: boolean;
  updateError: string;
  updateModalOpen: boolean;
  settings: SystemSettingsResponse | null;
  settingsError: string;
  settingsLoading: boolean;
  settingsMessage: string;
  settingsModalOpen: boolean;
  settingsSaving: boolean;
}) {
  const [projectName, setProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const [cursorApiKey, setCursorApiKey] = useState("");
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
  const submitCursorApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCursorApiKey = cursorApiKey.trim();
    if (!nextCursorApiKey || settingsSaving) return;

    await onSaveCursorApiKey(nextCursorApiKey);
    setCursorApiKey("");
  };

  return (
    <section className="project-picker">
      <div className="project-picker-header">
        <div className="project-picker-title">
          <h1>Projects</h1>
          {projectsRoot ? <code>{projectsRoot}</code> : null}
        </div>
        <div className="project-picker-update">
          <button disabled={settingsLoading || settingsSaving} onClick={onOpenSettings} type="button">
            Settings
          </button>
          <button disabled={updateCheckLoading || updateDownloadLoading} onClick={onCheckLatest} type="button">
            {updateCheckLoading ? "Checking..." : "Get Latest KISS AI Version"}
          </button>
        </div>
      </div>

      {updateModalOpen ? (
        <div className="kiss-ai-update-modal-backdrop" role="presentation">
          <section className="kiss-ai-update-modal" role="dialog" aria-modal="true" aria-labelledby="kiss-ai-update-title">
            <div className="kiss-ai-update-modal-header">
              <div>
                <span className="eyebrow">KISS AI version</span>
                <h2 id="kiss-ai-update-title">Get Latest KISS AI Version</h2>
              </div>
              <button className="kiss-ai-update-close" onClick={onCloseUpdateModal} type="button" aria-label="Close KISS AI update dialog">
                x
              </button>
            </div>

            {updateCheckLoading ? <p>Checking the latest KISS AI version...</p> : null}

            {updateError ? (
              <div className="warning-callout" role="alert">
                <strong>Could not check for updates</strong>
                <p>{updateError}</p>
              </div>
            ) : null}

            {!updateCheckLoading && updateCheck?.status === "up_to_date" ? <p>KISS AI is up to date. No new version.</p> : null}

            {!updateCheckLoading && updateCheck?.updateAvailable ? (
              <div className="kiss-ai-update-available">
                <p>
                  A new KISS AI version is available for download. Current version: <code>{updateCheck.localRevision}</code>. Latest version:{" "}
                  <code>{updateCheck.remoteRevision}</code>.
                </p>
                <button disabled={updateDownloadLoading} onClick={onDownloadLatest} type="button">
                  {updateDownloadLoading ? "Downloading..." : "Download Latest Version"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {settingsModalOpen ? (
        <div className="kiss-ai-update-modal-backdrop" role="presentation">
          <section className="kiss-ai-update-modal" role="dialog" aria-modal="true" aria-labelledby="kiss-ai-settings-title">
            <div className="kiss-ai-update-modal-header">
              <div>
                <span className="eyebrow">Settings</span>
                <h2 id="kiss-ai-settings-title">KISS AI Settings</h2>
              </div>
              <button className="kiss-ai-update-close" onClick={onCloseSettings} type="button" aria-label="Close settings dialog">
                x
              </button>
            </div>

            {settingsLoading ? <p>Checking Cursor API key status...</p> : null}
            {!settingsLoading && settings?.cursorApiKeyAvailable ? <p>Cursor API Key Found</p> : null}
            {!settingsLoading && settings && !settings.cursorApiKeyAvailable ? <p>No Cursor API key found.</p> : null}

            {settingsError ? (
              <div className="warning-callout" role="alert">
                <strong>Settings error</strong>
                <p>{settingsError}</p>
              </div>
            ) : null}

            {settingsMessage ? (
              <div className="settings-success-callout" role="status">
                <p>{settingsMessage}</p>
              </div>
            ) : null}

            <form className="settings-api-key-form" onSubmit={submitCursorApiKey}>
              <label>
                <span>CURSOR_API_KEY</span>
                <input
                  autoComplete="off"
                  disabled={settingsSaving}
                  onChange={(event) => setCursorApiKey(event.target.value)}
                  placeholder="Paste your Cursor API key"
                  type="password"
                  value={cursorApiKey}
                />
              </label>
              <button disabled={settingsSaving || !cursorApiKey.trim()} type="submit">
                {settingsSaving ? "Saving..." : "Save API Key"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

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
            <span>{project.slug}</span>
            <small>{project.path}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
