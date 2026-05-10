import { useCallback } from "react";
import type { ProjectFile } from "../../contracts/api";
import { designIdentityFilePath } from "../../domain/projectPaths";
import { designProjectFile, type RouteState, type View } from "../../navigation/views";

export function useRouteDrivenData({
  clearSelectedFile,
  loadTree,
  refreshBuildLog,
  refreshDesign,
  refreshRebuild,
  selectFile,
  selectedProjectSlug,
  setFiles,
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
  setFiles: (files: ProjectFile[]) => void;
  setNotice: (message: string) => void;
  setRouteContext: (context: Record<string, string>) => void;
  setView: (view: View) => void;
}) {
  return useCallback(
    async (route: RouteState) => {
      if (!route.projectSlug || route.projectSlug !== selectedProjectSlug) return;

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
      } else if (nextView === "annotations") {
        await loadTree("inputs-ai");
      } else {
        setFiles([]);
      }

      if (nextView === "dashboard") {
        await refreshDesign();
      } else if (nextView === "design") {
        setFiles([designProjectFile]);
        await refreshDesign();
        await selectFile(route.filePath ?? designIdentityFilePath);
      }

      if (nextView === "rebuild") {
        await refreshRebuild();
      }

      if (nextView === "build-log") {
        await refreshBuildLog();
      }

      if (route.filePath && nextView !== "design") {
        await selectFile(route.filePath);
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
      setFiles,
      setNotice,
      setRouteContext,
      setView,
    ],
  );
}
