import { useCallback, useState } from "react";
import type { RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";

export function useModelSelection() {
  const [rebuildModels, setRebuildModels] = useState<RebuildModel[]>([]);
  const [selectedRebuildModelId, setSelectedRebuildModelId] = useState("");

  const refreshRebuildModels = useCallback(async () => {
    const response = await api.rebuildModels();
    setRebuildModels(response.models);
    setSelectedRebuildModelId((current) => {
      if (current && response.models.some((model) => model.id === current)) return current;
      return response.defaultModelId ?? response.models[0]?.id ?? "";
    });
  }, []);

  const clearRebuildModels = useCallback(() => {
    setRebuildModels([]);
    setSelectedRebuildModelId("");
  }, []);

  return {
    rebuildModels,
    selectedRebuildModelId,
    setRebuildModels,
    setSelectedRebuildModelId,
    refreshRebuildModels,
    clearRebuildModels,
  };
}
