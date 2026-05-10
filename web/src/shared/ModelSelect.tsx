import type { RebuildModel } from "../contracts/api";
import { formatModelLabel, modelTierLabels, modelTierOrder } from "../domain/modelLabels";

export function ModelSelect({
  className,
  disabled,
  label,
  models,
  noteClassName,
  onModelChange,
  selectedModelId,
  showTierNote = true,
}: {
  className: string;
  disabled: boolean;
  label: string;
  models: RebuildModel[];
  noteClassName?: string;
  onModelChange: (modelId: string) => void;
  selectedModelId: string;
  showTierNote?: boolean;
}) {
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;

  return (
    <label className={className}>
      <span>{label}</span>
      <select disabled={disabled || !models.length} onChange={(event) => onModelChange(event.target.value)} value={selectedModelId}>
        {models.length ? (
          modelTierOrder.map((tier) => {
            const tierModels = models
              .filter((model) => model.tier === tier)
              .sort((left, right) =>
                (left.displayName || left.id).localeCompare(right.displayName || right.id, undefined, { sensitivity: "base" }),
              );
            if (!tierModels.length) return null;

            return (
              <optgroup key={tier} label={modelTierLabels[tier]}>
                {tierModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {formatModelLabel(model)}
                  </option>
                ))}
              </optgroup>
            );
          })
        ) : (
          <option value="">No models loaded</option>
        )}
      </select>
      {showTierNote && selectedModel ? <small className={noteClassName}>{modelTierLabels[selectedModel.tier]}</small> : null}
    </label>
  );
}
