import { useCallback, useEffect } from "react";
import { buildRouteHash, parseRouteHash } from "../../navigation/routes";
import type { RouteState, View } from "../../navigation/views";

type UseRouteSyncOptions = {
  applyRoute: (route: RouteState) => Promise<void>;
  selectedProjectSlug: string | null;
  setSelectedProjectSlug: (projectSlug: string | null) => void;
};

export function useRouteSync({ applyRoute, selectedProjectSlug, setSelectedProjectSlug }: UseRouteSyncOptions) {
  const navigateTo = useCallback(
    (nextView: View, filePath?: string | null) => {
      const nextHash = buildRouteHash(selectedProjectSlug, nextView, filePath);

      if (window.location.hash === nextHash) {
        void applyRoute({ projectSlug: selectedProjectSlug, view: nextView, filePath: filePath ?? null });
        return;
      }

      window.location.hash = nextHash;
    },
    [applyRoute, selectedProjectSlug],
  );

  useEffect(() => {
    const syncRoute = () => {
      const route = parseRouteHash(window.location.hash);
      const routeProjectSlug = route.projectSlug ?? selectedProjectSlug;

      if (!routeProjectSlug) {
        if (window.location.hash !== "#/projects") {
          window.history.replaceState(null, "", "#/projects");
        }
        return;
      }

      if (route.projectSlug !== routeProjectSlug) {
        const normalized = buildRouteHash(routeProjectSlug, route.view, route.filePath);
        if (window.location.hash !== normalized) {
          window.history.replaceState(null, "", normalized);
        }
      }

      if (selectedProjectSlug !== routeProjectSlug) {
        setSelectedProjectSlug(routeProjectSlug);
        return;
      }

      void applyRoute({ ...route, projectSlug: routeProjectSlug });
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    return () => window.removeEventListener("hashchange", syncRoute);
  }, [applyRoute, selectedProjectSlug, setSelectedProjectSlug]);

  return { navigateTo };
}
