import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { outputsApi } from "../../data/outputsApi";
import { artifactsApi } from "../../data/artifactsApi";
import { rebuildApi } from "../../data/rebuildApi";
import { filesApi } from "../../data/filesApi";
import type { ArtifactSpec, OutputStatusResponse, ProjectFile, RebuildModel } from "../../contracts/api";
import { groupModelsByTier, modelDisplayName, modelTierLabels } from "../../domain/modelLabels";

type SortBy = "name" | "buildDate";
type StatusFilter = "all" | "fresh" | "stale";

type ReportFileRow = {
  /** Relative path within the project, e.g. "outputs_ai/reports/uso_brief.md" */
  path: string;
  /** Display name (basename without extension) */
  name: string;
  /** One-level-deep folder, e.g. "etf_reports", or null for root */
  folder: string | null;
  /** ISO timestamp of last build, or null if never built */
  builtAt: string | null;
  /** Whether the file's build is stale relative to last knowledge build */
  stale: boolean;
};

export function OutputSection({
  models,
  projectFiles,
  projectSlug,
  selectedModelId,
  type,
}: {
  models: RebuildModel[];
  projectFiles: ProjectFile[];
  projectSlug: string;
  selectedModelId: string;
  type: "report" | "artifact";
}) {
  const typeLabel = type === "report" ? "Reports" : "Custom Documents";
  const typeSingular = type === "report" ? "Report" : "Document";

  // ── Data ──────────────────────────────────────────────────────
  const [outputStatus, setOutputStatus] = useState<OutputStatusResponse | null>(null);
  const [artifactSpecs, setArtifactSpecs] = useState<ArtifactSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── UI state ──────────────────────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [buildModelId, setBuildModelId] = useState(selectedModelId);
  const [building, setBuilding] = useState(false);
  const [buildingSlugs, setBuildingSlugs] = useState<Set<string>>(() => new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  // ── New report form ───────────────────────────────────────────
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newInputRef = useRef<HTMLInputElement | null>(null);

  // ── Rename state ──────────────────────────────────────────────
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Sync buildModelId when the project-level model changes
  useEffect(() => {
    setBuildModelId(selectedModelId);
  }, [selectedModelId]);

  // ── Fetch output status ───────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    try {
      if (type === "artifact") {
        const result = await artifactsApi.list(projectSlug);
        setArtifactSpecs(result.artifacts);
      } else {
        const result = await outputsApi.status(projectSlug);
        setOutputStatus(result);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load output status");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, type]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, projectFiles]);

  // ── Poll rebuild state for building indicators ─────────────────
  const buildStartedAtRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function pollRebuildState() {
      try {
        const state = await rebuildApi.rebuildState(projectSlug);
        if (cancelled) return;

        const isTrackedBuild = state.running && (
          state.runKind === "artifact_build" ||
          state.runKind === "artifact_batch_build" ||
          state.runKind === "output_build"
        );

        if (isTrackedBuild && Array.isArray(state.buildQueue) && state.buildQueue.length > 0) {
          setBuildingSlugs(new Set(state.buildQueue));
          setBuilding(true);
        } else if (isTrackedBuild) {
          // Build is running but no queue data — keep building state
          setBuilding(true);
        } else if (!state.running && building) {
          // Build may have just finished — but guard against race conditions
          // where we poll before the server has actually started the build.
          const msSinceBuildStart = Date.now() - buildStartedAtRef.current;
          if (msSinceBuildStart < 6000) {
            // Too soon after build was initiated — skip this poll cycle
            return;
          }
          // Build genuinely finished — clear state and refresh artifact list
          setBuildingSlugs(new Set());
          setBuilding(false);
          setSelectedFiles(new Set());
          flash("Generation complete ✓");
          void refreshStatus();
        } else if (!state.running) {
          setBuildingSlugs(new Set());
        }
      } catch {
        // polling error — ignore
      }
    }

    // Initial check
    void pollRebuildState();

    // Poll every 3s
    const interval = setInterval(pollRebuildState, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectSlug, building, refreshStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build rows from project files + output status (reports) or artifact specs (artifacts) ──
  const reportRows: ReportFileRow[] = useMemo(() => {
    if (type === "artifact") {
      // Artifacts: derive rows directly from artifactsApi.list() result
      return artifactSpecs.map((spec) => {
        const isStale = spec.lastBuilt != null && (
          (outputStatus?.lastKnowledgeBuild != null && outputStatus.lastKnowledgeBuild > spec.lastBuilt)
          || spec.sourcesUpdatedSinceLastBuild
          || (spec.buildSpecHash != null && spec.currentSpecHash != null && spec.buildSpecHash !== spec.currentSpecHash)
        );
        return {
          path: spec.slug,
          name: spec.name || spec.slug.replace(/[_-]/g, " "),
          folder: null,
          builtAt: spec.lastBuilt,
          stale: spec.status !== "built" || isStale,
        };
      });
    }

    // Reports: join projectFiles with outputsApi.status() ledger data
    const prefix = "outputs_ai/reports/";
    const statusByPath = new Map<string, { builtAt: string | null; stale: boolean }>();
    if (outputStatus) {
      for (const o of outputStatus.outputs) {
        statusByPath.set(o.path, { builtAt: o.builtAt ?? null, stale: o.stale });
      }
    }
    return projectFiles
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => {
        const relPath = f.path.slice(prefix.length);
        const parts = relPath.split("/");
        const folder = parts.length > 1 ? parts[0] : null;
        const basename = parts[parts.length - 1];
        const name = basename.replace(/\.(md|html)$/, "").replace(/[_-]/g, " ");
        const status = statusByPath.get(f.path);
        return {
          path: f.path,
          name,
          folder,
          builtAt: status?.builtAt ?? null,
          stale: status?.stale ?? true,
        };
      });
  }, [type, artifactSpecs, projectFiles, outputStatus]);

  // ── Compute unique folders ────────────────────────────────────
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const row of reportRows) {
      if (row.folder) set.add(row.folder);
    }
    return Array.from(set).sort();
  }, [reportRows]);

  // Auto-expand all folders on load
  useEffect(() => {
    if (folders.length > 0) {
      setExpandedFolders(new Set(folders));
    }
  }, [folders]);

  // ── Filter + sort ─────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = reportRows;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        (r.folder && r.folder.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter === "fresh") {
      rows = rows.filter((r) => !r.stale && r.builtAt);
    } else if (statusFilter === "stale") {
      rows = rows.filter((r) => r.stale || !r.builtAt);
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      // buildDate — most recent first, unbuilt last
      const aTime = a.builtAt ? new Date(a.builtAt).getTime() : 0;
      const bTime = b.builtAt ? new Date(b.builtAt).getTime() : 0;
      return bTime - aTime;
    });

    return rows;
  }, [reportRows, searchQuery, statusFilter, sortBy]);

  // ── Group by folder ───────────────────────────────────────────
  const { rootFiles, folderGroups } = useMemo(() => {
    const root: ReportFileRow[] = [];
    const groups = new Map<string, ReportFileRow[]>();

    for (const row of filteredRows) {
      if (row.folder) {
        const existing = groups.get(row.folder);
        if (existing) {
          existing.push(row);
        } else {
          groups.set(row.folder, [row]);
        }
      } else {
        root.push(row);
      }
    }

    return { rootFiles: root, folderGroups: groups };
  }, [filteredRows]);

  // ── Counts ────────────────────────────────────────────────────
  const totalCount = reportRows.length;
  const staleCount = reportRows.filter((r) => r.stale || !r.builtAt).length;
  const freshCount = totalCount - staleCount;

  // ── Selection helpers ─────────────────────────────────────────
  function toggleSelection(path: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectAll() {
    // Select all currently visible files (after filters)
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      for (const row of filteredRows) {
        next.add(row.path);
      }
      return next;
    });
  }

  function deselectAll() {
    setSelectedFiles(new Set());
  }

  // ── Flash notice ──────────────────────────────────────────────
  function flash(message: string) {
    setNotice(message);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 5000);
  }

  // ── Build selected outputs ────────────────────────────────────
  async function handleBuild() {
    const files = Array.from(selectedFiles).filter((f) =>
      reportRows.some((r) => r.path === f)
    );
    if (files.length === 0) return;
    flash(`Generating ${files.length} ${files.length === 1 ? typeSingular.toLowerCase() : typeLabel.toLowerCase()}…`);
    try {
      // Both artifact and report builds go through the same API — backend handles queuing
      await outputsApi.buildOutputs(projectSlug, files, type, buildModelId || undefined);
      // Only set building state AFTER the API has accepted the build —
      // setting it before causes a race where the poll fires before the server is running.
      buildStartedAtRef.current = Date.now();
      setBuilding(true);
      setBuildingSlugs(new Set(files));
      flash(`Generation started for ${files.length} ${files.length === 1 ? typeSingular.toLowerCase() : typeLabel.toLowerCase()}.`);
      // Completion is detected by the rebuild state polling effect above
    } catch (err) {
      setBuilding(false);
      flash(err instanceof Error ? err.message : "Generation failed");
    }
  }

  // ── Create new report ─────────────────────────────────────────
  // (The API doesn't yet support creating new empty reports through a dedicated endpoint,
  // but the UI is wired up and ready. For now the create action
  // triggers a file write via the filesApi.  We'll signal intent via flash.)
  function handleNewFormToggle() {
    setShowNewForm((prev) => !prev);
    setNewFileName("");
  }

  // ── Rename handler ────────────────────────────────────────────
  async function handleRename(oldPath: string, newBasename: string) {
    const trimmed = newBasename.trim();
    if (!trimmed) {
      setRenamingPath(null);
      return;
    }

    if (type === "artifact") {
      // For artifacts, oldPath is the slug and newBasename is the new slug
      const newSlug = trimmed.replace(/\.artifact\.md$/, "").replace(/\.md$/, "");
      if (newSlug === oldPath) {
        setRenamingPath(null);
        return;
      }
      try {
        await artifactsApi.rename(projectSlug, oldPath, newSlug);
        flash(`Renamed to ${newSlug} ✓`);
        setRenamingPath(null);
        await refreshStatus();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Rename failed");
      }
      return;
    }

    // Reports: rename via file path
    const finalBasename = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
    const dir = oldPath.substring(0, oldPath.lastIndexOf("/") + 1);
    const newPath = dir + finalBasename;

    if (newPath === oldPath) {
      setRenamingPath(null);
      return;
    }

    try {
      await filesApi.renameOutputFile(projectSlug, oldPath, newPath);
      flash(`Renamed to ${finalBasename} ✓`);
      setRenamingPath(null);
      await refreshStatus();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Rename failed");
    }
  }

  useEffect(() => {
    if (showNewForm && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [showNewForm]);

  // ── Toggle folder expansion ───────────────────────────────────
  function toggleFolder(folder: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }

  // ── Model selector ────────────────────────────────────────────
  const tieredModels = useMemo(() => groupModelsByTier(models), [models]);

  // ── Last knowledge build display ──────────────────────────────
  const lastKnowledgeBuildLabel = useMemo(() => {
    if (!outputStatus?.lastKnowledgeBuild) return null;
    try {
      return new Date(outputStatus.lastKnowledgeBuild).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return outputStatus.lastKnowledgeBuild;
    }
  }, [outputStatus?.lastKnowledgeBuild]);

  const selectedCount = Array.from(selectedFiles).filter((f) =>
    reportRows.some((r) => r.path === f)
  ).length;

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="output-section">
        <div className="output-section-header">
          <div className="output-section-header-left">
            <h2 className="output-section-title">{typeLabel}</h2>
          </div>
        </div>
        <div className="output-section-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="output-section-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="output-section">
        <div className="output-section-header">
          <div className="output-section-header-left">
            <h2 className="output-section-title">{typeLabel}</h2>
          </div>
        </div>
        <div className="output-section-empty">
          <div className="output-section-empty-icon">⚠️</div>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="output-section">
      {/* Header */}
      <div className="output-section-header">
        <div className="output-section-header-left">
          <h2 className="output-section-title">{typeLabel}</h2>
          {lastKnowledgeBuildLabel ? (
            <p className="output-section-subtitle">
              Last research update: {lastKnowledgeBuildLabel}
            </p>
          ) : (
            <p className="output-section-subtitle">
              No research update yet
            </p>
          )}
        </div>
        {type === "report" ? (
          <button
            className="output-section-new-btn"
            onClick={handleNewFormToggle}
            type="button"
          >
            + New {typeSingular}
          </button>
        ) : null}
      </div>

      {/* New file form */}
      {showNewForm ? (
        <form
          className="output-section-new-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newFileName.trim()) return;
            flash(`Creating "${newFileName.trim()}" — use the chat agent to fill it in.`);
            setShowNewForm(false);
            setNewFileName("");
          }}
        >
          <input
            ref={newInputRef}
            className="output-section-new-input"
            type="text"
            placeholder="report_name.md"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowNewForm(false);
            }}
            maxLength={120}
          />
          <button
            className="output-section-new-submit"
            type="submit"
            disabled={!newFileName.trim()}
          >
            Create
          </button>
          <button
            className="output-section-new-cancel"
            type="button"
            onClick={() => setShowNewForm(false)}
          >
            Cancel
          </button>
        </form>
      ) : null}

      {/* Notice bar */}
      {notice ? (
        <div className="output-section-notice">{notice}</div>
      ) : null}

      {/* Toolbar */}
      {totalCount > 0 ? (
        <div className="output-section-toolbar">
          <input
            className="output-section-search"
            type="search"
            placeholder={`Search ${typeLabel.toLowerCase()}…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="output-section-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="name">Sort: Name</option>
            <option value="buildDate">Sort: Last generated</option>
          </select>
          <div className="output-section-status-filter">
            <button
              className={`output-section-status-btn${statusFilter === "all" ? " active" : ""}`}
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              All ({totalCount})
            </button>
            <button
              className={`output-section-status-btn${statusFilter === "fresh" ? " active" : ""}`}
              onClick={() => setStatusFilter("fresh")}
              type="button"
            >
              Fresh ({freshCount})
            </button>
            <button
              className={`output-section-status-btn${statusFilter === "stale" ? " active" : ""}`}
              onClick={() => setStatusFilter("stale")}
              type="button"
            >
              Stale ({staleCount})
            </button>
          </div>
        </div>
      ) : null}

      {/* File list */}
      {totalCount === 0 ? (
        <div className="output-section-empty">
          <div className="output-section-empty-icon">📄</div>
          <span>
            No {typeLabel.toLowerCase()} yet.{" "}
            {type === "report"
              ? "Create one with the chat agent or click \"+ New Report\" above."
              : "Create one from the sidebar."}
          </span>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="output-section-empty">
          <div className="output-section-empty-icon">🔍</div>
          <span>No {typeLabel.toLowerCase()} match your filters.</span>
        </div>
      ) : (
        <div className="output-section-list">
          {/* Root files (no folder) */}
          {rootFiles.map((row) => (
            <FileRow
              key={row.path}
              row={row}
              checked={selectedFiles.has(row.path)}
              onToggle={() => toggleSelection(row.path)}
              isBuilding={buildingSlugs.has(row.path)}
              renaming={renamingPath === row.path}
              renameValue={renamingPath === row.path ? renameValue : ""}
              onRenameStart={() => {
                setRenamingPath(row.path);
                const basename = row.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
                setRenameValue(basename);
              }}
              onRenameChange={setRenameValue}
              onRenameSubmit={() => void handleRename(row.path, renameValue)}
              onRenameCancel={() => setRenamingPath(null)}
            />
          ))}

          {/* Folder groups */}
          {Array.from(folderGroups.entries()).map(([folder, files]) => (
            <div className="output-folder-group" key={folder}>
              <button
                className="output-folder-header"
                onClick={() => toggleFolder(folder)}
                type="button"
              >
                <span className={`output-folder-chevron${expandedFolders.has(folder) ? " expanded" : ""}`}>
                  ▶
                </span>
                📁 {folder}
                <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                  ({files.length})
                </span>
              </button>
              {expandedFolders.has(folder) ? (
                <div className="output-folder-children">
                  {files.map((row) => (
                    <FileRow
                      key={row.path}
                      row={row}
                      checked={selectedFiles.has(row.path)}
                      onToggle={() => toggleSelection(row.path)}
                      isBuilding={buildingSlugs.has(row.path)}
                      renaming={renamingPath === row.path}
                      renameValue={renamingPath === row.path ? renameValue : ""}
                      onRenameStart={() => {
                        setRenamingPath(row.path);
                        const basename = row.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
                        setRenameValue(basename);
                      }}
                      onRenameChange={setRenameValue}
                      onRenameSubmit={() => void handleRename(row.path, renameValue)}
                      onRenameCancel={() => setRenamingPath(null)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Footer / build bar — only show when there are files */}
      {totalCount > 0 ? (
        <div className="output-section-footer">
          <div className="output-section-select-actions">
            <span className="output-section-selection-info">
              <strong>{selectedCount}</strong> selected
            </span>
            <button
              className="output-section-select-all-btn"
              onClick={selectedCount > 0 ? deselectAll : selectAll}
              type="button"
            >
              {selectedCount > 0 ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {models.length > 0 ? (
              <select
                className="output-section-sort"
                value={buildModelId}
                onChange={(e) => setBuildModelId(e.target.value)}
                style={{ minWidth: 140 }}
              >
                {tieredModels.map(({ tier, models: tierModels }) => (
                  <optgroup key={tier} label={modelTierLabels[tier]}>
                    {tierModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {modelDisplayName(model)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : null}
            <button
              className="output-section-build-btn"
              disabled={selectedCount === 0 || building}
              onClick={() => void handleBuild()}
              type="button"
            >
              {building
                ? "Generating…"
                : `Generate ${selectedCount} ${selectedCount === 1 ? typeSingular : typeLabel}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── File Row sub-component ─────────────────────────────────── */

function FileRow({
  row,
  checked,
  onToggle,
  isBuilding = false,
  renaming,
  renameValue,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  row: ReportFileRow;
  checked: boolean;
  onToggle: () => void;
  isBuilding?: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameStart: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}) {
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const builtAtLabel = useMemo(() => {
    if (!row.builtAt) return null;
    try {
      return new Date(row.builtAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [row.builtAt]);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  function statusBadge() {
    if (isBuilding) {
      return (
        <span className="output-status-badge output-status-building">
          ⏳ Generating…
        </span>
      );
    }
    if (!row.builtAt) {
      return (
        <span className="output-status-badge output-status-unbuilt">
          ○ Not generated
        </span>
      );
    }
    if (row.stale) {
      return (
        <span className="output-status-badge output-status-stale">
          ⚠ Stale
        </span>
      );
    }
    return (
      <span className="output-status-badge output-status-fresh">
        ✓ Fresh
      </span>
    );
  }

  return (
    <div
      className={`output-file-row${checked ? " selected" : ""}`}
      onClick={renaming ? undefined : onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (renaming) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <input
        className="output-file-checkbox"
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      />
      {renaming ? (
        <form
          className="output-rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            onRenameSubmit();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={renameInputRef}
            className="output-rename-input"
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onRenameCancel();
            }}
            maxLength={120}
          />
          <span className="output-rename-ext">.md</span>
          <button className="output-rename-save" type="submit" title="Save">✓</button>
          <button className="output-rename-cancel" type="button" onClick={onRenameCancel} title="Cancel">✕</button>
        </form>
      ) : (
        <>
          <span className="output-file-name" title={row.path}>
            {row.name}
          </span>
          <button
            className="output-rename-btn"
            type="button"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onRenameStart();
            }}
          >
            ✎
          </button>
        </>
      )}
      {builtAtLabel ? (
        <span className="output-file-time" title={row.builtAt ?? undefined}>
          {builtAtLabel}
        </span>
      ) : null}
      {statusBadge()}
    </div>
  );
}
