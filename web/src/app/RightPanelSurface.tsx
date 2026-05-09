import type { ReactNode } from "react";
import type { RightPanelState } from "./hooks/useRightPanelSurface";

export function RightPanelSurface({
  actions,
  children,
  onClose,
  panel,
}: {
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  panel: NonNullable<RightPanelState>;
}) {
  return (
    <aside className={`right-panel-surface right-panel-${panel.kind}`} aria-label={panel.title}>
      <header className="right-panel-header">
        <div>
          <span>Panel</span>
          <strong>{panel.title}</strong>
        </div>
        <div className="right-panel-actions">
          {actions}
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>
      <div className="right-panel-body">{children}</div>
    </aside>
  );
}
