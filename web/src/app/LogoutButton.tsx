import { useEffect, useState } from "react";
import { authApi } from "../data/authApi";
import { request } from "../data/request";
import type { VersionResponse } from "../contracts/api";

/**
 * Logout button with confirmation dialog.
 * Only renders in server mode where authentication is active.
 */
export function LogoutButton() {
  const [isServerMode, setIsServerMode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const version = await request<VersionResponse>("/api/version");
        setIsServerMode(version.mode === "server");
      } catch {
        // standalone or unreachable
      }
    })();
  }, []);

  if (!isServerMode) return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authApi.logout();
    } catch {
      // Cookie may already be cleared
    }
    window.dispatchEvent(new Event("kiss-ai-auth-required"));
  };

  if (confirming) {
    return (
      <div className="logout-confirm" role="alertdialog" aria-label="Confirm logout">
        <span className="logout-confirm-text">Log out?</span>
        <button
          className="logout-confirm-yes"
          disabled={loggingOut}
          id="logout-confirm-button"
          onClick={() => void handleLogout()}
          type="button"
        >
          {loggingOut ? "Logging out…" : "Yes, log out"}
        </button>
        <button
          className="logout-confirm-no"
          onClick={() => setConfirming(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      className="logout-button"
      id="logout-button"
      onClick={() => setConfirming(true)}
      type="button"
    >
      Log Out
    </button>
  );
}
