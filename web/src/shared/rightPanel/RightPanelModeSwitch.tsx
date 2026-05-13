export type RightPanelModeKind = "agent-chat" | "requirements-sync" | "build-project";

const rightPanelModes: Array<{ kind: RightPanelModeKind; label: string }> = [
  { kind: "agent-chat", label: "Agent" },
  { kind: "requirements-sync", label: "Requirements Sync" },
  { kind: "build-project", label: "Build Project" },
];

export function RightPanelModeSwitch({
  activeKind,
  onSelect,
}: {
  activeKind: RightPanelModeKind;
  onSelect: (kind: RightPanelModeKind) => void;
}) {
  return (
    <div className="right-panel-mode-switch" role="group" aria-label="Right panel mode">
      {rightPanelModes.map((mode) => {
        const active = mode.kind === activeKind;

        return (
          <button aria-pressed={active} className={active ? "active" : undefined} key={mode.kind} onClick={() => onSelect(mode.kind)} type="button">
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
