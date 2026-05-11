import { useCallback, useState } from "react";

export type RightPanelKind = "agent-chat";

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

  return { closePanel, openPanel, rightPanel };
}
