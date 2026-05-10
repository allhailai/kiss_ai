export function formatLocalDateTime(timestamp: string | null | undefined, emptyLabel = "None") {
  if (!timestamp) return emptyLabel;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatLocalTime(timestamp: string | null | undefined, emptyLabel = "None") {
  if (!timestamp) return emptyLabel;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
