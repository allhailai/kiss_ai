import { useState } from "react";
import type {
  HumanAttentionItem,
  ProjectStatus,
  RebuildModel,
  RebuildState,
  RequirementsSyncProposal,
  RequirementsSyncSignalsResponse,
  RequirementsSyncStep,
  ResolutionAttempt,
  ResolutionOption,
} from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { humanAttentionItemText } from "../../domain/humanAttention";
import { formatModelLabel, modelTierLabels } from "../../domain/modelLabels";
import { humanAttentionQueuePath } from "../../domain/projectPaths";
import { requirementsSyncSteps, type RequirementsSyncStepStatus } from "../../domain/requirementsSync";
import { AgentTranscript } from "../../shared/agents/AgentTranscript";
import { ModelSelect } from "../../shared/ModelSelect";

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

function latestResolutionAttempt(item: HumanAttentionItem): ResolutionAttempt | null {
  if (item.last_resolution_attempt) return item.last_resolution_attempt;
  return item.resolution_attempts?.at(-1) ?? null;
}

function optionLabel(option: ResolutionOption) {
  return `${option.recommended ? "Recommended: " : ""}${option.label || option.id}`;
}

function requirementsSyncStepStatus(status: RequirementsSyncStepStatus, proposal: RequirementsSyncProposal | undefined, active: boolean) {
  switch (status) {
    case "generating":
      return "Generating proposal";
    case "ready":
      return active ? "Ready to review" : "Proposal ready";
    case "error":
      return "Needs regeneration";
    case "applying":
      return "Submitting review";
    case "applied":
      return "Applied";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Apply failed";
    default:
      if (proposal) return active ? "Ready to review" : "Proposal ready";
      return active ? "Focused file" : "Not started";
  }
}

function CopyableValue({ value }: { value: string }) {
  const copyValue = () => {
    void navigator.clipboard?.writeText(value);
  };

  return (
    <span className="copyable-value">
      <code>{value}</code>
      <button aria-label={`Copy ${value}`} onClick={copyValue} title={`Copy ${value}`} type="button" />
    </span>
  );
}

