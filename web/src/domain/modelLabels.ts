import type { RebuildModel } from "../contracts/api";

export const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High / Extra High ($$$)",
  small: "Small ($)",
};

export const modelTierOrder: RebuildModel["tier"][] = ["medium", "high", "small"];

export function formatModelLabel(model: RebuildModel) {
  const modelName = model.displayName || model.id;
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}
