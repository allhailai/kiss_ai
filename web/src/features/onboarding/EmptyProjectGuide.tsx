import { useState, type FormEvent } from "react";
import type { ProjectStatus, RebuildModel } from "../../contracts/api";
import { systemApi } from "../../data/systemApi";

/**
 * Shown on the AI workspace when the project has never been built.
 * Guides non-technical users through the first three steps.
 *
 * Step 1 inlines the API key form so users never have to navigate
 * to Settings — they paste the key and click Connect, right here.
 */
export function EmptyProjectGuide({
  models,
  status,
  onOpenBuild,
  onConnectionChange,
}: {
  models: RebuildModel[];
  status: ProjectStatus | null;
  onOpenBuild: () => void;
  onConnectionChange: () => Promise<void>;
}) {
  // A key can exist but be invalid — only show "connected" when models actually loaded
  const hasApiKey = (status?.cursorApiKeyAvailable ?? false) && models.length > 0;

  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed || saving) return;

    setError("");
    setSaving(true);
    try {
      await systemApi.saveCursorApiKey({ cursorApiKey: trimmed });
      setApiKey("");
      // Refresh status + models so the guide updates instantly
      await onConnectionChange();
    } catch {
      setError("Couldn't connect. Please check your key and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="empty-project-guide">
      <div className="empty-project-guide-inner">
        <h2 className="empty-project-guide-title">Let's set up your project</h2>
        <p className="empty-project-guide-subtitle">
          Three quick steps and you'll be ready to go.
        </p>

        <ol className="empty-project-guide-steps">
          <li className="empty-project-guide-step">
            <span className="empty-project-guide-step-number">1</span>
            <div className="empty-project-guide-step-content">
              <strong>Connect your AI service</strong>
              {hasApiKey ? (
                <p className="empty-project-guide-connected">
                  <span className="empty-project-guide-check">✓</span>
                  Connected and ready
                </p>
              ) : (
                <>
                  <p>
                    This app uses <strong>Cursor</strong> to power its AI. To connect it,
                    you need a Cursor API key — think of it as a password that lets this
                    app talk to the AI on your behalf.
                  </p>
                  <p className="empty-project-guide-key-help">
                    <a
                      href="https://cursor.com/settings/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="empty-project-guide-key-link"
                    >
                      Get your key at cursor.com ↗
                    </a>
                    {" — sign in, click "API Keys", then "Create new key" and paste it below."}
                  </p>
                  <form className="empty-project-guide-key-form" onSubmit={handleConnect}>
                    <input
                      autoComplete="off"
                      disabled={saving}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Paste your Cursor API key here"
                      type="password"
                      value={apiKey}
                    />
                    <button disabled={saving || !apiKey.trim()} type="submit">
                      {saving ? "Connecting…" : "Connect"}
                    </button>
                  </form>
                  {error ? (
                    <p className="empty-project-guide-error">{error}</p>
                  ) : null}
                </>
              )}
            </div>
          </li>

          <li className="empty-project-guide-step">
            <span className="empty-project-guide-step-number">2</span>
            <div className="empty-project-guide-step-content">
              <strong>Add your source materials</strong>
              <p>
                Upload PDFs, reports, or notes to "Your Sources" in the sidebar.
                The AI will use these as the foundation for your research.
              </p>
            </div>
          </li>

          <li className="empty-project-guide-step">
            <span className="empty-project-guide-step-number">3</span>
            <div className="empty-project-guide-step-content">
              <strong>Start your first research update</strong>
              <p>
                Click the button below to start. The AI will analyze your documents,
                gather additional sources, and build knowledge pages.
              </p>
              <button
                className="empty-project-guide-cta"
                disabled={!hasApiKey}
                onClick={onOpenBuild}
                type="button"
              >
                Update Research
              </button>
              {!hasApiKey ? (
                <span className="empty-project-guide-hint">
                  Complete step 1 first
                </span>
              ) : null}
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
