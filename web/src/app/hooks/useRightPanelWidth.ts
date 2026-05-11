import { useCallback, useEffect, useMemo, useState } from "react";
import type { RightPanelKind } from "./useRightPanelSurface";
import type { View } from "../../navigation/views";

export const panelWidthContextKey = "panelWidth";
export const projectChatDefaultPanelWidth = "55%";

const defaultPanelWidth = "420px";
const minPanelWidthPx = 320;
const maxPanelWidthPx = 1200;
const minWorkspaceWidthPx = 280;
const keyboardResizeStepPx = 24;

function viewportWidth() {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function maxUsablePanelWidthPx() {
  return Math.max(minPanelWidthPx, Math.min(maxPanelWidthPx, viewportWidth() - minWorkspaceWidthPx));
}

function defaultWidthFor(view: View, panelKind: RightPanelKind | null) {
  return view === "chat" && panelKind ? projectChatDefaultPanelWidth : defaultPanelWidth;
}

function panelWidthToPx(value: string) {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed);
    if (Number.isFinite(percent)) return (viewportWidth() * percent) / 100;
  }

  if (trimmed.endsWith("px")) {
    const px = Number.parseFloat(trimmed);
    if (Number.isFinite(px)) return px;
  }

  return Number.NaN;
}

function normalizePanelWidth(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || fallback;

  if (/^\d+(\.\d+)?%$/.test(candidate)) {
    const percent = clamp(Number.parseFloat(candidate), 25, 80);
    return `${Number.parseFloat(percent.toFixed(2))}%`;
  }

  if (/^\d+(\.\d+)?px$/.test(candidate)) {
    const px = clamp(Number.parseFloat(candidate), minPanelWidthPx, maxUsablePanelWidthPx());
    return `${Math.round(px)}px`;
  }

  return fallback;
}

export function useRightPanelWidth({
  panelKind,
  replaceRouteContext,
  routeContext,
  view,
}: {
  panelKind: RightPanelKind | null;
  replaceRouteContext: (patch: Record<string, string | null | undefined>) => void;
  routeContext: Record<string, string>;
  view: View;
}) {
  const fallbackWidth = defaultWidthFor(view, panelKind);
  const routeWidth = routeContext[panelWidthContextKey];
  const normalizedRouteWidth = useMemo(() => normalizePanelWidth(routeWidth, fallbackWidth), [fallbackWidth, routeWidth]);
  const [dragWidthPx, setDragWidthPx] = useState<number | null>(null);
  const widthPx = clamp(dragWidthPx ?? panelWidthToPx(normalizedRouteWidth), minPanelWidthPx, maxUsablePanelWidthPx());
  const cssValue = dragWidthPx === null ? normalizedRouteWidth : `${Math.round(widthPx)}px`;
  const isResizable = Boolean(panelKind);

  useEffect(() => {
    setDragWidthPx(null);
  }, [normalizedRouteWidth]);

  const resizeFromClientX = useCallback((clientX: number) => {
    setDragWidthPx(clamp(viewportWidth() - clientX, minPanelWidthPx, maxUsablePanelWidthPx()));
  }, []);

  const commitWidth = useCallback(
    (nextWidthPx?: number) => {
      const committedWidthPx = clamp(nextWidthPx ?? dragWidthPx ?? widthPx, minPanelWidthPx, maxUsablePanelWidthPx());
      setDragWidthPx(null);
      replaceRouteContext({ [panelWidthContextKey]: `${Math.round(committedWidthPx)}px` });
    },
    [dragWidthPx, replaceRouteContext, widthPx],
  );

  const resizeByKeyboard = useCallback(
    (direction: "narrower" | "wider") => {
      const delta = direction === "wider" ? keyboardResizeStepPx : -keyboardResizeStepPx;
      commitWidth(widthPx + delta);
    },
    [commitWidth, widthPx],
  );

  return {
    cssValue,
    isResizable,
    maxWidthPx: maxUsablePanelWidthPx(),
    minWidthPx: minPanelWidthPx,
    resizeByKeyboard,
    resizeFromClientX,
    commitWidth,
    widthPx,
  };
}
