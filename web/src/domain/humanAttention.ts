import type { HumanAttentionItem, ResolutionOption } from "../contracts/api";

export type FriendlyHumanAttentionItem = {
  title: string;
  summary: string;
  action: string | null;
  technicalDetails: string[];
};

function categoryTitle(category: string) {
  switch (category) {
    case "runtime":
      return "Project setup";
    case "source_gap":
    case "evidence":
    case "evidence_grade":
      return "Source confidence";
    case "schema":
    case "routing":
      return "Output location";
    default:
      return "Review note";
  }
}

function recommendedOption(options: ResolutionOption[] | undefined) {
  if (!Array.isArray(options) || !options.length) return null;
  return options.find((option) => option.recommended) ?? options[0] ?? null;
}

function technicalValue(label: string, value: unknown) {
  if (Array.isArray(value)) {
    return value.length ? `${label}: ${value.join(", ")}` : null;
  }
  if (typeof value === "string" && value.trim()) return `${label}: ${value.trim()}`;
  return null;
}

export function friendlyHumanAttentionItem(item: HumanAttentionItem): FriendlyHumanAttentionItem {
  const category = item.category ?? "review";
  const option = recommendedOption(item.resolution_options);
  const nextAction = item.next_human_action ?? item.nextAction ?? "";
  const title = categoryTitle(category);
  const action = option?.label ?? (nextAction ? "Review the suggested next step" : null);

  let summary = item.summary || item.issue || item.message || "The build left an optional review note.";
  if (category === "runtime") {
    summary = "The build finished, but one project setup choice can be clarified for future rebuilds.";
  } else if (category === "source_gap" || category === "evidence" || category === "evidence_grade") {
    summary = "Some cited facts came from summarized public sources. If exact numbers matter, add original public source copies or public source data and rebuild.";
  } else if (category === "schema" || category === "routing") {
    summary = "The build used the standard output folder. Clarify the requirement wording only if an exact folder name matters.";
  }

  const technicalDetails = [
    technicalValue("ID", item.id),
    technicalValue("Severity", item.severity),
    technicalValue("Category", item.category),
    technicalValue("Raw summary", item.summary || item.issue || item.message),
    technicalValue("Raw next step", nextAction),
    technicalValue("Affected files", item.affected_files),
    option ? technicalValue("Suggested option", option.label) : null,
    option ? technicalValue("Suggested prompt", option.prompt) : null,
  ].filter((detail): detail is string => Boolean(detail));

  return { title, summary, action, technicalDetails };
}

export function friendlyHumanAttentionItems(items: HumanAttentionItem[]) {
  return items.map(friendlyHumanAttentionItem).filter((item) => item.action || item.summary);
}
