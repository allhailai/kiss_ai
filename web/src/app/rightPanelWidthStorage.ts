const rightPanelWidthStorageKey = "kiss_ai.rightPanelWidth";

export function readRightPanelWidth() {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(rightPanelWidthStorageKey);
  } catch {
    return null;
  }
}

export function writeRightPanelWidth(width: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(rightPanelWidthStorageKey, width);
  } catch {
    // Ignore storage failures; the caller-owned width state is already updated.
  }
}
