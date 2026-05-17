const leftNavWidthStorageKeyPrefix = "kiss_ai.leftNavWidth.";

function storageKey(projectSlug: string) {
  return `${leftNavWidthStorageKeyPrefix}${projectSlug}`;
}

export function readLeftNavWidth(projectSlug: string): string | null {
  if (typeof window === "undefined" || !projectSlug) return null;

  try {
    return window.localStorage.getItem(storageKey(projectSlug));
  } catch {
    return null;
  }
}

export function writeLeftNavWidth(projectSlug: string, width: string) {
  if (typeof window === "undefined" || !projectSlug) return;

  try {
    window.localStorage.setItem(storageKey(projectSlug), width);
  } catch {
    // Ignore storage failures; the caller-owned width state is already updated.
  }
}
