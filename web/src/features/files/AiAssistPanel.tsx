import { useEffect, useMemo, useState } from "react";
import { api, type AiAssistProposal, type FileContent, type RebuildModel } from "../../api";
import { buildLineDiff, countDeletedLines, countDiffRangeLines } from "../../domain/diffs";

type AiAssistPanelProps = {
  projectSlug: string;
  models: RebuildModel[];
  selectedModelId: string;
  selected: FileContent;
  onModelChange: (modelId: string) => void;
  onApplyDraft: (value: string) => void;
  onNotice: (message: string) => void;
};

type DiffEntry = {
  type: "same" | "added" | "removed";
  text: string;
};

export const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High / Extra High ($$$)",
  small: "Small ($)",
};

export const modelTierOrder: RebuildModel["tier"][] = ["medium", "high", "small"];
const defaultAiAssistInstruction = "Expand on the annotations and file.";

export function formatModelLabel(model: RebuildModel) {
  const modelName = model.displayName || model.id;
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}

function isAiAssistEligible(selected: FileContent) {
  return selected.editable && selected.kind === "human" && /^human_[^/]+\.md$/i.test(selected.path);
}

function findAssistCandidates(content: string) {
  return content
    .split("\n")
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => /\b(TODO|AI Assist|FIXME|TBD)\b|^\s*[-*]\s+\[[ ?]\]/i.test(line))
    .slice(0, 6);
}

export function buildDiffPreview(originalText: string, proposedText: string): DiffEntry[] {
  const original = originalText.split("\n");
  const proposed = proposedText.split("\n");
  const table = Array.from({ length: original.length + 1 }, () => new Uint32Array(proposed.length + 1));

  if (original.length * proposed.length > 120_000) {
    return [
      { type: "same", text: "Large proposal preview. Use the changed-line summary, then Apply to inspect the full unsaved editor diff." },
    ];
  }

  for (let originalIndex = original.length - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let proposedIndex = proposed.length - 1; proposedIndex >= 0; proposedIndex -= 1) {
      table[originalIndex][proposedIndex] =
        original[originalIndex] === proposed[proposedIndex]
          ? table[originalIndex + 1][proposedIndex + 1] + 1
          : Math.max(table[originalIndex + 1][proposedIndex], table[originalIndex][proposedIndex + 1]);
    }
  }

  const entries: DiffEntry[] = [];
  let originalIndex = 0;
  let proposedIndex = 0;

  while (originalIndex < original.length && proposedIndex < proposed.length) {
    if (original[originalIndex] === proposed[proposedIndex]) {
      entries.push({ type: "same", text: original[originalIndex] });
      originalIndex += 1;
      proposedIndex += 1;
    } else if (table[originalIndex + 1][proposedIndex] >= table[originalIndex][proposedIndex + 1]) {
      entries.push({ type: "removed", text: original[originalIndex] });
      originalIndex += 1;
    } else {
      entries.push({ type: "added", text: proposed[proposedIndex] });
      proposedIndex += 1;
    }
  }

  while (originalIndex < original.length) {
    entries.push({ type: "removed", text: original[originalIndex] });
    originalIndex += 1;
  }

  while (proposedIndex < proposed.length) {
    entries.push({ type: "added", text: proposed[proposedIndex] });
    proposedIndex += 1;
  }

  return compactDiffPreview(entries);
}

function compactDiffPreview(entries: DiffEntry[]) {
  const changedIndexes = entries.map((entry, index) => (entry.type === "same" ? -1 : index)).filter((index) => index >= 0);
  if (!changedIndexes.length) return [{ type: "same" as const, text: "No content changes proposed." }];

  const keep = new Set<number>();
  for (const index of changedIndexes) {
    for (let next = Math.max(0, index - 3); next <= Math.min(entries.length - 1, index + 3); next += 1) {
      keep.add(next);
    }
  }

  const compacted: DiffEntry[] = [];
  let skipped = 0;

  entries.forEach((entry, index) => {
    if (!keep.has(index)) {
      skipped += 1;
      return;
    }

    if (skipped) {
      compacted.push({ type: "same", text: `... ${skipped.toLocaleString()} unchanged line${skipped === 1 ? "" : "s"} ...` });
      skipped = 0;
    }

    compacted.push(entry);
  });

  if (skipped) {
    compacted.push({ type: "same", text: `... ${skipped.toLocaleString()} unchanged line${skipped === 1 ? "" : "s"} ...` });
  }

  return compacted;
}

