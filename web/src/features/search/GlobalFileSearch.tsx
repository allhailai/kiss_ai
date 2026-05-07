import { useEffect, useState, type KeyboardEvent } from "react";
import { api, type ProjectFile } from "../../api";
import { fileBasename, humanizePathSegment } from "../../domain/files";

export function GlobalFileSearch({
  projectName,
  projectSlug,
  onOpenFile,
  onOpenProjectHome,
  onSwitchProject,
}: {
  projectName: string;
  projectSlug: string;
  onOpenFile: (path: string) => void;
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

    let cancelled = false;
    setLoading(true);
    setError("");

    const timeoutId = window.setTimeout(() => {
      api
        .searchFiles(projectSlug, trimmedQuery)
        .then((response) => {
          if (cancelled) return;
          setResults(response.files);
          setActiveResultIndex(response.files.length ? 0 : -1);
          setIsOpen(true);
        })
        .catch((searchError) => {
          if (cancelled) return;
          setResults([]);
          setActiveResultIndex(-1);
          setError(searchError instanceof Error ? searchError.message : "Could not search project files.");
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
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
      setActiveResultIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
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

  return (
    <header className="global-topbar">
      <button className="project-header-title" onClick={onOpenProjectHome} type="button">
        {projectName}
      </button>
      <div className="global-search" role="search">
        <label className="global-search-label" htmlFor="global-file-search">
          Search files
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
            placeholder="Search inputs, outputs, and human files..."
            type="search"
            value={query}
          />
          {showResults ? (
            <div className="global-search-results" role="listbox">
              {loading ? <p className="global-search-state">Searching...</p> : null}
              {!loading && error ? <p className="global-search-state">{error}</p> : null}
              {!loading && !error && results.length === 0 ? <p className="global-search-state">No matching files found.</p> : null}
              {!loading && !error
                ? results.map((file, index) => (
                    <button
                      aria-selected={index === activeResultIndex}
                      className={index === activeResultIndex ? "global-search-result active" : "global-search-result"}
                      key={file.path}
                      onMouseEnter={() => setActiveResultIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openResult(file.path)}
                      role="option"
                      title={file.path}
                      type="button"
                    >
                      <strong>{humanizePathSegment(fileBasename(file.path))}</strong>
                      <span>{file.path}</span>
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      </div>
      <button className="project-switch-button" onClick={onSwitchProject} type="button">
        Projects
      </button>
    </header>
  );
}
