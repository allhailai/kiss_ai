import { useCallback, useEffect, useRef, useState } from "react";
import type { Toast } from "../../shared/toast";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);

  const setNotice = useCallback((message: string) => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setToasts([]);
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current = [];
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, message: trimmedMessage }]);

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timeoutIdsRef.current = timeoutIdsRef.current.filter((currentId) => currentId !== timeoutId);
    }, 6000);
    timeoutIdsRef.current.push(timeoutId);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIdsRef.current = [];
    };
  }, []);

  return { toasts, setNotice, dismissToast };
}
