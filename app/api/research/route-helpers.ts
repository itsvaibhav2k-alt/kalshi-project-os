import { NextResponse } from 'next/server';

import { validateTicker } from '@/lib/research-store/validation';

/**
 * Shared helpers for the research API route handlers (not a route module —
 * it exports no HTTP methods).
 *
 * Error responses are always `{ error, fieldErrors? }` with a 4xx status:
 * plain English, no stack traces, no internal paths. Request bodies are
 * untrusted and validated server-side before any store call.
 */

/** Error envelope for every research API failure response. */
export interface ResearchApiError {
  error: string;
  fieldErrors?: string[];
}

/**
 * Builds a JSON error response.
 *
 * @param status - HTTP status code (4xx/5xx).
 * @param error - User-facing summary message.
 * @param fieldErrors - Optional field-level validation messages.
 * @returns The JSON error response.
 */
export function errorResponse(
  status: number,
  error: string,
  fieldErrors?: string[],
): NextResponse<ResearchApiError> {
  const body: ResearchApiError =
    fieldErrors !== undefined && fieldErrors.length > 0 ? { error, fieldErrors } : { error };
  return NextResponse.json(body, { status });
}

/**
 * Validates a route ticker param, returning a 400 response when invalid.
 *
 * @param ticker - Raw ticker path segment.
 * @returns Null when the ticker is valid; otherwise the 400 response.
 */
export function rejectInvalidTicker(ticker: string): NextResponse<ResearchApiError> | null {
  const result = validateTicker(ticker);
  if (result.ok) {
    return null;
  }
  return errorResponse(400, 'Invalid market ticker', result.errors);
}

/** Result of reading an untrusted JSON request body. */
export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse<ResearchApiError> };

/**
 * Reads and parses the request body as JSON without leaking parser internals.
 *
 * @param request - Incoming request.
 * @returns The parsed body, or a 400 response when the body is not valid JSON.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    const body: unknown = await request.json();
    return { ok: true, body };
  } catch {
    return { ok: false, response: errorResponse(400, 'Request body must be valid JSON') };
  }
}

/**
 * Narrows an unknown value to a plain object record.
 *
 * @param value - Untrusted value.
 * @returns True when the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes an optional free-text field: non-empty strings pass through,
 * everything else (missing, null, empty, non-string) becomes null.
 *
 * @param value - Untrusted field value.
 * @returns The string, or null.
 */
export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
