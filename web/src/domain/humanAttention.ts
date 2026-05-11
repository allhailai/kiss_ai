export function humanAttentionItemText(item: unknown) {
  if (!item || typeof item !== "object") return String(item);

  const source = item as Record<string, unknown>;
  const severity = typeof source.severity === "string" ? source.severity : "attention";
  const category = typeof source.category === "string" ? source.category : "review";
  const summary =
    typeof source.summary === "string"
      ? source.summary
      : typeof source.issue === "string"
        ? source.issue
        : typeof source.message === "string"
          ? source.message
          : "Review needed.";
  const nextAction =
    typeof source.next_human_action === "string"
      ? source.next_human_action
      : typeof source.nextAction === "string"
        ? source.nextAction
        : "";

  return `${severity}/${category}: ${summary}${nextAction ? ` Next: ${nextAction}` : ""}`;
}
