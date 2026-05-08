export class ApiError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function httpError(message, statusCode = 400, code = null) {
  return new ApiError(message, statusCode, code);
}

export function apiErrorHandler(error, _request, response, _next) {
  const statusCode = Number(error?.statusCode ?? 500);
  response.status(statusCode).json({
    code: typeof error?.code === "string" ? error.code : undefined,
    error: error instanceof Error ? error.message : "Unknown API error.",
  });
}
