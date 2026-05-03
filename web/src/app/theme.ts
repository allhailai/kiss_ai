import type { CSSProperties } from "react";
import type { DesignState } from "../api";

export function buildThemeStyle(design: DesignState | null): CSSProperties {
  const colors = design?.parsed.colors ?? {};

  return {
    "--color-primary": colors.primary ?? "#17202A",
    "--color-secondary": colors.secondary ?? "#5D6D7E",
    "--color-accent": colors.accent ?? "#A45C40",
    "--color-background": colors.background ?? "#F8F6F1",
    "--color-surface": colors.surface ?? "#FFFFFF",
    "--color-border": colors.border ?? "#D8D2C4",
    "--color-annotation": colors.annotation ?? "#6D5BD0",
    "--color-success": colors.success ?? "#2F6F4E",
    "--color-warning": colors.warning ?? "#9A6B1F",
  } as CSSProperties;
}
