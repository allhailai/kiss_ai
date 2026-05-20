import { useCallback, useEffect, useState } from "react";
import type { AiSuggestion } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import "./SuggestionsWorkspace.css";

type SuggestionsFilter = "all" | "pending" | "accepted" | "dismissed";

function statusLabel(status: AiSuggestion["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "dismissed":
      return "Dismissed";
  }
}

function SuggestionCard({
  suggestion,
  onResolve,
  onNavigateToFile,
}: {
  suggestion: AiSuggestion;
  onResolve: (suggestionId: string, status: "accepted" | "dismissed") => void;
  onNavigateToFile: (path: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isPending = suggestion.status === "pending";

  const handleResolve = useCallback(
    async (status: "accepted" | "dismissed") => {
      if (saving) return;
      setSaving(true);
      try {
        onResolve(suggestion.id, status);
      } finally {
        setSaving(false);
      }
    },
    [saving, onResolve, suggestion.id],
  );

  return (
    <article className={`suggestion-card suggestion-card-${suggestion.status}`}>
      <header className="suggestion-card-header">
        <span className={`suggestion-status-pill suggestion-status-${suggestion.status}`}>
          {statusLabel(suggestion.status)}
        </span>
      </header>

      <p className="suggestion-card-text">{suggestion.text}</p>

      {suggestion.sourceFile ? (
        <div className="suggestion-card-source">
          <span className="suggestion-card-source-label">Source:</span>
          <button
            className="suggestion-card-file-link"
            onClick={() => onNavigateToFile(suggestion.sourceFile)}
            type="button"
          >
            {suggestion.sourceFile.split("/").pop()}
          </button>
        </div>
      ) : null}

      <div className="suggestion-card-meta">
        <span>Created {formatLocalDateTime(suggestion.createdAt, "Unknown")}</span>
        {suggestion.createdDuring.phase ? <span>Phase {suggestion.createdDuring.phase}</span> : null}
        {suggestion.createdDuring.modelId ? <span>{suggestion.createdDuring.modelId}</span> : null}
      </div>

      {isPending ? (
        <div className="suggestion-card-actions">
          <button
            className="suggestion-accept-button"
            disabled={saving}
            onClick={() => void handleResolve("accepted")}
            type="button"
          >
            {saving ? "Saving…" : "Accept"}
          </button>
          <button
            className="suggestion-dismiss-button"
            disabled={saving}
            onClick={() => void handleResolve("dismissed")}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : (
        suggestion.resolvedAt ? (
          <span className="suggestion-card-resolved-at">
            {suggestion.status === "accepted" ? "Accepted" : "Dismissed"}{" "}
            {formatLocalDateTime(suggestion.resolvedAt, "")}
          </span>
        ) : null
      )}
    </article>
  );
}

export function SuggestionsWorkspace({
  onNavigateToFile,
  projectSlug,
}: {
  onNavigateToFile: (path: string) => void;
  projectSlug: string;
}) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SuggestionsFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/suggestions`);
      if (!response.ok) throw new Error("Failed to load suggestions");
      const data = await response.json();
      setSuggestions(data.suggestions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  const handleResolve = useCallback(
    async (suggestionId: string, status: "accepted" | "dismissed") => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectSlug)}/suggestions/${encodeURIComponent(suggestionId)}/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          },
        );
        if (!response.ok) throw new Error("Failed to resolve suggestion");

        // Refresh the list
        await fetchSuggestions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resolve suggestion");
      }
    },
    [projectSlug, fetchSuggestions],
  );

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const acceptedCount = suggestions.filter((s) => s.status === "accepted").length;
  const dismissedCount = suggestions.filter((s) => s.status === "dismissed").length;

  const filteredSuggestions = suggestions.filter((s) => {
    if (filter === "pending") return s.status === "pending";
    if (filter === "accepted") return s.status === "accepted";
    if (filter === "dismissed") return s.status === "dismissed";
    return true;
  });

  // Sort: pending first, then by date (newest first)
  const sortedSuggestions = [...filteredSuggestions].sort((a, b) => {
    const statusOrder = { pending: 0, accepted: 1, dismissed: 2 };
    const sa = statusOrder[a.status] ?? 2;
    const sb = statusOrder[b.status] ?? 2;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (loading) {
    return (
      <div className="suggestions-workspace">
        <p className="suggestions-loading">Loading suggestions…</p>
      </div>
    );
  }

  return (
    <div className="suggestions-workspace">
      <header className="suggestions-header">
        <h2>AI Suggestions</h2>
        <p className="suggestions-summary">
          {pendingCount} pending · {acceptedCount} accepted · {dismissedCount} dismissed · {suggestions.length} total
        </p>
        <div className="suggestions-filter-bar">
          {(["all", "pending", "accepted", "dismissed"] as const).map((f) => (
            <button
              className={`suggestions-filter-button${filter === f ? " active" : ""}`}
              key={f}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="suggestions-error">{error}</p> : null}

      {sortedSuggestions.length === 0 ? (
        <div className="suggestions-empty">
          <p>
            {suggestions.length === 0
              ? "No suggestions yet. Run a build to generate suggestions from the AI."
              : `No ${filter} suggestions.`}
          </p>
        </div>
      ) : (
        <div className="suggestions-list">
          {sortedSuggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              onNavigateToFile={onNavigateToFile}
              onResolve={handleResolve}
              suggestion={s}
            />
          ))}
        </div>
      )}
    </div>
  );
}
