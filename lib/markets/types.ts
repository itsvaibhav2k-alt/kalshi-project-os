/**
 * Shared market type contract for Kalshi Project OS, Phase 1.
 *
 * Read-only market data only. These types describe normalized market
 * snapshots and factual data-quality flags. No verdicts, no trading,
 * no account or order concepts.
 */

/** Supported market platforms. Phase 1 is Kalshi-only. */
export type PlatformId = 'kalshi';

/** Normalized lifecycle status of a market. */
export type MarketStatus = 'active' | 'closed' | 'settled' | 'unknown';

/**
 * Factual data-quality flags. These describe observable properties of the
 * market data only — they are not recommendations or verdicts.
 */
export type DataFlag =
  | 'wide spread'
  | 'thin open interest'
  | 'zero volume'
  | 'missing rules'
  | 'missing settlement source'
  | 'likely junk / parlay'
  | 'not evaluated';

/** Every valid DataFlag value, in display order. */
export const ALL_DATA_FLAGS: readonly DataFlag[] = [
  'wide spread',
  'thin open interest',
  'zero volume',
  'missing rules',
  'missing settlement source',
  'likely junk / parlay',
  'not evaluated',
] as const;

/**
 * A platform-agnostic, normalized view of a single market.
 *
 * All prices are integer cents (0-100 for binary contracts). Fields that the
 * source platform did not provide are `null`, never fabricated.
 */
export interface NormalizedMarket {
  /** Stable internal id, e.g. `kalshi:<externalId>`. */
  id: string;
  /** Platform this market came from. */
  platformId: PlatformId;
  /** The platform's own market identifier (e.g. Kalshi ticker). */
  externalId: string;
  /** Parent event ticker, when the platform groups markets into events. */
  eventTicker: string | null;
  /** Human-readable market title. */
  title: string;
  /** Platform category, if provided. */
  category: string | null;
  /** Best YES bid in cents, or null if not provided. */
  yesBidCents: number | null;
  /** Best YES ask in cents, or null if not provided. */
  yesAskCents: number | null;
  /** Best NO bid in cents, or null if not provided. */
  noBidCents: number | null;
  /** Best NO ask in cents, or null if not provided. */
  noAskCents: number | null;
  /** Last traded price in cents, or null if not provided. */
  lastPriceCents: number | null;
  /** YES ask minus YES bid in cents, or null when either side is missing. */
  spreadCents: number | null;
  /** Lifetime contract volume, or null if not provided. */
  volume: number | null;
  /** Trailing 24h contract volume, or null if not provided. */
  volume24h: number | null;
  /** Open interest in contracts, or null if not provided. */
  openInterest: number | null;
  /** Platform-reported liquidity in dollars, or null if not provided. */
  liquidityDollars: number | null;
  /** ISO 8601 close time, or null if not provided. */
  closeTime: string | null;
  /** ISO 8601 expiration time, or null if not provided. */
  expirationTime: string | null;
  /** Normalized lifecycle status. */
  status: MarketStatus;
  /** The platform's raw status string, preserved for auditability. */
  rawStatus: string;
  /** Full rules text, or null if not provided. */
  rulesText: string | null;
  /** Resolution criteria text, or null if not provided. */
  resolutionCriteria: string | null;
  /** Named settlement source, or null if not provided. */
  settlementSource: string | null;
  /** True when the platform marks the market as provisional. */
  isProvisional: boolean;
  /** True for multivariate / combination (parlay-style) markets. */
  isMultivariate: boolean;
  /** Factual data-quality flags observed for this market. */
  flags: DataFlag[];
  /** The untouched raw payload from the platform, kept for auditing. */
  raw: unknown;
}

/**
 * Result envelope for a market scan.
 *
 * `source` distinguishes live API data from fixture data; fixture data must
 * never be presented as live anywhere downstream.
 */
export interface MarketsResult {
  /** Normalized markets that passed ingestion. */
  markets: NormalizedMarket[];
  /** ISO 8601 timestamp of when the data was fetched. */
  fetchedAt: string;
  /** Whether this data came from the live API or a local fixture. */
  source: 'live' | 'fixture';
  /** Human-readable error message, or null on success. */
  error: string | null;
  /** Pipeline counts for the scan. */
  counts: {
    /** Total markets scanned from the source. */
    scanned: number;
    /** Markets filtered out as likely junk / parlay. */
    junkFiltered: number;
    /** Markets shown after filtering. */
    shown: number;
  };
}
