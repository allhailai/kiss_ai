import { createContext, useContext, type ReactNode } from "react";
import type { ProjectStatus, RebuildModel, RebuildState } from "../../contracts/api";

export type BuildContextValue = {
  isBuilding: boolean;
  rebuild: RebuildState | null;
  buildPhase: string | null;
  startRebuild: () => void;
  openBuildPanel: () => void;
  refreshRebuild: () => Promise<RebuildState>;
  refreshStatus: () => Promise<void>;
  models: RebuildModel[];
  selectedModelId: string;
  setSelectedModelId: (modelId: string) => void;
  status: ProjectStatus | null;
};

const BuildContext = createContext<BuildContextValue | null>(null);

export function useBuildContext(): BuildContextValue {
  const context = useContext(BuildContext);
  if (!context) {
    throw new Error("useBuildContext must be used within a BuildProvider");
  }
  return context;
}

export function BuildProvider({ children, value }: { children: ReactNode; value: BuildContextValue }) {
  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}
