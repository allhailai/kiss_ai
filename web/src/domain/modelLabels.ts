import type { RebuildModel } from "../contracts/api";

export const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High ($$$)",
  small: "Low ($)",
};

export const modelTierOrder: RebuildModel["tier"][] = ["high", "medium", "small"];

export function modelDisplayName(model: RebuildModel) {
  return model.displayName || model.id;
}

export function formatModelLabel(model: RebuildModel) {
  const modelName = modelDisplayName(model);
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}

export function groupModelsByTier(models: RebuildModel[]) {
  return modelTierOrder
    .map((tier) => ({
      tier,
      models: models
        .filter((model) => model.tier === tier)
        .sort((left, right) => modelDisplayName(left).localeCompare(modelDisplayName(right), undefined, { sensitivity: "base" })),
    }))
    .filter((group) => group.models.length > 0);
}
