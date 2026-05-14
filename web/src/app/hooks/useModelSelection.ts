import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectUiState, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";

const emptyProjectUiState: ProjectUiState = { version: 1 };

export function useModelSelection(selectedProjectSlug: string | null) {
  const [rebuildModels, setRebuildModels] = useState<RebuildModel[]>([]);
  const [selectedRebuildModelId, setSelectedRebuildModelId] = useState("");
  const selectedProjectSlugRef = useRef(selectedProjectSlug);

  useEffect(() => {
    selectedProjectSlugRef.current = selectedProjectSlug;
  }, [selectedProjectSlug]);

  const refreshRebuildModels = useCallback(async () => {
    const projectSlug = selectedProjectSlug;
    const [response, projectUiState] = await Promise.all([
      api.rebuildModels(),
      projectSlug ? api.projectUiState(projectSlug).catch(() => emptyProjectUiState) : Promise.resolve(emptyProjectUiState),
    ]);

    if (selectedProjectSlugRef.current !== projectSlug) return;

    setRebuildModels(response.models);
    const preferredModelId = projectUiState.preferredModelId;
    const preferredAvailable = preferredModelId ? response.models.some((model) => model.id === preferredModelId) : false;
    const nextModelId = preferredAvailable && preferredModelId ? preferredModelId : response.defaultModelId ?? response.models[0]?.id ?? "";

    setSelectedRebuildModelId(nextModelId);
    if (projectSlug && nextModelId && nextModelId !== preferredModelId) {
      void api.updateProjectUiState(projectSlug, { preferredModelId: nextModelId }).catch((error: unknown) => {
        console.warn("[kiss_ai UI warning] Could not persist fallback model selection.", error);
      });
    }
  }, [selectedProjectSlug]);

  const selectRebuildModelId = useCallback((modelId: string) => {
    setSelectedRebuildModelId(modelId);
    const projectSlug = selectedProjectSlugRef.current;
    if (!projectSlug || !modelId) return;

    void api.updateProjectUiState(projectSlug, { preferredModelId: modelId }).catch((error: unknown) => {
      console.warn("[kiss_ai UI warning] Could not persist model selection.", error);
    });
  }, []);

  const clearRebuildModels = useCallback(() => {
    setRebuildModels([]);
    setSelectedRebuildModelId("");
  }, []);

  return {
    rebuildModels,
    selectedRebuildModelId,
    setSelectedRebuildModelId: selectRebuildModelId,
    refreshRebuildModels,
    clearRebuildModels,
  };
}
