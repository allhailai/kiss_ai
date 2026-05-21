import { useState, type FormEvent } from "react";
import { api } from "../data/apiClient";
import type { SystemSettingsResponse } from "../contracts/api";

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cursorApiKey, setCursorApiKey] = useState("");

  const openSettings = async () => {
    if (loading || saving) return;

    setOpen(true);
    setSettings(null);
    setError("");
    setMessage("");
    setLoading(true);
    try {
      setSettings(await api.systemSettings());
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
      const result = await api.saveCursorApiKey({ cursorApiKey: nextCursorApiKey });
      setMessage(result.message);
      setSettings(await api.systemSettings());
      setCursorApiKey("");
    } catch {
      setError("Failed! Please try again. If this issue persists, contact AllHail.AI");
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

            {loading ? <p>Checking Cursor API key status...</p> : null}
            {!loading && settings?.cursorApiKeyAvailable ? <p>Cursor API Key Found</p> : null}
            {!loading && settings && !settings.cursorApiKeyAvailable ? <p>No Cursor API key found.</p> : null}

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
          </section>
        </div>
      ) : null}
    </>
  );
}
