import { useCallback, useState } from "react";
import { readRightPanelKind, writeRightPanelKind } from "../rightPanelSurfaceStorage";

export type RightPanelKind = "agent-chat";

export type RightPanelState = {
  kind: RightPanelKind;
  title: string;
} | null;

const rightPanelByKind: Record<RightPanelKind, NonNullable<RightPanelState>> = {
  "agent-chat": { kind: "agent-chat", title: "Agent Chat" },
};

export function useRightPanelSurface() {
  const [rightPanel, setRightPanel] = useState<RightPanelState>(() => {
    const storedKind = readRightPanelKind();
    return storedKind ? rightPanelByKind[storedKind] : null;
  });

  const openPanel = useCallback((panel: NonNullable<RightPanelState>) => {
    writeRightPanelKind(panel.kind);
    setRightPanel(panel);
  }, []);

  const closePanel = useCallback(() => {
    writeRightPanelKind(null);
    setRightPanel(null);
  }, []);

  return { closePanel, openPanel, rightPanel };
}
