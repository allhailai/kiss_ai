import { createContext, useContext, type ReactNode } from "react";
import type { RouteController } from "../workspaceControllers";

const RouteContext = createContext<RouteController | null>(null);

export function useRouteContext(): RouteController {
  const context = useContext(RouteContext);
  if (!context) {
    throw new Error("useRouteContext must be used within a RouteProvider");
  }
  return context;
}

export function RouteProvider({ children, value }: { children: ReactNode; value: RouteController }) {
  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}
