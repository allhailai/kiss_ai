import type { RebuildModel } from "../contracts/api";

export const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High ($$$)",
  small: "Low ($)",
};

export const modelTierOrder: RebuildModel["tier"][] = ["high", "medium", "small"];

function modelSortLabel(model: RebuildModel) {
  return model.displayName || model.id;
}

export function formatModelLabel(model: RebuildModel) {
  const modelName = modelSortLabel(model);
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}

export function groupModelsByTier(models: RebuildModel[]) {
  return modelTierOrder
    .map((tier) => ({
      tier,
      models: models
        .filter((model) => model.tier === tier)
        .sort((left, right) => modelSortLabel(left).localeCompare(modelSortLabel(right), undefined, { sensitivity: "base" })),
    }))
    .filter((group) => group.models.length > 0);
}
