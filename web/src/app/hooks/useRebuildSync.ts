import { useEffect, useRef } from "react";
import type { RebuildState } from "../../contracts/api";
import { rebuildApi } from "../../data/rebuildApi";
import { errorMessage } from "../../domain/errors";
import { isTerminalRebuildStatus } from "../../domain/rebuild";

type UseRebuildSyncOptions = {
  rebuild: RebuildState | null;
  refreshBuildLog: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshRebuild: () => Promise<RebuildState>;
  refreshStatus: () => Promise<void>;
  selectedProjectSlug: string | null;
  setRebuild: (rebuild: RebuildState) => void;
  setNotice: (message: string) => void;
};

export function useRebuildSync({
  rebuild,
  refreshBuildLog,
  refreshProjectFiles,
  refreshRebuild,
  refreshStatus,
  selectedProjectSlug,
  setRebuild,
  setNotice,
}: UseRebuildSyncOptions) {
  const lastLiveEventAtRef = useRef(0);
  const lastRefreshErrorAtRef = useRef(0);

  const reportRefreshError = (error: unknown) => {
    const now = Date.now();
    if (now - lastRefreshErrorAtRef.current < 10000) return;

    lastRefreshErrorAtRef.current = now;
    setNotice(errorMessage(error, "Could not refresh rebuild status."));
  };

  const refreshSafely = async <T,>(refresh: () => Promise<T>) => {
    try {
      return await refresh();
    } catch (error) {
      reportRefreshError(error);
      return null;
    }
  };

  useEffect(() => {
    if (!rebuild?.running) return;

    const interval = window.setInterval(() => {
      void (async () => {
        if (typeof EventSource !== "undefined" && Date.now() - lastLiveEventAtRef.current < 7500) return;
        const next = await refreshSafely(refreshRebuild);
        void refreshSafely(refreshStatus);

        if (next && !next.running && isTerminalRebuildStatus(next.status)) {
          void refreshSafely(refreshBuildLog);
          void refreshSafely(refreshProjectFiles);
        }
      })();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [rebuild?.running, refreshBuildLog, refreshProjectFiles, refreshRebuild, refreshStatus, setNotice]);

  useEffect(() => {
    if (!selectedProjectSlug || !rebuild?.running || typeof EventSource === "undefined") return;

    const eventSource = rebuildApi.openRebuildEventSource(selectedProjectSlug);
    const syncRebuild = (event: MessageEvent<string>) => {
      try {
        lastLiveEventAtRef.current = Date.now();
        const payload = JSON.parse(event.data) as unknown;
        const next =
          payload && typeof payload === "object" && "state" in payload
            ? (payload as { state?: RebuildState }).state
            : (payload as RebuildState);
        if (next) {
          setRebuild(next);
          if (!next.running && isTerminalRebuildStatus(next.status)) {
            void refreshSafely(refreshStatus);
            void refreshSafely(refreshBuildLog);
            void refreshSafely(refreshProjectFiles);
          }
        }
      } catch {
        // Polling remains the fallback if the live event payload cannot be parsed.
      }
    };

    eventSource.addEventListener("snapshot", syncRebuild);
    eventSource.addEventListener("event", syncRebuild);
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [rebuild?.running, refreshBuildLog, refreshProjectFiles, refreshStatus, selectedProjectSlug, setRebuild, setNotice]);
}
