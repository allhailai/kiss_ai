import { useEffect, useState, type FormEvent } from "react";
import { systemApi } from "../../data/systemApi";
import { authApi } from "../../data/authApi";
import { request } from "../../data/request";
import { useUxPreferences } from "../../app/contexts/UxPreferencesContext";
import { UserAdminPanel } from "../userAdmin/UserAdminPanel";
import type { SystemSettingsResponse, VersionResponse } from "../../contracts/api";

export function SettingsPage() {
  const { preferences, updatePreference } = useUxPreferences();

  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cursorApiKey, setCursorApiKey] = useState("");
  const [showUserAdmin, setShowUserAdmin] = useState(false);
  const [isServerAdmin, setIsServerAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsResult, version] = await Promise.all([
          systemApi.systemSettings(),
          request<VersionResponse>("/api/version"),
        ]);
        setSettings(settingsResult);
        if (version.mode === "server") {
          try {
            const me = await authApi.me();
            setIsServerAdmin(me.is_admin);
          } catch {
            setIsServerAdmin(false);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  return (
    <div className="settings-page">
      <header className="page-header">
        <span className="eyebrow">Settings</span>
        <h2>Project Settings</h2>
        <p>Configure your AI service connection and display preferences.</p>
      </header>

      {/* ── AI Service Connection ── */}
      <section className="content-card settings-section">
        <div className="section-heading">
          <h3>AI Service Connection</h3>
        </div>

        {loading ? <p className="settings-loading">Checking connection status…</p> : null}

        {!loading && settings?.cursorApiKeyAvailable ? (
          <div className="settings-status-connected" role="status">
            <span className="settings-status-icon" aria-hidden="true">✓</span>
            <div>
              <strong>AI Service Connected</strong>
              <p>Your AI engine is ready. Research updates are enabled.</p>
            </div>
          </div>
        ) : null}

        {!loading && settings && !settings.cursorApiKeyAvailable ? (
          <div className="settings-status-disconnected" role="status">
            <span className="settings-status-icon" aria-hidden="true">⚠</span>
            <div>
              <strong>AI Service Not Connected</strong>
              <p>Add your key below to enable research updates.</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="warning-callout" role="alert">
            <strong>Connection error</strong>
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
            <span>AI Service Key</span>
            <input
              autoComplete="off"
              disabled={saving}
              onChange={(event) => setCursorApiKey(event.target.value)}
              placeholder="Paste your AI service key"
              type="password"
              value={cursorApiKey}
            />
          </label>
          <p className="settings-helper-text">
            This key connects kiss_ai to the AI engine that powers your research updates.
          </p>
          <button disabled={saving || !cursorApiKey.trim()} type="submit">
            {saving ? "Connecting…" : "Connect AI Service"}
          </button>
        </form>
      </section>

      {/* ── Display Preferences ── */}
      <section className="content-card settings-section">
        <div className="section-heading">
          <h3>Display Preferences</h3>
        </div>
        <p className="settings-section-description">
          Control which advanced features are visible. These are hidden by default to keep the interface simple.
        </p>

        <div className="settings-toggle-list">
          <SettingsToggle
            checked={preferences.showFileBrowser}
            description="Show a file tree navigator in the sidebar for direct file access."
            label="Show file browser"
            onChange={(value) => updatePreference("showFileBrowser", value)}
          />
          <SettingsToggle
            checked={preferences.showTopics}
            description="Show the Topics tab on the home screen, tracking AI research depth per topic."
            label="Show research topics"
            onChange={(value) => updatePreference("showTopics", value)}
          />
          <SettingsToggle
            checked={preferences.showDesignIdentity}
            description="Show the visual style editor for customizing colors, typography, and spacing tokens."
            label="Show visual style editor"
            onChange={(value) => updatePreference("showDesignIdentity", value)}
          />
          <SettingsToggle
            checked={preferences.showModelPicker}
            description="Show the AI model selector when updating research. Otherwise, the best available model is used."
            label="Show AI model selector"
            onChange={(value) => updatePreference("showModelPicker", value)}
          />
        </div>
      </section>

      {/* ── User Administration (server mode admins only) ── */}
      {isServerAdmin ? (
        <section className="content-card settings-section">
          <div className="section-heading">
            <h3>User Administration</h3>
          </div>
          <button
            className="settings-admin-button"
            onClick={() => setShowUserAdmin(true)}
            type="button"
          >
            Manage Users
          </button>
        </section>
      ) : null}

      {showUserAdmin ? <UserAdminPanel onClose={() => setShowUserAdmin(false)} /> : null}
    </div>
  );
}

function SettingsToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
}) {
  const id = `settings-toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <label className="settings-toggle" htmlFor={id}>
      <div className="settings-toggle-text">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <input
        checked={checked}
        id={id}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        role="switch"
      />
    </label>
  );
}
