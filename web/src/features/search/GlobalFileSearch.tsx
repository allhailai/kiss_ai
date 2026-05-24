import { useEffect, useState, type KeyboardEvent } from "react";
import type { ProjectFile } from "../../contracts/api";
import { useBuildContext } from "../../app/contexts/BuildContext";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { fileBasename, humanizePathSegment } from "../../domain/files";

export function GlobalFileSearch({
  projectName,
  projectSlug,
  onOpenFile,
  onOpenDashboard,
  onOpenProjectHome,
  onSwitchProject,
}: {
  projectName: string;
  projectSlug: string;
  onOpenFile: (path: string) => void;
  onOpenDashboard: () => void;
  onOpenProjectHome: () => void;
  onSwitchProject: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
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
      api
        .searchFiles(projectSlug, trimmedQuery, controller.signal)
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
  }, [projectSlug, trimmedQuery]);

  function openResult(path: string) {
    onOpenFile(path);
    setQuery("");
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

  const showResults = isOpen && Boolean(trimmedQuery);
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
      <div className="global-search" role="search">
        <label className="global-search-label" htmlFor="global-file-search">
          Search file paths
        </label>
        <div className="global-search-field">
          <input
            autoComplete="off"
            id="global-file-search"
            onBlur={() => {
              window.setTimeout(() => setIsOpen(false), 120);
            }}
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
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="global-topbar-actions">
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
        <button
          aria-label="Open technical dashboard"
          className="technical-dashboard-button"
          onClick={onOpenDashboard}
          title="Technical dashboard"
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a8.1 8.1 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A8.1 8.1 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a8.1 8.1 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a8.1 8.1 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle
              cx="12"
              cy="12"
              fill="none"
              r="3.1"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
