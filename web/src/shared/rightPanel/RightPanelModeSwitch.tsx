export type RightPanelModeKind = "agent-chat" | "build-project";

const rightPanelModes: Array<{ kind: RightPanelModeKind; label: string }> = [
  { kind: "agent-chat", label: "Chat" },
  { kind: "build-project", label: "Update Research" },
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
