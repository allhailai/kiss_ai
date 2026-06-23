import { useEffect, useState, type FormEvent } from "react";
import { systemApi } from "../data/systemApi";
import type { SystemSettingsResponse, VersionResponse } from "../contracts/api";
import { authApi } from "../data/authApi";
import { request } from "../data/request";
import { UserAdminPanel } from "../features/userAdmin/UserAdminPanel";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cursorApiKey, setCursorApiKey] = useState("");
  const [githubPat, setGithubPat] = useState("");
  const [showUserAdmin, setShowUserAdmin] = useState(false);
  const [isServerAdmin, setIsServerAdmin] = useState(false);

  // Check if we're in server mode and current user is admin
  useEffect(() => {
    (async () => {
      try {
        const version = await request<VersionResponse>("/api/version");
        if (version.mode === "server") {
          try {
            const me = await authApi.me();
            setIsServerAdmin(me.is_admin);
          } catch {
            setIsServerAdmin(false);
          }
        }
      } catch {
        // standalone or unreachable
      }
    })();
  }, []);

  const openSettings = async () => {
    if (loading || saving) return;

    setOpen(true);
    setSettings(null);
    setError("");
    setMessage("");
    setLoading(true);
    try {
      setSettings(await systemApi.systemSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  };

  const saveCursorApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCursorApiKey = cursorApiKey.trim();
    if (!nextCursorApiKey || saving) return;

    setError("");
    setMessage("");
    setSaving(true);
    try {
      const result = await systemApi.saveCursorApiKey({ cursorApiKey: nextCursorApiKey });
      setMessage(result.message);
      setSettings(await systemApi.systemSettings());
      setCursorApiKey("");
    } catch {
      setError("Failed! Please try again. If this issue persists, contact AllHail.AI");
    } finally {
      setSaving(false);
    }
  };

  const saveGithubPat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextGithubPat = githubPat.trim();
    if (!nextGithubPat || saving) return;

    setError("");
    setMessage("");
    setSaving(true);
    try {
      const result = await systemApi.saveGithubPat({ githubPat: nextGithubPat });
      setMessage(result.message);
      setSettings(await systemApi.systemSettings());
      setGithubPat("");
    } catch {
      setError("Failed to save GitHub PAT! Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button disabled={loading || saving} onClick={() => void openSettings()} type="button">
        Settings
      </button>

      {open ? (
        <div className="kiss-ai-update-modal-backdrop" role="presentation">
          <section className="kiss-ai-update-modal" role="dialog" aria-modal="true" aria-labelledby="kiss-ai-settings-title">
            <div className="kiss-ai-update-modal-header">
              <div>
                <span className="eyebrow">Settings</span>
                <h2 id="kiss-ai-settings-title">KISS AI Settings</h2>
              </div>
              <button className="kiss-ai-update-close" onClick={() => setOpen(false)} type="button" aria-label="Close settings dialog">
                x
              </button>
            </div>

            {loading ? <p>Checking settings status...</p> : null}
            {!loading && settings && (
              <div style={{ display: "grid", gap: 6, marginBottom: "1rem", fontSize: "0.85rem", color: "var(--color-secondary)", border: "1px solid var(--color-border)", borderRadius: "8px", padding: 10, background: "rgba(255, 255, 255, 0.02)" }}>
                <div>
                  Cursor API Key:{" "}
                  <strong style={{ color: settings.cursorApiKeyAvailable ? "var(--color-accent)" : "var(--color-secondary)" }}>
                    {settings.cursorApiKeyAvailable ? "✓ Found" : "✗ Missing"}
                  </strong>
                </div>
                <div>
                  GitHub PAT (Personal Access Token):{" "}
                  <strong style={{ color: settings.githubPatAvailable ? "var(--color-accent)" : "var(--color-secondary)" }}>
                    {settings.githubPatAvailable ? "✓ Found" : "✗ Missing"}
                  </strong>
                </div>
              </div>
            )}

            {error ? (
              <div className="warning-callout" role="alert">
                <strong>Settings error</strong>
                <p>{error}</p>
              </div>
            ) : null}

            {message ? (
              <div className="settings-success-callout" role="status">
                <p>{message}</p>
              </div>
            ) : null}

            <form className="settings-api-key-form" onSubmit={saveCursorApiKey}>
              <label>
                <span>CURSOR_API_KEY</span>
                <input
                  autoComplete="off"
                  disabled={saving}
                  onChange={(event) => setCursorApiKey(event.target.value)}
                  placeholder="Paste your Cursor API key"
                  type="password"
                  value={cursorApiKey}
                />
              </label>
              <button disabled={saving || !cursorApiKey.trim()} type="submit">
                {saving ? "Saving..." : "Save API Key"}
              </button>
            </form>

            <form className="settings-api-key-form" onSubmit={saveGithubPat} style={{ marginTop: "1rem" }}>
              <label>
                <span>KISS_AI_GITHUB_PAT (For Private Repositories)</span>
                <input
                  autoComplete="off"
                  disabled={saving}
                  onChange={(event) => setGithubPat(event.target.value)}
                  placeholder="Paste your GitHub Personal Access Token"
                  type="password"
                  value={githubPat}
                />
              </label>
              <button disabled={saving || !githubPat.trim()} type="submit">
                {saving ? "Saving..." : "Save GitHub PAT"}
              </button>
            </form>

            {isServerAdmin ? (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border)" }}>
                <button
                  onClick={() => setShowUserAdmin(true)}
                  type="button"
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    padding: "0.5rem 1rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    background: "var(--color-surface)",
                    color: "var(--color-primary)",
                    cursor: "pointer",
                  }}
                >
                  Manage Users
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {showUserAdmin ? <UserAdminPanel onClose={() => setShowUserAdmin(false)} /> : null}
    </>
  );
}
