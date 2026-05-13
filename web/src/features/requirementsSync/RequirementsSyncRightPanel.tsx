import { useState } from "react";
import type { RebuildModel, RequirementsSyncProposal, RequirementsSyncStep } from "../../contracts/api";
import { requirementsSyncSteps } from "../../domain/requirementsSync";
import { CompactModelPicker } from "../../shared/CompactModelPicker";
import { ConceptualDiffReviewItem } from "../../shared/conceptualDiff/ConceptualDiffReviewItem";
import type { useRequirementsSync } from "./useRequirementsSync";

type RequirementsSyncController = ReturnType<typeof useRequirementsSync>;
const summaryPreviewCharacterLimit = 260;

function stepStatus(controller: RequirementsSyncController, step: RequirementsSyncStep) {
  const result = controller.applyResults[step];
  const status = controller.stepStatuses[step];
  if (result) return result.summary;
  switch (status) {
    case "generating":
      return "Building proposal";
    case "ready":
      return "Ready to review";
    case "error":
      return "Needs regeneration";
    case "applying":
      return "Submitting review";
    case "applied":
      return "Applied";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Apply failed";
    default:
      return controller.proposals[step] ? "Ready to review" : "Not started";
  }
}

function acceptedDiffCount(proposal: RequirementsSyncProposal) {
  return proposal.conceptualDiffs.filter((diff) => diff.status === "accepted").length;
}

function totalDiffCount(proposals: RequirementsSyncProposal[]) {
  return proposals.reduce((count, proposal) => count + proposal.conceptualDiffs.length, 0);
}

function stepDisplayLabel(step: RequirementsSyncStep) {
  switch (step) {
    case "goal":
      return "Goal";
    case "inputs":
      return "Inputs";
    case "outputs":
      return "Outputs";
  }
}

function stepStatusLabel(step: RequirementsSyncStep) {
  return `${stepDisplayLabel(step)} Requirements`;
}

function summaryPreview(summary: string) {
  if (summary.length <= summaryPreviewCharacterLimit) return summary;
  const preview = summary.slice(0, summaryPreviewCharacterLimit).replace(/\s+\S*$/, "").trimEnd();
  return preview || summary.slice(0, summaryPreviewCharacterLimit).trimEnd();
}

export function RequirementsSyncRightPanel({
  controller,
  models,
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
  const loadingStep = requirementsSyncSteps.find((candidate) => candidate.id === controller.loadingStep);
  const primaryActionLabel = controller.loadingStep ? `Syncing ${loadingStep?.label ?? "requirements"}...` : controller.allProposalsReady ? "Regenerate All" : "Sync All Requirements";
  const canApplyBatch = controller.allProposalsReady && controller.acceptedDiffCount > 0;

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
      </header>

      <section className="requirements-sync-panel-review">
        <div className="requirements-sync-panel-review-heading">
          <div>
            <strong>Conceptual diffs</strong>
            <p>Sync all requirement files, review every conceptual diff, then apply the accepted changes in one submit.</p>
          </div>
          {controller.allProposals.length ? (
            <strong>
              {controller.acceptedDiffCount} accepted / {controller.totalDiffCount} total
            </strong>
          ) : null}
        </div>

        {controller.allProposals.length ? (
          <BatchProposalReview controller={controller} />
        ) : (
          <div className="requirements-sync-empty">
            <button className="requirements-sync-empty-action" disabled={controller.busy || !selectedModelId} onClick={() => void controller.syncAll()} type="button">
              Sync All Requirements
            </button>
            <p>AI Synchronize Requirements to ensure that all files are complete and aligned.</p>
            <div className="requirements-sync-empty-files" aria-label="Requirement files">
              <span>Goal Requirements</span>
              <span>Input Requirements</span>
              <span>Output Requirements</span>
            </div>
            <p>You can accept or reject proposed changes and apply them.</p>
          </div>
        )}
      </section>

      <section className="requirements-sync-file-strip" aria-label="Requirements sync files">
        {requirementsSyncSteps.map((candidate) => (
          <button
            className={`requirements-sync-step status-${controller.stepStatuses[candidate.id]}${candidate.id === controller.step ? " active" : ""}`}
            disabled={controller.applying}
            key={candidate.id}
            onClick={() => controller.setStep(candidate.id)}
            type="button"
          >
            <strong title={candidate.filePath}>{stepStatusLabel(candidate.id)}</strong>
            <small>{stepStatus(controller, candidate.id)}</small>
          </button>
        ))}
      </section>

      <section className="requirements-sync-run-controls" aria-label="Run requirements sync">
        <CompactModelPicker disabled={controller.busy} models={models} onModelChange={onModelChange} selectedModelId={selectedModelId} />
        <div className="requirements-sync-generate-actions">
          <button
            className="requirements-sync-generate-button"
            disabled={controller.busy || !selectedModelId}
            onClick={() => void controller.syncAll()}
            type="button"
          >
            {primaryActionLabel}
          </button>
          <button className="agent-edit-proposal-apply" disabled={controller.busy || !canApplyBatch} onClick={() => void controller.applyAll()} type="button">
            {controller.applying ? "Applying..." : "Apply Accepted Changes"}
          </button>
        </div>
      </section>
    </div>
  );
}

