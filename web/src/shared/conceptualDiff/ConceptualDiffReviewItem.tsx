import type { ConceptualDiff } from "../../contracts/api";

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
    <div className="agent-edit-proposal-detail-row">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function DetailList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="agent-edit-proposal-detail-row">
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
    <div className="agent-edit-proposal-detail-grid">
      {diff.target ? (
        <div className="agent-edit-proposal-detail-row">
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

export function ConceptualDiffReviewItem({
  controlsDisabled = false,
  diff,
  onStatusChange,
  readOnly = false,
}: {
  controlsDisabled?: boolean;
  diff: ConceptualDiff;
  onStatusChange?: (status: ConceptualDiff["status"]) => void;
  readOnly?: boolean;
}) {
  const scopeLabel = diff.target?.scope ? scopeLabels[diff.target.scope] : "";
  const impactLabel = riskLabel(diff.applyNotes?.riskLevel);
  const memoryLabel = diff.memory?.reconsidersRejectedId ? "Previously rejected" : "";
  const elevated = diff.target?.scope === "document" || diff.applyNotes?.riskLevel === "high";

  return (
    <div className={readOnly ? "agent-edit-proposal-diff read-only" : "agent-edit-proposal-diff"}>
      {readOnly ? null : (
        <input
          aria-label={`${diff.status === "accepted" ? "Reject" : "Accept"} ${diff.title}`}
          checked={diff.status === "accepted"}
          disabled={controlsDisabled}
          onChange={(event) => onStatusChange?.(event.currentTarget.checked ? "accepted" : "rejected")}
          type="checkbox"
        />
      )}
      <div className="agent-edit-proposal-diff-body">
        <div className="agent-edit-proposal-diff-title">
          <strong>{diff.title}</strong>
          {scopeLabel || impactLabel || memoryLabel ? (
            <span className="agent-edit-proposal-badges">
              {scopeLabel ? <span className={elevated ? "agent-edit-proposal-badge elevated" : "agent-edit-proposal-badge"}>{scopeLabel}</span> : null}
              {memoryLabel ? <span className="agent-edit-proposal-badge memory">{memoryLabel}</span> : null}
              {impactLabel ? (
                <span className={diff.applyNotes?.riskLevel === "high" ? "agent-edit-proposal-badge elevated" : "agent-edit-proposal-badge"}>{impactLabel}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        <small>{diff.summary}</small>
        {hasDiffDetails(diff) ? (
          <details className="agent-edit-proposal-details">
            <summary>Details</summary>
            <ConceptualDiffDetails diff={diff} />
          </details>
        ) : null}
      </div>
    </div>
  );
}
