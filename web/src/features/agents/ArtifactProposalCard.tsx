import { useCallback, useEffect, useState } from "react";
import type { ArtifactSpec, ChatMessageArtifactProposal } from "../../contracts/api";
import { artifactsApi } from "../../data/artifactsApi";

type CardState = "preview" | "checking" | "exists" | "duplicates" | "creating" | "created" | "error";

type ArtifactProposalCardProps = {
  projectSlug: string;
  proposal: ChatMessageArtifactProposal;
  selectedBuildModelId: string;
  onCreated: (slug: string, name: string) => void;
  disabled?: boolean;
};

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function ArtifactProposalCard({
  projectSlug,
  proposal,
  selectedBuildModelId,
  onCreated,
  disabled = false,
}: ArtifactProposalCardProps) {
  const [title, setTitle] = useState(proposal.title);
  const [cardState, setCardState] = useState<CardState>("checking");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingMatch, setExistingMatch] = useState<{ slug: string; name: string; status: string } | null>(null);
  const [similarArtifacts, setSimilarArtifacts] = useState<ArtifactSpec[]>([]);
  const [forceCreate, setForceCreate] = useState(false);

  // On mount: check if an artifact with this name already exists
  useEffect(() => {
    if (!proposal.title.trim()) {
      setCardState("preview");
      return;
    }
    let cancelled = false;
    setCardState("checking");

    artifactsApi.list(projectSlug)
      .then((data) => {
        if (cancelled) return;
        const normalizedInput = normalizeForComparison(proposal.title);
        const exactMatch = data.artifacts.find((a) => normalizeForComparison(a.name) === normalizedInput);
        if (exactMatch) {
          setExistingMatch({ slug: exactMatch.slug, name: exactMatch.name, status: exactMatch.status });
          setCardState("exists");
        } else {
          // Check for similar names (simple substring overlap)
          const similar = data.artifacts.filter((a) => {
            const normalizedExisting = normalizeForComparison(a.name);
            const words = normalizedInput.split(" ").filter((w) => w.length > 3);
            const matchingWords = words.filter((word) => normalizedExisting.includes(word));
            return matchingWords.length >= Math.ceil(words.length * 0.5) && words.length > 0;
          });
          if (similar.length > 0) {
            setSimilarArtifacts(similar);
            setCardState("duplicates");
          } else {
            setCardState("preview");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setCardState("preview");
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally runs only on mount

  const handleCreate = useCallback(async () => {
    if (!title.trim() || cardState === "creating") return;
    setCardState("creating");
    setError(null);

    try {
      // Build the spec body from the proposal
      const bodyParts: string[] = [];
      if (proposal.summary) {
        bodyParts.push(proposal.summary);
      }
      if (proposal.details.length) {
        bodyParts.push("");
        bodyParts.push("## Key Content");
        proposal.details.forEach((detail) => {
          bodyParts.push(`- ${detail}`);
        });
      }
      // Use the specBody from the agent if available, otherwise use the generated body
      const body = proposal.specBody || bodyParts.join("\n");

      const result = await artifactsApi.create(projectSlug, title.trim(), body);

      // Set the model on the newly created artifact
      if (selectedBuildModelId) {
        try {
          const spec = await artifactsApi.read(projectSlug, result.slug);
          await artifactsApi.update(
            projectSlug,
            result.slug,
            { ...spec.frontmatter, modelId: selectedBuildModelId },
            spec.body,
          );
        } catch {
          // Best-effort model assignment — don't fail the creation
        }
      }

      setCreatedSlug(result.slug);
      setCardState("created");
      onCreated(result.slug, title.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create artifact.");
      setCardState("error");
    }
  }, [title, cardState, projectSlug, proposal, selectedBuildModelId, onCreated]);

  // ── "Checking" state ──
  if (cardState === "checking") {
    return (
      <div className="artifact-proposal-card">
        <div className="artifact-proposal-card-header">
          <span className="artifact-proposal-card-icon" aria-hidden="true">📄</span>
          <strong>Checking existing artifacts…</strong>
        </div>
      </div>
    );
  }

  // ── "Already exists" state (exact match) ──
  if (cardState === "exists" && existingMatch) {
    return (
      <div className="artifact-proposal-card artifact-proposal-card-created">
        <div className="artifact-proposal-card-header">
          <span className="artifact-proposal-card-icon" aria-hidden="true">✅</span>
          <strong>Artifact Already Exists</strong>
        </div>
        <p className="artifact-proposal-card-title-display">{existingMatch.name}</p>
        <div className="artifact-proposal-card-meta">
          <span>Status: {existingMatch.status === "built" ? "Generated" : "Not generated"}</span>
          <span>This artifact was already created.</span>
        </div>
        <div className="artifact-proposal-card-actions">
          <button
            className="artifact-proposal-card-view-button"
            onClick={() => onCreated(existingMatch.slug, existingMatch.name)}
            type="button"
          >
            View Artifact
          </button>
        </div>
      </div>
    );
  }

  // ── "Similar artifacts found" state ──
  if (cardState === "duplicates") {
    return (
      <div className="artifact-proposal-card artifact-proposal-card-duplicates">
        <div className="artifact-proposal-card-header">
          <span className="artifact-proposal-card-icon" aria-hidden="true">⚠️</span>
          <strong>Potentially Similar Artifacts</strong>
        </div>
        <p className="artifact-proposal-card-notice">
          These existing artifacts look similar to &ldquo;{title.trim()}&rdquo;:
        </p>
        <ul className="artifact-proposal-card-duplicate-list">
          {similarArtifacts.map((artifact) => (
            <li key={artifact.slug}>
              <strong>{artifact.name}</strong>
              <span className="artifact-proposal-card-duplicate-status">
                {artifact.status === "built" ? "Generated" : "Not generated"}
              </span>
            </li>
          ))}
        </ul>
        <label className="artifact-proposal-card-force-label">
          <input
            checked={forceCreate}
            onChange={(e) => setForceCreate(e.target.checked)}
            type="checkbox"
          />
          Create anyway — I know this is different
        </label>
        <div className="artifact-proposal-card-actions">
          <button
            className="artifact-proposal-card-create-button"
            disabled={!forceCreate || disabled}
            onClick={() => void handleCreate()}
            type="button"
          >
            Create Artifact
          </button>
          <button
            className="artifact-proposal-card-cancel-button"
            onClick={() => {
              setCardState("preview");
              setForceCreate(false);
            }}
            type="button"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── "Created" state ──
  if (cardState === "created" && createdSlug) {
    return (
      <div className="artifact-proposal-card artifact-proposal-card-created">
        <div className="artifact-proposal-card-header">
          <span className="artifact-proposal-card-icon" aria-hidden="true">✅</span>
          <strong>Artifact Created</strong>
        </div>
        <p className="artifact-proposal-card-title-display">{title}</p>
      </div>
    );
  }

  // ── "Preview" / "Error" / default input state ──
  return (
    <div className="artifact-proposal-card">
      <div className="artifact-proposal-card-header">
        <span className="artifact-proposal-card-icon" aria-hidden="true">📄</span>
        <strong>{cardState === "creating" ? "Creating Artifact…" : "Artifact Ready"}</strong>
      </div>
      {error ? <p className="artifact-proposal-card-error">{error}</p> : null}
      <div className="artifact-proposal-card-field">
        <label htmlFor="artifact-proposal-title">Title</label>
        <input
          autoFocus
          disabled={disabled || cardState === "creating"}
          id="artifact-proposal-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Artifact title"
          type="text"
          value={title}
        />
      </div>
      {proposal.summary ? (
        <p className="artifact-proposal-card-summary">{proposal.summary}</p>
      ) : null}
      {proposal.details.length ? (
        <ul className="artifact-proposal-card-details">
          {proposal.details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      ) : null}
      <div className="artifact-proposal-card-actions">
        <button
          className="artifact-proposal-card-create-button"
          disabled={disabled || !title.trim() || cardState === "creating"}
          onClick={() => void handleCreate()}
          type="button"
        >
          {cardState === "creating" ? "Creating…" : "Create Artifact"}
        </button>
      </div>
    </div>
  );
}