function BatchProposalReview({
  controller,
}: {
  controller: RequirementsSyncController;
}) {
  const proposals = requirementsSyncSteps.map((candidate) => controller.proposals[candidate.id]).filter((proposal): proposal is RequirementsSyncProposal => Boolean(proposal));
  const hasDiffs = totalDiffCount(proposals) > 0;

  return (
    <section className="agent-edit-proposal requirements-sync-edit-proposal" aria-label="Requirements Sync Proposed Changes">
      <div className="agent-edit-proposal-header">
        <div>
          <span className="agent-context-label">Proposed changes</span>
          <p>Review all generated requirement diffs before submitting the accepted and rejected list.</p>
        </div>
        <strong>
          {controller.acceptedDiffCount} accepted / {controller.totalDiffCount} total
        </strong>
      </div>

      {hasDiffs ? (
        <div className="agent-edit-proposal-actions">
          <button disabled={controller.busy} onClick={() => proposals.forEach((proposal) => controller.setAllDiffs(proposal.step, "accepted"))} type="button">
            Accept all
          </button>
          <button disabled={controller.busy} onClick={() => proposals.forEach((proposal) => controller.setAllDiffs(proposal.step, "rejected"))} type="button">
            Reject all
          </button>
        </div>
      ) : null}

      <div className="agent-edit-proposal-files">
        {requirementsSyncSteps.map((candidate) => {
          const proposal = controller.proposals[candidate.id];
          if (!proposal) {
            return (
              <div className="agent-edit-proposal-file requirements-sync-review-file" key={candidate.id}>
                <div className="requirements-sync-review-file-heading">
                  <div>
                    <strong title={candidate.filePath}>{stepDisplayLabel(candidate.id)}</strong>
                  </div>
                </div>
                <p className="requirements-sync-no-diffs">{stepStatus(controller, candidate.id)}</p>
              </div>
            );
          }

          return <ProposalReviewFile controller={controller} key={proposal.step} proposal={proposal} />;
        })}
      </div>
    </section>
  );
}

function ProposalReviewFile({ controller, proposal }: { controller: RequirementsSyncController; proposal: RequirementsSyncProposal }) {
  const hasDiffs = proposal.conceptualDiffs.length > 0;
  const result = controller.applyResults[proposal.step];
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const summary = proposal.summary || "Review which conceptual changes should be applied.";
  const summaryNeedsToggle = summary.length > summaryPreviewCharacterLimit;
  const visibleSummary = summaryExpanded || !summaryNeedsToggle ? summary : summaryPreview(summary);

  return (
    <div className="agent-edit-proposal-file requirements-sync-review-file">
      <div className="requirements-sync-review-file-heading">
        <div className="requirements-sync-review-file-title-row">
          <strong title={proposal.targetFilePath}>{stepDisplayLabel(proposal.step)}</strong>
          <span>
            {acceptedDiffCount(proposal)} accepted / {proposal.conceptualDiffs.length} total
          </span>
        </div>
        <div className="requirements-sync-review-summary">
          <p>
            <strong>Summary:</strong> {visibleSummary}
            {!summaryExpanded && summaryNeedsToggle ? (
              <>
                {"... "}
                <button onClick={() => setSummaryExpanded(true)} type="button">
                  (more)
                </button>
              </>
            ) : null}
          </p>
          {summaryExpanded && summaryNeedsToggle ? (
            <button className="requirements-sync-review-summary-collapse" onClick={() => setSummaryExpanded(false)} type="button">
              (less)
            </button>
          ) : null}
        </div>
      </div>

      {result ? <p className={`requirements-sync-apply-result status-${result.status}`}>{result.summary}</p> : null}

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
        <div className="agent-edit-proposal-actions requirements-sync-file-actions">
          <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "accepted")} type="button">
            Accept file
          </button>
          <button disabled={controller.busy} onClick={() => controller.setAllDiffs(proposal.step, "rejected")} type="button">
            Reject file
          </button>
        </div>
      ) : null}

      {hasDiffs ? (
        proposal.conceptualDiffs.map((diff) => (
          <ConceptualDiffReviewItem
            controlsDisabled={controller.busy}
            diff={diff}
            key={diff.id}
            onStatusChange={(status) => controller.updateDiffStatus(proposal.step, diff.id, status)}
          />
        ))
      ) : (
        <p className="requirements-sync-no-diffs">
          <strong>No changes needed.</strong>
        </p>
      )}
    </div>
  );
}
