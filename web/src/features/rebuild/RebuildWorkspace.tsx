import type { ReactNode } from "react";
import type { ProjectStatus, RebuildState, RequirementsSyncSignalsResponse } from "../../contracts/api";

export function RebuildWorkspace({
  buildLog,
  status,
  rebuild,
  onOpenBuildProject,
  onOpenQuestions,
  onOpenRequirementsSync,
  requirementsSyncSignals,
}: {
  buildLog: ReactNode;
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onOpenBuildProject: () => void;
  onOpenQuestions: () => void;
  onOpenRequirementsSync: () => void;
  requirementsSyncSignals: RequirementsSyncSignalsResponse | null;
}) {
  const openQuestionsCount = status?.openQuestionsCount ?? 0;

  return (
    <div className="panel-stack rebuild-launcher-workspace">
      {openQuestionsCount ? (
        <section className="rebuild-open-questions-callout" aria-label="Unanswered human questions">
          <div>
            <strong>You have unanswered questions for the next build.</strong>
            <p>
              Answer {openQuestionsCount} question{openQuestionsCount === 1 ? "" : "s"} in human_open_questions.md when you are ready to refine the project.
            </p>
          </div>
          <button onClick={onOpenQuestions} type="button">
            Answer Questions
          </button>
        </section>
      ) : null}

      <section className="content-card rebuild-launcher-card" aria-label="Build actions">
        <div className="rebuild-launcher-actions">
          <button className="rebuild-launcher-action rebuild-launcher-sync" onClick={onOpenRequirementsSync} type="button">
            <span>Synchronize Requirements</span>
            <small>{requirementsSyncSignals?.summary ?? "Review Goal, Inputs, and Outputs before building."}</small>
          </button>
          <button className="rebuild-launcher-action rebuild-launcher-build" onClick={onOpenBuildProject} type="button">
            <span>Build Project</span>
            <small>{rebuild?.running ? "Build is running. Open the right panel for live progress." : rebuild?.message || "Open the build panel."}</small>
          </button>
        </div>
        {!status?.cursorApiKeyAvailable ? (
          <p className="lint-warning">
            Add a Cursor API key using `CURSOR_API_KEY`, `web/.env`, or macOS Keychain item `cursor_api_key` to enable UI-triggered builds.
          </p>
        ) : null}
      </section>

      <div className="rebuild-build-log-divider" role="separator" aria-hidden="true" />

      {buildLog}
    </div>
  );
}
