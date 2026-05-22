import { useCallback, useEffect, useRef, useState } from "react";
import { artifactsApi, type ArtifactSpec, type ArtifactSpecDetail } from "../../data/artifactsApi";
import { useRouteContext } from "../../app/contexts/RouteContext";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import "./artifacts.css";

type Tab = "spec" | "preview";

export function ArtifactsView({ projectSlug }: { projectSlug: string }) {
  const route = useRouteContext();

  // The selected artifact slug comes from the URL (deep link)
  const selectedSlug = route.filePath || null;

  const [artifacts, setArtifacts] = useState<ArtifactSpec[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<ArtifactSpecDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("spec");
  const [building, setBuilding] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noopOpenFile = useCallback(() => {}, []);

  const selectedArtifact = artifacts.find((a) => a.slug === selectedSlug) ?? null;
  const isBuilt = selectedArtifact?.status === "built";

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
    void refreshList();
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
      route.navigateTo("artifacts", null);
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

  if (!selectedSlug) {
    return (
      <div className="artifacts-view">
        <div className="artifacts-placeholder">
          <p>Select an artifact from the sidebar or create a new one.</p>
        </div>
      </div>
    );
  }

  if (!selectedSpec) {
    return (
      <div className="artifacts-view">
        <div className="artifacts-placeholder">
          <p>Loading artifact…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="artifacts-view">
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
              <dd>
                <select
                  className="artifacts-meta-select"
                  value={String(selectedSpec.frontmatter.lifecycle ?? "manual")}
                  onChange={(e) => {
                    const updated = { ...selectedSpec, frontmatter: { ...selectedSpec.frontmatter, lifecycle: e.target.value } };
                    setSelectedSpec(updated);
                    void artifactsApi.update(projectSlug, selectedSlug, updated.frontmatter, editBody);
                  }}
                >
                  <option value="manual">manual</option>
                  <option value="on_build">on_build</option>
                </select>
              </dd>
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
          <MarkdownEditor
            baselineValue={selectedSpec.body}
            editable={true}
            files={[]}
            projectSlug={projectSlug}
            savedDiff={null}
            selectedPath={`artifact:${selectedSlug}`}
            value={editBody}
            onChange={setEditBody}
            onNotice={(msg) => flash(msg)}
            onOpenFile={noopOpenFile}
            onSave={() => void handleSave()}
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
    </div>
  );
}
