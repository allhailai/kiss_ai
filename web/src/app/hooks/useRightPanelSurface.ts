import { useCallback, useMemo, useState } from "react";
import { readRightPanelKind, writeRightPanelKind } from "../rightPanelSurfaceStorage";

export type RightPanelKind = "agent-chat" | "requirements-sync" | "build-project";

export type RightPanelState = {
  kind: RightPanelKind;
  title: string;
} | null;

const rightPanelByKind: Record<RightPanelKind, NonNullable<RightPanelState>> = {
  "agent-chat": { kind: "agent-chat", title: "Agent Chat" },
  "requirements-sync": { kind: "requirements-sync", title: "Requirements Sync" },
  "build-project": { kind: "build-project", title: "Build Project" },
};

export function panelForKind(kind: RightPanelKind) {
  return rightPanelByKind[kind];
}

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

  return useMemo(() => ({ closePanel, openPanel, rightPanel }), [closePanel, openPanel, rightPanel]);
}
