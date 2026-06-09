import { useEffect, useState, useRef, type KeyboardEvent } from "react";
import type { ProjectFile } from "../../contracts/api";
import { useBuildContext } from "../../app/contexts/BuildContext";
import { filesApi } from "../../data/filesApi";
import { errorMessage } from "../../domain/errors";
import { fileBasename, humanizePathSegment } from "../../domain/files";

export function GlobalFileSearch({
  projectName,
  projectSlug,
  onOpenFile,
  onOpenProjectHome,
  onSwitchProject,
  sidebarOpen,
  onToggleSidebar,
  rightPanelOpen,
  onToggleRightPanel,
}: {
  projectName: string;
  projectSlug: string;
  onOpenFile: (path: string) => void;
  onOpenProjectHome: () => void;
  onSwitchProject: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const trimmedQuery = query.trim();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!trimmedQuery && filter === "all") {
      setResults([]);
      setLoading(false);
      setError("");
      setActiveResultIndex(-1);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError("");

    const timeoutId = window.setTimeout(() => {
      filesApi
        .searchFiles(projectSlug, trimmedQuery, controller.signal, filter)
        .then((response) => {
          if (cancelled) return;
          setResults(response.files);
          setActiveResultIndex(response.files.length ? 0 : -1);
          setIsOpen(true);
        })
        .catch((searchError) => {
          if (cancelled) return;
          if (
            searchError instanceof DOMException &&
            searchError.name === "AbortError"
          )
            return;
          setResults([]);
          setActiveResultIndex(-1);
          setError(
            errorMessage(searchError, "Could not search project paths."),
          );
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [projectSlug, trimmedQuery, filter]);

  function openResult(path: string) {
    onOpenFile(path);
    setQuery("");
    setFilter("all");
    setResults([]);
    setIsOpen(false);
    setActiveResultIndex(-1);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!results.length) return;
      setIsOpen(true);
      setActiveResultIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      setIsOpen(true);
      setActiveResultIndex((current) =>
        current <= 0 ? results.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      const activeResult = results[activeResultIndex] ?? results[0];
      if (!activeResult) return;
      event.preventDefault();
      openResult(activeResult.path);
    }
  }

  const showResults = isOpen && (Boolean(trimmedQuery) || filter !== "all");
  const { isBuilding, openBuildPanel, rebuild } = useBuildContext();
  const buildPhaseLabel = rebuild?.buildPhase ? rebuild.buildPhase.replace(/_/g, " ") : null;

  return (
    <header className="global-topbar">
      <div className="project-header-breadcrumb" aria-label="Project navigation">
        <button className="project-header-projects-link" onClick={onSwitchProject} type="button">
          Projects
        </button>
        <span aria-hidden="true" className="project-header-separator">
          /
        </span>
        <button className="project-header-title" onClick={onOpenProjectHome} type="button">
          {projectName}
        </button>
      </div>
      <div className="topbar-panel-toggles" role="group" aria-label="Panel layout">
        <button
          className={`topbar-panel-toggle-btn ${sidebarOpen ? "active" : ""}`}
          onClick={onToggleSidebar}
          type="button"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={sidebarOpen}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="2" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="1" y="2" width="6" height="16" rx="2" fill={sidebarOpen ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" opacity={sidebarOpen ? 0.5 : 0.3} />
          </svg>
        </button>
        <button
          className={`topbar-panel-toggle-btn ${rightPanelOpen ? "active" : ""}`}
          onClick={onToggleRightPanel}
          type="button"
          title={rightPanelOpen ? "Hide AI panel" : "Show AI panel"}
          aria-pressed={rightPanelOpen}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="2" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="13" y="2" width="6" height="16" rx="2" fill={rightPanelOpen ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" opacity={rightPanelOpen ? 0.5 : 0.3} />
          </svg>
        </button>
      </div>
      <div className="global-search" role="search" ref={searchContainerRef}>
        <label className="global-search-label" htmlFor="global-file-search">
          Search file paths
        </label>
        <div className="global-search-field">
          <select
            className="global-search-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter search results"
          >
            <option value="all">All</option>
            <option value="sources">Sources</option>
            <option value="wiki">Wiki</option>
            <option value="outputs">Outputs</option>
          </select>
          <input
            autoComplete="off"
            id="global-file-search"
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search paths in inputs, outputs, and human files..."
            type="search"
            value={query}
          />
          {showResults ? (
            <div className="global-search-results" role="listbox">
              {loading ? (
                <p className="global-search-state">Searching...</p>
              ) : null}
              {!loading && error ? (
                <p className="global-search-state">{error}</p>
              ) : null}
              {!loading && !error && results.length === 0 ? (
                <p className="global-search-state">No matching paths found.</p>
              ) : null}
              {!loading && !error
                ? results.map((file, index) => (
                    <button
                      aria-selected={index === activeResultIndex}
                      className={
                        index === activeResultIndex
                          ? "global-search-result active"
                          : "global-search-result"
                      }
                      key={file.path}
                      onMouseEnter={() => setActiveResultIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openResult(file.path)}
                      role="option"
                      title={file.path}
                      type="button"
                    >
                      <strong>
                        {humanizePathSegment(fileBasename(file.path))}
                      </strong>
                      <span>{file.path}</span>
                      {file.snippet ? (
                        <span className="global-search-snippet">{file.snippet}</span>
                      ) : null}
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="global-topbar-actions">
        <a
          className="global-download-btn"
          href={`/api/projects/${encodeURIComponent(projectSlug)}/export`}
          download
          title="Download Project as ZIP"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download ZIP
        </a>
        {isBuilding ? (
          <button
            aria-label="Build in progress — click to view"
            className="global-activity-badge"
            onClick={openBuildPanel}
            title={buildPhaseLabel ? `Building: ${buildPhaseLabel}` : "Build in progress"}
            type="button"
          >
            <span className="global-activity-dot" aria-hidden="true" />
            <span>{buildPhaseLabel || "Working…"}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
