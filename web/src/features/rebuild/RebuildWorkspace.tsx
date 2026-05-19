import type { ProjectStatus, RebuildState } from "../../contracts/api";

export function RebuildWorkspace({
  status,
  rebuild,
  onOpenBuildProject,
  onOpenQuestions,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onOpenBuildProject: () => void;
  onOpenQuestions: () => void;
}) {
  const openQuestionsCount = status?.openQuestionsCount ?? 0;

  return (
    <div className="panel-stack rebuild-launcher-workspace">
      {openQuestionsCount ? (
        <section className="rebuild-open-questions-callout" aria-label="Unanswered human questions">
          <div>
            <strong>You have unanswered questions for the next build.</strong>
            <p>
              {openQuestionsCount} question{openQuestionsCount === 1 ? "" : "s"} from the AI need your input to improve the next build.
            </p>
          </div>
          <button onClick={onOpenQuestions} type="button">
            Answer Questions
          </button>
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
    </div>
  );
}
