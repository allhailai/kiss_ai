import type { TopicState } from "../../contracts/api";

export type TopicsFilter = "all" | "needs_review" | "active" | "in_progress" | "archived" | "shallow" | "deep";

export const VALID_FILTERS = new Set<TopicsFilter>(["all", "needs_review", "active", "in_progress", "archived", "shallow", "deep"]);

export function parseFilterFromHash(): TopicsFilter {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  if (qIndex === -1) return "all";
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  const f = params.get("filter") as TopicsFilter | null;
  return f && VALID_FILTERS.has(f) ? f : "all";
}

export function setFilterInHash(filter: TopicsFilter): void {
  const hash = window.location.hash;
  const qIndex = hash.indexOf("?");
  const basePath = qIndex === -1 ? hash : hash.slice(0, qIndex);
  if (filter === "all") {
    // Clean URL for default filter
    window.history.replaceState(null, "", basePath);
  } else {
    window.history.replaceState(null, "", `${basePath}?filter=${filter}`);
  }
}

export function stateLabel(state: TopicState): string {
  switch (state) {
    case "seed": return "New";
    case "shallow": return "Getting Started";
    case "deep": return "Well Covered";
    case "saturated": return "Complete";
    case "split_candidate": return "Needs Review";
    case "deprecated": return "Removed";
  }
}

export function isActiveTopic(topic: { state: TopicState; disposition: string | null }): boolean {
  const activeState = topic.state === "shallow" || topic.state === "deep" || topic.state === "saturated" || topic.state === "split_candidate";
  return activeState && !topic.disposition;
}
