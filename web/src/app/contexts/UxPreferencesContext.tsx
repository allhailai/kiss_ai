import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultUxPreferences, type UxPreferences } from "../../contracts/api";
import { systemApi } from "../../data/systemApi";

type UxPreferencesController = {
  preferences: UxPreferences;
  loaded: boolean;
  updatePreference: <K extends keyof UxPreferences>(key: K, value: UxPreferences[K]) => void;
};

const UxPreferencesContext = createContext<UxPreferencesController | null>(null);

export function useUxPreferences(): UxPreferencesController {
  const context = useContext(UxPreferencesContext);
  if (!context) {
    throw new Error("useUxPreferences must be used within a UxPreferencesProvider");
  }
  return context;
}

export function UxPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UxPreferences>(defaultUxPreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    systemApi.uxPreferences()
      .then((prefs) => {
        setPreferences(prefs);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const updatePreference = useCallback(<K extends keyof UxPreferences>(key: K, value: UxPreferences[K]) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      void systemApi.setUxPreferences({ [key]: value }).catch(() => {
        // Revert on failure
        setPreferences(prev);
      });
      return next;
    });
  }, []);

  return (
    <UxPreferencesContext.Provider value={{ preferences, loaded, updatePreference }}>
      {children}
    </UxPreferencesContext.Provider>
  );
}
