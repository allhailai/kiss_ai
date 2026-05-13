import type { RebuildModel, RequirementsSyncProposal, RequirementsSyncStep } from "../../contracts/api";
import { requirementsSyncSteps, nextRequirementsSyncStep } from "../../domain/requirementsSync";
import { CompactModelPicker } from "../../shared/CompactModelPicker";
import { ConceptualDiffReviewItem } from "../../shared/conceptualDiff/ConceptualDiffReviewItem";
import type { useRequirementsSync } from "./useRequirementsSync";

type RequirementsSyncController = ReturnType<typeof useRequirementsSync>;

function stepStatus(step: RequirementsSyncStep, proposal: RequirementsSyncProposal | undefined, activeStep: RequirementsSyncStep) {
  if (proposal) return step === activeStep ? "Reviewing proposal" : "Proposal ready";
  return step === activeStep ? "Current step" : "Not started";
}

function acceptedDiffCount(proposal: RequirementsSyncProposal) {
  return proposal.conceptualDiffs.filter((diff) => diff.status === "accepted").length;
}

function canApplyProposal(proposal: RequirementsSyncProposal) {
  return acceptedDiffCount(proposal) > 0;
}

function nextStepOrFinish(controller: RequirementsSyncController, onFinish: () => void) {
  const nextStep = nextRequirementsSyncStep(controller.step);
  if (nextStep) {
    controller.setStep(nextStep);
    return;
  }

  onFinish();
}

async function applyAndNextOrFinish(controller: RequirementsSyncController, onFinish: () => void) {
  const applied = await controller.applyProposal();
  if (!applied) return;

  nextStepOrFinish(controller, onFinish);
}

export function RequirementsSyncRightPanel({
  controller,
  models,
  onFinish,
  onModelChange,
  onOpenAgent,
  selectedModelId,
}: {
  controller: RequirementsSyncController;
  models: RebuildModel[];
  onFinish: () => void;
  onModelChange: (modelId: string) => void;
  onOpenAgent: () => void;
  selectedModelId: string;
}) {
  const currentStep = requirementsSyncSteps.find((candidate) => candidate.id === controller.step) ?? requirementsSyncSteps[0];
  const currentProposal = controller.currentProposal;

  return (
    <div className="requirements-sync-panel">
      <header className="requirements-sync-panel-header">
        <div className="right-panel-mode-switch" role="group" aria-label="Right panel mode">
          <button type="button" onClick={onOpenAgent}>
            Agent
          </button>
          <button aria-pressed="true" className="active" type="button">
            Requirements Sync
          </button>
        </div>
        <h2>AI update the requirements files.</h2>
        <ul className="requirements-sync-panel-description">
          <li>
            <strong>Goal:</strong> ensure all important objectives are covered.
          </li>
          <li>
            <strong>Inputs:</strong> add all relevant sources to support the goal.
          </li>
          <li>
            <strong>Outputs:</strong> provide outputs in alignment to inputs and goal.
          </li>
        </ul>
      </header>

      <section className="requirements-sync-panel-review">
        <div className="requirements-sync-panel-review-heading">
          <div>
            <strong>Conceptual diffs</strong>
            <p>Accept changes to apply, reject changes to remember as constraints, or continue when no apply is needed.</p>
          </div>
        </div>

        {currentProposal ? (
          <ProposalReview controller={controller} onFinish={onFinish} proposal={currentProposal} />
        ) : (
          <div className="requirements-sync-empty">
            <strong>No proposal yet.</strong>
            <p>Generate this step to let the AI propose conceptual diffs for this requirement file.</p>
          </div>
        )}
      </section>

      <section className="requirements-sync-file-strip" aria-label="Requirements sync files">
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

      <section className="requirements-sync-run-controls" aria-label="Generate requirements sync proposal">
        <div>
          <span className="agent-context-label">Selected file</span>
          <code title={currentStep.filePath}>{currentStep.label}</code>
        </div>
        <div className="requirements-sync-generate-actions">
          <CompactModelPicker disabled={controller.busy} models={models} onModelChange={onModelChange} selectedModelId={selectedModelId} />
          <button
            className="requirements-sync-generate-button"
            disabled={controller.busy || !selectedModelId}
            onClick={() => void controller.proposeStep()}
            type="button"
          >
            {controller.loadingStep === controller.step ? "Thinking..." : currentProposal ? "Regenerate" : "Generate"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ProposalReview({
  controller,
  onFinish,
  proposal,
}: {
  controller: RequirementsSyncController;
  onFinish: () => void;
  proposal: RequirementsSyncProposal;
}) {
  const nextStep = nextRequirementsSyncStep(proposal.step);
  const hasDiffs = proposal.conceptualDiffs.length > 0;
  const canApply = canApplyProposal(proposal);
  const continueLabel = nextStep ? "Continue" : "Finish Sync";

  return (
    <section className="agent-edit-proposal requirements-sync-edit-proposal" aria-label="Requirements Sync Proposed Changes">
      <div className="agent-edit-proposal-header">
        <div>
          <span className="agent-context-label">Proposed Changes</span>
          <p>{proposal.summary || "Review which conceptual changes should be applied."}</p>
        </div>
        <strong>
          {acceptedDiffCount(proposal)} accepted / {proposal.conceptualDiffs.length} total
        </strong>
      </div>

      {proposal.sourceSignalsUsed.length ? (
        <details className="requirements-sync-source-signals">
          <summary>Source signals used</summary>
          <ul>
            {proposal.sourceSignalsUsed.slice(0, 6).map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {hasDiffs ? (
        <div className="agent-edit-proposal-actions">
          <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "accepted")} type="button">
            Accept all
          </button>
          <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "rejected")} type="button">
            Reject all
          </button>
        </div>
      ) : null}

      <div className="agent-edit-proposal-files">
        <div className="agent-edit-proposal-file">
          <code title={proposal.targetFilePath}>{proposal.targetFilePath}</code>
          {hasDiffs ? (
            proposal.conceptualDiffs.map((diff) => {
              return (
                <ConceptualDiffReviewItem
                  controlsDisabled={controller.busy}
                  diff={diff}
                  key={diff.id}
                  onStatusChange={(status) => controller.updateDiffStatus(proposal.step, diff.id, status)}
                />
              );
            })
          ) : (
            <p className="requirements-sync-no-diffs">No conceptual diffs were needed; proposed content matches the current requirement intent.</p>
          )}
        </div>
      </div>

      <div className="requirements-sync-panel-actions">
        <button className="editor-secondary-button" disabled={controller.busy} onClick={() => nextStepOrFinish(controller, onFinish)} type="button">
          {hasDiffs ? "Skip" : continueLabel}
        </button>
        <button className="agent-edit-proposal-apply" disabled={controller.busy || !canApply} onClick={() => void controller.applyProposal()} type="button">
          {controller.applying ? "Applying..." : "Apply This Step"}
        </button>
        <button className="agent-edit-proposal-apply" disabled={controller.busy || !canApply} onClick={() => void applyAndNextOrFinish(controller, onFinish)} type="button">
          {nextStep ? "Apply And Next" : "Apply And Finish"}
        </button>
      </div>
    </section>
  );
}
