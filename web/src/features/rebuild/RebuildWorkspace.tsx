import { useState } from "react";
import type { HumanAttentionItem, ProjectStatus, RebuildModel, RebuildState, ResolutionAttempt, ResolutionOption } from "../../api";
import { AgentTranscript } from "../agents/AgentTranscript";

const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High / Extra High ($$$)",
  small: "Small ($)",
};

const modelTierOrder: RebuildModel["tier"][] = ["medium", "high", "small"];

function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function formatModelLabel(model: RebuildModel) {
  const modelName = model.displayName || model.id;
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}

function formatRunDuration(rebuild: RebuildState | null) {
  if (!rebuild?.startedAt) return "Not started";

  const startedAt = new Date(rebuild.startedAt).getTime();
  const finishedAt = rebuild.finishedAt ? new Date(rebuild.finishedAt).getTime() : Date.now();

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt < startedAt) return "Unknown";

  const totalSeconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function getLatestLogEntry(rebuild: RebuildState | null) {
  return rebuild?.log.at(-1) ?? null;
}

function getLatestLogTimestamp(entry: string | null) {
  return entry?.match(/^\[([^\]]+)\]/)?.[1] ?? null;
}

function getLatestLogText(entry: string | null) {
  return entry?.replace(/^\[[^\]]+\]\s*/, "").trim() || "No log entries yet.";
}

function attentionItemText(item: HumanAttentionItem) {
  const severity = item.severity ?? "attention";
  const category = item.category ?? "review";
  const summary =
    item.summary || (typeof item.issue === "string" ? item.issue : typeof item.message === "string" ? item.message : "Review needed.");
  const nextAction = item.next_human_action ?? item.nextAction ?? "";

  return `${severity}/${category}: ${summary}${nextAction ? ` Next: ${nextAction}` : ""}`;
}

function latestResolutionAttempt(item: HumanAttentionItem): ResolutionAttempt | null {
  if (item.last_resolution_attempt) return item.last_resolution_attempt;
  return item.resolution_attempts?.at(-1) ?? null;
}

function optionLabel(option: ResolutionOption) {
  return `${option.recommended ? "Recommended: " : ""}${option.label || option.id}`;
}

