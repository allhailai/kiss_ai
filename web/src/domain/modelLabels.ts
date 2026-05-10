import type { RebuildModel } from "../contracts/api";

export const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High ($$$)",
  small: "Low ($)",
};

export const modelTierOrder: RebuildModel["tier"][] = ["high", "medium", "small"];

export function formatModelLabel(model: RebuildModel) {
  const modelName = model.displayName || model.id;
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}
