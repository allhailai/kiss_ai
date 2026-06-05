import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artifactsApi } from "../../data/artifactsApi";
import { rebuildApi } from "../../data/rebuildApi";
import { downloadProjectFile, triggerDownload } from "../../data/downloadFile";
import { useRouteContext } from "../../app/contexts/RouteContext";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { groupModelsByTier, modelDisplayName, modelTierLabels } from "../../domain/modelLabels";
import type { ArtifactSpec, ArtifactSpecDetail, AvailableSourceFile, FileContent, RebuildModel } from "../../contracts/api";

type Tab = "spec" | "preview";

export function ArtifactsView({ lastProjectBuildAt, models, projectSlug, selectedBuildModelId, selectedFileContent }: { lastProjectBuildAt: string | null; models: RebuildModel[]; projectSlug: string; selectedBuildModelId: string; selectedFileContent: FileContent | null }) {
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
  // Tracks the server's `startedAt` for the build we initiated (or recovered).
  // Used by the polling effect to guard against reacting to stale/old states.
  const buildRunStartedAtRef = useRef<string | null>(null);
  const popoutRef = useRef<Window | null>(null);
  const noopOpenFile = useCallback(() => {}, []);

  const selectedArtifact = artifacts.find((a) => a.slug === selectedSlug) ?? null;
  const isBuilt = selectedArtifact?.status === "built";

  // Compute staleness reasons
  const staleReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!selectedArtifact?.lastBuilt) return reasons;
    const built = selectedArtifact.lastBuilt;
    if (lastProjectBuildAt && lastProjectBuildAt > built) reasons.push("build");
    if (selectedArtifact.sourcesUpdatedSinceLastBuild) reasons.push("deepened");
    if (selectedArtifact.buildSpecHash && selectedArtifact.currentSpecHash
        && selectedArtifact.buildSpecHash !== selectedArtifact.currentSpecHash) reasons.push("spec");
    return reasons;
  }, [selectedArtifact, lastProjectBuildAt]);

  // Default to preview tab when selecting an artifact that's already built.
  // Also reset building state — the recovery effect below will re-enable it
  // if this specific artifact is genuinely being built.
  const prevSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedSlug !== prevSlugRef.current) {
      prevSlugRef.current = selectedSlug;
      // Reset building state from any previous artifact
      setBuilding(false);
      buildRunStartedAtRef.current = null;
      if (selectedArtifact?.status === "built") {
        setActiveTab("preview");
      } else {
        setActiveTab("spec");
      }
    }
  }, [selectedSlug, selectedArtifact?.status]);

  // On mount or slug change, check server state to recover building state.
  // This ensures the building spinner survives page refreshes and navigation
  // away/back. The slug-change effect above resets building=false first,
  // then this effect re-enables it if the server confirms this artifact is building.
  useEffect(() => {
    if (!selectedSlug) return;

    rebuildApi.rebuildState(projectSlug).then((state) => {
      const isArtifactBuild = state.runKind === "artifact_build" || state.runKind === "artifact_batch_build";
      const isForThisArtifact = Array.isArray(state.buildQueue) && state.buildQueue.includes(selectedSlug);
      if (state.running && isArtifactBuild && isForThisArtifact) {
        // This specific artifact is currently being built — resume building UI
        buildRunStartedAtRef.current = state.startedAt;
        setBuilding(true);
        setActiveTab("preview");
        flash("Resuming build — agent is generating HTML…");
      }
    }).catch(() => { /* ignore — recovery is best-effort */ });
  }, [selectedSlug, projectSlug]);

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
  }, [refreshList, lastProjectBuildAt]);

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
      // Refresh the artifacts list so staleness signals (currentSpecHash) update
      void refreshList();
    }
    lastContentHashRef.current = selectedFileContent.contentHash;
  }, [projectSlug, selectedSlug, selectedFileContent?.contentHash, selectedFileContent?.path]);

  // Clean up popout ref on unmount
  useEffect(() => {
    return () => {
      popoutRef.current = null;
    };
  }, []);

  // Handle "build" action from route context (e.g. Rebuild button in side panel)
  const [pendingBuild, setPendingBuild] = useState(false);
  useEffect(() => {
    if (route.context.action === "build" && selectedSlug) {
      setPendingBuild(true);
      // Clear the context so it doesn't re-trigger
      route.navigateTo("artifacts", selectedSlug, {});
    }
  }, [route.context.action, selectedSlug]);

  // Fire the build once the spec is loaded
  useEffect(() => {
    if (pendingBuild && selectedSpec && selectedSlug && !building) {
      setPendingBuild(false);
      void handleBuild();
    }
  }, [pendingBuild, selectedSpec, selectedSlug, building]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!selectedSlug || !selectedSpec) return;
    setSaving(true);
    try {
      await artifactsApi.update(projectSlug, selectedSlug, selectedSpec.frontmatter, editBody);
      flash("Saved");
      const updated = await artifactsApi.read(projectSlug, selectedSlug);
      setSelectedSpec(updated);
      // Refresh the artifacts list so staleness signals (currentSpecHash) update
      void refreshList();
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

      const result = await artifactsApi.build(projectSlug, selectedSlug, String(selectedSpec?.frontmatter.modelId ?? ""));

      // If the server says it's already running (duplicate build prevention),
      // or it just started, record the server's startedAt for the polling guard.
      buildRunStartedAtRef.current = result.startedAt ?? new Date().toISOString();

      // Build completion is detected by the rebuildState polling effect below.
      // Switch to preview tab so the user sees the loading state.
      setActiveTab("preview");
    } catch (error) {
      setBuilding(false);
      flash(error instanceof Error ? error.message : "Build failed");
    }
  }

  // Poll rebuildState to detect when the artifact build finishes.
  // Uses the server's `startedAt` to guard against reacting to stale states.
  useEffect(() => {
    if (!building) return;

    let cancelled = false;
    const ourBuildStartedAt = buildRunStartedAtRef.current;

    async function pollRebuildState() {
      try {
        const state = await rebuildApi.rebuildState(projectSlug);
        if (cancelled) return;

        // Still running — keep waiting
        if (state.running) return;

        // The server is idle. Is this the completion of OUR build?
        const isArtifactBuild = state.runKind === "artifact_build" || state.runKind === "artifact_batch_build";

        // Guard: if the server's startedAt doesn't match the build we initiated,
        // this is a stale state from a previous (or different) run. The server
        // may not have transitioned to running yet, so wait.
        if (ourBuildStartedAt && state.startedAt !== ourBuildStartedAt) {
          return;
        }

        // Build genuinely finished — update UI
        setBuilding(false);
        buildRunStartedAtRef.current = null;

        if (!isArtifactBuild) {
          // A non-artifact job displaced our build (e.g. a knowledge build started after).
          // The artifact may or may not have completed. Refresh and let status speak.
          await refreshList();
          flash("Build status updated.");
          return;
        }

        const isSuccess = state.status === "finished" || state.status === "finished_with_attention";
        if (isSuccess) {
          // Refresh the artifact list so isBuilt / lastBuilt update
          await refreshList();
          setPreviewKey((k) => k + 1);
          // Auto-refresh popped-out preview window
          try {
            if (popoutRef.current && !popoutRef.current.closed) {
              popoutRef.current.location.reload();
            }
          } catch { /* cross-origin or closed — ignore */ }
          flash("Build complete ✓");
        } else {
          // error, interrupted, blocked, etc.
          await refreshList();
          flash(state.message || "Build failed — check the build log.");
        }
      } catch {
        // polling error — ignore
      }
    }

    // Poll every 3 seconds
    const interval = setInterval(pollRebuildState, 3000);
    // Also do an initial check after a brief delay to let the server transition
    const initialTimer = setTimeout(() => void pollRebuildState(), 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(initialTimer);
    };
  }, [building, projectSlug, refreshList]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {staleReasons.length > 0 ? (
            <span className="artifacts-stale-notice" title="The preview may not reflect recent changes">
              <span className="artifacts-stale-icon">⚠</span>
              Stale:
              {staleReasons.includes("build") ? <span className="artifacts-stale-pill">🔨 Build</span> : null}
              {staleReasons.includes("deepened") ? <span className="artifacts-stale-pill">📚 Deepened</span> : null}
              {staleReasons.includes("spec") ? <span className="artifacts-stale-pill">✏️ Spec</span> : null}
            </span>
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
          {isBuilt ? (
            <button
              className="artifacts-action-btn"
              onClick={() => triggerDownload(artifactsApi.previewUrl(projectSlug, selectedSlug), `${selectedSlug}.html`)}
              title="Download the built HTML file"
              type="button"
            >
              ↓ HTML
            </button>
          ) : null}
          {selectedSpec ? (
            <button
              className="artifacts-action-btn"
              onClick={() => downloadProjectFile(projectSlug, `artifacts/artifact_specs/${selectedSlug}.artifact.md`)}
              title="Download the artifact spec"
              type="button"
            >
              ↓ Spec
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