export function RebuildWorkspace({
  status,
  rebuild,
  models,
  selectedModelId,
  onModelChange,
  onStart,
  onResolve,
  onRefresh,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  models: RebuildModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onStart: () => void;
  onResolve: (request: { itemId: string; resolutionOptionId?: string; manualPrompt?: string }) => void;
  onRefresh: () => void;
}) {
  const [manualItemId, setManualItemId] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState("");
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const startDisabled = Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable || !selectedModelId || !models.length;
  const resolveDisabled = startDisabled;
  const latestLogEntry = getLatestLogEntry(rebuild);
  const latestLogTimestamp = getLatestLogTimestamp(latestLogEntry);
  const attentionItems = status?.humanAttentionItems ?? [];

  const submitManualPrompt = (itemId: string) => {
    const trimmedPrompt = manualPrompt.trim();
    if (!trimmedPrompt) return;

    onResolve({ itemId, manualPrompt: trimmedPrompt });
    setManualItemId(null);
    setManualPrompt("");
  };

  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project rebuild</span>
        <h2>Run the kiss_ai rebuild loop</h2>
        <p>The backend starts one local Cursor SDK agent from the project root and asks it to follow the project rebuild command.</p>
      </header>

      <section className="content-card">
        <div className="section-heading">
          <h3>Runner status</h3>
          <button onClick={onRefresh}>Refresh</button>
        </div>
        <p>
          Current state: <strong>{rebuild?.status ?? "idle"}</strong>
        </p>
        <label className="rebuild-model-field">
          <span>Cursor model</span>
          <select
            disabled={Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable || !models.length}
            onChange={(event) => onModelChange(event.target.value)}
            value={selectedModelId}
          >
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
        </label>
        {selectedModel ? (
          <p className="rebuild-model-note">
            Selected model: <strong>{formatModelLabel(selectedModel)}</strong> · {modelTierLabels[selectedModel.tier]}
            {selectedModel.description ? ` - ${selectedModel.description}` : ""}
          </p>
        ) : null}
        <p>{rebuild?.message ?? "No rebuild state loaded."}</p>
        {rebuild?.status === "finished_with_attention" || status?.humanAttentionCount ? (
          <div className="warning-callout">
            <strong>Human attention needed</strong>
            <p>
              The rebuild can finish without stopping for questions. Review {status?.humanAttentionCount ?? 0} item
              {(status?.humanAttentionCount ?? 0) === 1 ? "" : "s"} in `change_logs/human_attention_queue.md`.
            </p>
            {attentionItems.length ? (
              <div className="attention-resolution-list">
                {attentionItems.map((item) => {
                  const attempt = latestResolutionAttempt(item);

                  return (
                    <article className="attention-resolution-item" key={item.id}>
                      <div>
                        <strong>{attentionItemText(item)}</strong>
                        {attempt?.summary ? (
                          <p className="attention-resolution-attempt">
                            Last attempt: {attempt.outcome ?? "incomplete"} - {attempt.summary}
                          </p>
                        ) : null}
                      </div>

                      {item.resolution_options.length ? (
                        <div className="attention-resolution-options">
                          {item.resolution_options.map((option) => (
                            <button
                              disabled={resolveDisabled}
                              key={option.id}
                              onClick={() => onResolve({ itemId: item.id, resolutionOptionId: option.id })}
                              title={option.description || option.prompt}
                              type="button"
                            >
                              {optionLabel(option)}
                              {option.riskLevel ? ` (${option.riskLevel})` : ""}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="attention-resolution-empty">No suggested options are stored yet. Use a manual prompt.</p>
                      )}

                      <div className="attention-resolution-manual">
                        {manualItemId === item.id ? (
                          <>
                            <textarea
                              onChange={(event) => setManualPrompt(event.target.value)}
                              placeholder="Tell the agent exactly how to resolve this item."
                              value={manualPrompt}
                            />
                            <div className="attention-resolution-manual-actions">
                              <button disabled={resolveDisabled || !manualPrompt.trim()} onClick={() => submitManualPrompt(item.id)} type="button">
                                Submit Manual Prompt
                              </button>
                              <button
                                disabled={resolveDisabled}
                                onClick={() => {
                                  setManualItemId(null);
                                  setManualPrompt("");
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            disabled={resolveDisabled}
                            onClick={() => {
                              setManualItemId(item.id);
                              setManualPrompt("");
                            }}
                            type="button"
                          >
                            Manual resolution prompt
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        <button disabled={startDisabled} onClick={onStart}>
          {rebuild?.running ? "Rebuild Running" : "Start Rebuild"}
        </button>
        {!status?.cursorApiKeyAvailable ? (
          <p className="lint-warning">
            Add a Cursor API key using `CURSOR_API_KEY`, `web/.env`, or macOS Keychain item `cursor_api_key` to enable
            UI-triggered rebuilds.
          </p>
        ) : (
          <p>
            Using Cursor API key from <strong>{status.cursorApiKeySource}</strong>.
          </p>
        )}
        {status?.cursorApiKeyWarnings?.length ? (
          <div className="warning-callout">
            <strong>Cursor API key warning</strong>
            <ul>
              {status.cursorApiKeyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <h3>Runner details</h3>
        <div className="rebuild-runner-grid">
          <div>
            <span>Status</span>
            <strong>{rebuild?.status ?? "idle"}</strong>
          </div>
          <div>
            <span>Cursor SDK agent</span>
            <strong>{rebuild?.agentId ?? "Not created yet"}</strong>
          </div>
          <div>
            <span>Run ID</span>
            <strong>{rebuild?.runId ?? "Not started yet"}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{rebuild?.modelId ?? (selectedModelId || "Not selected")}</strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{formatLocalDateTime(rebuild?.startedAt)}</strong>
          </div>
          <div>
            <span>{rebuild?.running ? "Elapsed" : "Duration"}</span>
            <strong>{formatRunDuration(rebuild)}</strong>
          </div>
          <div>
            <span>Last update</span>
            <strong>{formatLocalDateTime(latestLogTimestamp)}</strong>
          </div>
          <div>
            <span>Project binding</span>
            <strong>One persisted runner state per project</strong>
          </div>
        </div>
        <p className="rebuild-runner-note">
          Starting rebuilds in different projects creates separate Cursor SDK agents. This page shows the agent and run IDs tied to
          the selected project.
        </p>
        <div className="rebuild-latest-log">
          <span>Latest runner message</span>
          <p>{getLatestLogText(latestLogEntry)}</p>
        </div>
      </section>

      <AgentTranscript events={rebuild?.events ?? []} log={rebuild?.log ?? []} />
    </div>
  );
}
