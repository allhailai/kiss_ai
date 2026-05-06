import { useEffect, useMemo, useState } from "react";
import {
  api,
  type FileContent,
  type RebuildModel,
  type RequirementAutoUpdatePath,
  type RequirementsAutoUpdateProposal,
} from "../../api";
import { buildLineDiff, countDeletedLines, countDiffRangeLines } from "../../domain/diffs";
import { buildDiffPreview, formatModelLabel, modelTierLabels, modelTierOrder } from "./AiAssistPanel";

const requirementAutoUpdatePaths: RequirementAutoUpdatePath[] = [
  "human_goal_requirements.md",
  "human_input_requirements.md",
  "human_output_requirements.md",
];

const requirementLabels: Record<RequirementAutoUpdatePath, string> = {
  "human_goal_requirements.md": "Goal Requirements",
  "human_input_requirements.md": "Input Requirements",
  "human_output_requirements.md": "Output Requirements",
};

export function isRequirementAutoUpdatePath(path: string): path is RequirementAutoUpdatePath {
  return requirementAutoUpdatePaths.includes(path as RequirementAutoUpdatePath);
}

type RequirementsAutoUpdateModalProps = {
  projectSlug: string;
  models: RebuildModel[];
  selectedModelId: string;
  sourcePath: RequirementAutoUpdatePath;
  hasUnsavedSourceChanges: boolean;
  onClose: () => void;
  onModelChange: (modelId: string) => void;
  onNotice: (message: string) => void;
  onAccepted: (writtenPaths: RequirementAutoUpdatePath[]) => Promise<void>;
};

type Phase = "generate" | "review";

