import { useCallback, useRef } from "react";
import { errorMessage } from "../../domain/errors";
import { designIdentityFilePath } from "../../domain/projectPaths";
import { type RouteState, type View } from "../../navigation/views";

export function useRouteDrivenData({
  clearSelectedFile,
  loadTree,
  refreshBuildLog,
  refreshDesign,
  refreshRebuild,
  selectFile,
  selectedProjectSlug,
  setNotice,
  setRouteContext,
  setView,
}: {
  clearSelectedFile: () => void;
  loadTree: (section: string) => Promise<void>;
  refreshBuildLog: () => Promise<void>;
  refreshDesign: () => Promise<void>;
  refreshRebuild: () => Promise<unknown>;
  selectFile: (path: string) => Promise<void>;
  selectedProjectSlug: string | null;
  setNotice: (message: string) => void;
  setRouteContext: (context: Record<string, string>) => void;
  setView: (view: View) => void;
}) {
  const routeRequestIdRef = useRef(0);

  return useCallback(
    async (route: RouteState) => {
      if (!route.projectSlug || route.projectSlug !== selectedProjectSlug) return;

      const requestId = (routeRequestIdRef.current += 1);
      const isCurrentRouteRequest = () => routeRequestIdRef.current === requestId;

      try {
        const nextView = route.view;
        setView(nextView);
        setRouteContext(route.context);
        setNotice("");
        clearSelectedFile();

        if (nextView === "requirements") {
          await loadTree("requirements");
        } else if (nextView === "inputs") {
          await loadTree("human");
        } else if (nextView === "outputs") {
          await loadTree("outputs");
        }
        if (!isCurrentRouteRequest()) return;

        if (nextView === "dashboard") {
          await Promise.all([refreshDesign(), refreshBuildLog()]);
        } else if (nextView === "design") {
          if (!isCurrentRouteRequest()) return;
          await refreshDesign();
          if (!isCurrentRouteRequest()) return;
          await selectFile(route.filePath ?? designIdentityFilePath);
        }
        if (!isCurrentRouteRequest()) return;

        if (nextView === "rebuild") {
          await refreshRebuild();
          if (!isCurrentRouteRequest()) return;
          await refreshBuildLog();
        }
        if (!isCurrentRouteRequest()) return;

        if (route.filePath && nextView !== "design") {
          await selectFile(route.filePath);
        }
      } catch (error) {
        if (isCurrentRouteRequest()) {
          setNotice(errorMessage(error, "Could not load this view."));
        }
      }
    },
    [
      clearSelectedFile,
      loadTree,
      refreshBuildLog,
      refreshDesign,
      refreshRebuild,
      selectFile,
      selectedProjectSlug,
      setNotice,
      setRouteContext,
      setView,
    ],
  );
}