export function RebuildWorkspace({
  status,
  rebuild,
  models,
  selectedModelId,
  onModelChange,
  onOpenRequirementsSync,
  onShowRequirementsSyncController,
  onStart,
  onStartRequirementsSync,
  requirementsSyncSignals,
  requirementsSyncControllerOpen,
  requirementsSyncBusy,
  requirementsSyncProposals,
  requirementsSyncStep,
  requirementsSyncStepStatuses,
  onRequirementsSyncStepChange,
  onResolve,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  models: RebuildModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onOpenRequirementsSync: () => void;
  onShowRequirementsSyncController: () => void;
  onStart: () => void;
  onStartRequirementsSync: () => void;
  requirementsSyncSignals: RequirementsSyncSignalsResponse | null;
  requirementsSyncControllerOpen: boolean;
  requirementsSyncBusy: boolean;
  requirementsSyncProposals: Partial<Record<RequirementsSyncStep, RequirementsSyncProposal>>;
  requirementsSyncStep: RequirementsSyncStep;
  requirementsSyncStepStatuses: Record<RequirementsSyncStep, RequirementsSyncStepStatus>;
  onRequirementsSyncStepChange: (step: RequirementsSyncStep) => void;
  onResolve: (request: { itemId: string; resolutionOptionId?: string; manualPrompt?: string }) => void;
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

      <section className="content-card rebuild-status-card">
        <div className="requirements-sync-rebuild-controller">
          {!requirementsSyncControllerOpen ? (
            <>
              <div>
                <span className="eyebrow">Requirements sync</span>
                <strong>Review requirement diffs before rebuilding.</strong>
                <p>{requirementsSyncSignals?.summary ?? "Check Goal, Inputs, and Outputs for sync opportunities."}</p>
              </div>
              <button disabled={Boolean(rebuild?.running)} onClick={onShowRequirementsSyncController} type="button">
                Sync Requirements
              </button>
            </>
          ) : (
            <>
              <div className="requirements-sync-rebuild-controller-heading">
                <div>
                  <span className="eyebrow">Requirements sync</span>
                  <strong>Goal, Inputs, and Outputs</strong>
                  <p>{requirementsSyncSignals?.summary ?? "No requirements sync signals loaded yet."}</p>
                </div>
                <button disabled={Boolean(rebuild?.running) || requirementsSyncBusy} onClick={onStartRequirementsSync} type="button">
                  {requirementsSyncBusy ? "Sync Running" : "Start Sync"}
                </button>
              </div>
              <div className="requirements-sync-rebuild-steps" aria-label="Requirements sync file status">
                {requirementsSyncSteps.map((step) => (
                  <button
                    className={`requirements-sync-rebuild-step status-${requirementsSyncStepStatuses[step.id]}${step.id === requirementsSyncStep ? " active" : ""}`}
                    disabled={requirementsSyncBusy}
                    key={step.id}
                    onClick={() => onRequirementsSyncStepChange(step.id)}
                    type="button"
                  >
                    <span>{step.label}</span>
                    <strong>{step.filePath}</strong>
                    <small>{requirementsSyncStepStatus(requirementsSyncStepStatuses[step.id], requirementsSyncProposals[step.id], step.id === requirementsSyncStep)}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="section-heading rebuild-status-heading">
          <h3>Runner status</h3>
          <p>
            Current state: <strong>{rebuild?.status ?? "idle"}</strong>
          </p>
        </div>

        <div className="rebuild-status-controls">
          <ModelSelect
            className="rebuild-model-field"
            disabled={Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable}
            label="AI Model"
            models={models}
            onModelChange={onModelChange}
            selectedModelId={selectedModelId}
            showTierNote={false}
          />

          <button disabled={startDisabled} onClick={onStart}>
            {rebuild?.running ? "Rebuild Running" : "Start Rebuild"}
          </button>
        </div>

        <div className="rebuild-status-copy">
          {selectedModel ? (
            <p className="rebuild-model-note">
              <strong>{formatModelLabel(selectedModel)}</strong> · {modelTierLabels[selectedModel.tier]}
              {selectedModel.description ? ` - ${selectedModel.description}` : ""}
            </p>
          ) : null}
          <p>{rebuild?.message ?? "No rebuild state loaded."}</p>
        </div>

        {requirementsSyncSignals?.hasSignals ? (
          <div className="warning-callout">
            <strong>Requirements sync signals detected</strong>
            <p>{requirementsSyncSignals.summary}. Review requirements before rebuilding, or continue if these changes are intentional.</p>
            <button className="editor-secondary-button" disabled={Boolean(rebuild?.running)} onClick={onOpenRequirementsSync} type="button">
              Open Requirements Sync
            </button>
          </div>
        ) : null}

        {rebuild?.status === "finished_with_attention" || status?.humanAttentionCount ? (
          <div className="warning-callout">
            <strong>Human attention needed</strong>
            <p>
              The rebuild can finish without stopping for questions. Review {status?.humanAttentionCount ?? 0} item
              {(status?.humanAttentionCount ?? 0) === 1 ? "" : "s"} in `{humanAttentionQueuePath}`.
            </p>
            {attentionItems.length ? (
              <div className="attention-resolution-list">
                {attentionItems.map((item) => {
                  const attempt = latestResolutionAttempt(item);

                  return (
                    <article className="attention-resolution-item" key={item.id}>
                      <div>
                        <strong>{humanAttentionItemText(item)}</strong>
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

      <section className="content-card rebuild-runner-card">
        <h3>Runner details</h3>
        <div className="rebuild-runner-grid">
          <div>
            <span>Status</span>
            <strong>{rebuild?.status ?? "idle"}</strong>
          </div>
          <div>
            <span>Model</span>
            <strong>{rebuild?.modelId ?? (selectedModelId || "Not selected")}</strong>
          </div>
          <div>
            <span>Started</span>
            <strong>{formatLocalDateTime(rebuild?.startedAt, "Not recorded")}</strong>
          </div>
          <div>
            <span>{rebuild?.running ? "Elapsed" : "Duration"}</span>
            <strong>{formatRunDuration(rebuild)}</strong>
          </div>
          <div>
            <span>Last update</span>
            <strong>{formatLocalDateTime(latestLogTimestamp, "Not recorded")}</strong>
          </div>
        </div>

        <p className="rebuild-technical-details">
          <span>
            Project binding: <CopyableValue value="One persisted runner state per project" />
          </span>
          <span>
            Run ID: <CopyableValue value={rebuild?.runId ?? "Not started yet"} />
          </span>
          <span>
            Cursor SDK agent: <CopyableValue value={rebuild?.agentId ?? "Not created yet"} />
          </span>
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