export function RequirementsAutoUpdateModal({
  projectSlug,
  models,
  selectedModelId,
  sourcePath,
  hasUnsavedSourceChanges,
  onClose,
  onModelChange,
  onNotice,
  onAccepted,
}: RequirementsAutoUpdateModalProps) {
  const [phase, setPhase] = useState<Phase>("generate");
  const [files, setFiles] = useState<Partial<Record<RequirementAutoUpdatePath, FileContent>>>({});
  const [selectedPaths, setSelectedPaths] = useState<RequirementAutoUpdatePath[]>(() =>
    requirementAutoUpdatePaths.filter((path) => path !== sourcePath),
  );
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<RequirementsAutoUpdateProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let active = true;

    setPhase("generate");
    setSelectedPaths(requirementAutoUpdatePaths.filter((path) => path !== sourcePath));
    setInstruction("");
    setProposal([]);
    setFiles({});
    setLoading(true);

    Promise.all(requirementAutoUpdatePaths.map((path) => api.file(projectSlug, path)))
      .then((loadedFiles) => {
        if (!active) return;
        setFiles(Object.fromEntries(loadedFiles.map((file) => [file.path, file])) as Partial<Record<RequirementAutoUpdatePath, FileContent>>);
      })
      .catch((error) => {
        if (!active) return;
        onNotice(error instanceof Error ? error.message : "Could not load requirement files.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onNotice, projectSlug, sourcePath]);

  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const allFilesLoaded = requirementAutoUpdatePaths.every((path) => files[path]);
  const contentHashes = useMemo(() => {
    const entries = requirementAutoUpdatePaths.map((path) => [path, files[path]?.contentHash ?? ""]);
    return Object.fromEntries(entries) as Record<RequirementAutoUpdatePath, string>;
  }, [files]);
  const proposalsByPath = useMemo(() => new Map(proposal.map((item) => [item.filePath, item])), [proposal]);
  const staleProposalPaths = proposal
    .filter((item) => files[item.filePath] && files[item.filePath]?.contentHash !== item.contentHash)
    .map((item) => item.filePath);

  const toggleSelectedPath = (path: RequirementAutoUpdatePath) => {
    setProposal([]);
    setPhase("generate");
    setSelectedPaths((current) => (current.includes(path) ? current.filter((item) => item !== path) : [...current, path]));
  };

  const generateProposal = async () => {
    if (!selectedPaths.length) {
      onNotice("Select at least one requirement file to update.");
      return;
    }
    if (!allFilesLoaded) {
      onNotice("Requirement files are still loading.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.requirementsAutoUpdatePropose(projectSlug, {
        modelId: selectedModelId,
        sourcePath,
        selectedPaths,
        instruction: instruction.trim() || undefined,
        contentHashes,
      });
      setProposal(response.proposals);
      setPhase("review");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI Auto Update could not generate a proposal.");
    } finally {
      setLoading(false);
    }
  };

  const acceptProposal = async () => {
    if (!proposal.length) return;
    if (staleProposalPaths.length) {
      onNotice("One or more requirement files changed after proposal generation. Regenerate before accepting.");
      return;
    }

    setAccepting(true);
    try {
      const response = await api.requirementsAutoUpdateAccept(projectSlug, {
        proposals: proposal.map(({ filePath, contentHash, proposedContent }) => ({ filePath, contentHash, proposedContent })),
      });
      const writtenPaths = response.files.map((file) => file.path).filter(isRequirementAutoUpdatePath);
      await onAccepted(writtenPaths);
      onNotice(`AI Auto Update wrote ${writtenPaths.length.toLocaleString()} requirement file${writtenPaths.length === 1 ? "" : "s"}.`);
      onClose();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI Auto Update could not accept the proposal.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="requirements-auto-update-backdrop" role="presentation">
      <section aria-labelledby="requirements-auto-update-title" aria-modal="true" className="requirements-auto-update-modal" role="dialog">
        <header className="requirements-auto-update-header">
          <div>
            <span className="eyebrow">AI Auto Update</span>
            <h2 id="requirements-auto-update-title">{phase === "review" ? "Review And Accept" : "Generate Proposal"}</h2>
            <p>
              Source of recent intent: <strong>{sourcePath}</strong>
            </p>
          </div>
          <button className="editor-secondary-button" disabled={loading || accepting} onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="requirements-auto-update-body">
          {hasUnsavedSourceChanges ? (
            <div className="warning-callout">The open source file has unsaved editor changes. AI Auto Update reads the saved file content.</div>
          ) : null}

          <div className="requirements-auto-update-files">
            {requirementAutoUpdatePaths.map((path) => {
              const file = files[path];
              const item = proposalsByPath.get(path);
              const changedLineCount = item && file ? countChangedLines(file.content, item.proposedContent) : 0;

              return (
                <label className="requirements-auto-update-file" key={path}>
                  <input checked={selectedPaths.includes(path)} disabled={loading || accepting} onChange={() => toggleSelectedPath(path)} type="checkbox" />
                  <span>
                    <strong>{requirementLabels[path]}</strong>
                    <small>
                      {path}
                      {path === sourcePath ? " - current source" : ""}
                      {item ? ` - ${changedLineCount.toLocaleString()} changed line${changedLineCount === 1 ? "" : "s"}` : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>

          <label className="ai-assist-field">
            <span>Optional Instruction</span>
            <textarea
              disabled={loading || accepting}
              onChange={(event) => {
                setInstruction(event.target.value);
                setProposal([]);
                setPhase("generate");
              }}
              placeholder="Make the input and output requirements reflect the new goal constraints."
              value={instruction}
            />
          </label>

          <div className="ai-assist-controls">
            <label className="ai-assist-model-field">
              <span>AI Model</span>
              <select disabled={loading || accepting || !models.length} onChange={(event) => onModelChange(event.target.value)} value={selectedModelId}>
                {models.length ? (
                  modelTierOrder.map((tier) => {
                    const tierModels = models
                      .filter((model) => model.tier === tier)
                      .sort((left, right) =>
                        (left.displayName || left.id).localeCompare(right.displayName || right.id, undefined, { sensitivity: "base" }),
                      );
                    if (!tierModels.length) return null;

                    return (
                      <optgroup key={tier} label={modelTierLabels[tier]}>
                        {tierModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {formatModelLabel(model)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })
                ) : (
                  <option value="">No models loaded</option>
                )}
              </select>
              {selectedModel ? <small>{modelTierLabels[selectedModel.tier]}</small> : null}
            </label>

            <div className="ai-assist-actions">
              <button disabled={loading || accepting || !selectedModelId || !models.length} onClick={() => void generateProposal()} type="button">
                {loading ? "Working..." : proposal.length ? "Regenerate Proposal" : "Generate Proposal"}
              </button>
            </div>
          </div>

          {phase === "review" && proposal.length ? (
            <div className="requirements-auto-update-review">
              {staleProposalPaths.length ? (
                <div className="warning-callout">This proposal is stale for: {staleProposalPaths.join(", ")}.</div>
              ) : null}

              {proposal.map((item) => {
                const file = files[item.filePath];
                const previewEntries = file ? buildDiffPreview(file.content, item.proposedContent) : [];
                const changedLineCount = file ? countChangedLines(file.content, item.proposedContent) : 0;

                return (
                  <section className="ai-assist-proposal" key={item.filePath}>
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">{item.filePath}</span>
                        <h3>{item.summary}</h3>
                      </div>
                      <strong>{changedLineCount.toLocaleString()} changed line{changedLineCount === 1 ? "" : "s"}</strong>
                    </div>

                    {item.rationale ? <p>{item.rationale}</p> : null}

                    {item.affectedSections.length ? (
                      <div className="ai-assist-chip-list">
                        {item.affectedSections.map((section) => (
                          <span key={section}>{section}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="ai-assist-diff-preview" aria-label={`AI Auto Update proposal diff preview for ${item.filePath}`}>
                      {previewEntries.map((entry, index) => (
                        <div className={`ai-assist-diff-line ${entry.type}`} key={`${index}-${entry.type}`}>
                          <span>{entry.type === "added" ? "+" : entry.type === "removed" ? "-" : " "}</span>
                          <code>{entry.text || " "}</code>
                        </div>
                      ))}
                    </div>

                    {item.risks.length || item.questionsOrAssumptions.length ? (
                      <details className="ai-assist-review-notes">
                        <summary>Review Notes ({item.risks.length + item.questionsOrAssumptions.length})</summary>
                        {item.risks.length ? (
                          <div>
                            <strong>Risks</strong>
                            {item.risks.map((note) => (
                              <p key={note}>{note}</p>
                            ))}
                          </div>
                        ) : null}
                        {item.questionsOrAssumptions.length ? (
                          <div>
                            <strong>Assumptions / Questions</strong>
                            {item.questionsOrAssumptions.map((note) => (
                              <p key={note}>{note}</p>
                            ))}
                          </div>
                        ) : null}
                      </details>
                    ) : null}
                  </section>
                );
              })}

              <div className="requirements-auto-update-footer">
                <button className="editor-secondary-button" disabled={accepting || loading} onClick={() => setPhase("generate")} type="button">
                  Back
                </button>
                <button disabled={accepting || loading || Boolean(staleProposalPaths.length)} onClick={() => void acceptProposal()} type="button">
                  {accepting ? "Writing..." : "Accept And Write Files"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function countChangedLines(originalContent: string, proposedContent: string) {
  const diff = buildLineDiff(originalContent, proposedContent);
  return countDiffRangeLines(diff.ranges) + countDeletedLines(diff.deletions);
}
