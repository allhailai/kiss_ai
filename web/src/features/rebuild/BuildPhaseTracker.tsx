import type { RebuildState } from "../../contracts/api";

type PhaseStep = {
  id: string;
  label: string;
  detail?: string;
};

const PHASES: PhaseStep[] = [
  { id: "research", label: "Researching" },
  { id: "fetching", label: "Pulling Sources" },
  { id: "digests", label: "Digesting" },
  { id: "wiki", label: "Wiki Build" },
  { id: "recording", label: "Recording" },
];

function getPhaseIndex(phase: string | null | undefined): number {
  if (!phase) return -1;
  return PHASES.findIndex((p) => p.id === phase);
}

function getPhaseStatus(phaseIndex: number, currentIndex: number, buildFinished: boolean): "done" | "active" | "pending" {
  if (buildFinished) return "done";
  if (phaseIndex < currentIndex) return "done";
  if (phaseIndex === currentIndex) return "active";
  return "pending";
}

export function BuildPhaseTracker({ rebuild }: { rebuild: RebuildState | null }) {
  const isRunning = Boolean(rebuild?.running);
  const buildFinished = rebuild?.status === "finished" || rebuild?.status === "finished_with_attention" || rebuild?.buildPhase === "complete";
  const buildError = rebuild?.status === "error" || rebuild?.status === "blocked" || rebuild?.status === "interrupted";

  if (!isRunning && !buildFinished && !buildError) return null;

  const currentIndex = getPhaseIndex(rebuild?.buildPhase);
  const detail = rebuild?.buildPhaseDetail || null;

  return (
    <div className="build-phase-tracker" role="status" aria-label="Build progress">
      <div className="build-phase-steps">
        {PHASES.map((phase, i) => {
          const status = buildError && i >= currentIndex && i > 0
            ? (i === currentIndex ? "error" : "pending")
            : getPhaseStatus(i, currentIndex, buildFinished);

          return (
            <div
              className={`build-phase-step build-phase-step-${status}`}
              key={phase.id}
              aria-current={status === "active" ? "step" : undefined}
            >
              <div className="build-phase-indicator">
                {status === "done" ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12" aria-hidden="true">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                ) : status === "active" ? (
                  <span className="build-phase-pulse" />
                ) : status === "error" ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12" aria-hidden="true">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                ) : (
                  <span className="build-phase-dot" />
                )}
              </div>
              <span className="build-phase-label">{phase.label}</span>
            </div>
          );
        })}
      </div>
      {detail && isRunning ? (
        <p className="build-phase-detail">{detail}</p>
      ) : null}
    </div>
  );
}