export function AiAssistPanel({
  projectSlug,
  models,
  selectedModelId,
  selected,
  onModelChange,
  onApplyDraft,
  onNotice,
}: AiAssistPanelProps) {
  const eligible = isAiAssistEligible(selected);
  const candidates = useMemo(() => findAssistCandidates(selected.content), [selected.content]);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [proposal, setProposal] = useState<AiAssistProposal | null>(null);
  const [proposalBaseline, setProposalBaseline] = useState("");
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setOpen(false);
    setFeedback("");
    setProposal(null);
    setProposalBaseline("");
    setLoading(false);
    setApplied(false);
  }, [selected.path, selected.content]);

  if (!eligible) return null;

  const diff = proposal ? buildLineDiff(selected.content, proposal.proposedContent) : null;
  const changedLineCount = diff ? countDiffRangeLines(diff.ranges) + countDeletedLines(diff.deletions) : 0;
  const staleProposal = Boolean(proposal && proposalBaseline && selected.content !== proposalBaseline);
  const previewEntries = proposal ? buildDiffPreview(selected.content, proposal.proposedContent) : [];
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;

  const requestProposal = async () => {
    const nextFeedback = feedback.trim();

    setLoading(true);
    setApplied(false);
    try {
      const body = {
        modelId: selectedModelId,
        path: selected.path,
        annotation: defaultAiAssistInstruction,
        contentHash: proposal?.contentHash,
        feedback: nextFeedback || undefined,
        previousProposal: proposal ?? undefined,
      };
      const nextProposal = proposal ? await api.aiAssistRefine(projectSlug, body) : await api.aiAssistPropose(projectSlug, body);
      setProposal(nextProposal);
      setProposalBaseline(selected.content);
      setFeedback("");
      setOpen(true);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "AI Assist could not generate a proposal.");
    } finally {
      setLoading(false);
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    if (staleProposal) {
      onNotice("The saved file changed after this proposal was generated. Refresh AI Assist before applying.");
      return;
    }

    onApplyDraft(proposal.proposedContent);
    setApplied(true);
    setOpen(false);
    onNotice("AI Assist applied the proposal to the unsaved editor draft. Review and save when ready.");
  };

  const cancelAssist = () => {
    setProposal(null);
    setFeedback("");
    setApplied(false);
    setOpen(false);
  };

  return (
    <div className={open ? "ai-assist-panel open" : "ai-assist-panel"}>
      <div className="ai-assist-header">
        {open ? (
          <div>
            <span className="eyebrow">AI Assist</span>
            <h3>Expand notes into requirement edits</h3>
          </div>
        ) : null}
        <button className="ai-assist-trigger" onClick={() => setOpen((isOpen) => !isOpen)} type="button">
          {open ? "Collapse" : "AI Assist"}
        </button>
      </div>

      {open ? (
        <div className="ai-assist-body">
          <p>
            Ask AI Assist to reason across this requirement file. It will propose changes first; Apply only updates the unsaved editor draft.
          </p>

          <label className="ai-assist-field ai-assist-feedback-field">
            <span>Ephemeral feedback</span>
            <textarea
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={
                proposal
                  ? "Tell AI Assist what to adjust, then regenerate the proposal. This feedback is not saved."
                  : "Optional. Tell AI Assist what to focus on. Leave blank to expand on the annotations and file."
              }
              value={feedback}
            />
          </label>

          {candidates.length ? (
            <div className="ai-assist-candidates">
              <span className="eyebrow">Detected Notes</span>
              {candidates.map((candidate) => (
                <button
                  key={`${candidate.lineNumber}-${candidate.line}`}
                  className="ai-assist-candidate"
                  onClick={() => setFeedback(candidate.line)}
                  type="button"
                >
                  Line {candidate.lineNumber}: {candidate.line}
                </button>
              ))}
            </div>
          ) : null}

          {proposal ? (
            <section className="ai-assist-proposal">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Proposal</span>
                  <h3>{proposal.summary}</h3>
                </div>
                <strong>{changedLineCount.toLocaleString()} changed draft line{changedLineCount === 1 ? "" : "s"}</strong>
              </div>

              {staleProposal ? <div className="warning-callout">This proposal is stale because the saved file changed after it was generated.</div> : null}
              {applied ? <div className="ai-assist-applied">Applied to the unsaved editor draft. Review, edit, undo, or save.</div> : null}

              {proposal.rationale ? <p>{proposal.rationale}</p> : null}

              {proposal.affectedSections.length ? (
                <div className="ai-assist-chip-list">
                  {proposal.affectedSections.map((section) => (
                    <span key={section}>{section}</span>
                  ))}
                </div>
              ) : null}

              <div className="ai-assist-diff-preview" aria-label="AI Assist proposal diff preview">
                {previewEntries.map((entry, index) => (
                  <div className={`ai-assist-diff-line ${entry.type}`} key={`${index}-${entry.type}`}>
                    <span>{entry.type === "added" ? "+" : entry.type === "removed" ? "-" : " "}</span>
                    <code>{entry.text || " "}</code>
                  </div>
                ))}
              </div>

              {proposal.risks.length || proposal.questionsOrAssumptions.length ? (
                <details className="ai-assist-review-notes">
                  <summary>
                    Review Notes ({proposal.risks.length + proposal.questionsOrAssumptions.length})
                  </summary>
                  {proposal.risks.length ? (
                    <div>
                      <strong>Risks</strong>
                      {proposal.risks.map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                  ) : null}
                  {proposal.questionsOrAssumptions.length ? (
                    <div>
                      <strong>Assumptions / Questions</strong>
                      {proposal.questionsOrAssumptions.map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                  ) : null}
                </details>
              ) : null}

              <div className="ai-assist-actions">
                <button disabled={loading || staleProposal} onClick={applyProposal} type="button">
                  Apply To Draft
                </button>
              </div>
            </section>
          ) : null}

          <div className="ai-assist-controls">
            <label className="ai-assist-model-field">
              <span>AI Model</span>
              <select disabled={loading || !models.length} onChange={(event) => onModelChange(event.target.value)} value={selectedModelId}>
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
              <button disabled={loading || !selectedModelId || !models.length} onClick={() => void requestProposal()} type="button">
                {loading ? "Working..." : proposal ? "Regenerate Proposal" : "Generate Proposal"}
              </button>
              <button className="editor-secondary-button" disabled={loading} onClick={cancelAssist} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
