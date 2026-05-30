export class ApiClientError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, { code, status }: { code?: string; status: number }) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: options?.body ? { "Content-Type": "application/json", ...options?.headers } : options?.headers,
    ...options,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { code?: unknown; error?: unknown };

    // Global 401 handler: notify the app that authentication is required
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("kiss-ai-auth-required"));
    }

    throw new ApiClientError(typeof errorBody.error === "string" ? errorBody.error : `Request failed: ${response.status}`, {
      code: typeof errorBody.code === "string" ? errorBody.code : undefined,
      status: response.status,
    });
  }

  return response.json() as Promise<T>;
}

export function projectBase(projectSlug: string) {
  return `/api/projects/${encodeURIComponent(projectSlug)}`;
}
