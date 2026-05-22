import { useCallback, useEffect, useRef, useState } from "react";
import { artifactsApi, type ArtifactSpec, type ArtifactSpecDetail } from "../../data/artifactsApi";
import { useRouteContext } from "../../app/contexts/RouteContext";
import "./artifacts.css";

type Tab = "spec" | "preview";

export function ArtifactsView({ projectSlug }: { projectSlug: string }) {
  const route = useRouteContext();

  // The selected artifact slug comes from the URL (deep link)
  const selectedSlug = route.filePath || null;

  const [artifacts, setArtifacts] = useState<ArtifactSpec[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<ArtifactSpecDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("spec");
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Incremented after each build to force iframe to reload
  const [previewKey, setPreviewKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedArtifact = artifacts.find((a) => a.slug === selectedSlug) ?? null;
  const isBuilt = selectedArtifact?.status === "built";

  function selectArtifact(slug: string | null) {
    route.navigateTo("artifacts", slug);
    setActiveTab("spec");
  }

  const refreshList = useCallback(async () => {
    try {
      const result = await artifactsApi.list(projectSlug);
      setArtifacts(result.artifacts);
      return result.artifacts;
    } catch {
      setArtifacts([]);
      return [];
    }
  }, [projectSlug]);

  useEffect(() => {
    setLoading(true);
    refreshList().finally(() => setLoading(false));
  }, [refreshList]);

  // Load spec detail when selectedSlug changes
  useEffect(() => {
    if (!selectedSlug) {
      setSelectedSpec(null);
      setEditBody("");
      return;
    }
    artifactsApi.read(projectSlug, selectedSlug).then((spec) => {
      setSelectedSpec(spec);
      setEditBody(spec.body);
    }).catch(() => {
      setSelectedSpec(null);
      setEditBody("");
    });
  }, [projectSlug, selectedSlug]);

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const result = await artifactsApi.create(projectSlug, trimmed, "## Goal\n\nDescribe the goal of this artifact...\n");
      await refreshList();
      selectArtifact(result.slug);
      setNewName("");
      flash("Created");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedSlug || !selectedSpec) return;
    setSaving(true);
    try {
      await artifactsApi.update(projectSlug, selectedSlug, selectedSpec.frontmatter, editBody);
      flash("Saved");
      const updated = await artifactsApi.read(projectSlug, selectedSlug);
      setSelectedSpec(updated);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleBuild() {
    if (!selectedSlug) return;
    setBuilding(true);
    try {
      // Auto-save unsaved edits before building
      if (selectedSpec && editBody !== selectedSpec.body) {
        await artifactsApi.update(projectSlug, selectedSlug, selectedSpec.frontmatter, editBody);
        const updated = await artifactsApi.read(projectSlug, selectedSlug);
        setSelectedSpec(updated);
        flash("Saved & building — agent is generating HTML…");
      } else {
        flash("Build started — agent is generating HTML…");
      }

      await artifactsApi.build(projectSlug, selectedSlug);

      // Poll for build completion every 5 seconds
      if (pollRef.current) clearInterval(pollRef.current);
      const slugAtBuildTime = selectedSlug;
      pollRef.current = setInterval(async () => {
        const updatedList = await refreshList();
        const updated = updatedList.find((a) => a.slug === slugAtBuildTime);
        if (updated?.status === "built") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setBuilding(false);
          setPreviewKey((k) => k + 1);
          setActiveTab("preview");
          flash("Build complete ✓");
        }
      }, 5000);
    } catch (error) {
      setBuilding(false);
      flash(error instanceof Error ? error.message : "Build failed");
    }
  }

  async function handleDelete() {
    if (!selectedSlug) return;
    if (!confirm(`Delete artifact "${selectedSlug}"?`)) return;
    try {
      await artifactsApi.delete(projectSlug, selectedSlug);
      selectArtifact(null);
      await refreshList();
      flash("Deleted");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to delete");
    }
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 5000);
  }

  const hasChanges = selectedSpec && editBody !== selectedSpec.body;

  return (
    <div className="artifacts-view">
      {/* Left panel: artifact list */}
      <div className="artifacts-list-panel">
        <div className="artifacts-list-header">
          <h3>Artifacts</h3>
        </div>

        {loading ? (
          <p className="artifacts-empty">Loading…</p>
        ) : artifacts.length === 0 ? (
          <p className="artifacts-empty">No artifact specs yet.</p>
        ) : (
          <ul className="artifacts-list">
            {artifacts.map((artifact) => (
              <li key={artifact.slug}>
                <button
                  className={`artifact-item ${selectedSlug === artifact.slug ? "active" : ""}`}
                  onClick={() => selectArtifact(artifact.slug)}
                  type="button"
                >
                  <span className="artifact-item-name">{artifact.name}</span>
                  <span className="artifact-item-meta">
                    <span className={`artifact-status artifact-status-${artifact.status}`}>
                      {artifact.status === "built" ? "●" : "○"}
                    </span>
                    <span className="artifact-lifecycle">{artifact.lifecycle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="artifacts-create-form">
          <input
            className="artifacts-create-input"
            type="text"
            placeholder="New artifact name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            maxLength={120}
          />
          <button
            className="artifacts-create-button"
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
            type="button"
          >
            + New
          </button>
        </div>
      </div>

      {/* Right panel: editor / preview */}
      <div className="artifacts-main-panel">
        {!selectedSlug || !selectedSpec ? (
          <div className="artifacts-placeholder">
            {selectedSlug && !selectedSpec ? (
              <p>Loading artifact…</p>
            ) : (
              <p>Select an artifact from the list or create a new one.</p>
            )}
          </div>
        ) : (
          <>
            <div className="artifacts-toolbar">
              <div className="artifacts-tabs">
                <button
                  className={`artifacts-tab ${activeTab === "spec" ? "active" : ""}`}
                  onClick={() => setActiveTab("spec")}
                  type="button"
                >
                  Spec
                </button>
                <button
                  className={`artifacts-tab ${activeTab === "preview" ? "active" : ""}`}
                  onClick={() => setActiveTab("preview")}
                  disabled={!isBuilt && !building}
                  title={!isBuilt && !building ? "Build the artifact first to see a preview" : undefined}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <div className="artifacts-actions">
                {notice ? <span className="artifacts-notice">{notice}</span> : null}
                {activeTab === "spec" && hasChanges ? (
                  <button
                    className="artifacts-action-btn artifacts-save-btn"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    type="button"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                ) : null}
                <button
                  className="artifacts-action-btn artifacts-build-btn"
                  disabled={building}
                  onClick={() => void handleBuild()}
                  type="button"
                >
                  {building ? "Building…" : "Build"}
                </button>
                <button
                  className="artifacts-action-btn artifacts-delete-btn"
                  onClick={() => void handleDelete()}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>

            {activeTab === "spec" ? (
              <div className="artifacts-spec-editor">
                <div className="artifacts-spec-meta">
                  <dl className="artifacts-meta-grid">
                    <dt>Name</dt>
                    <dd>{String(selectedSpec.frontmatter.name ?? selectedSpec.slug)}</dd>
                    <dt>Format</dt>
                    <dd>{String(selectedSpec.frontmatter.format ?? "html")}</dd>
                    <dt>Lifecycle</dt>
                    <dd>{String(selectedSpec.frontmatter.lifecycle ?? "manual")}</dd>
                    <dt>Sources</dt>
                    <dd>
                      {Array.isArray(selectedSpec.frontmatter.sources)
                        ? (selectedSpec.frontmatter.sources as string[]).join(", ")
                        : "none"}
                    </dd>
                    {selectedArtifact?.lastBuilt ? (
                      <>
                        <dt>Last Built</dt>
                        <dd>{new Date(selectedArtifact.lastBuilt).toLocaleString()}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
                <label className="artifacts-body-label">
                  Spec body (goal, content guidance, visualizations)
                </label>
                <textarea
                  className="artifacts-body-editor"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="artifacts-preview-container">
                {building ? (
                  <div className="artifacts-building-overlay">
                    <div className="artifacts-building-spinner" />
                    <p>Agent is generating the HTML artifact…</p>
                    <p className="artifacts-building-hint">This may take a minute. The preview will load automatically when ready.</p>
                  </div>
                ) : isBuilt ? (
                  <iframe
                    key={previewKey}
                    className="artifacts-preview-iframe"
                    src={artifactsApi.previewUrl(projectSlug, selectedSlug)}
                    title={`Preview: ${selectedSpec.frontmatter.name ?? selectedSlug}`}
                    sandbox="allow-scripts"
                  />
                ) : (
                  <div className="artifacts-placeholder">
                    <p>This artifact hasn't been built yet. Click <strong>Build</strong> to generate it.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
