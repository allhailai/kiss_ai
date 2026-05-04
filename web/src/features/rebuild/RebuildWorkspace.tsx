import type { ProjectStatus, RebuildModel, RebuildState } from "../../api";

const modelTierLabels: Record<RebuildModel["tier"], string> = {
  medium: "Medium ($$)",
  high: "High / Extra High ($$$)",
  small: "Small ($)",
};

const modelTierOrder: RebuildModel["tier"][] = ["medium", "high", "small"];

function formatModelLabel(model: RebuildModel) {
  const modelName = model.displayName || model.id;
  return model.provider ? `${modelName} - ${model.provider}` : modelName;
}

export function RebuildWorkspace({
  status,
  rebuild,
  models,
  selectedModelId,
  onModelChange,
  onStart,
  onRefresh,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  models: RebuildModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  onStart: () => void;
  onRefresh: () => void;
}) {
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const startDisabled = Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable || !selectedModelId || !models.length;

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
        <h3>Run log</h3>
        <pre className="run-log">{rebuild?.log.length ? rebuild.log.join("\n\n") : "No UI-started rebuild log yet."}</pre>
      </section>
    </div>
  );
}
