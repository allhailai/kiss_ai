import { useState } from "react";
import { api } from "../data/apiClient";
import { errorMessage } from "../domain/errors";
import type { KissAiUpdateCheckResponse } from "../contracts/api";

export function UpdateCheckerModal() {
  const [open, setOpen] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<KissAiUpdateCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const checkLatest = async () => {
    if (loading || downloading) return;

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

  const downloadLatest = async () => {
    if (downloading) return;

    setError("");
    setDownloading(true);
    try {
      await api.updateKissAi();
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, "Could not download the latest KISS AI version."));
      setDownloading(false);
    }
  };

  return (
    <>
      <button disabled={loading || downloading} onClick={() => void checkLatest()} type="button">
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
              <button className="kiss-ai-update-close" onClick={() => setOpen(false)} type="button" aria-label="Close KISS AI update dialog">
                x
              </button>
            </div>

            {loading ? <p>Checking the latest KISS AI version...</p> : null}

            {error ? (
              <div className="warning-callout" role="alert">
                <strong>Could not check for updates</strong>
                <p>{error}</p>
              </div>
            ) : null}

            {!loading && updateCheck?.status === "up_to_date" ? <p>KISS AI is up to date. No new version.</p> : null}

            {!loading && updateCheck?.updateAvailable ? (
              <div className="kiss-ai-update-available">
                <p>
                  A new KISS AI version is available for download. Current version: <code>{updateCheck.localRevision}</code>. Latest version:{" "}
                  <code>{updateCheck.remoteRevision}</code>.
                </p>
                <button disabled={downloading} onClick={() => void downloadLatest()} type="button">
                  {downloading ? "Downloading..." : "Download Latest Version"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
