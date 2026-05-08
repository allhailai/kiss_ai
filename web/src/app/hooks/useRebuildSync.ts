import { useEffect } from "react";
import type { RebuildState } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { isTerminalRebuildStatus } from "../../domain/rebuild";

type UseRebuildSyncOptions = {
  rebuild: RebuildState | null;
  refreshBuildLog: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshRebuild: () => Promise<RebuildState>;
  refreshStatus: () => Promise<void>;
  selectedProjectSlug: string | null;
  setRebuild: (rebuild: RebuildState) => void;
};

export function useRebuildSync({
  rebuild,
  refreshBuildLog,
  refreshProjectFiles,
  refreshRebuild,
  refreshStatus,
  selectedProjectSlug,
  setRebuild,
}: UseRebuildSyncOptions) {
  useEffect(() => {
    if (!rebuild?.running) return;

    const interval = window.setInterval(() => {
      void (async () => {
        const next = await refreshRebuild();
        void refreshStatus();

        if (!next.running && isTerminalRebuildStatus(next.status)) {
          void refreshBuildLog();
          void refreshProjectFiles();
        }
      })();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [rebuild?.running, refreshBuildLog, refreshProjectFiles, refreshRebuild, refreshStatus]);

  useEffect(() => {
    if (!selectedProjectSlug || !rebuild?.running || typeof EventSource === "undefined") return;

    const eventSource = new EventSource(api.rebuildEventsUrl(selectedProjectSlug));
    const syncRebuild = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as unknown;
        const next =
          payload && typeof payload === "object" && "state" in payload
            ? (payload as { state?: RebuildState }).state
            : (payload as RebuildState);
        if (next) {
          setRebuild(next);
          if (!next.running && isTerminalRebuildStatus(next.status)) {
            void refreshStatus();
            void refreshBuildLog();
            void refreshProjectFiles();
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
  }, [rebuild?.running, refreshBuildLog, refreshProjectFiles, refreshStatus, selectedProjectSlug, setRebuild]);
}
