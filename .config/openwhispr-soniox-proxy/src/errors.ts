import { config } from "./config.ts";

export type SonioxErrorType =
  | "invalid_key"
  | "rate_limited"
  | "upstream"
  | "timeout"
  | "transcription_failed"
  | "bad_request"
  | "internal";

export class SonioxError extends Error {
  readonly status: number;
  readonly type: SonioxErrorType;

  constructor(message: string, status: number, type: SonioxErrorType) {
    super(message);
    this.name = "SonioxError";
    this.status = status;
    this.type = type;
  }
}

export type ErrorResponseBody = {
  error: { message: string; type: SonioxErrorType };
};

export function errorResponse(
  error: SonioxError,
): { status: number; body: ErrorResponseBody } {
  return {
    status: error.status,
    body: { error: { message: error.message, type: error.type } },
  };
}

export function internalError(message: string): SonioxError {
  return new SonioxError(message, 500, "internal");
}

export function badRequestError(message: string): SonioxError {
  return new SonioxError(message, 400, "bad_request");
}

export function invalidKeyError(message = "Invalid or missing Soniox API key"): SonioxError {
  return new SonioxError(message, 401, "invalid_key");
}

export function rateLimitedError(message = "Soniox API rate limited"): SonioxError {
  return new SonioxError(message, 429, "rate_limited");
}

export function upstreamError(message: string): SonioxError {
  return new SonioxError(message, 502, "upstream");
}

export function timeoutError(message = "Soniox transcription timed out"): SonioxError {
  return new SonioxError(message, 504, "timeout");
}

export function transcriptionFailedError(message: string): SonioxError {
  return new SonioxError(message, 502, "transcription_failed");
}

/**
 * Map a Soniox HTTP failure (non-2xx) to the appropriate SonioxError.
 * Reads the upstream response body for a richer message when available.
 */
export async function fromUpstreamResponse(
  res: Response,
  context: string,
): Promise<SonioxError> {
  let detail = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error_message ?? parsed?.message ?? parsed?.error ?? text;
      } catch {
        detail = text;
      }
    }
  } catch {
    // ignore body read failures
  }

  if (res.status === 401 || res.status === 403) {
    return invalidKeyError(
      `Invalid Soniox API key for region "${config.SONIOX_REGION}" ` +
        `(${config.SONIOX_API_BASE})${detail ? `: ${detail}` : ""}. ` +
        `Check that the key belongs to a project in that region.`,
    );
  }
  if (res.status === 429) {
    return rateLimitedError(`Soniox rate limited${detail ? `: ${detail}` : ""}`);
  }
  if (res.status >= 500) {
    return upstreamError(`Soniox upstream error${detail ? `: ${detail}` : ""}`);
  }
  if (res.status === 400) {
    return badRequestError(`Soniox rejected the request${detail ? `: ${detail}` : ""}`);
  }

  return upstreamError(`${context}${detail ? `: ${detail}` : ""}`);
}
