import type { EditProposal } from "../../contracts/api";
import { ConceptualDiffReviewItem } from "../../shared/conceptualDiff/ConceptualDiffReviewItem";
import { canApplyProposal, proposalDiffGroups, proposalStatusLabel } from "./agentChatHelpers";

export function AgentEditProposalPanel({
  activeProposal,
  controlsDisabled,
  onApply,
  onHide,
  onSetAllDiffs,
  onSetDiffStatus,
  proposalReadOnly,
  sending,
}: {
  activeProposal: EditProposal;
  controlsDisabled: boolean;
  onApply: (proposal: EditProposal) => void;
  onHide: () => void;
  onSetAllDiffs: (proposal: EditProposal, status: "accepted" | "rejected") => void;
  onSetDiffStatus: (proposal: EditProposal, diffId: string, status: "accepted" | "rejected") => void;
  proposalReadOnly: boolean;
  sending: boolean;
}) {
  return (
    <section className="agent-edit-proposal agent-edit-proposal-in-thread" aria-label={proposalReadOnly ? "Edit Proposal Details" : "Proposed Changes"}>
      <div className="agent-edit-proposal-header">
        <div>
          <span className="agent-context-label">{proposalReadOnly ? "Proposal Details" : "Proposed Changes"}</span>
          <p>{activeProposal.notice || "Review which conceptual changes should be applied."}</p>
        </div>
        <strong>{proposalStatusLabel(activeProposal.status)}</strong>
      </div>
      {activeProposal.conceptualDiffs.length ? (
        <>
          {proposalReadOnly ? (
            <div className="agent-edit-proposal-actions">
              <button disabled={controlsDisabled} onClick={onHide} type="button">
                Hide
              </button>
            </div>
          ) : (
            <div className="agent-edit-proposal-actions">
              <button disabled={controlsDisabled} onClick={() => onSetAllDiffs(activeProposal, "accepted")} type="button">
                Accept all
              </button>
              <button disabled={controlsDisabled} onClick={() => onSetAllDiffs(activeProposal, "rejected")} type="button">
                Reject all
              </button>
            </div>
          )}
          <div className="agent-edit-proposal-files">
            {proposalDiffGroups(activeProposal).map((group) => (
              <div className="agent-edit-proposal-file" key={group.filePath}>
                <code title={group.filePath}>{group.filePath}</code>
                {group.conceptualDiffs.map((diff) => {
                  return (
                    <ConceptualDiffReviewItem
                      controlsDisabled={controlsDisabled}
                      diff={diff}
                      key={diff.id}
                      onStatusChange={(status) => onSetDiffStatus(activeProposal, diff.id, status)}
                      readOnly={proposalReadOnly}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {proposalReadOnly ? null : (
            <button
              className="agent-edit-proposal-apply"
              disabled={controlsDisabled || !canApplyProposal(activeProposal)}
              onClick={() => onApply(activeProposal)}
              type="button"
            >
              {activeProposal.status === "applying" || sending ? "Applying..." : "Apply Proposal"}
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}
