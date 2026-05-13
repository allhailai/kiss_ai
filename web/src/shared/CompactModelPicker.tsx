import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { RebuildModel } from "../contracts/api";
import { groupModelsByTier, modelDisplayName, modelTierLabels } from "../domain/modelLabels";

export function CompactModelPicker({
  disabled,
  models,
  onAfterModelChange,
  onModelChange,
  selectedModelId,
}: {
  disabled: boolean;
  models: RebuildModel[];
  onAfterModelChange?: () => void;
  onModelChange: (modelId: string) => void;
  selectedModelId: string;
}) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const activeModelOptionRef = useRef<HTMLButtonElement | null>(null);
  const modelBlurTimeoutRef = useRef<number | null>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const tieredModels = useMemo(() => groupModelsByTier(models), [models]);
  const modelOptions = useMemo(() => tieredModels.flatMap((group) => group.models), [tieredModels]);
  const modelOptionIndexes = useMemo(
    () => new Map(modelOptions.map((model, index) => [model.id, index])),
    [modelOptions],
  );

  useEffect(() => {
    if (!modelPickerOpen) return;
    const selectedIndex = modelOptionIndexes.get(selectedModelId) ?? -1;
    setActiveModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [modelOptionIndexes, modelPickerOpen, selectedModelId]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    window.requestAnimationFrame(() => {
      activeModelOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
  }, [activeModelIndex, modelPickerOpen]);

  useEffect(() => {
    return () => {
      if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
    };
  }, []);

  const closeModelPickerSoon = () => {
    if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
    modelBlurTimeoutRef.current = window.setTimeout(() => setModelPickerOpen(false), 120);
  };

  const selectModel = (modelId: string) => {
    onModelChange(modelId);
    setModelPickerOpen(false);
    onAfterModelChange?.();
  };

  const handleModelPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!modelOptions.length) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setModelPickerOpen(false);
      onAfterModelChange?.();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setModelPickerOpen(true);
      setActiveModelIndex((current) => (current + 1) % modelOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setModelPickerOpen(true);
      setActiveModelIndex((current) => (current <= 0 ? modelOptions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && modelPickerOpen) {
      event.preventDefault();
      selectModel(modelOptions[activeModelIndex]?.id ?? selectedModelId);
    }
  };

  return (
    <div
      className="chat-model-picker"
      onBlur={closeModelPickerSoon}
      onFocus={() => {
        if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
      }}
      onKeyDown={handleModelPickerKeyDown}
    >
      <button
        aria-expanded={modelPickerOpen}
        aria-haspopup="listbox"
        className="chat-model-trigger"
        disabled={disabled || !models.length}
        onClick={() => setModelPickerOpen((open) => !open)}
        type="button"
      >
        <span className="chat-model-trigger-label">{selectedModel ? modelDisplayName(selectedModel) : "Model"}</span>
        <span aria-hidden="true" className="chat-model-trigger-chevron">
          ▾
        </span>
      </button>
      {modelPickerOpen ? (
        <div className="chat-model-popover" role="listbox" aria-label="Select model">
          {models.length ? (
            tieredModels.map(({ tier, models: tierModels }) => {
              return (
                <div className={`chat-model-group chat-model-group-${tier}`} key={tier}>
                  <p>{modelTierLabels[tier]}</p>
                  {tierModels.map((model) => {
                    const optionIndex = modelOptionIndexes.get(model.id) ?? 0;
                    const isActive = optionIndex === activeModelIndex;
                    const isSelected = model.id === selectedModelId;
                    return (
                      <button
                        aria-selected={isSelected}
                        className={`chat-model-option${isActive ? " active" : ""}${isSelected ? " selected" : ""}`}
                        key={model.id}
                        onClick={() => selectModel(model.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveModelIndex(optionIndex)}
                        ref={isActive ? activeModelOptionRef : undefined}
                        role="option"
                        type="button"
                      >
                        <strong>{modelDisplayName(model)}</strong>
                      </button>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <p className="chat-context-state">No models loaded.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
