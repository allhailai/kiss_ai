import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { artifactsApi } from "../../data/artifactsApi";
import { rebuildApi } from "../../data/rebuildApi";
import { downloadProjectFile, triggerDownload } from "../../data/downloadFile";
import { useRouteContext } from "../../app/contexts/RouteContext";
import { MarkdownEditor } from "../../editor/MarkdownEditor";
import { groupModelsByTier, modelDisplayName, modelTierLabels } from "../../domain/modelLabels";
import type { Annotation, ArtifactSpec, ArtifactSpecDetail, ArtifactSection, ArtifactSectionsResponse, AvailableSourceFile, BuildVersion, ElementContext, FileContent, RebuildModel } from "../../contracts/api";

type QuickAddTarget = {
  sectionId: string;
  sectionTitle: string;
  elementContext?: ElementContext;
};

type Tab = "spec" | "preview";

export function ArtifactsView({ lastProjectBuildAt, models, projectSlug, selectedBuildModelId, selectedFileContent }: { lastProjectBuildAt: string | null; models: RebuildModel[]; projectSlug: string; selectedBuildModelId: string; selectedFileContent: FileContent | null }) {
  const route = useRouteContext();

  // The selected artifact slug comes from the URL (deep link)
  const selectedSlug = route.filePath || null;

  const [artifacts, setArtifacts] = useState<ArtifactSpec[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<ArtifactSpecDetail | null>(null);
  const [activeTab, setActiveTabRaw] = useState<Tab>((route.context.tab === "spec" || route.context.tab === "preview") ? route.context.tab : "spec");
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Section panel state
  const [sections, setSections] = useState<ArtifactSection[]>([]);
  const [hiddenSectionIds, setHiddenSectionIds] = useState<string[]>([]);
  const [regeneratedSections, setRegeneratedSections] = useState<string[]>([]);
  const [contractVersion, setContractVersion] = useState<number | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionPanelOpen, setSectionPanelOpenRaw] = useState(route.context.sections === "closed" ? false : true);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);

  // Annotation queue state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  // Build versioning
  const [buildVersions, setBuildVersions] = useState<BuildVersion[]>([]);
  const [activeVersionDirName, setActiveVersionDirName] = useState<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = useState(false);

  // Rebuild warning modal
  const [showRebuildWarning, setShowRebuildWarning] = useState(false);

  // Inspection / annotation mode
  const [annotationMode, setAnnotationMode] = useState(false);

  // ─── URL deep-link helpers ────────────────────────────────────
  // Build context object for URL sync (preserves other keys like action)
  function buildUrlContext(tab: Tab, sections: boolean, extra: Record<string, string> = {}): Record<string, string> {
    return { ...extra, tab, sections: sections ? "open" : "closed" };
  }

  // Wrap setActiveTab to also sync to URL
  function setActiveTab(tab: Tab) {
    setActiveTabRaw(tab);
    route.navigateTo("artifacts", selectedSlug, buildUrlContext(tab, sectionPanelOpen));
  }

  // Wrap setSectionPanelOpen to also sync to URL
  function setSectionPanelOpen(open: boolean) {
    setSectionPanelOpenRaw(open);
    route.navigateTo("artifacts", selectedSlug, buildUrlContext(activeTab, open));
  }

  // Respond to URL changes (browser back/forward)
  useEffect(() => {
    const urlTab = route.context.tab;
    const urlSections = route.context.sections;
    if ((urlTab === "spec" || urlTab === "preview") && urlTab !== activeTab) {
      setActiveTabRaw(urlTab);
    }
    if (urlSections === "open" && !sectionPanelOpen) {
      setSectionPanelOpenRaw(true);
    } else if (urlSections === "closed" && sectionPanelOpen) {
      setSectionPanelOpenRaw(false);
    }
  }, [route.context.tab, route.context.sections]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const prevArtifactStatusRef = useRef<string | undefined>(undefined);
  // Tracks when tab defaulted to "spec" only because artifact status was unknown
  const tabWasFallbackRef = useRef(false);
  useEffect(() => {
    const statusChanged = selectedArtifact?.status !== prevArtifactStatusRef.current;
    prevArtifactStatusRef.current = selectedArtifact?.status;

    if (selectedSlug !== prevSlugRef.current) {
      prevSlugRef.current = selectedSlug;
      // Reset building state from any previous artifact
      setBuilding(false);
      buildRunStartedAtRef.current = null;
      // Use URL context tab if present, otherwise default to preview-if-built
      const urlTab = route.context.tab;
      const hasExplicitTab = urlTab === "spec" || urlTab === "preview";
      const defaultTab: Tab = hasExplicitTab ? urlTab
        : selectedArtifact?.status === "built" ? "preview" : "spec";
      // Track if we fell back to "spec" because status was unknown
      tabWasFallbackRef.current = !hasExplicitTab && !selectedArtifact?.status;
      setActiveTabRaw(defaultTab);
      // Default sections to open unless URL says closed
      const defaultSections = route.context.sections !== "closed";
      setSectionPanelOpenRaw(defaultSections);
      // Sync defaults into URL
      route.navigateTo("artifacts", selectedSlug, buildUrlContext(defaultTab, defaultSections));
    } else if (tabWasFallbackRef.current && statusChanged && selectedArtifact?.status === "built") {
      // The artifacts list loaded after the slug was already set (race on first
      // navigation from another view). The tab had defaulted to "spec" only
      // because the status was unknown — now switch to preview.
      tabWasFallbackRef.current = false;
      setActiveTabRaw("preview");
      route.navigateTo("artifacts", selectedSlug, buildUrlContext("preview", sectionPanelOpen));
    }
  }, [selectedSlug, selectedArtifact?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setActiveTabRaw("preview");
        route.navigateTo("artifacts", selectedSlug, buildUrlContext("preview", sectionPanelOpen));
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
      // Clear the action context so it doesn't re-trigger, but preserve tab/sections
      route.navigateTo("artifacts", selectedSlug, buildUrlContext(activeTab, sectionPanelOpen));
    }
  }, [route.context.action, selectedSlug]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Check for modifications and show warning if needed
    const hasModifications = hiddenSectionIds.length > 0
      || regeneratedSections.length > 0
      || annotations.some(a => a.status === "applied" && a.type === "add_section");

    if (hasModifications && isBuilt && !showRebuildWarning) {
      setShowRebuildWarning(true);
      return;
    }
    setShowRebuildWarning(false);

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
      setActiveTabRaw("preview");
      route.navigateTo("artifacts", selectedSlug, buildUrlContext("preview", sectionPanelOpen));
    } catch (error) {
      setBuilding(false);
      flash(error instanceof Error ? error.message : "Build failed");
    }
  }

  // Load build versions
  const loadVersions = useCallback(async () => {
    if (!selectedSlug) return;
    try {
      const result = await artifactsApi.versions(projectSlug, selectedSlug);
      setBuildVersions(result.versions);
      setActiveVersionDirName(result.activeVersionDirName ?? null);
    } catch { /* non-fatal */ }
  }, [projectSlug, selectedSlug]);

  // Load versions when preview tab is shown
  useEffect(() => {
    if (activeTab === "preview" && isBuilt && selectedSlug) {
      void loadVersions();
    }
  }, [activeTab, isBuilt, selectedSlug, loadVersions]);

  // Revert to a previous build version
  async function handleRevertVersion(versionDirName: string) {
    if (!selectedSlug || switchingVersion) return;
    setSwitchingVersion(true);
    try {
      await artifactsApi.revertVersion(projectSlug, selectedSlug, versionDirName);
      flash("Switched to previous version");
      setPreviewKey((k) => k + 1);
      void loadSections();
      void loadAnnotations();
      void loadVersions();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to revert");
    } finally {
      setSwitchingVersion(false);
    }
  }

  // Switch back to the latest build
  async function handleRevertToLatest() {
    if (!selectedSlug || switchingVersion) return;
    setSwitchingVersion(true);
    try {
      await artifactsApi.revertToLatest(projectSlug, selectedSlug);
      flash("Switched to latest build");
      setPreviewKey((k) => k + 1);
      void loadSections();
      void loadAnnotations();
      void loadVersions();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to switch to latest");
    } finally {
      setSwitchingVersion(false);
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
        const isArtifactBuild = state.runKind === "artifact_build" || state.runKind === "artifact_batch_build" || state.runKind === "section_regeneration" || state.runKind === "batch_section_regeneration";

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

  // Load sections when preview tab is active and artifact is built
  const loadSections = useCallback(async () => {
    if (!selectedSlug || !isBuilt) return;
    setSectionsLoading(true);
    try {
      const result = await artifactsApi.sections(projectSlug, selectedSlug);
      setSections(result.sections);
      setRegeneratedSections(result.regeneratedSections);
      setContractVersion(result.contractVersion);
      setHiddenSectionIds(result.hiddenSectionIds ?? []);
    } catch {
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, [projectSlug, selectedSlug, isBuilt]);

  useEffect(() => {
    if (activeTab === "preview" && isBuilt) {
      void loadSections();
    }
  }, [activeTab, isBuilt, loadSections, previewKey]);

  function handleScrollToSection(sectionId: string) {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !selectedSlug) return;
    iframe.contentWindow.postMessage(
      { type: 'kiss-scroll-to-section', sectionId },
      '*',
    );
  }

  // ─── Annotation CRUD ────────────────────────────────────────

  const loadAnnotations = useCallback(async () => {
    if (!selectedSlug) return;
    try {
      const { annotations: list } = await artifactsApi.listAnnotations(projectSlug, selectedSlug);
      setAnnotations(list);
    } catch { /* non-fatal */ }
  }, [projectSlug, selectedSlug]);

  useEffect(() => {
    if (selectedSlug && isBuilt) {
      void loadAnnotations();
    }
  }, [selectedSlug, isBuilt, loadAnnotations]);

  // Always re-sync annotations and sections when any build finishes (building → false).
  // This is the single, durable reload point — no matter which polling path
  // triggered the transition, annotations and sections are guaranteed to refresh.
  const prevBuildingRef = useRef(false);
  useEffect(() => {
    if (prevBuildingRef.current && !building && selectedSlug && isBuilt) {
      void loadAnnotations();
      void loadSections();
      void loadVersions();
    }
    prevBuildingRef.current = building;
  }, [building, selectedSlug, isBuilt, loadAnnotations, loadSections, loadVersions]);

  function handleOpenQuickAdd(sectionId: string, sectionTitle: string, elementContext?: ElementContext) {
    setQuickAddTarget({ sectionId, sectionTitle, elementContext });
    setQuickAddText("");
    if (!sectionPanelOpen) setSectionPanelOpen(true);
  }

  async function handleAddAnnotation() {
    if (!selectedSlug || !quickAddTarget || !quickAddText.trim()) return;
    try {
      await artifactsApi.addAnnotation(projectSlug, selectedSlug, {
        sectionId: quickAddTarget.sectionId,
        sectionTitle: quickAddTarget.sectionTitle,
        instruction: quickAddText.trim(),
        elementContext: quickAddTarget.elementContext,
      });
      setQuickAddText("");
      setQuickAddTarget(null);
      await loadAnnotations();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to add annotation");
    }
  }

  async function handleUpdateAnnotation(annotationId: string, instruction: string) {
    if (!selectedSlug) return;
    try {
      await artifactsApi.updateAnnotation(projectSlug, selectedSlug, annotationId, { instruction });
      setEditingAnnotationId(null);
      await loadAnnotations();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to update annotation");
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    if (!selectedSlug) return;
    try {
      await artifactsApi.deleteAnnotation(projectSlug, selectedSlug, annotationId);
      await loadAnnotations();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to delete annotation");
    }
  }

  async function handleApplyAnnotations() {
    if (!selectedSlug) return;
    try {
      const result = await artifactsApi.applyAnnotations(projectSlug, selectedSlug);
      buildRunStartedAtRef.current = result.startedAt ?? new Date().toISOString();
      setBuilding(true);
      flash(`Batch regenerating sections…`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Batch regeneration failed");
    }
  }

  async function handleRetryFailed() {
    if (!selectedSlug) return;
    try {
      await artifactsApi.retryAnnotations(projectSlug, selectedSlug);
      await loadAnnotations();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Retry failed");
    }
  }

  async function handleToggleAnnotation(annotationId: string) {
    if (!selectedSlug) return;
    try {
      await artifactsApi.toggleAnnotation(projectSlug, selectedSlug, annotationId);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Toggle failed");
    } finally {
      await loadAnnotations();
    }
  }

  function handleHighlightAnnotation(annotation: Annotation) {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: 'kiss-highlight-element',
        cssPath: annotation.elementContext?.cssPath,
        sectionId: annotation.sectionId,
      },
      '*',
    );
  }

  // ─── Section Hide / Unhide / Add ────────────────────────────

  async function handleHideSection(sectionId: string) {
    if (!selectedSlug) return;
    try {
      const result = await artifactsApi.hideSection(projectSlug, selectedSlug, sectionId);
      setSections(result.sections);
      setHiddenSectionIds(result.hiddenSectionIds);
      setPreviewKey((k) => k + 1); // immediately reload iframe
      flash("Section hidden");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to hide section");
    }
  }

  async function handleUnhideSection(sectionId: string) {
    if (!selectedSlug) return;
    try {
      const result = await artifactsApi.unhideSection(projectSlug, selectedSlug, sectionId);
      setSections(result.sections);
      setHiddenSectionIds(result.hiddenSectionIds);
      setPreviewKey((k) => k + 1); // immediately reload iframe
      flash("Section visible again");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to show section");
    }
  }

  async function handleAddSection(description: string, afterSectionId: string | null) {
    if (!selectedSlug) return;
    try {
      await artifactsApi.addSection(projectSlug, selectedSlug, description, afterSectionId);
      await loadAnnotations();
      flash("New section added as draft annotation");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Failed to add section");
    }
  }

  // ─── Inspection mode ────────────────────────────────────────

  function toggleAnnotationMode() {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const next = !annotationMode;
    setAnnotationMode(next);
    iframe.contentWindow.postMessage(
      { type: next ? 'kiss-enter-annotation' : 'kiss-exit-annotation' },
      '*',
    );
  }

  // Listen for annotation clicks from the iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== 'kiss-annotation-selected') return;
      const { sectionId, elementTag, elementId, cssPath, elementText, elementHTML } = event.data;
      if (!sectionId) return;
      const section = sections.find(s => s.id === sectionId);
      const sectionTitle = section?.title ?? sectionId;
      handleOpenQuickAdd(sectionId, sectionTitle, {
        elementTag,
        elementId: elementId || undefined,
        cssPath: cssPath || undefined,
        elementText: elementText || undefined,
        elementHTML: elementHTML || undefined,
      });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sections]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exit annotation mode when leaving preview
  useEffect(() => {
    if (activeTab !== 'preview' && annotationMode) {
      setAnnotationMode(false);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <>
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
              <p>Agent is {regeneratingSection ? `regenerating section…` : `generating the HTML artifact…`}</p>
              <p className="artifacts-building-hint">This may take a minute. The preview will load automatically when ready.</p>
            </div>
          ) : isBuilt ? (
            <div className="artifacts-preview-with-sections">
              <iframe
                key={previewKey}
                ref={iframeRef}
                className="artifacts-preview-iframe"
                src={artifactsApi.previewUrl(projectSlug, selectedSlug)}
                title={`Preview: ${selectedSpec.frontmatter.name ?? selectedSlug}`}
                sandbox="allow-scripts"
              />
              {sectionPanelOpen ? (
              <SectionPanel
                  sections={sections}
                  regeneratedSections={regeneratedSections}
                  contractVersion={contractVersion}
                  loading={sectionsLoading}
                  annotations={annotations}
                  quickAddTarget={quickAddTarget}
                  quickAddText={quickAddText}
                  editingAnnotationId={editingAnnotationId}
                  building={building}
                  switchingVersion={switchingVersion}
                  annotationMode={annotationMode}
                  buildVersions={buildVersions}
                  activeVersionDirName={activeVersionDirName}
                  onScrollTo={handleScrollToSection}
                  onOpenQuickAdd={handleOpenQuickAdd}
                  onQuickAddTextChange={setQuickAddText}
                  onAddAnnotation={handleAddAnnotation}
                  onCloseQuickAdd={() => setQuickAddTarget(null)}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onStartEditing={setEditingAnnotationId}
                  onCancelEditing={() => setEditingAnnotationId(null)}
                  onHighlightAnnotation={handleHighlightAnnotation}
                  onApplyAnnotations={handleApplyAnnotations}
                  onRetryFailed={handleRetryFailed}
                  onToggleAnnotation={handleToggleAnnotation}
                  onToggleInspection={toggleAnnotationMode}
                  onHideSection={handleHideSection}
                  onUnhideSection={handleUnhideSection}
                  onAddSection={handleAddSection}
                  onRevertVersion={handleRevertVersion}
                  onRevertToLatest={handleRevertToLatest}
                />
              ) : null}
              <button
                className={`artifacts-sections-toggle ${sectionPanelOpen ? "open" : ""}`}
                onClick={() => setSectionPanelOpen(!sectionPanelOpen)}
                type="button"
                title={sectionPanelOpen ? "Hide sections" : "Show sections"}
              >
                {sectionPanelOpen ? "›" : "‹"}
                <span className="artifacts-sections-toggle-label">{sectionPanelOpen ? "" : "Sections"}</span>
              </button>
            </div>
          ) : (
            <div className="artifacts-placeholder">
              <p>This artifact hasn't been built yet. Click <strong>Build</strong> to generate it.</p>
            </div>
          )}
        </div>
      )}
    </div>
      {showRebuildWarning ? (
        <div className="artifacts-rebuild-warning-overlay" onClick={() => setShowRebuildWarning(false)}>
          <div className="artifacts-rebuild-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="artifacts-rebuild-warning-icon">⚠️</div>
            <h3 className="artifacts-rebuild-warning-title">Rebuild will replace all sections</h3>
            <p className="artifacts-rebuild-warning-text">
              This artifact has section-level changes that a full rebuild will overwrite:
            </p>
            <ul className="artifacts-rebuild-warning-list">
              {hiddenSectionIds.length > 0 ? (
                <li>{hiddenSectionIds.length} hidden section{hiddenSectionIds.length !== 1 ? "s" : ""}</li>
              ) : null}
              {regeneratedSections.length > 0 ? (
                <li>{regeneratedSections.length} edited section{regeneratedSections.length !== 1 ? "s" : ""}</li>
              ) : null}
              {annotations.some(a => a.status === "applied" && a.type === "add_section") ? (
                <li>{annotations.filter(a => a.status === "applied" && a.type === "add_section").length} added section{annotations.filter(a => a.status === "applied" && a.type === "add_section").length !== 1 ? "s" : ""}</li>
              ) : null}
            </ul>
            <p className="artifacts-rebuild-warning-reassurance">
              Your current build will be saved to <strong>Version History</strong> so you can revert if needed.
            </p>
            <div className="artifacts-rebuild-warning-actions">
              <button
                className="artifacts-rebuild-warning-cancel"
                onClick={() => setShowRebuildWarning(false)}
                type="button"
              >Cancel</button>
              <button
                className="artifacts-rebuild-warning-proceed"
                onClick={() => void handleBuild()}
                type="button"
              >Rebuild Anyway</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

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

/* ─── Section Panel ──────────────────────────────────────── */

function SectionPanel({
  sections,
  regeneratedSections,
  contractVersion,
  loading,
  annotations,
  quickAddTarget,
  quickAddText,
  editingAnnotationId,
  building,
  switchingVersion,
  annotationMode,
  onScrollTo,
  onOpenQuickAdd,
  onQuickAddTextChange,
  onAddAnnotation,
  onCloseQuickAdd,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onStartEditing,
  onCancelEditing,
  onHighlightAnnotation,
  onApplyAnnotations,
  onRetryFailed,
  onToggleAnnotation,
  onToggleInspection,
  onHideSection,
  onUnhideSection,
  onAddSection,
  buildVersions,
  activeVersionDirName,
  onRevertVersion,
  onRevertToLatest,
}: {
  sections: ArtifactSection[];
  regeneratedSections: string[];
  contractVersion: number | null;
  loading: boolean;
  annotations: Annotation[];
  quickAddTarget: QuickAddTarget | null;
  quickAddText: string;
  editingAnnotationId: string | null;
  building: boolean;
  switchingVersion: boolean;
  annotationMode: boolean;
  onScrollTo: (id: string) => void;
  onOpenQuickAdd: (sectionId: string, sectionTitle: string) => void;
  onQuickAddTextChange: (value: string) => void;
  onAddAnnotation: () => void;
  onCloseQuickAdd: () => void;
  onUpdateAnnotation: (id: string, instruction: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onStartEditing: (id: string) => void;
  onCancelEditing: () => void;
  onHighlightAnnotation: (annotation: Annotation) => void;
  onApplyAnnotations: () => void;
  onRetryFailed: () => void;
  onToggleAnnotation: (id: string) => void;
  onToggleInspection: () => void;
  onHideSection: (sectionId: string) => void;
  onUnhideSection: (sectionId: string) => void;
  onAddSection: (description: string, afterSectionId: string | null) => void;
  buildVersions: BuildVersion[];
  activeVersionDirName: string | null;
  onRevertVersion: (versionDirName: string) => void;
  onRevertToLatest: () => void;
}) {
  const pendingAnnotations = annotations.filter(a => a.status === "pending");
  const failedAnnotations = annotations.filter(a => a.status === "failed");
  const appliedAnnotations = annotations.filter(a => a.status === "applied");
  const inactiveAnnotations = annotations.filter(a => a.status === "inactive");
  const pendingCount = pendingAnnotations.length;
  const failedCount = failedAnnotations.length;

  // Draft section annotations (add_section type)
  const draftSectionAnnotations = pendingAnnotations.filter(a => a.type === "add_section");

  // Section filtering and delete confirmation state
  const [showHidden, setShowHidden] = useState(true);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Add section form state
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSectionDescription, setAddSectionDescription] = useState("");
  const [addSectionAfter, setAddSectionAfter] = useState<string | null>(null);

  // Version revert confirmation
  const [confirmingRevertId, setConfirmingRevertId] = useState<string | null>(null);

  const hiddenCount = sections.filter(s => s.hidden).length;
  const visibleSections = showHidden ? sections : sections.filter(s => !s.hidden);

  function handleSubmitAddSection() {
    if (!addSectionDescription.trim()) return;
    onAddSection(addSectionDescription.trim(), addSectionAfter);
    setAddSectionDescription("");
    setAddSectionAfter(null);
    setAddSectionOpen(false);
  }

  return (
    <div className="artifacts-section-panel">
      <div className="artifacts-section-panel-header">
        <h3>Sections</h3>
        <button
          className={`artifacts-inspect-btn ${annotationMode ? "active" : ""}`}
          onClick={onToggleInspection}
          type="button"
          title={annotationMode ? "Exit inspection mode" : "Pick a UI element to annotate"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          <span className="artifacts-inspect-btn-label">Pick UI to Annotate</span>
        </button>
      </div>
      {hiddenCount > 0 ? (
        <div className="artifacts-section-filter-bar">
          <label className="artifacts-section-filter-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show hidden ({hiddenCount})
          </label>
        </div>
      ) : null}
      {contractVersion === null ? (
        <div className="artifacts-section-panel-warning">
          This artifact was built before section editing was supported. Visual changes will work, but interactive features may need a full rebuild.
        </div>
      ) : null}
      {loading ? (
        <div className="artifacts-section-panel-loading">Loading sections…</div>
      ) : visibleSections.length === 0 ? (
        <div className="artifacts-section-panel-empty">No sections found.</div>
      ) : (
        <ul className="artifacts-section-list">
          {visibleSections.map((section) => {
            const isModified = regeneratedSections.includes(section.id);
            const sectionAnnotationCount = pendingAnnotations.filter(a => a.sectionId === section.id).length;
            const isQuickAdding = quickAddTarget?.sectionId === section.id;
            const isHidden = section.hidden === true;
            const isConfirmingDelete = confirmingDeleteId === section.id;
            return (
              <li key={section.id} className={`artifacts-section-item ${isQuickAdding ? "active" : ""} ${isHidden ? "hidden" : ""}`}>
                <div className="artifacts-section-item-header">
                  <button
                    className="artifacts-section-item-title"
                    onClick={() => onScrollTo(section.id)}
                    type="button"
                    title={isHidden ? `${section.title} (hidden)` : `Scroll to ${section.title}`}
                  >
                    {section.title}
                    {isModified && !isHidden ? <span className="artifacts-section-modified-badge">edited</span> : null}
                    {isHidden ? <span className="artifacts-section-deleted-badge">hidden</span> : null}
                  </button>
                  {isHidden ? (
                    <button
                      className="artifacts-section-restore-btn"
                      onClick={() => onUnhideSection(section.id)}
                      type="button"
                      title="Show (unhide) this section"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Show
                    </button>
                  ) : (
                    <>
                      <button
                        className="artifacts-section-comment-btn"
                        onClick={() => onOpenQuickAdd(section.id, section.title)}
                        disabled={building}
                        type="button"
                        title="Comment on this section"
                      >
                        💬
                        {sectionAnnotationCount > 0 ? (
                          <span className="artifacts-annotation-count-badge">{sectionAnnotationCount}</span>
                        ) : null}
                      </button>
                      <button
                        className="artifacts-section-delete-btn"
                        onClick={() => setConfirmingDeleteId(section.id)}
                        disabled={building}
                        type="button"
                        title="Hide this section"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      </button>
                    </>
                  )}
                </div>
                {isConfirmingDelete && !isHidden ? (
                  <div className="artifacts-section-delete-confirm">
                    <span className="artifacts-section-delete-confirm-text">Hide this section?</span>
                    <button
                      className="artifacts-section-delete-confirm-yes"
                      onClick={() => { onHideSection(section.id); setConfirmingDeleteId(null); }}
                      type="button"
                      title="Confirm hide"
                    >
                      ✓
                    </button>
                    <button
                      className="artifacts-section-delete-confirm-no"
                      onClick={() => setConfirmingDeleteId(null)}
                      type="button"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                {isQuickAdding && !isHidden ? (
                  <div className="artifacts-quick-add">
                    {quickAddTarget.elementContext ? (
                      <div className="artifacts-section-feedback-element">
                        <span className="artifacts-section-feedback-element-tag">{quickAddTarget.elementContext.elementTag}</span>
                        {quickAddTarget.elementContext.cssPath ? (
                          <span className="artifacts-section-feedback-element-path">{quickAddTarget.elementContext.cssPath}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="artifacts-quick-add-row">
                      <input
                        className="artifacts-quick-add-input"
                        placeholder="What should change?…"
                        value={quickAddText}
                        onChange={(e) => onQuickAddTextChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && quickAddText.trim()) { e.preventDefault(); onAddAnnotation(); } if (e.key === "Escape") onCloseQuickAdd(); }}
                        autoFocus
                      />
                      <button
                        className="artifacts-quick-add-btn"
                        disabled={!quickAddText.trim()}
                        onClick={onAddAnnotation}
                        type="button"
                        title="Add annotation"
                      >
                        +
                      </button>
                      <button
                        className="artifacts-quick-add-close"
                        onClick={onCloseQuickAdd}
                        type="button"
                        title="Cancel"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Draft section annotations */}
      {draftSectionAnnotations.length > 0 ? (
        <div className="artifacts-draft-sections">
          {draftSectionAnnotations.map((ann) => (
            <div key={ann.id} className="artifacts-draft-section-card">
              <div className="artifacts-draft-section-header">
                <span className="artifacts-draft-section-badge">Draft</span>
                <span className="artifacts-draft-section-label">New Section</span>
                <button
                  className="artifacts-draft-section-remove"
                  onClick={() => onDeleteAnnotation(ann.id)}
                  type="button"
                  title="Remove draft section"
                >
                  ✕
                </button>
              </div>
              <div className="artifacts-draft-section-description">{ann.instruction}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Add Section button/form */}
      {!addSectionOpen ? (
        <button
          className="artifacts-add-section-btn"
          onClick={() => setAddSectionOpen(true)}
          disabled={building}
          type="button"
        >
          + Add Section
        </button>
      ) : (
        <div className="artifacts-add-section-form">
          <div className="artifacts-add-section-form-header">
            <span>Add New Section</span>
            <button
              className="artifacts-add-section-form-close"
              onClick={() => { setAddSectionOpen(false); setAddSectionDescription(""); setAddSectionAfter(null); }}
              type="button"
              title="Cancel"
            >
              ×
            </button>
          </div>
          <select
            className="artifacts-add-section-position"
            value={addSectionAfter ?? "__beginning__"}
            onChange={(e) => setAddSectionAfter(e.target.value === "__beginning__" ? null : e.target.value)}
          >
            <option value="__beginning__">At the beginning</option>
            {sections.filter(s => !s.hidden).map((s) => (
              <option key={s.id} value={s.id}>After: {s.title}</option>
            ))}
          </select>
          <textarea
            className="artifacts-add-section-textarea"
            placeholder="Describe what this section should be about…"
            value={addSectionDescription}
            onChange={(e) => setAddSectionDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey && addSectionDescription.trim()) { e.preventDefault(); handleSubmitAddSection(); } if (e.key === "Escape") { setAddSectionOpen(false); setAddSectionDescription(""); setAddSectionAfter(null); } }}
            rows={3}
            autoFocus
          />
          <div className="artifacts-add-section-form-actions">
            <button
              className="artifacts-add-section-submit"
              disabled={!addSectionDescription.trim()}
              onClick={handleSubmitAddSection}
              type="button"
            >
              Add as Draft
            </button>
          </div>
        </div>
      )}

      {pendingAnnotations.length > 0 ? (
        <div className="artifacts-annotation-queue">
          <div className="artifacts-annotation-queue-header">
            📝 {pendingCount} pending change{pendingCount !== 1 ? "s" : ""}
          </div>
          {pendingAnnotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              isEditing={editingAnnotationId === ann.id}
              onHighlight={() => onHighlightAnnotation(ann)}
              onStartEditing={() => onStartEditing(ann.id)}
              onCancelEditing={onCancelEditing}
              onUpdate={(instruction) => onUpdateAnnotation(ann.id, instruction)}
              onDelete={() => onDeleteAnnotation(ann.id)}
              onToggle={() => onToggleAnnotation(ann.id)}
            />
          ))}
        </div>
      ) : null}

      {pendingCount > 0 ? (
        <button
          className="artifacts-batch-regen-btn"
          disabled={building}
          onClick={onApplyAnnotations}
          type="button"
        >
          Regenerate w/ {pendingCount} change{pendingCount !== 1 ? "s" : ""}
        </button>
      ) : null}

      {failedCount > 0 && pendingCount === 0 ? (
        <button
          className="artifacts-batch-retry-btn"
          onClick={onRetryFailed}
          type="button"
        >
          Retry {failedCount} failed change{failedCount !== 1 ? "s" : ""}
        </button>
      ) : null}

      {appliedAnnotations.length > 0 || inactiveAnnotations.length > 0 ? (
        <details className="artifacts-annotation-history">
          <summary className="artifacts-annotation-history-header">
            {appliedAnnotations.length > 0 ? `✓ ${appliedAnnotations.length} applied` : ''}
            {appliedAnnotations.length > 0 && inactiveAnnotations.length > 0 ? ' · ' : ''}
            {inactiveAnnotations.length > 0 ? `${inactiveAnnotations.length} inactive` : ''}
          </summary>
          {appliedAnnotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              isEditing={editingAnnotationId === ann.id}
              onHighlight={() => onHighlightAnnotation(ann)}
              onStartEditing={() => onStartEditing(ann.id)}
              onCancelEditing={onCancelEditing}
              onUpdate={(instruction) => onUpdateAnnotation(ann.id, instruction)}
              onDelete={() => onDeleteAnnotation(ann.id)}
              onToggle={() => onToggleAnnotation(ann.id)}
            />
          ))}
          {inactiveAnnotations.map((ann) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              isEditing={editingAnnotationId === ann.id}
              onHighlight={() => onHighlightAnnotation(ann)}
              onStartEditing={() => onStartEditing(ann.id)}
              onCancelEditing={onCancelEditing}
              onUpdate={(instruction) => onUpdateAnnotation(ann.id, instruction)}
              onDelete={() => onDeleteAnnotation(ann.id)}
              onToggle={() => onToggleAnnotation(ann.id)}
            />
          ))}
        </details>
      ) : null}

      {/* Version History */}
      {buildVersions.length > 0 ? (
        <details className="artifacts-version-history">
          <summary className="artifacts-version-history-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign: "-1px", marginRight: "4px", opacity: 0.7}}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            Version History ({buildVersions.length})
          </summary>
          <ul className="artifacts-version-list">
            {activeVersionDirName ? (
              <li className="artifacts-version-item">
                <span className="artifacts-version-label">
                  <span className="artifacts-version-current-text">Latest build</span>
                </span>
                <button
                  className="artifacts-version-revert-btn"
                  onClick={onRevertToLatest}
                  disabled={building || switchingVersion}
                  type="button"
                  title="Switch to latest build"
                >Switch</button>
              </li>
            ) : (
              <li className="artifacts-version-item artifacts-version-current">
                <span className="artifacts-version-label">
                  <span className="artifacts-version-current-dot">●</span>
                  <span className="artifacts-version-current-text">Latest build</span>
                </span>
              </li>
            )}
            {buildVersions.map((v) => {
              const dateStr = new Date(v.timestamp).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              });
              const isConfirming = confirmingRevertId === v.dirName;
              const isActive = activeVersionDirName === v.dirName;
              return (
                <li key={v.dirName} className={`artifacts-version-item${isActive ? " artifacts-version-active" : ""}`}>
                  <span className="artifacts-version-label">
                    {isActive ? <span className="artifacts-version-current-dot">●</span> : null}
                    <span className="artifacts-version-number">v{v.version}</span>
                    <span className="artifacts-version-date">{dateStr}</span>
                    {isActive ? <span className="artifacts-version-active-tag">(active)</span> : null}
                  </span>
                  {isActive ? null : isConfirming ? (
                    <span className="artifacts-version-confirm">
                      <span className="artifacts-version-confirm-text">Revert?</span>
                      <button
                        className="artifacts-version-confirm-yes"
                        onClick={() => { onRevertVersion(v.dirName); setConfirmingRevertId(null); }}
                        type="button"
                        title="Confirm revert"
                      >✓</button>
                      <button
                        className="artifacts-version-confirm-no"
                        onClick={() => setConfirmingRevertId(null)}
                        type="button"
                        title="Cancel"
                      >✕</button>
                    </span>
                  ) : (
                    <button
                      className="artifacts-version-revert-btn"
                      onClick={() => setConfirmingRevertId(v.dirName)}
                      disabled={building || switchingVersion}
                      type="button"
                      title={`Revert to v${v.version}`}
                    >Revert</button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* ─── Annotation Card ────────────────────────────────────── */

function AnnotationCard({
  annotation,
  isEditing,
  onHighlight,
  onStartEditing,
  onCancelEditing,
  onUpdate,
  onDelete,
  onToggle,
}: {
  annotation: Annotation;
  isEditing: boolean;
  onHighlight: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onUpdate: (instruction: string) => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [editText, setEditText] = useState(annotation.instruction);
  const isPending = annotation.status === "pending";
  const isReactivated = isPending && annotation.previouslyApplied;

  return (
    <div className={`artifacts-annotation-card ${annotation.status}${isReactivated ? " reactivated" : ""}`}>
      <div className="artifacts-annotation-card-header">
        <button
          className="artifacts-annotation-card-section"
          onClick={onHighlight}
          type="button"
          title="Scroll to this element"
        >
          {annotation.sectionTitle}
        </button>
        {isReactivated ? <span className="artifacts-annotation-reactivated-badge">reactivated</span> : null}
        {isPending ? (
          <span className="artifacts-annotation-card-actions">
            <button onClick={onStartEditing} type="button" data-tooltip="Edit">✎</button>
            <button onClick={onToggle} type="button" data-tooltip="Deactivate">⏸</button>
            <button onClick={onDelete} type="button" data-tooltip="Delete">✕</button>
          </span>
        ) : (
          <span className="artifacts-annotation-card-actions">
            <button onClick={onToggle} type="button" data-tooltip="Reactivate" className="artifacts-annotation-reactivate">↻</button>
            <button onClick={onDelete} type="button" data-tooltip="Delete">✕</button>
          </span>
        )}
      </div>
      {annotation.elementContext ? (
        <div className="artifacts-section-feedback-element" style={{ marginTop: 2 }}>
          <span className="artifacts-section-feedback-element-tag">{annotation.elementContext.elementTag}</span>
          {annotation.elementContext.cssPath ? (
            <span className="artifacts-section-feedback-element-path">{annotation.elementContext.cssPath}</span>
          ) : null}
        </div>
      ) : null}
      {isEditing ? (
        <div className="artifacts-annotation-edit-row">
          <input
            className="artifacts-quick-add-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && editText.trim()) { e.preventDefault(); onUpdate(editText.trim()); } if (e.key === "Escape") onCancelEditing(); }}
            autoFocus
          />
          <button
            className="artifacts-quick-add-btn"
            disabled={!editText.trim()}
            onClick={() => onUpdate(editText.trim())}
            type="button"
          >
            ✓
          </button>
        </div>
      ) : (
        <div className="artifacts-annotation-instruction">{annotation.instruction}</div>
      )}
    </div>
  );
}
