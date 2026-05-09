import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { RightPanelState } from "./hooks/useRightPanelSurface";

export type RightPanelResizeControls = {
  disabled?: boolean;
  maxWidthPx: number;
  minWidthPx: number;
  onCommit: () => void;
  onKeyboardResize: (direction: "narrower" | "wider") => void;
  onResize: (clientX: number) => void;
  widthPx: number;
};

export function RightPanelSurface({
  actions,
  children,
  onClose,
  panel,
  resize,
}: {
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  panel: NonNullable<RightPanelState>;
  resize?: RightPanelResizeControls;
}) {
  const resizingRef = useRef(false);
  const resizeDisabled = !resize || resize.disabled;

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!resize || resize.disabled) return;
    event.preventDefault();
    resizingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.onResize(event.clientX);
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!resize || resizeDisabled || !resizingRef.current) return;
    resize.onResize(event.clientX);
  };

  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!resize || resizeDisabled || !resizingRef.current) return;
    resizingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    resize.onCommit();
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!resize || resizeDisabled) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resize.onKeyboardResize("wider");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resize.onKeyboardResize("narrower");
    }
  };

  return (
    <aside className={`right-panel-surface right-panel-${panel.kind}`} aria-label={panel.title}>
      {resize ? (
        <div
          aria-label="Resize panel"
          aria-orientation="vertical"
          aria-valuemax={Math.round(resize.maxWidthPx)}
          aria-valuemin={Math.round(resize.minWidthPx)}
          aria-valuenow={Math.round(resize.widthPx)}
          className="right-panel-resize-handle"
          onKeyDown={handleResizeKeyDown}
          onPointerCancel={handleResizePointerEnd}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          role="separator"
          tabIndex={resizeDisabled ? -1 : 0}
        />
      ) : null}
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
