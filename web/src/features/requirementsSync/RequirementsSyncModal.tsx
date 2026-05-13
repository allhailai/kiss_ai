import type { ConceptualDiff, RebuildModel, RequirementsSyncProposal, RequirementsSyncStep } from "../../contracts/api";
import { formatModelLabel } from "../../domain/modelLabels";
import { ModelSelect } from "../../shared/ModelSelect";
import { requirementsSyncSteps } from "./requirementsSyncTypes";
import type { useRequirementsSync } from "./useRequirementsSync";

type RequirementsSyncController = ReturnType<typeof useRequirementsSync>;

function stepStatus(step: RequirementsSyncStep, proposal: RequirementsSyncProposal | undefined, activeStep: RequirementsSyncStep) {
  if (proposal) return "Proposal ready";
  return step === activeStep ? "Current step" : "Not started";
}

function canApplyProposal(proposal: RequirementsSyncProposal) {
  return proposal.conceptualDiffs.some((diff) => diff.status === "accepted");
}

const scopeLabels: Record<NonNullable<ConceptualDiff["target"]>["scope"], string> = {
  document: "Document-wide",
  local: "Localized",
  multi_section: "Multi-section",
  section: "Section",
};

function riskLabel(riskLevel: NonNullable<ConceptualDiff["applyNotes"]>["riskLevel"]) {
  switch (riskLevel) {
    case "high":
      return "High impact";
    case "medium":
      return "Medium risk";
    case "low":
      return "Low risk";
    default:
      return "";
  }
}

function hasDiffDetails(diff: ConceptualDiff) {
  return Boolean(
    diff.target ||
      diff.intent ||
      diff.evidence ||
      diff.applyNotes?.expectedChangeShape ||
      diff.applyNotes?.nonGoals?.length ||
      diff.applyNotes?.riskLevel ||
      diff.memory?.reconsidersRejectedId ||
      diff.memory?.reconsiderReason,
  );
}

