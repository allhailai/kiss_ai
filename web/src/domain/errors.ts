export function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  const code = "code" in error && typeof error.code === "string" ? error.code : null;
  if (status && code) return `${error.message} (${code}, HTTP ${status})`;
  if (status) return `${error.message} (HTTP ${status})`;
  if (code) return `${error.message} (${code})`;
  return error.message;
}
