import { useCallback, useRef } from "react";
import { errorMessage } from "../../domain/errors";
import { designIdentityFilePath } from "../../domain/projectPaths";
import { type RouteState, type View } from "../../navigation/views";

export function useRouteDrivenData({
  clearSelectedFile,
  refreshBuildLog,
  refreshDesign,
  selectFile,
  selectedProjectSlug,
  setArtifactSlug,
  setNotice,
  setRouteContext,
  setView,
}: {
  clearSelectedFile: () => void;
  refreshBuildLog: () => Promise<void>;
  refreshDesign: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  selectedProjectSlug: string | null;
  setArtifactSlug: (slug: string | null) => void;
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

        // Track artifact slug when in artifacts view, clear otherwise
        setArtifactSlug(nextView === "artifacts" ? (route.filePath ?? null) : null);



        if (nextView === "dashboard") {
          await Promise.all([refreshDesign(), refreshBuildLog()]);
        } else if (nextView === "design") {
          if (!isCurrentRouteRequest()) return;
          await refreshDesign();
          if (!isCurrentRouteRequest()) return;
          await selectFile(route.filePath ?? designIdentityFilePath);
        }
        if (!isCurrentRouteRequest()) return;

        if (route.filePath && nextView !== "design" && nextView !== "artifacts") {
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
      refreshBuildLog,
      refreshDesign,
      selectFile,
      selectedProjectSlug,
      setArtifactSlug,
      setNotice,
      setRouteContext,
      setView,
    ],
  );
}