function DetailText({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="requirements-sync-detail-row">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function DetailList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="requirements-sync-detail-row">
      <strong>{label}</strong>
      <ul>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function ConceptualDiffDetails({ diff }: { diff: ConceptualDiff }) {
  return (
    <div className="requirements-sync-detail-grid">
      {diff.target ? (
        <div className="requirements-sync-detail-row">
          <strong>Target</strong>
          <p>{scopeLabels[diff.target.scope]}</p>
        </div>
      ) : null}
      <DetailList label="Sections" values={diff.target?.sections} />
      <DetailList label="Anchors" values={diff.target?.anchors} />
      <DetailText label="Objective" value={diff.intent?.objective} />
      <DetailText label="Rationale" value={diff.intent?.rationale} />
      <DetailList label="Must preserve" values={diff.intent?.mustPreserve} />
      <DetailList label="Avoid" values={diff.intent?.avoid} />
      <DetailList label="User guidance" values={diff.evidence?.userGuidance} />
      <DetailList label="Git diff signals" values={diff.evidence?.gitDiffSignals} />
      <DetailList label="Context signals" values={diff.evidence?.contextSignals} />
      <DetailText label="Expected change" value={diff.applyNotes?.expectedChangeShape} />
      <DetailList label="Non-goals" values={diff.applyNotes?.nonGoals} />
      <DetailText label="Risk" value={riskLabel(diff.applyNotes?.riskLevel)} />
      <DetailText label="Previously rejected" value={diff.memory?.reconsidersRejectedId ? "Yes" : ""} />
      <DetailText label="Reconsider reason" value={diff.memory?.reconsiderReason} />
    </div>
  );
}

export function RequirementsSyncModal({
  controller,
  models,
  onModelChange,
  selectedModelId,
}: {
  controller: RequirementsSyncController;
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  selectedModelId: string;
}) {
  if (!controller.open) return null;

  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const currentStep = requirementsSyncSteps.find((candidate) => candidate.id === controller.step) ?? requirementsSyncSteps[0];
  const currentProposal = controller.currentProposal;

  return (
    <div className="requirements-auto-update-backdrop" role="presentation">
      <section aria-label="Requirements synchronization" aria-modal={!controller.collapsed} className="requirements-auto-update-modal" role="dialog">
        <header className="requirements-auto-update-header">
          <div>
            <span className="eyebrow">Requirements sync</span>
            <h2>Synchronize project requirements</h2>
            <p>
              The goal file is authoritative. This wizard reviews conceptual diffs, then applies accepted changes one file at a
              time.
            </p>
          </div>
          <div className="requirements-auto-update-header-actions">
            <button
              className="editor-secondary-button"
              disabled={controller.busy}
              onClick={() => controller.setCollapsed(!controller.collapsed)}
              type="button"
            >
              {controller.collapsed ? "Expand" : "Collapse"}
            </button>
            <button className="editor-secondary-button" disabled={controller.busy} onClick={controller.closeModal} type="button">
              Close
            </button>
          </div>
        </header>

        {controller.collapsed ? null : (
          <div className="requirements-auto-update-body">
            <div className="requirements-sync-setup-panel">
              <section className="warning-callout">
                <strong>Do not manually edit requirement files while this modal is running.</strong>
                <p>Regenerate the current step if requirement files change before apply.</p>
              </section>

              <section className="requirements-auto-update-controls">
                <ModelSelect
                  className="requirements-auto-update-model"
                  disabled={controller.busy}
                  label="AI Model"
                  models={models}
                  onModelChange={onModelChange}
                  selectedModelId={selectedModelId}
                  showTierNote={false}
                />
                <div className="requirements-auto-update-model-note">
                  {selectedModel ? <strong>{formatModelLabel(selectedModel)}</strong> : <strong>Select a model</strong>}
                  <span>Use a stronger model for requirements quality.</span>
                </div>
              </section>

              <section className="requirements-auto-update-stepper" aria-label="Requirements sync steps">
                {requirementsSyncSteps.map((candidate) => (
                  <button
                    className={candidate.id === controller.step ? "requirements-sync-step active" : "requirements-sync-step"}
                    disabled={controller.busy}
                    key={candidate.id}
                    onClick={() => controller.setStep(candidate.id)}
                    type="button"
                  >
                    <span className="eyebrow">{candidate.label}</span>
                    <strong>{candidate.filePath}</strong>
                    <small>{stepStatus(candidate.id, controller.proposals[candidate.id], controller.step)}</small>
                  </button>
                ))}
              </section>

              {controller.signals ? (
                <section className={controller.signals.hasSignals ? "requirements-sync-signals active" : "requirements-sync-signals"}>
                  <strong>Sync signals</strong>
                  <p>{controller.signals.summary}</p>
                  {controller.signals.gitStatus.length ? (
                    <ul>
                      {controller.signals.gitStatus.slice(0, 4).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              <section className="requirements-sync-instruction">
                <label htmlFor="requirements-sync-user-instruction">Optional instruction</label>
                <textarea
                  disabled={controller.busy}
                  id="requirements-sync-user-instruction"
                  onChange={(event) => controller.setUserInstruction(event.target.value)}
                  placeholder="Add special guidance for this sync run."
                  value={controller.userInstruction}
                />
              </section>
            </div>

            <section className="requirements-auto-update-review">
              <div className="section-heading">
                <div>
                  <h3>{currentStep.label}: {currentStep.filePath}</h3>
                  <p>{currentStep.description}</p>
                </div>
                <div className="requirements-sync-actions">
                  <button disabled={controller.busy || !selectedModelId} onClick={() => void controller.proposeStep()} type="button">
                    {controller.loadingStep === controller.step ? "Thinking..." : currentProposal ? "Regenerate Proposal" : "Generate Proposal"}
                  </button>
                </div>
              </div>

              {currentProposal ? (
                <ProposalReview controller={controller} proposal={currentProposal} />
              ) : (
                <div className="requirements-sync-empty">
                  <strong>No proposal yet.</strong>
                  <p>Generate this step to let the AI propose conceptual diffs for this requirement file.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function ProposalReview({ controller, proposal }: { controller: RequirementsSyncController; proposal: RequirementsSyncProposal }) {
  return (
    <>
      <section className="requirements-sync-proposal-summary">
        <strong>{proposal.summary}</strong>
        {proposal.sourceSignalsUsed.length ? (
          <ul>
            {proposal.sourceSignalsUsed.slice(0, 6).map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="requirements-sync-diffs">
        <div className="requirements-sync-diff-actions">
          <strong>Conceptual diffs</strong>
          <span>
            <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "accepted")} type="button">
              Accept All
            </button>
            <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "rejected")} type="button">
              Reject All
            </button>
          </span>
        </div>
        {proposal.conceptualDiffs.length ? (
          proposal.conceptualDiffs.map((diff) => {
            const scopeLabel = diff.target?.scope ? scopeLabels[diff.target.scope] : "";
            const impactLabel = riskLabel(diff.applyNotes?.riskLevel);
            const memoryLabel = diff.memory?.reconsidersRejectedId ? "Previously rejected" : "";
            const elevated = diff.target?.scope === "document" || diff.applyNotes?.riskLevel === "high";
            return (
              <article
                className={diff.status === "accepted" ? "requirements-sync-diff accepted" : "requirements-sync-diff rejected"}
                key={diff.id}
                onClick={() => {
                  if (!controller.busy) {
                    controller.updateDiffStatus(proposal.step, diff.id, diff.status === "accepted" ? "rejected" : "accepted");
                  }
                }}
              >
                <div>
                  <div className="requirements-sync-diff-title">
                    <strong>{diff.title}</strong>
                    <span className="requirements-sync-diff-status">{diff.status === "accepted" ? "Accepted" : "Rejected"}</span>
                    {scopeLabel ? <span className={elevated ? "requirements-sync-diff-badge elevated" : "requirements-sync-diff-badge"}>{scopeLabel}</span> : null}
                    {memoryLabel ? <span className="requirements-sync-diff-badge memory">{memoryLabel}</span> : null}
                    {impactLabel ? (
                      <span className={diff.applyNotes?.riskLevel === "high" ? "requirements-sync-diff-badge elevated" : "requirements-sync-diff-badge"}>{impactLabel}</span>
                    ) : null}
                  </div>
                  <p>{diff.summary}</p>
                  {hasDiffDetails(diff) ? (
                    <details className="requirements-sync-diff-details" onClick={(event) => event.stopPropagation()}>
                      <summary>Details</summary>
                      <ConceptualDiffDetails diff={diff} />
                    </details>
                  ) : null}
                </div>
                <div className="requirements-sync-diff-buttons">
                  <button
                    aria-pressed={diff.status === "accepted"}
                    className={diff.status === "accepted" ? "active" : ""}
                    disabled={controller.busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      controller.updateDiffStatus(proposal.step, diff.id, "accepted");
                    }}
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    aria-pressed={diff.status === "rejected"}
                    className={diff.status === "rejected" ? "active" : ""}
                    disabled={controller.busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      controller.updateDiffStatus(proposal.step, diff.id, "rejected");
                    }}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p>No conceptual diffs were needed; proposed content matches the current requirement intent.</p>
        )}
      </section>

      <footer className="requirements-auto-update-footer">
        <button className="editor-secondary-button" disabled={controller.busy} onClick={controller.skipStep} type="button">
          Skip Step
        </button>
        <button disabled={controller.busy || !canApplyProposal(proposal)} onClick={() => void controller.applyProposal()} type="button">
          {controller.applying ? "Applying..." : "Apply This Step"}
        </button>
        <button disabled={controller.busy || !canApplyProposal(proposal)} onClick={() => void controller.applyAndNext()} type="button">
          Apply And Next
        </button>
      </footer>
    </>
  );
}
