import { useEffect, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import type { ChatContextRef, ProjectFile, RebuildModel } from "../../contracts/api";
import { ModelSelect } from "../ModelSelect";

const composerMaxRows = 8;

function contextLabel(ref: ChatContextRef) {
  return ref.label || ref.path;
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
  onSelectedContextPathChange = () => undefined,
  onSubmit,
  placeholder = "Ask about this project... Enter to send, Shift+Enter for a new line",
  selectedContextPath,
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
  onAddContextRef?: () => void;
  onChangeDraft: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onModelChange: (modelId: string) => void;
  onRemoveContextRef?: (path: string) => void;
  onSelectedContextPathChange?: (path: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  selectedContextPath: string;
  selectedModelId: string;
  showContextControls?: boolean;
  submitLabel?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  useEffect(() => {
    resizeComposer(textareaRef.current);
  }, [draft, textareaRef]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit();
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
                    {contextLabel(ref)} <span aria-hidden="true">x</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="chat-context-controls">
              <select
                aria-label="Add file context"
                disabled={disabled}
                onChange={(event) => onSelectedContextPathChange(event.target.value)}
                value={selectedContextPath}
              >
                <option value="">Add Context</option>
                {contextFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.path}
                  </option>
                ))}
              </select>
              <button disabled={disabled || !selectedContextPath} onClick={onAddContextRef} type="button">
                Add
              </button>
            </div>
          </div>
        ) : null}
        <div className="chat-composer-actions">
          <ModelSelect
            className="chat-model-field"
            disabled={disabled}
            label="Model"
            models={models}
            noteClassName="chat-model-note"
            onModelChange={onModelChange}
            selectedModelId={selectedModelId}
          />
          <button disabled={disabled || !draft.trim() || !selectedModelId} type="submit">
            {disabled ? "Sending..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
