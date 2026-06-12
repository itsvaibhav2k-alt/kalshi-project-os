/**
 * Read-only Kalshi public API client.
 *
 * SAFETY: this client only performs plain GET requests against the public
 * market-data /events endpoint (with and without nested markets). It carries
 * NO auth headers, NO credentials, and NO order/account/portfolio paths.
 */

import { isJunk } from '@/lib/markets/filters';

import { normalizeKalshiMarket } from './normalize';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
  KalshiRawEvent,
  KalshiRawMarket,
} from './types';

/** Public Kalshi market-data API base URL. */
export const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

/** Stop paginating once at least this many non-junk markets are collected. */
export const TARGET_NON_JUNK_MARKETS = 200;

/** Hard cap on pages fetched per scan, regardless of junk density. */
export const MAX_EVENT_PAGES = 5;

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;

/** Minimal response surface the client needs from a fetch implementation. */
export interface KalshiFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Injectable fetch shape so tests can mock the network. */
export type KalshiFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<KalshiFetchResponse>;

/** Descriptive error for any Kalshi API failure. */
export class KalshiApiError extends Error {
  /** HTTP status code, or null when the failure happened before a response. */
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'KalshiApiError';
    this.status = status;
  }
}

/**
 * Fetches open markets as the nested markets of open events.
 *
 * The flat /markets feed currently leads with thousands of KXMV multivariate
 * parlay markets, so a single page can be 100% junk and the scanner would
 * show zero rows. Fetching per real event via /events (with nested markets)
 * skips those parlay collections at the source. Cursor pagination continues
 * until TARGET_NON_JUNK_MARKETS non-junk markets are collected, the cursor
 * runs out, or MAX_EVENT_PAGES is reached. Junk markets that do appear are
 * still returned so downstream junk-filter counts stay accurate.
 *
 * @param limit - Maximum number of events to request per page (default 100)
 * @param fetchImpl - Fetch implementation, injectable for tests
 * @returns A markets envelope containing every nested market fetched
 * @throws {KalshiApiError} On HTTP errors, timeouts, bad JSON, or a missing `events` key
 */
export async function fetchOpenMarkets(
  limit: number = DEFAULT_LIMIT,
  fetchImpl: KalshiFetch = globalThis.fetch,
): Promise<KalshiMarketsResponse> {
  let collected: KalshiRawMarket[] = [];
  let nonJunkCount = 0;
  let cursor: string | null = null;

  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const response = await fetchNestedEventsPage(limit, cursor, fetchImpl);
    const pageMarkets = flattenEventMarkets(response.events);
    collected = [...collected, ...pageMarkets];
    nonJunkCount += countNonJunkMarkets(pageMarkets);
    cursor = nonEmptyCursor(response.cursor);
    if (nonJunkCount >= TARGET_NON_JUNK_MARKETS || cursor === null) {
      break;
    }
  }
  return { markets: collected };
}

/**
 * Fetches open events from the public Kalshi events endpoint.
 *
 * @param limit - Maximum number of events to request (default 100)
 * @param fetchImpl - Fetch implementation, injectable for tests
 * @returns The validated events response envelope
 * @throws {KalshiApiError} On HTTP errors, timeouts, bad JSON, or a missing `events` key
 */
export async function fetchOpenEvents(
  limit: number = DEFAULT_LIMIT,
  fetchImpl: KalshiFetch = globalThis.fetch,
): Promise<KalshiEventsResponse> {
  const payload = await getJson(`/events?status=open&limit=${limit}`, fetchImpl);
  if (!hasArrayKey(payload, 'events')) {
    throw new KalshiApiError('Kalshi events response is missing the "events" array');
  }
  return payload as unknown as KalshiEventsResponse;
}

/** Fetches one page of open events with nested markets, validating the envelope. */
async function fetchNestedEventsPage(
  limit: number,
  cursor: string | null,
  fetchImpl: KalshiFetch,
): Promise<KalshiEventsResponse> {
  const cursorParam = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
  const payload = await getJson(
    `/events?status=open&limit=${limit}&with_nested_markets=true${cursorParam}`,
    fetchImpl,
  );
  if (!hasArrayKey(payload, 'events')) {
    throw new KalshiApiError('Kalshi events response is missing the "events" array');
  }
  return payload as unknown as KalshiEventsResponse;
}

/** Flattens nested event markets into one list, skipping events without markets. */
function flattenEventMarkets(events: KalshiRawEvent[]): KalshiRawMarket[] {
  return events.flatMap((event) => event.markets ?? []);
}

const EMPTY_CATEGORY_INDEX: Record<string, string> = {};

/** Counts markets that survive the exact same junk filter the API route applies. */
function countNonJunkMarkets(markets: KalshiRawMarket[]): number {
  return markets.filter((raw) => !isJunk(normalizeKalshiMarket(raw, EMPTY_CATEGORY_INDEX))).length;
}

/** Returns a usable pagination cursor, or null when absent or blank. */
function nonEmptyCursor(cursor: string | undefined): string | null {
  return typeof cursor === 'string' && cursor.trim().length > 0 ? cursor : null;
}

/** Performs a plain GET request with a 10s abort timeout and JSON parsing. */
async function getJson(path: string, fetchImpl: KalshiFetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: KalshiFetchResponse;
    try {
      response = await fetchImpl(`${KALSHI_BASE_URL}${path}`, { signal: controller.signal });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new KalshiApiError(
          `Kalshi request to ${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        );
      }
      throw new KalshiApiError(`Kalshi request to ${path} failed: ${describeError(error)}`);
    }
    if (!response.ok) {
      throw new KalshiApiError(
        `Kalshi responded with HTTP ${response.status} for ${path}`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new KalshiApiError(`Kalshi response for ${path} was not valid JSON`, response.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Type guard: payload is an object containing the named array key. */
function hasArrayKey(payload: unknown, key: string): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as Record<string, unknown>)[key])
  );
}

/** Detects AbortController-driven cancellation across runtimes. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Extracts a human-readable message from an unknown thrown value. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}
