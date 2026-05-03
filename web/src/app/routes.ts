import { defaultRoute, fileBackedViews, type RouteState, type View, viewIds } from "./views";

export function parseRouteHash(hash: string): RouteState {
  const route = hash.replace(/^#\/?/, "");
  const [firstSegment, secondSegment, thirdSegment, ...remainingParts] = route.split("/");
  const isProjectRoute = firstSegment === "p" && Boolean(secondSegment);
  let projectSlug: string | null = null;

  try {
    projectSlug = isProjectRoute ? decodeURIComponent(secondSegment) : null;
  } catch {
    projectSlug = null;
  }

  const viewCandidate = isProjectRoute ? thirdSegment : firstSegment;
  const filePathParts = isProjectRoute ? remainingParts : [secondSegment, thirdSegment, ...remainingParts].filter(Boolean);

  if (!viewCandidate || !viewIds.has(viewCandidate as View)) {
    return { ...defaultRoute, projectSlug };
  }

  const view = viewCandidate as View;
  const rawFilePath = filePathParts.join("/");

  if (!fileBackedViews.has(view) || !rawFilePath) {
    return { projectSlug, view, filePath: null };
  }

  try {
    return { projectSlug, view, filePath: decodeURIComponent(rawFilePath) };
  } catch {
    return { projectSlug, view, filePath: null };
  }
}

export function buildRouteHash(projectSlug: string | null, view: View, filePath?: string | null) {
  if (!projectSlug) return "#/projects";

  const base = `#/p/${encodeURIComponent(projectSlug)}/${view}`;

  if (filePath && fileBackedViews.has(view)) {
    return `${base}/${encodeURIComponent(filePath)}`;
  }

  return base;
}
