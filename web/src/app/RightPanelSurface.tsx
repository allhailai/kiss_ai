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
  children,
  onClose,
  panel,
  resize,
}: {
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
          title="Drag to resize the side panel"
        />
      ) : null}
      <button aria-label="Close panel" className="right-panel-close-button" onClick={onClose} title="Close panel" type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="right-panel-body">{children}</div>
    </aside>
  );
}
