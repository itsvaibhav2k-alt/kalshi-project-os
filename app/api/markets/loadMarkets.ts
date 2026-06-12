/**
 * Server-side market loading shared by read-only route handlers.
 *
 * Calls the read-only Kalshi connector (public market data, no credentials),
 * applies the factual junk filter, and returns a MarketsResult envelope.
 * On any fetch/parse failure it falls back to local fixture snapshots,
 * clearly labeled source: 'fixture' with the real failure message.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { applyJunkFilter, computeCounts } from '@/lib/markets/filters';
import type { MarketsResult, NormalizedMarket } from '@/lib/markets/types';
import { KalshiConnector } from '@/lib/platforms/kalshi/connector';
import { buildCategoryIndex, normalizeKalshiMarket } from '@/lib/platforms/kalshi/normalize';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
} from '@/lib/platforms/kalshi/types';

// DEV FALLBACK ONLY: local fixture snapshots of the public Kalshi payloads.
// They are used when the live API call fails (or when the read-only
// KALSHI_MARKETS_SOURCE=fixture toggle requests them), are normalized
// through the exact same pipeline as live data, and every response built
// from them is labeled source: 'fixture' — fixture data is never presented
// as live.
const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures');
const fixtureMarketsResponse = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'kalshi-markets.json'), 'utf8'),
) as KalshiMarketsResponse;
const fixtureEventsResponse = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'kalshi-events.json'), 'utf8'),
) as KalshiEventsResponse;

/** Normalizes the fixture snapshots through the same pipeline as live data. */
function normalizeFixtureMarkets(): NormalizedMarket[] {
  const categoryIndex = buildCategoryIndex(fixtureEventsResponse.events);
  return fixtureMarketsResponse.markets.map((raw) => normalizeKalshiMarket(raw, categoryIndex));
}

/** Builds the MarketsResult envelope: junk filter + pipeline counts. */
function buildResult(
  markets: NormalizedMarket[],
  source: MarketsResult['source'],
  error: string | null,
): MarketsResult {
  const { kept, junkFiltered } = applyJunkFilter(markets);
  return {
    markets: kept,
    fetchedAt: new Date().toISOString(),
    source,
    error,
    counts: computeCounts(markets.length, junkFiltered, kept.length),
  };
}

/** Extracts a human-readable message from an unknown thrown value. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected failure fetching market data';
}

/**
 * Loads the current market scan as a MarketsResult.
 *
 * The KALSHI_MARKETS_SOURCE env toggle is read on every call (never cached):
 * when it equals 'fixture', the live fetch is skipped entirely and the
 * fixture snapshots are returned, labeled source 'fixture'.
 *
 * @returns Live data when the public API call succeeds; otherwise the
 *   fixture fallback with source 'fixture' and the real failure message.
 */
export async function loadCurrentMarkets(): Promise<MarketsResult> {
  if (process.env.KALSHI_MARKETS_SOURCE === 'fixture') {
    return buildResult(normalizeFixtureMarkets(), 'fixture', null);
  }
  try {
    const markets = await KalshiConnector.fetchNormalizedMarkets();
    return buildResult(markets, 'live', null);
  } catch (error: unknown) {
    return buildResult(normalizeFixtureMarkets(), 'fixture', describeError(error));
  }
}
