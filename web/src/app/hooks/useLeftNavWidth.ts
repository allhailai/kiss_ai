import { useCallback, useEffect, useMemo, useState } from "react";
import { readLeftNavWidth, writeLeftNavWidth } from "../leftNavWidthStorage";

const defaultNavWidthPx = 300;
const minNavWidthPx = 180;
const maxNavWidthPx = 520;
const collapsedWidthPx = 52;
const keyboardResizeStepPx = 24;

function viewportWidth() {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function maxUsableNavWidthPx() {
  // Never allow the sidebar to consume more than half the viewport (or the hard max)
  return Math.min(maxNavWidthPx, Math.floor(viewportWidth() * 0.45));
}

function parseStoredWidth(stored: string | null): number {
  if (!stored) return defaultNavWidthPx;
  const px = Number.parseFloat(stored);
  return Number.isFinite(px) ? clamp(px, minNavWidthPx, maxUsableNavWidthPx()) : defaultNavWidthPx;
}

export function useLeftNavWidth({
  projectSlug,
  collapsed,
}: {
  projectSlug: string;
  collapsed: boolean;
}) {
  const [storedWidthPx, setStoredWidthPx] = useState(() => parseStoredWidth(readLeftNavWidth(projectSlug)));
  const [dragWidthPx, setDragWidthPx] = useState<number | null>(null);

  // Re-read from storage when project changes
  useEffect(() => {
    setStoredWidthPx(parseStoredWidth(readLeftNavWidth(projectSlug)));
    setDragWidthPx(null);
  }, [projectSlug]);

  const effectiveWidthPx = collapsed
    ? collapsedWidthPx
    : clamp(dragWidthPx ?? storedWidthPx, minNavWidthPx, maxUsableNavWidthPx());

  const cssValue = collapsed ? `${collapsedWidthPx}px` : `${Math.round(effectiveWidthPx)}px`;

  const resizeFromClientX = useCallback((clientX: number) => {
    setDragWidthPx(clamp(clientX, minNavWidthPx, maxUsableNavWidthPx()));
  }, []);

  const commitWidth = useCallback(
    (nextWidthPx?: number) => {
      const committedWidthPx = clamp(nextWidthPx ?? dragWidthPx ?? storedWidthPx, minNavWidthPx, maxUsableNavWidthPx());
      setDragWidthPx(null);
      setStoredWidthPx(committedWidthPx);
      writeLeftNavWidth(projectSlug, `${Math.round(committedWidthPx)}`);
    },
    [dragWidthPx, projectSlug, storedWidthPx],
  );

  const resizeByKeyboard = useCallback(
    (direction: "narrower" | "wider") => {
      const delta = direction === "wider" ? keyboardResizeStepPx : -keyboardResizeStepPx;
      commitWidth(effectiveWidthPx + delta);
    },
    [commitWidth, effectiveWidthPx],
  );

  return useMemo(
    () => ({
      cssValue,
      minWidthPx: minNavWidthPx,
      maxWidthPx: maxUsableNavWidthPx(),
      widthPx: effectiveWidthPx,
      resizeFromClientX,
      commitWidth,
      resizeByKeyboard,
      isResizable: !collapsed,
    }),
    [cssValue, effectiveWidthPx, resizeFromClientX, commitWidth, resizeByKeyboard, collapsed],
  );
}
