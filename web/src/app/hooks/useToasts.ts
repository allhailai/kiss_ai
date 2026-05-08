import { useCallback, useState } from "react";
import type { Toast } from "../../shared/toast";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const setNotice = useCallback((message: string) => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setToasts([]);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, message: trimmedMessage }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, setNotice, dismissToast };
}
