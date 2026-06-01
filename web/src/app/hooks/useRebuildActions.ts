import { useCallback } from "react";
import type { RebuildModel, RebuildState, ResolveHumanAttentionRequest } from "../../contracts/api";
import { rebuildApi } from "../../data/rebuildApi";
import { errorMessage } from "../../domain/errors";
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
    try {
      const next = await rebuildApi.startRebuild(requireSelectedProjectSlug(), resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels));
      setRebuild(next);

      if (next.status === "blocked") {
        setNotice(next.message);
      }
    } catch (error) {
      setNotice(errorMessage(error, "Could not start the rebuild."));
    }
  }, [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice, setRebuild]);

  const resolveHumanAttention = useCallback(
    async (request: Omit<ResolveHumanAttentionRequest, "modelId">) => {
      setNotice("");
      try {
        const next = await rebuildApi.resolveHumanAttention(requireSelectedProjectSlug(), {
          ...request,
          modelId: resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels),
        });
        setRebuild(next);

        if (next.status === "blocked" || next.status === "error") {
          setNotice(next.message);
        }
      } catch (error) {
        setNotice(errorMessage(error, "Could not start review-note resolution."));
      }
    },
    [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice, setRebuild],
  );

  const cancelRebuild = useCallback(async () => {
    setNotice("");
    try {
      const next = await rebuildApi.cancelRebuild(requireSelectedProjectSlug());
      setRebuild(next);
      setNotice("Build cancelled.");
    } catch (error) {
      setNotice(errorMessage(error, "Could not cancel the build."));
    }
  }, [requireSelectedProjectSlug, setNotice, setRebuild]);

  return { cancelRebuild, resolveHumanAttention, startRebuild };
}
