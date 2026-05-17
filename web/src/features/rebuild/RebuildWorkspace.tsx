import type { ReactNode } from "react";
import type { ProjectStatus, RebuildState } from "../../contracts/api";

export function RebuildWorkspace({
  buildLog,
  status,
  rebuild,
  onOpenBuildProject,
  onOpenQuestions,
}: {
  buildLog: ReactNode;
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onOpenBuildProject: () => void;
  onOpenQuestions: () => void;
}) {
  const openQuestionsCount = status?.openQuestionsCount ?? 0;
  const counts = status?.annotationCounts;
  const pendingSuggestions = counts ? counts.suggestionsAdded - counts.suggestionsAccepted - counts.suggestionsDismissed : 0;

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

      {counts ? (
        <section className="rebuild-annotation-summary" aria-label="Annotation summary">
          {status?.buildNotes ? <p className="rebuild-build-notes">{status.buildNotes}</p> : null}
          <div className="rebuild-annotation-stats">
            <div className="rebuild-annotation-stat">
              <span className="rebuild-annotation-stat-value">{counts.feedbackApplied}</span>
              <span className="rebuild-annotation-stat-label">Comments applied</span>
            </div>
            <div className="rebuild-annotation-stat">
              <span className="rebuild-annotation-stat-value">{counts.suggestionsAdded}</span>
              <span className="rebuild-annotation-stat-label">Suggestions added</span>
            </div>
            {pendingSuggestions > 0 ? (
              <div className="rebuild-annotation-stat rebuild-annotation-stat-pending">
                <span className="rebuild-annotation-stat-value">{pendingSuggestions}</span>
                <span className="rebuild-annotation-stat-label">Pending review</span>
              </div>
            ) : null}
            <div className="rebuild-annotation-stat">
              <span className="rebuild-annotation-stat-value">{counts.suggestionsAccepted}</span>
              <span className="rebuild-annotation-stat-label">Accepted</span>
            </div>
            <div className="rebuild-annotation-stat">
              <span className="rebuild-annotation-stat-value">{counts.suggestionsDismissed}</span>
              <span className="rebuild-annotation-stat-label">Dismissed</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="content-card rebuild-launcher-card" aria-label="Build actions">
        <div className="rebuild-launcher-actions">
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
