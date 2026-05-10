export function RightPanelToggle({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button aria-pressed={active} className={active ? "right-panel-open-button active" : "right-panel-open-button"} onClick={onToggle} type="button">
      {label}
    </button>
  );
}
