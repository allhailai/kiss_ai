import { defaultRoute, fileBackedViews, legacyAiViews, type RouteState, type View, viewIds } from "./views";

/** Map legacy URL slugs to the AI tab they should open. */
const legacyViewToAiTab: Record<string, string> = {
  chat: "conversations",
  review: "conversations",
  questions: "questions",
  topics: "topics",
  suggestions: "conversations",
};

export function parseRouteHash(hash: string): RouteState {
  const [routePart, queryPart = ""] = hash.replace(/^#\/?/, "").split("?");
  const route = routePart;
  const [firstSegment, secondSegment, thirdSegment, ...remainingParts] = route.split("/");
  const isProjectRoute = firstSegment === "p" && Boolean(secondSegment);
  let projectSlug: string | null = null;
  const context = Object.fromEntries(new URLSearchParams(queryPart).entries());

  try {
    projectSlug = isProjectRoute ? decodeURIComponent(secondSegment) : null;
  } catch {
    projectSlug = null;
  }

  const viewCandidate = isProjectRoute ? thirdSegment : firstSegment;
  const filePathParts = isProjectRoute ? remainingParts : [secondSegment, thirdSegment, ...remainingParts].filter(Boolean);

  if (!viewCandidate || !viewIds.has(viewCandidate as View)) {
    // Legacy /rebuild route: redirect to default view with build panel context
    if (viewCandidate === "rebuild") {
      return { ...defaultRoute, projectSlug, context: { ...context, panel: "build-project" } };
    }

    // Legacy AI-related routes (chat, review, questions, topics, suggestions) → redirect to "ai" view
    if (legacyAiViews.has(viewCandidate ?? "")) {
      const tab = legacyViewToAiTab[viewCandidate!] ?? "conversations";
      return { projectSlug, view: "ai", filePath: null, context: { ...context, tab } };
    }

    return { ...defaultRoute, projectSlug, context };
  }

  const view = viewCandidate as View;
  const rawFilePath = filePathParts.join("/");

  if (!fileBackedViews.has(view) || !rawFilePath) {
    return { projectSlug, view, filePath: null, context };
  }

  try {
    return { projectSlug, view, filePath: decodeURIComponent(rawFilePath), context };
  } catch {
    return { projectSlug, view, filePath: null, context };
  }
}

export function buildRouteHash(projectSlug: string | null, view: View, filePath?: string | null, context: Record<string, string> = {}) {
  if (!projectSlug) return "#/projects";

  const base = `#/p/${encodeURIComponent(projectSlug)}/${view}`;
  const route = filePath && fileBackedViews.has(view) ? `${base}/${encodeURIComponent(filePath)}` : base;
  const routeContext = new URLSearchParams();

  for (const [key, value] of Object.entries(context)) {
    if (value) routeContext.set(key, value);
  }

  const query = routeContext.toString();
  return query ? `${route}?${query}` : route;
}
