import { useCallback } from "react";
import type { RebuildModel, RebuildState, ResolveHumanAttentionRequest } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { resolveEffectiveRebuildModelId } from "../../domain/rebuild";

export function useRebuildActions({
  rebuildModels,
  requireSelectedProjectSlug,
  selectedRebuildModelId,
  setNotice,
  setRebuild,
}: {
  rebuildModels: RebuildModel[];
  requireSelectedProjectSlug: () => string;
  selectedRebuildModelId: string;
  setNotice: (message: string) => void;
  setRebuild: (rebuild: RebuildState) => void;
}) {
  const startRebuild = useCallback(async () => {
    setNotice("");
    const next = await api.startRebuild(requireSelectedProjectSlug(), resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels));
    setRebuild(next);

    if (next.status === "blocked") {
      setNotice(next.message);
    }
  }, [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice, setRebuild]);

  const resolveHumanAttention = useCallback(
    async (request: Omit<ResolveHumanAttentionRequest, "modelId">) => {
      setNotice("");
      const next = await api.resolveHumanAttention(requireSelectedProjectSlug(), {
        ...request,
        modelId: resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels),
      });
      setRebuild(next);

      if (next.status === "blocked" || next.status === "error") {
        setNotice(next.message);
      }
    },
    [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice, setRebuild],
  );

  return { resolveHumanAttention, startRebuild };
}
