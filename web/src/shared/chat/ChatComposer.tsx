import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import type { ChatContextRef, ProjectFile, RebuildModel } from "../../contracts/api";
import { fileBasename } from "../../domain/files";
import { formatModelLabel, modelTierLabels, modelTierOrder } from "../../domain/modelLabels";

const composerMaxRows = 8;

function contextLabel(ref: ChatContextRef) {
  return ref.label || ref.path;
}

function fileLabel(file: ProjectFile) {
  return file.name || fileBasename(file.path);
}

function resizeComposer(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  textarea.style.height = "auto";
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
  const paddingY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const borderY = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
  const maxHeight = Math.ceil(lineHeight * composerMaxRows + paddingY + borderY);
  const contentHeight = textarea.scrollHeight + borderY;
  const nextHeight = Math.min(contentHeight, maxHeight);

  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

export function ChatComposer({
  contextFiles,
  contextRefs,
  disabled,
  draft,
  models,
  onAddContextRef = () => undefined,
  onChangeDraft,
  onModelChange,
  onRemoveContextRef = () => undefined,
  onSubmit,
  placeholder = "Ask about this project... Enter to send, Shift+Enter for a new line",
  selectedModelId,
  showContextControls = true,
  submitLabel = "Send",
  textareaRef,
}: {
  contextFiles: ProjectFile[];
  contextRefs: ChatContextRef[];
  disabled: boolean;
  draft: string;
  models: RebuildModel[];
  onAddContextRef?: (path: string) => void;
  onChangeDraft: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onModelChange: (modelId: string) => void;
  onRemoveContextRef?: (path: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  selectedModelId: string;
  showContextControls?: boolean;
  submitLabel?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const [activeContextIndex, setActiveContextIndex] = useState(0);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const contextInputRef = useRef<HTMLInputElement | null>(null);
  const activeModelOptionRef = useRef<HTMLButtonElement | null>(null);
  const contextBlurTimeoutRef = useRef<number | null>(null);
  const modelBlurTimeoutRef = useRef<number | null>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const selectedContextPaths = useMemo(() => new Set(contextRefs.map((ref) => ref.path)), [contextRefs]);
  const filteredContextFiles = useMemo(() => {
    const query = contextQuery.trim().toLowerCase();
    return contextFiles
      .filter((file) => !selectedContextPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      })
      .slice(0, 12);
  }, [contextFiles, contextQuery, selectedContextPaths]);
  const tieredModels = useMemo(
    () =>
      modelTierOrder
        .map((tier) => ({
          tier,
          models: models
            .filter((model) => model.tier === tier)
            .sort((left, right) =>
              (left.displayName || left.id).localeCompare(right.displayName || right.id, undefined, { sensitivity: "base" }),
            ),
        }))
        .filter((group) => group.models.length > 0),
    [models],
  );
  const modelOptions = useMemo(() => tieredModels.flatMap((group) => group.models), [tieredModels]);

  useEffect(() => {
    resizeComposer(textareaRef.current);
  }, [draft, textareaRef]);

  useEffect(() => {
    if (!contextPickerOpen) return;
    window.requestAnimationFrame(() => contextInputRef.current?.focus());
  }, [contextPickerOpen]);

  useEffect(() => {
    setActiveContextIndex(0);
  }, [contextQuery, contextPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const selectedIndex = modelOptions.findIndex((model) => model.id === selectedModelId);
    setActiveModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [modelOptions, modelPickerOpen, selectedModelId]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    window.requestAnimationFrame(() => {
      activeModelOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
  }, [activeModelIndex, modelPickerOpen]);

  useEffect(() => {
    return () => {
      if (contextBlurTimeoutRef.current) window.clearTimeout(contextBlurTimeoutRef.current);
      if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
    };
  }, []);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit();
  };

  const addContextFile = (file: ProjectFile | null) => {
    if (!file || disabled) return;
    onAddContextRef(file.path);
    setContextQuery("");
    setContextPickerOpen(false);
    textareaRef.current?.focus();
  };

  const handleContextPickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setContextPickerOpen(false);
      textareaRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!filteredContextFiles.length) return;
      setActiveContextIndex((current) => (current + 1) % filteredContextFiles.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!filteredContextFiles.length) return;
      setActiveContextIndex((current) => (current <= 0 ? filteredContextFiles.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      addContextFile(filteredContextFiles[activeContextIndex] ?? filteredContextFiles[0] ?? null);
    }
  };

  const closeContextPickerSoon = () => {
    if (contextBlurTimeoutRef.current) window.clearTimeout(contextBlurTimeoutRef.current);
    contextBlurTimeoutRef.current = window.setTimeout(() => setContextPickerOpen(false), 120);
  };

  const closeModelPickerSoon = () => {
    if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
    modelBlurTimeoutRef.current = window.setTimeout(() => setModelPickerOpen(false), 120);
  };

  const selectModel = (modelId: string) => {
    onModelChange(modelId);
    setModelPickerOpen(false);
    textareaRef.current?.focus();
  };

  const handleModelPickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!modelOptions.length) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setModelPickerOpen(false);
      textareaRef.current?.focus();
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
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        disabled={disabled}
        ref={textareaRef}
        onKeyDown={handleComposerKeyDown}
        onChange={onChangeDraft}
        placeholder={placeholder}
        value={draft}
      />
      <div className="chat-composer-meta">
        {showContextControls ? (
          <div className="chat-context-compact">
            <div className="chat-context-picker" onBlur={closeContextPickerSoon} onFocus={() => {
              if (contextBlurTimeoutRef.current) window.clearTimeout(contextBlurTimeoutRef.current);
            }}>
              <button
                aria-expanded={contextPickerOpen}
                aria-haspopup="listbox"
                aria-label="Add file context"
                className="chat-context-trigger"
                disabled={disabled || !contextFiles.length}
                onClick={() => setContextPickerOpen((open) => !open)}
                title="Add file context"
                type="button"
              >
                <span aria-hidden="true">+</span>
                <span className="chat-context-trigger-label">Context</span>
              </button>
              {contextPickerOpen ? (
                <div className="chat-context-popover">
                  <input
                    aria-label="Search files to add as context"
                    autoComplete="off"
                    disabled={disabled}
                    onChange={(event) => setContextQuery(event.currentTarget.value)}
                    onKeyDown={handleContextPickerKeyDown}
                    placeholder="Search files..."
                    ref={contextInputRef}
                    type="search"
                    value={contextQuery}
                  />
                  <div className="chat-context-results" role="listbox">
                    {filteredContextFiles.length ? (
                      filteredContextFiles.map((file, index) => (
                        <button
                          aria-selected={index === activeContextIndex}
                          className={index === activeContextIndex ? "chat-context-result active" : "chat-context-result"}
                          key={file.path}
                          onClick={() => addContextFile(file)}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveContextIndex(index)}
                          role="option"
                          title={file.path}
                          type="button"
                        >
                          <strong>{fileLabel(file)}</strong>
                          <span>{file.path}</span>
                        </button>
                      ))
                    ) : (
                      <p className="chat-context-state">No matching files.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {contextRefs.length ? (
              <div className="chat-context-chips" aria-label="Selected file context">
                {contextRefs.map((ref) => (
                  <button
                    className="chat-context-chip"
                    key={ref.path}
                    onClick={() => onRemoveContextRef(ref.path)}
                    title={`Remove ${ref.path}`}
                    type="button"
                  >
                    <span className="chat-context-chip-label">{contextLabel(ref)}</span>
                    <span className="chat-context-chip-remove" aria-hidden="true">
                      x
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="chat-composer-actions">
          <div className="chat-model-picker" onBlur={closeModelPickerSoon} onFocus={() => {
            if (modelBlurTimeoutRef.current) window.clearTimeout(modelBlurTimeoutRef.current);
          }} onKeyDown={handleModelPickerKeyDown}>
            <button
              aria-expanded={modelPickerOpen}
              aria-haspopup="listbox"
              className="chat-model-trigger"
              disabled={disabled || !models.length}
              onClick={() => setModelPickerOpen((open) => !open)}
              type="button"
            >
              <span className="chat-model-trigger-label">{selectedModel ? formatModelLabel(selectedModel) : "Model"}</span>
              {selectedModel ? <small>{modelTierLabels[selectedModel.tier]}</small> : null}
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
                          const optionIndex = modelOptions.findIndex((option) => option.id === model.id);
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
                              <strong>{formatModelLabel(model)}</strong>
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
          <button disabled={disabled || !draft.trim() || !selectedModelId} type="submit">
            {disabled ? "Sending..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
