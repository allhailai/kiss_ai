import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artifactsApi, type ArtifactSpec, type ArtifactSpecDetail, type AvailableSourceFile } from "../../data/artifactsApi";
import { useRouteContext } from "../../app/contexts/RouteContext";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { groupModelsByTier, modelDisplayName, modelTierLabels } from "../../domain/modelLabels";
import type { FileContent, RebuildModel } from "../../contracts/api";
import "./artifacts.css";

type Tab = "spec" | "preview";

export function ArtifactsView({ models, projectSlug, selectedBuildModelId, selectedFileContent }: { models: RebuildModel[]; projectSlug: string; selectedBuildModelId: string; selectedFileContent: FileContent | null }) {
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
  const popoutRef = useRef<Window | null>(null);
  const noopOpenFile = useCallback(() => {}, []);

  const selectedArtifact = artifacts.find((a) => a.slug === selectedSlug) ?? null;
  const isBuilt = selectedArtifact?.status === "built";

  // Default to preview tab when selecting an artifact that's already built
  const prevSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSlug !== prevSlugRef.current) {
      prevSlugRef.current = selectedSlug;
      if (selectedArtifact?.status === "built") {
        setActiveTab("preview");
      } else {
        setActiveTab("spec");
      }
    }
  }, [selectedSlug, selectedArtifact?.status]);
  const tieredModels = useMemo(() => groupModelsByTier(models), [models]);

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
      // Default modelId to project's current build model if not set
      if (!spec.frontmatter.modelId && selectedBuildModelId) {
        spec = { ...spec, frontmatter: { ...spec.frontmatter, modelId: selectedBuildModelId } };
        void artifactsApi.update(projectSlug, selectedSlug, spec.frontmatter, spec.body);
      }
      setSelectedSpec(spec);
      setEditBody(spec.body);
    }).catch(() => {
      setSelectedSpec(null);
      setEditBody("");
    });
  }, [projectSlug, selectedSlug]);

  // Re-read spec when the underlying file changes (e.g. agent writes to it)
  const lastContentHashRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSlug || !selectedFileContent) return;
    const specPath = `artifacts/artifact_specs/${selectedSlug}.artifact.md`;
    if (selectedFileContent.path !== specPath) return;
    // Only reload when contentHash actually changes (not on initial load)
    if (lastContentHashRef.current !== null && selectedFileContent.contentHash !== lastContentHashRef.current) {
      artifactsApi.read(projectSlug, selectedSlug).then((spec) => {
        setSelectedSpec(spec);
        setEditBody(spec.body);
        flash("Spec updated by agent");
      }).catch(() => {});
    }
    lastContentHashRef.current = selectedFileContent.contentHash;
  }, [projectSlug, selectedSlug, selectedFileContent?.contentHash, selectedFileContent?.path]);

  // Clean up poll and popout ref on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      popoutRef.current = null;
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

      await artifactsApi.build(projectSlug, selectedSlug, String(selectedSpec?.frontmatter.modelId ?? ""));

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
          // Auto-refresh popped-out preview window
          try {
            if (popoutRef.current && !popoutRef.current.closed) {
              popoutRef.current.location.reload();
            }
          } catch { /* cross-origin or closed — ignore */ }
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
          {activeTab === "preview" && isBuilt ? (
            <button
              className="artifacts-tab artifacts-popout-btn"
              onClick={() => {
                const url = artifactsApi.previewUrl(projectSlug, selectedSlug);
                if (popoutRef.current && !popoutRef.current.closed) {
                  popoutRef.current.focus();
                } else {
                  popoutRef.current = window.open(url, `artifact-preview-${selectedSlug}`, "noopener");
                }
              }}
              type="button"
              title="Open preview in a new window"
            >
              ↗ Pop Out
            </button>
          ) : null}
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
              <dd>
                <input
                  className="artifacts-meta-input"
                  type="text"
                  value={String(selectedSpec.frontmatter.name ?? "")}
                  onChange={(e) => {
                    const updated = { ...selectedSpec, frontmatter: { ...selectedSpec.frontmatter, name: e.target.value } };
                    setSelectedSpec(updated);
                  }}
                  onBlur={() => {
                    void artifactsApi.update(projectSlug, selectedSlug, selectedSpec.frontmatter, editBody);
                  }}
                  placeholder={selectedSpec.slug}
                />
              </dd>
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
                  <option value="manual">manual — build only when you click Build</option>
                  <option value="on_build">on_build — auto-rebuild with each project build</option>
                </select>
                <small className="artifacts-meta-hint">
                  {String(selectedSpec.frontmatter.lifecycle ?? "manual") === "on_build"
                    ? "This artifact will be automatically rebuilt whenever the project runs a full build."
                    : "This artifact is only rebuilt when you manually click the Build button."}
                </small>
              </dd>
              <dt>Model</dt>
              <dd>
                <select
                  className="artifacts-meta-select"
                  disabled={building}
                  value={String(selectedSpec.frontmatter.modelId ?? "")}
                  onChange={(e) => {
                    const updated = { ...selectedSpec, frontmatter: { ...selectedSpec.frontmatter, modelId: e.target.value || null } };
                    setSelectedSpec(updated);
                    void artifactsApi.update(projectSlug, selectedSlug, updated.frontmatter, editBody);
                  }}
                >
                  {tieredModels.map(({ tier, models: tierModels }) => (
                    <optgroup key={tier} label={modelTierLabels[tier]}>
                      {tierModels.map((model) => (
                        <option key={model.id} value={model.id}>{modelDisplayName(model)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {selectedSpec.frontmatter.modelId && !models.some((m) => m.id === selectedSpec.frontmatter.modelId)
                  ? <small className="artifacts-model-obsolete">⚠ Model no longer available — select a new one</small>
                  : null}
              </dd>
              <dt>Context Hints</dt>
              <dd>
                <ArtifactContextHints
                  projectSlug={projectSlug}
                  sources={(Array.isArray(selectedSpec.frontmatter.sources) ? selectedSpec.frontmatter.sources : []) as string[]}
                  onChange={(newSources) => {
                    const updated = { ...selectedSpec, frontmatter: { ...selectedSpec.frontmatter, sources: newSources } };
                    setSelectedSpec(updated);
                    void artifactsApi.update(projectSlug, selectedSlug, updated.frontmatter, editBody);
                  }}
                />
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

/* ─── Context Hints (Sources) ────────────────────────────────── */

function ArtifactContextHints({
  projectSlug,
  sources,
  onChange,
}: {
  projectSlug: string;
  sources: string[];
  onChange: (sources: string[]) => void;
}) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [availableFiles, setAvailableFiles] = useState<AvailableSourceFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Load available files when suggest picker opens
  useEffect(() => {
    if (!suggestOpen) return;
    setLoadingFiles(true);
    artifactsApi.availableSources(projectSlug)
      .then((result) => setAvailableFiles(result.files))
      .catch(() => setAvailableFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [suggestOpen, projectSlug]);

  const filteredFiles = useMemo(() => {
    if (!suggestOpen) return [];
    const selectedPaths = new Set(sources);
    const query = suggestQuery.trim().toLowerCase();
    return availableFiles
      .filter((f) => !selectedPaths.has(f.relativePath))
      .filter((f) => {
        if (!query) return true;
        return `${f.relativePath} ${f.name} ${f.kind}`.toLowerCase().includes(query);
      });
  }, [availableFiles, sources, suggestOpen, suggestQuery]);

  function removeSource(value: string) {
    onChange(sources.filter((s) => s !== value));
  }

  function addSource(relativePath: string) {
    if (sources.includes(relativePath)) return;
    // Filter out legacy "all" if present
    const filtered = sources.filter((s) => s !== "all");
    onChange([...filtered, relativePath]);
    setSuggestOpen(false);
    setSuggestQuery("");
  }

  function sourceDisplayName(sourcePath: string): string {
    // Show basename without extension, humanized
    const base = sourcePath.split("/").pop() || sourcePath;
    return base.replace(/\.(md|html)$/, "").replace(/[_-]/g, " ");
  }

  function sourceKindBadge(sourcePath: string): string {
    if (sourcePath.startsWith("outputs_ai/wiki/")) return "wiki";
    if (sourcePath.startsWith("outputs_ai/reports/")) return "report";
    if (sourcePath.startsWith("outputs_ai/directed_outputs/")) return "directed";
    if (sourcePath.startsWith("artifacts/builds/")) return "artifact";
    return "";
  }

  return (
    <div className="artifacts-sources-editor">
      {sources.length > 0 ? (
        <div className="artifacts-sources-chips">
          {sources.map((source) => (
            <span className="artifacts-source-chip" key={source} title={source}>
              {sourceKindBadge(source) ? (
                <span className="artifacts-source-kind-badge">{sourceKindBadge(source)}</span>
              ) : null}
              <span>{sourceDisplayName(source)}</span>
              <button
                className="artifacts-source-chip-remove"
                onClick={() => removeSource(source)}
                type="button"
                title={`Remove ${source}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="artifacts-sources-auto">✨ auto — agent will discover relevant context at build time</span>
      )}
      <div className="artifacts-sources-suggest-row">
        <button
          className="artifacts-sources-suggest-btn"
          onClick={() => {
            setSuggestQuery("");
            setSuggestOpen((open) => !open);
          }}
          type="button"
        >
          {suggestOpen ? "Close" : "+ Suggest a file"}
        </button>
      </div>
      {suggestOpen ? (
        <div className="artifacts-sources-suggest-picker">
          <input
            className="artifacts-sources-suggest-input"
            type="search"
            placeholder="Search available files…"
            value={suggestQuery}
            onChange={(e) => setSuggestQuery(e.target.value)}
            autoFocus
          />
          <div className="artifacts-sources-suggest-results">
            {loadingFiles ? (
              <p className="artifacts-sources-suggest-empty">Loading…</p>
            ) : filteredFiles.length > 0 ? (
              filteredFiles.map((file) => (
                <button
                  className="artifacts-sources-suggest-item"
                  key={file.relativePath}
                  onClick={() => addSource(file.relativePath)}
                  title={file.relativePath}
                  type="button"
                >
                  <span className="artifacts-source-kind-badge">{file.kind}</span>
                  <strong>{file.name}</strong>
                  <span className="artifacts-sources-suggest-path">{file.relativePath}</span>
                </button>
              ))
            ) : (
              <p className="artifacts-sources-suggest-empty">No matching files.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

