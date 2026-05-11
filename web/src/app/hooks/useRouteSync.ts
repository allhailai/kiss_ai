import { useCallback, useEffect, useRef } from "react";
import { buildRouteHash, parseRouteHash } from "../../navigation/routes";
import type { RouteState, View } from "../../navigation/views";
import { errorMessage } from "../../domain/errors";

type UseRouteSyncOptions = {
  applyRoute: (route: RouteState) => Promise<void>;
  canLeaveCurrentRoute?: (nextRoute: RouteState) => boolean;
  currentRoute: RouteState;
  onRouteError?: (message: string) => void;
  selectedProjectSlug: string | null;
  setSelectedProjectSlug: (projectSlug: string | null) => void;
};

function applyRouteSafely(applyRoute: (route: RouteState) => Promise<void>, route: RouteState, onRouteError?: (message: string) => void) {
  applyRoute(route).catch((error: unknown) => {
    console.error("[kiss_ai UI warning] Route sync failed.", error);
    onRouteError?.(errorMessage(error, "Could not load this route."));
  });
}

export function useRouteSync({ applyRoute, canLeaveCurrentRoute, currentRoute, onRouteError, selectedProjectSlug, setSelectedProjectSlug }: UseRouteSyncOptions) {
  const applyRouteRef = useRef(applyRoute);
  const canLeaveCurrentRouteRef = useRef(canLeaveCurrentRoute);
  const currentRouteRef = useRef(currentRoute);
  const onRouteErrorRef = useRef(onRouteError);
  const selectedProjectSlugRef = useRef(selectedProjectSlug);

  applyRouteRef.current = applyRoute;
  canLeaveCurrentRouteRef.current = canLeaveCurrentRoute;
  currentRouteRef.current = currentRoute;
  onRouteErrorRef.current = onRouteError;
  selectedProjectSlugRef.current = selectedProjectSlug;

  const navigateTo = useCallback(
    (nextView: View, filePath?: string | null, context: Record<string, string> = {}) => {
      const nextRoute = { projectSlug: selectedProjectSlugRef.current, view: nextView, filePath: filePath ?? null, context };
      if (canLeaveCurrentRouteRef.current && !canLeaveCurrentRouteRef.current(nextRoute)) return;

      const nextHash = buildRouteHash(selectedProjectSlugRef.current, nextView, filePath, context);
      const currentHash = buildRouteHash(
        currentRouteRef.current.projectSlug,
        currentRouteRef.current.view,
        currentRouteRef.current.filePath,
        currentRouteRef.current.context,
      );

      if (window.location.hash === nextHash) {
        if (currentHash !== nextHash) {
          applyRouteSafely(applyRouteRef.current, nextRoute, onRouteErrorRef.current);
        }
        return;
      }

      window.location.hash = nextHash;
    },
    [],
  );

  useEffect(() => {
    const syncRoute = () => {
      const route = parseRouteHash(window.location.hash);
      const routeProjectSlug = route.projectSlug ?? selectedProjectSlugRef.current;

      if (!routeProjectSlug) {
        if (window.location.hash !== "#/projects") {
          window.history.replaceState(null, "", "#/projects");
        }
        return;
      }

      if (route.projectSlug !== routeProjectSlug) {
        const normalized = buildRouteHash(routeProjectSlug, route.view, route.filePath, route.context);
        if (window.location.hash !== normalized) {
          window.history.replaceState(null, "", normalized);
        }
      }

      const nextRoute = { ...route, projectSlug: routeProjectSlug };
      const nextHash = buildRouteHash(nextRoute.projectSlug, nextRoute.view, nextRoute.filePath, nextRoute.context);
      const currentHash = buildRouteHash(
        currentRouteRef.current.projectSlug,
        currentRouteRef.current.view,
        currentRouteRef.current.filePath,
        currentRouteRef.current.context,
      );

      if (currentHash === nextHash) return;

      if (canLeaveCurrentRouteRef.current && !canLeaveCurrentRouteRef.current(nextRoute)) {
        if (window.location.hash !== currentHash) {
          window.history.replaceState(null, "", currentHash);
        }
        return;
      }

      if (selectedProjectSlugRef.current !== routeProjectSlug) {
        setSelectedProjectSlug(routeProjectSlug);
        return;
      }

      applyRouteSafely(applyRouteRef.current, nextRoute, onRouteErrorRef.current);
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    return () => window.removeEventListener("hashchange", syncRoute);
  }, [selectedProjectSlug, setSelectedProjectSlug]);

  return { navigateTo };
}
