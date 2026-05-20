import { useEffect, useRef } from "react";
import { api } from "../../data/apiClient";
import type { Keybindings } from "../../contracts/api";

type ParsedShortcut = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
};

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const modifiers = new Set(parts.map((m) => m.toLowerCase()));

  return {
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt") || modifiers.has("option"),
    meta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
    key,
  };
}

function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  return (
    event.ctrlKey === shortcut.ctrl &&
    event.shiftKey === shortcut.shift &&
    event.altKey === shortcut.alt &&
    event.metaKey === shortcut.meta &&
    event.key === shortcut.key
  );
}

export function useKeybindings(actions: {
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
}) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const keybindingsRef = useRef<Keybindings | null>(null);
  const parsedRef = useRef<Map<keyof Keybindings, ParsedShortcut>>(new Map());

  useEffect(() => {
    let cancelled = false;

    api.keybindings().then((bindings) => {
      if (cancelled) return;

      keybindingsRef.current = bindings;
      const parsed = new Map<keyof Keybindings, ParsedShortcut>();

      for (const [action, shortcut] of Object.entries(bindings) as [keyof Keybindings, string][]) {
        parsed.set(action, parseShortcut(shortcut));
      }

      parsedRef.current = parsed;
    }).catch(() => {
      // Silently use defaults — they'll be parsed on the next successful fetch.
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Don't intercept when user is typing in an input/textarea.
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      for (const [action, shortcut] of parsedRef.current.entries()) {
        if (matchesShortcut(event, shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          actionsRef.current[action]();
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
