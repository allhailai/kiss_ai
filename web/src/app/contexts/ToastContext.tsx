import { createContext, useContext, type ReactNode } from "react";
import type { ToastWorkspaceController } from "../workspaceControllers";

const ToastContext = createContext<ToastWorkspaceController | null>(null);

export function useToastContext(): ToastWorkspaceController {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToastContext must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children, value }: { children: ReactNode; value: ToastWorkspaceController }) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
