import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import type { ChatContextFile, ProjectFile, RebuildModel } from "../../contracts/api";
import { labeledFileDisplayName, projectFileDisplayName } from "../../domain/files";
import { CompactModelPicker } from "../CompactModelPicker";

const composerMaxRows = 8;

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
  attachedContextFiles,
  disabled,
  draft,
  models,
  onAddContextFile = () => undefined,
  onChangeDraft,
  onModelChange,
  onRemoveContextFile = () => undefined,
  onSubmit,
  placeholder = "Ask about this project... Enter to send, Shift+Enter for a new line",
  modelAdjacentAction,
  selectedModelId,
  secondaryAction,
  showContextControls = true,
  submitLabel = "Send",
  textareaRef,
}: {
  contextFiles: ProjectFile[];
  attachedContextFiles: ChatContextFile[];
  disabled: boolean;
  draft: string;
  models: RebuildModel[];
  onAddContextFile?: (path: string) => void;
  onChangeDraft: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onModelChange: (modelId: string) => void;
  onRemoveContextFile?: (path: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  modelAdjacentAction?: {
    ariaLabel?: string;
    disabled: boolean;
    label: string;
    onClick: () => void;
    title?: string;
  };
  selectedModelId: string;
  secondaryAction?: {
    disabled: boolean;
    label: string;
    onClick: () => void;
    title?: string;
  };
  showContextControls?: boolean;
  submitLabel?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const [activeContextIndex, setActiveContextIndex] = useState(0);
  const contextInputRef = useRef<HTMLInputElement | null>(null);
  const contextBlurTimeoutRef = useRef<number | null>(null);
  const attachedContextPaths = useMemo(() => new Set(attachedContextFiles.map((file) => file.path)), [attachedContextFiles]);
  const filteredContextFiles = useMemo(() => {
    const query = contextQuery.trim().toLowerCase();
    return contextFiles
      .filter((file) => !attachedContextPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      })
      .slice(0, 12);
  }, [attachedContextPaths, contextFiles, contextQuery]);

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
    return () => {
      if (contextBlurTimeoutRef.current) window.clearTimeout(contextBlurTimeoutRef.current);
    };
  }, []);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit();
  };

  const addContextFile = (file: ProjectFile | null) => {
    if (!file || disabled) return;
    onAddContextFile(file.path);
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
                          <strong>{projectFileDisplayName(file)}</strong>
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
            {attachedContextFiles.length ? (
              <div className="chat-context-chips" aria-label="Selected file context">
                {attachedContextFiles.map((file) => (
                  <button
                    className="chat-context-chip"
                    key={file.path}
                    onClick={() => onRemoveContextFile(file.path)}
                    title={`Remove ${file.path}`}
                    type="button"
                  >
                    <span className="chat-context-chip-label">{labeledFileDisplayName(file)}</span>
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
          <CompactModelPicker disabled={disabled} models={models} onAfterModelChange={() => textareaRef.current?.focus()} onModelChange={onModelChange} selectedModelId={selectedModelId} />
          {modelAdjacentAction ? (
            <>
              <button
                aria-label={modelAdjacentAction.ariaLabel}
                className="chat-composer-model-adjacent-action"
                disabled={modelAdjacentAction.disabled}
                onClick={modelAdjacentAction.onClick}
                title={modelAdjacentAction.title}
                type="button"
              >
                {modelAdjacentAction.label}
              </button>
              <span aria-hidden="true" className="chat-composer-action-spacer" />
            </>
          ) : null}
          <button disabled={disabled || !draft.trim() || !selectedModelId} type="submit">
            {disabled ? "Sending..." : submitLabel}
          </button>
          {secondaryAction ? (
            <button
              className="chat-composer-secondary-action"
              disabled={secondaryAction.disabled}
              onClick={secondaryAction.onClick}
              title={secondaryAction.title}
              type="button"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
