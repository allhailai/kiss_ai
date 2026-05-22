import { useEffect, useRef, useState } from "react";
import { api } from "../data/apiClient";
import { errorMessage } from "../domain/errors";
import type { KissAiUpdateCheckResponse } from "../contracts/api";

function useServerReadyPoller(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(async () => {
      try {
        await api.systemSettings();
        // Server is back — reload the page.
        window.location.reload();
      } catch {
        // Server still down, keep polling.
      }
    }, 2_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);
}

export function UpdateCheckerModal() {
  const [open, setOpen] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<KissAiUpdateCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");

  useServerReadyPoller(restarting);

  const checkLatest = async () => {
    if (loading || updating || restarting) return;

    setOpen(true);
    setUpdateCheck(null);
    setError("");
    setLoading(true);
    try {
      setUpdateCheck(await api.checkKissAiUpdate());
    } catch (err) {
      setError(errorMessage(err, "Could not check for the latest KISS AI version."));
    } finally {
      setLoading(false);
    }
  };

  const updateAndRestart = async () => {
    if (updating || restarting) return;

    setError("");
    setUpdating(true);
    try {
      const result = await api.updateAndRestartKissAi();

      if (result.restarting) {
        setRestarting(true);
      } else {
        // Already up to date — nothing to restart.
        setUpdateCheck({ status: "up_to_date", updateAvailable: false, localRevision: result.afterRevision, remoteRevision: result.afterRevision, upstream: "" });
        setUpdating(false);
      }
    } catch (err) {
      setError(errorMessage(err, "Could not update KISS AI."));
      setUpdating(false);
    }
  };

  const busy = loading || updating || restarting;

  return (
    <>
      <button disabled={busy} onClick={() => void checkLatest()} type="button">
        {loading ? "Checking..." : "Get Latest KISS AI Version"}
      </button>

      {open ? (
        <div className="kiss-ai-update-modal-backdrop" role="presentation">
          <section className="kiss-ai-update-modal" role="dialog" aria-modal="true" aria-labelledby="kiss-ai-update-title">
            <div className="kiss-ai-update-modal-header">
              <div>
                <span className="eyebrow">KISS AI version</span>
                <h2 id="kiss-ai-update-title">Get Latest KISS AI Version</h2>
              </div>
              {!restarting ? (
                <button className="kiss-ai-update-close" onClick={() => setOpen(false)} type="button" aria-label="Close KISS AI update dialog">
                  x
                </button>
              ) : null}
            </div>

            {loading ? <p>Checking the latest KISS AI version...</p> : null}

            {error ? (
              <div className="warning-callout" role="alert">
                <strong>Could not check for updates</strong>
                <p>{error}</p>
              </div>
            ) : null}

            {!loading && updateCheck?.status === "up_to_date" ? <p>KISS AI is up to date. No new version.</p> : null}

            {restarting ? (
              <div className="kiss-ai-update-restarting">
                <p>
                  <strong>Updating and restarting KISS AI...</strong>
                </p>
                <p>The app is installing dependencies and restarting. This page will reload automatically when the new version is ready.</p>
                <p className="kiss-ai-update-restarting-hint">This usually takes 15–30 seconds. Do not close this tab.</p>
              </div>
            ) : null}

            {!loading && !restarting && updateCheck?.updateAvailable ? (
              <div className="kiss-ai-update-available">
                <p>
                  A new KISS AI version is available for download. Current version: <code>{updateCheck.localRevision}</code>. Latest version:{" "}
                  <code>{updateCheck.remoteRevision}</code>.
                </p>
                <button disabled={updating} onClick={() => void updateAndRestart()} type="button">
                  {updating ? "Updating..." : "Update & Restart"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

