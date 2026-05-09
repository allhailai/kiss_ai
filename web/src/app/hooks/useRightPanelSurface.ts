import { useCallback, useState } from "react";

export type RightPanelKind = "agent-chat" | "project-chat" | "file-inspector" | "run-details" | "tool-approval";

export type RightPanelState = {
  kind: RightPanelKind;
  title: string;
} | null;

export function useRightPanelSurface() {
  const [rightPanel, setRightPanel] = useState<RightPanelState>(null);

  const openPanel = useCallback((panel: NonNullable<RightPanelState>) => {
    setRightPanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    setRightPanel(null);
  }, []);

  const togglePanel = useCallback((panel: NonNullable<RightPanelState>) => {
    setRightPanel((current) => (current?.kind === panel.kind ? null : panel));
  }, []);

  return { closePanel, openPanel, rightPanel, togglePanel };
}
