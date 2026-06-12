/**
 * Pure normalization functions: raw Kalshi payloads -> NormalizedMarket.
 *
 * No clocks, no network, no mutation. Missing data becomes null — values
 * are never invented. Flags use only the approved factual vocabulary.
 */

import type { DataFlag, MarketStatus, NormalizedMarket } from '@/lib/markets/types';

import type { KalshiRawEvent, KalshiRawMarket } from './types';

const WIDE_SPREAD_THRESHOLD_CENTS = 4;
const THIN_OPEN_INTEREST_THRESHOLD = 1000;
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

/** The fields flag derivation inspects. */
export interface FlagInput {
  spreadCents: number | null;
  openInterest: number | null;
  volume: number | null;
  rulesText: string | null;
  settlementSource: string | null;
  isMultivariate: boolean;
  isProvisional: boolean;
}

/**
 * Parses a Kalshi dollar string into integer cents.
 *
 * @param value - e.g. "0.4100" -> 41; malformed or missing -> null
 * @returns Integer cents, or null
 */
export function parseDollarsToCents(value: string | null | undefined): number | null {
  const parsed = parseNumeric(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

/**
 * Parses a Kalshi fixed-point string into a number.
 *
 * @param value - e.g. "18200.00" -> 18200; malformed or missing -> null
 * @returns The numeric value, or null
 */
export function parseFixedPoint(value: string | null | undefined): number | null {
  return parseNumeric(value);
}

/**
 * Derives the YES spread in cents.
 *
 * @returns ask minus bid, or null when either side is missing
 */
export function deriveSpreadCents(
  yesBidCents: number | null,
  yesAskCents: number | null,
): number | null {
  if (yesBidCents === null || yesAskCents === null) {
    return null;
  }
  return yesAskCents - yesBidCents;
}

/**
 * Maps a raw Kalshi status string to the normalized lifecycle status.
 */
export function mapStatus(raw: string): MarketStatus {
  switch (raw.toLowerCase()) {
    case 'active':
      return 'active';
    case 'closed':
      return 'closed';
    case 'settled':
    case 'finalized':
      return 'settled';
    default:
      return 'unknown';
  }
}

/**
 * Derives factual data-quality flags from observable market fields.
 *
 * Uses EXACTLY the approved vocabulary. 'not evaluated' is always present
 * as the last flag because no risk engine exists in Phase 1.
 */
export function deriveFlags(market: FlagInput): DataFlag[] {
  const flags: DataFlag[] = [];
  if (market.spreadCents !== null && market.spreadCents > WIDE_SPREAD_THRESHOLD_CENTS) {
    flags.push('wide spread');
  }
  if (market.openInterest !== null && market.openInterest < THIN_OPEN_INTEREST_THRESHOLD) {
    flags.push('thin open interest');
  }
  if (market.volume === 0) {
    flags.push('zero volume');
  }
  if (market.rulesText === null) {
    flags.push('missing rules');
  }
  if (market.settlementSource === null) {
    flags.push('missing settlement source');
  }
  if (market.isMultivariate || market.isProvisional) {
    flags.push('likely junk / parlay');
  }
  flags.push('not evaluated');
  return flags;
}

/**
 * Normalizes one raw Kalshi market into the shared NormalizedMarket shape.
 *
 * @param raw - The untouched raw market payload (preserved in `.raw`)
 * @param categoryByEventTicker - Event ticker -> category index
 * @returns A NormalizedMarket with null for anything the payload omitted
 */
export function normalizeKalshiMarket(
  raw: KalshiRawMarket,
  categoryByEventTicker: Record<string, string>,
): NormalizedMarket {
  const externalId = raw.ticker ?? '';
  const eventTicker = nonEmptyString(raw.event_ticker);
  const yesBidCents = parseDollarsToCents(raw.yes_bid_dollars);
  const yesAskCents = parseDollarsToCents(raw.yes_ask_dollars);
  const spreadCents = deriveSpreadCents(yesBidCents, yesAskCents);
  const volume = parseFixedPoint(raw.volume_fp);
  const openInterest = parseFixedPoint(raw.open_interest_fp);
  const rulesText = nonEmptyString(raw.rules_primary);
  const settlementSource = nonEmptyString(
    typeof raw['settlement_source'] === 'string' ? (raw['settlement_source'] as string) : null,
  );
  const isProvisional = raw.is_provisional === true;
  const isMultivariate =
    nonEmptyString(raw.mve_collection_ticker) !== null ||
    (Array.isArray(raw.mve_selected_legs) && raw.mve_selected_legs.length > 0);

  return {
    id: `kalshi:${externalId}`,
    platformId: 'kalshi',
    externalId,
    eventTicker,
    title: raw.title ?? '',
    category: eventTicker === null ? null : categoryByEventTicker[eventTicker] ?? null,
    yesBidCents,
    yesAskCents,
    noBidCents: parseDollarsToCents(raw.no_bid_dollars),
    noAskCents: parseDollarsToCents(raw.no_ask_dollars),
    lastPriceCents: parseDollarsToCents(raw.last_price_dollars),
    spreadCents,
    volume,
    volume24h: parseFixedPoint(raw.volume_24h_fp),
    openInterest,
    liquidityDollars: parseFixedPoint(raw.liquidity_dollars),
    closeTime: nonEmptyString(raw.close_time),
    expirationTime: nonEmptyString(raw.expiration_time),
    status: mapStatus(raw.status ?? ''),
    rawStatus: raw.status ?? '',
    rulesText,
    resolutionCriteria: nonEmptyString(raw.rules_secondary),
    settlementSource,
    isProvisional,
    isMultivariate,
    flags: deriveFlags({
      spreadCents,
      openInterest,
      volume,
      rulesText,
      settlementSource,
      isMultivariate,
      isProvisional,
    }),
    raw,
  };
}

/**
 * Builds an event-ticker -> category index from raw Kalshi events.
 *
 * Events missing a ticker or category are skipped — never guessed.
 */
export function buildCategoryIndex(events: KalshiRawEvent[]): Record<string, string> {
  return Object.fromEntries(
    events
      .filter(
        (event) =>
          nonEmptyString(event.event_ticker) !== null && nonEmptyString(event.category) !== null,
      )
      .map((event) => [event.event_ticker as string, event.category as string]),
  );
}

/** Returns the trimmed string, or null when missing or empty. */
function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Parses a plain numeric string; anything else is null. */
function parseNumeric(value: string | null | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!NUMERIC_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
