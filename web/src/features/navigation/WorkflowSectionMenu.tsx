import React, { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { defineNavTarget } from "../../navigation/navigationModel";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { type View } from "../../navigation/views";
import type { ArtifactSpec, FileChangeStatus, ProjectFile } from "../../contracts/api";
import { FileTreeNav } from "./FileTreeNav";
import { artifactsApi } from "../../data/artifactsApi";
import { filesApi } from "../../data/filesApi";

/* ─── Knowledgebase Section Body ───────────────────────────────── */

export function KnowledgebaseSectionBody({
  currentView,
  expandedSubsections,
  fileChanges,
  humanInputEmptyDirectories,
  humanInputFiles,
  loading,
  onCreateFolder,
  onCreateTextFile,
  onDeleteFolder,
  onDeleteHumanInputFile,
  onDeleteProjectFile,
  onDeleteProjectFolder,
  onMoveFile,
  onUploadFiles,
  onOpenFile,
  onOpenView,
  selectedPath,
  sourceFiles,
  toggleSubsection,
  wikiFiles,
  projectSlug,
  projectFiles,
}: {
  currentView: View;
  expandedSubsections: Set<string>;
  fileChanges: Record<string, FileChangeStatus>;
  humanInputEmptyDirectories?: Array<{ path: string; name: string }>;
  humanInputFiles: ProjectFile[];
  loading: boolean;
  onCreateFolder?: (name: string) => void;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onDeleteFolder?: (folder: string) => void;
  onDeleteHumanInputFile?: (path: string) => void;
  onDeleteProjectFile?: (path: string) => void;
  onDeleteProjectFolder?: (folder: string) => void;
  onMoveFile?: (sourcePath: string, targetFolder: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
  onOpenFile: (path: string) => void;
  onOpenView: (view: View, path?: string | null) => void;
  selectedPath: string | null;
  sourceFiles: ProjectFile[];
  toggleSubsection: (id: string, event?: React.MouseEvent<HTMLButtonElement>) => void;
  wikiFiles: ProjectFile[];
  projectSlug: string;
  projectFiles: ProjectFile[];
}) {
  // ── Load repository modal state ──────────────────────────────
  const [isLoadRepoOpen, setIsLoadRepoOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");
  const [loadRepoError, setLoadRepoError] = useState("");
  const [loadRepoSaving, setLoadRepoSaving] = useState(false);

  // ── Local folder browsing state ──────────────────────────────
  const [browsingDirs, setBrowsingDirs] = useState<Array<{ name: string; path: string }>>([]);
  const [browsingParentPath, setBrowsingParentPath] = useState<string | null>(null);
  const [currentBrowsedPath, setCurrentBrowsedPath] = useState<string>("");

  // ── External repositories loaded list ────────────────────────
  const [externalRepos, setExternalRepos] = useState<Array<{ name: string; path: string }>>([]);

  const loadExternalRepos = useCallback(async () => {
    try {
      const res = await filesApi.file(projectSlug, ".kiss_ai/external_repos.json");
      const parsed = JSON.parse(res.content);
      if (Array.isArray(parsed)) {
        setExternalRepos(parsed);
      } else {
        setExternalRepos([]);
      }
    } catch (err) {
      setExternalRepos([]);
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadExternalRepos();
  }, [loadExternalRepos, projectFiles]);

  async function loadDirectory(path?: string) {
    try {
      const res = await filesApi.browseLocalDirs(projectSlug, path);
      setBrowsingDirs(res.directories);
      setBrowsingParentPath(res.parentPath);
      setCurrentBrowsedPath(res.currentPath);
      setNewRepoPath(res.currentPath);
    } catch (err: any) {
      console.error(err);
      setLoadRepoError(`Cannot browse directory: ${err.message || "Unknown error"}`);
    }
  }

  function handleLoadRepo() {
    setIsLoadRepoOpen(true);
    setNewRepoName("");
    setNewRepoPath("");
    setLoadRepoError("");
    // Trigger initial browse starting from /opt
    void loadDirectory("/opt");
  }

  async function handleLoadRepoSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = newRepoName.trim();
    const pathInput = newRepoPath.trim();
    if (!name) {
      setLoadRepoError("Repository name is required.");
      return;
    }
    if (!pathInput) {
      setLoadRepoError("Repository path is required.");
      return;
    }

    setLoadRepoError("");
    setLoadRepoSaving(true);
    try {
      let currentRepos: any[] = [];
      let hash = "";
      try {
        const fileRes = await filesApi.file(projectSlug, ".kiss_ai/external_repos.json");
        currentRepos = JSON.parse(fileRes.content);
        hash = fileRes.contentHash;
      } catch (err) {
        // Doesn't exist or is invalid, start clean
        hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 hash of empty string
      }

      if (!Array.isArray(currentRepos)) {
        if (currentRepos && typeof currentRepos === "object") {
          currentRepos = Object.entries(currentRepos).map(([n, p]) => ({ name: n, path: p }));
        } else {
          currentRepos = [];
        }
      }

      const existingIdx = currentRepos.findIndex((r: any) => r.name.toLowerCase() === name.toLowerCase());
      if (existingIdx >= 0) {
        currentRepos[existingIdx].path = pathInput;
      } else {
        currentRepos.push({ name: name, path: pathInput });
      }

      await filesApi.saveFile(
        projectSlug,
        ".kiss_ai/external_repos.json",
        JSON.stringify(currentRepos, null, 2),
        hash
      );

      setIsLoadRepoOpen(false);
      setNewRepoName("");
      setNewRepoPath("");
      
      void loadExternalRepos();
    } catch (err: any) {
      console.error(err);
      setLoadRepoError(`Failed to load repository: ${err.message || "Unknown error"}`);
    } finally {
      setLoadRepoSaving(false);
    }
  }

  return (
    <>
      {/* ── 1) Project Definition ──────────────────────────── */}
      <div className="nav-subsection">
        <button
          className={`nav-subsection-trigger${currentView === "requirements" ? " active" : ""}`}
          onClick={() => onOpenView(defineNavTarget.view, defineNavTarget.path)}
          type="button"
        >
          <span className="nav-section-label"><strong>1) Project Definition</strong></span>
        </button>
      </div>

      {/* ── 2) Source Data ─────────────────────────────────── */}
      <div className="nav-subsection">
        <button
          className={`nav-subsection-trigger${currentView === "inputs" ? " active" : ""}`}
          onClick={(event) => toggleSubsection("source-data", event)}
          type="button"
          aria-expanded={expandedSubsections.has("source-data")}
        >
          <span className="nav-section-label"><strong>2) Source Data</strong></span>
          <b aria-hidden="true">{expandedSubsections.has("source-data") ? "-" : "+"}</b>
        </button>

        {expandedSubsections.has("source-data") ? (
          <div className="nav-section-body">
            <button
              className={
                currentView === "inputs" && !selectedPath
                  ? "simple-nav-item simple-nav-subheader active"
                  : "simple-nav-item simple-nav-subheader"
              }
              onClick={() => onOpenView("inputs")}
              type="button"
            >
              <span>Human Sources</span>
            </button>

            {onCreateFolder ? (
              <HumanInputActions onCreateFolder={onCreateFolder} onCreateTextFile={onCreateTextFile} onUploadFiles={onUploadFiles} />
            ) : null}

            <FileTreeBlock
              emptyLabel="No human-acquired files yet."
              emptyDirectories={humanInputEmptyDirectories}
              fileChanges={fileChanges}
              files={humanInputFiles}
              loading={loading && currentView === "inputs"}
              onCreateTextFile={onCreateTextFile}
              onCreateFolder={onCreateFolder}
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
              fileChanges={fileChanges}
              files={sourceFiles}
              loading={loading && currentView === "inputs"}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 22%, var(--color-border))" }}>
              <span style={{ fontWeight: 800, fontSize: "0.84rem", color: "var(--color-primary)", padding: "5px 0 3px" }}>
                External Repos
              </span>
              <button
                className="human-input-action-button"
                onClick={handleLoadRepo}
                type="button"
                style={{ width: "auto", padding: "2px 8px", margin: 0, fontSize: "0.72rem", borderStyle: "dashed" }}
              >
                📁 Load
              </button>
            </div>
            {externalRepos.length === 0 ? (
              <p className="simple-nav-state">No repositories loaded.</p>
            ) : (
              <div className="simple-nav-children" style={{ marginTop: "4px", display: "grid", gap: "4px" }}>
                {externalRepos.map((repo) => (
                  <div
                    key={repo.name}
                    style={{
                      display: "grid",
                      gap: "2px",
                      padding: "4px 8px",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      background: "var(--color-surface)",
                      color: "var(--color-primary)",
                      fontSize: "0.8rem",
                      lineHeight: "1.18",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{repo.name}</span>
                    <small style={{ wordBreak: "break-all", fontSize: "0.68rem", color: "var(--color-secondary)" }}>
                      {repo.path}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 3) Wiki ───────────────────────────────────────── */}
      <div className="nav-subsection">
        <button
          className={`nav-subsection-trigger${currentView === "outputs" ? " active" : ""}`}
          onClick={(event) => toggleSubsection("wiki", event)}
          type="button"
          aria-expanded={expandedSubsections.has("wiki")}
        >
          <span className="nav-section-label"><strong>3) Wiki</strong></span>
          <b aria-hidden="true">{expandedSubsections.has("wiki") ? "-" : "+"}</b>
        </button>

        {expandedSubsections.has("wiki") ? (
          <div className="nav-section-body">
            <FileTreeBlock
              emptyLabel="No wiki pages yet. Run a knowledge build first."
              fileChanges={fileChanges}
              files={wikiFiles}
              loading={loading && currentView === "outputs"}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />
          </div>
        ) : null}
      </div>

      {isLoadRepoOpen ? (
        <div className="kiss-ai-update-modal-backdrop" role="presentation" onClick={() => setIsLoadRepoOpen(false)}>
          <section
            className="kiss-ai-update-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiss-ai-load-repo-title"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(460px, 100%)", backdropFilter: "blur(8px)" }}
          >
            <div className="kiss-ai-update-modal-header">
              <div>
                <span className="eyebrow">Load External Repository</span>
                <h2 id="kiss-ai-load-repo-title">Load Repository</h2>
              </div>
              <button
                className="kiss-ai-update-close"
                onClick={() => {
                  setIsLoadRepoOpen(false);
                  setLoadRepoError("");
                }}
                type="button"
                aria-label="Close load repository dialog"
              >
                x
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              Provide a name and local absolute path to an external git repository to use it as a read-only source.
            </p>

            {loadRepoError ? (
              <div className="project-create-error" role="alert" style={{ marginBottom: "0.5rem" }}>
                <p>{loadRepoError}</p>
              </div>
            ) : null}

            <form className="settings-api-key-form" onSubmit={handleLoadRepoSubmit}>
              <label>
                <span>REPOSITORY NAME</span>
                <input
                  autoComplete="off"
                  disabled={loadRepoSaving}
                  onChange={(event) => setNewRepoName(event.target.value)}
                  placeholder="e.g. allhai-core"
                  type="text"
                  value={newRepoName}
                  required
                />
              </label>

              <label style={{ marginTop: "0.5rem" }}>
                <span>ABSOLUTE PATH</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    autoComplete="off"
                    disabled={loadRepoSaving}
                    onChange={(event) => setNewRepoPath(event.target.value)}
                    placeholder="e.g. /opt/all_hail_ai/omnibox/tenants/core"
                    type="text"
                    value={newRepoPath}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => void loadDirectory(newRepoPath)}
                    disabled={loadRepoSaving}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-background)",
                      color: "var(--color-primary)",
                      cursor: "pointer",
                      fontSize: "0.78rem"
                    }}
                  >
                    Go
                  </button>
                </div>
              </label>

              <div style={{ marginTop: "0.8rem", border: "1px solid var(--color-border)", borderRadius: "10px", padding: 8, background: "rgba(255,255,255,0.02)" }}>
                <span className="eyebrow" style={{ fontSize: "0.68rem", display: "block", marginBottom: 6 }}>
                  Folder Browser: <code style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--color-primary)" }}>{currentBrowsedPath || "/"}</code>
                </span>
                <div style={{ maxHeight: "140px", overflowY: "auto", display: "grid", gap: 4, paddingRight: 4 }}>
                  {browsingParentPath && browsingParentPath !== currentBrowsedPath ? (
                    <button
                      type="button"
                      onClick={() => void loadDirectory(browsingParentPath)}
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-accent)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        fontWeight: 700
                      }}
                    >
                      📁 .. (Up to Parent Folder)
                    </button>
                  ) : null}
                  {browsingDirs.map((dir) => (
                    <button
                      key={dir.path}
                      type="button"
                      onClick={() => void loadDirectory(dir.path)}
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-primary)",
                        cursor: "pointer",
                        fontSize: "0.8125rem"
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "color-mix(in srgb, var(--color-border) 40%, transparent)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      📁 {dir.name}
                    </button>
                  ))}
                  {browsingDirs.length === 0 ? (
                    <span style={{ fontSize: "0.78rem", color: "var(--color-secondary)", padding: "4px 8px" }}>
                      No subdirectories found
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                disabled={loadRepoSaving || !newRepoName.trim() || !newRepoPath.trim()}
                type="submit"
                style={{ marginTop: "1rem" }}
              >
                {loadRepoSaving ? "Loading..." : "Load Repo"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

/* ─── Outputs Section Body ─────────────────────────────────────── */

export function OutputsSectionBody({
  currentView,
  expandedSubsections,
  fileChanges,
  loading,
  onDeleteProjectFile,
  onDeleteProjectFolder,
  onNewArtifactViaChat,
  onOpenFile,
  onOpenView,
  projectSlug,
  rebuildRunning,
  reportFiles,
  selectedArtifactSlug,
  selectedPath,
  toggleSubsection,
}: {
  currentView: View;
  expandedSubsections: Set<string>;
  fileChanges: Record<string, FileChangeStatus>;
  loading: boolean;
  onDeleteProjectFile?: (path: string) => void;
  onDeleteProjectFolder?: (folder: string) => void;
  onNewArtifactViaChat?: () => void;
  onOpenFile: (path: string) => void;
  onOpenView: (view: View, path?: string | null) => void;
  projectSlug: string;
  rebuildRunning: boolean;
  reportFiles: ProjectFile[];
  selectedArtifactSlug: string | null;
  selectedPath: string | null;
  toggleSubsection: (id: string, event?: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      {/* ── Reports ───────────────────────────────────────── */}
      <div className="nav-subsection">
        <button
          className={`nav-subsection-trigger${currentView === "reports" ? " active" : ""}`}
          onClick={(event) => toggleSubsection("reports", event)}
          type="button"
          aria-expanded={expandedSubsections.has("reports")}
        >
          <span className="nav-section-label"><strong>Reports</strong></span>
          <b aria-hidden="true">{expandedSubsections.has("reports") ? "-" : "+"}</b>
        </button>

        {expandedSubsections.has("reports") ? (
          <div className="nav-section-body">
            <div className="human-input-actions" style={{ padding: "0 4px 4px" }}>
              <button
                className="human-input-action-button"
                onClick={() => onOpenView("reports")}
                type="button"
                style={{ justifyContent: "center" }}
              >
                <span>Build Reports</span>
              </button>
            </div>
            <FileTreeBlock
              emptyLabel="No reports yet. Create one with the chat agent."
              fileChanges={fileChanges}
              files={reportFiles}
              loading={loading && currentView === "reports"}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />
          </div>
        ) : null}
      </div>

      {/* ── Artifacts ─────────────────────────────────────── */}
      <div className="nav-subsection">
        <button
          className={`nav-subsection-trigger${currentView === "artifacts" ? " active" : ""}`}
          onClick={(event) => toggleSubsection("artifacts", event)}
          type="button"
          aria-expanded={expandedSubsections.has("artifacts")}
        >
          <span className="nav-section-label"><strong>Artifacts</strong></span>
          <b aria-hidden="true">{expandedSubsections.has("artifacts") ? "-" : "+"}</b>
        </button>

        {expandedSubsections.has("artifacts") ? (
          <div className="nav-section-body">
            <div className="human-input-actions" style={{ padding: "0 4px 4px" }}>
              <button
                className="human-input-action-button"
                onClick={() => onOpenView("artifacts")}
                type="button"
                style={{ justifyContent: "center" }}
              >
                <span>Build Artifacts</span>
              </button>
            </div>
            <ArtifactNavSection
              projectSlug={projectSlug}
              selectedArtifactSlug={selectedArtifactSlug}
              isActive={currentView === "artifacts"}
              rebuildRunning={rebuildRunning}
              onNewArtifactViaChat={onNewArtifactViaChat}
              onOpenView={onOpenView}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ─── Artifact Navigation Section ──────────────────────────────── */

function ArtifactNavSection({
  projectSlug,
  selectedArtifactSlug,
  isActive,
  rebuildRunning,
  onNewArtifactViaChat,
  onOpenView,
}: {
  projectSlug: string;
  selectedArtifactSlug: string | null;
  isActive: boolean;
  rebuildRunning: boolean;
  onNewArtifactViaChat?: () => void;
  onOpenView: (view: View, path?: string | null) => void;
}) {
  const [artifacts, setArtifacts] = useState<ArtifactSpec[]>([]);
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

  return (
    <>
      {artifacts.length === 0 ? (
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
            onClick={onNewArtifactViaChat}
            type="button"
            title="Create a new artifact via AI chat"
          >
            <span className="human-input-action-icon" aria-hidden="true">+</span>
            <span>New artifact</span>
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Human Input Actions ──────────────────────────────────────── */

export function HumanInputActions({
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
          <span className="human-input-action-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3A1 1 0 002 4.5z"/><line x1="8" y1="7.5" x2="8" y2="11.5"/><line x1="6" y1="9.5" x2="10" y2="9.5"/></svg></span>
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
            <span className="human-input-action-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><polyline points="9,2 9,6 13,6"/><line x1="8" y1="8" x2="8" y2="12"/><line x1="6" y1="10" x2="10" y2="10"/></svg></span>
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
            <span className="human-input-action-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="12" x2="8" y2="3"/><polyline points="4,6 8,2 12,6"/><line x1="3" y1="14" x2="13" y2="14"/></svg></span>
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

/* ─── File Tree Block ──────────────────────────────────────────── */

export function FileTreeBlock({
  emptyLabel,
  emptyDirectories,
  fileChanges,
  files,
  loading,
  selectedPath,
  onCreateTextFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onUploadFiles,
  onOpenFile,
}: {
  emptyLabel: string;
  emptyDirectories?: Array<{ path: string; name: string }>;
  fileChanges?: Record<string, FileChangeStatus>;
  files: ProjectFile[];
  loading: boolean;
  selectedPath: string | null;
  onCreateTextFile?: (name: string, folder?: string) => void;
  onCreateFolder?: (name: string, folder?: string) => void;
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
      fileChanges={fileChanges}
      files={files}
      emptyDirectories={emptyDirectories}
      selectedPath={selectedPath}
      onCreateTextFile={onCreateTextFile}
      onCreateFolder={onCreateFolder}
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
