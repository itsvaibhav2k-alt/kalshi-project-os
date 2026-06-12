/**
 * Deterministic probability estimation (pipeline stage 03 Research / Predict).
 *
 * Derives a market-implied probability from listed prices and, ONLY when
 * sourced research and a caller-supplied fair range both exist, an advisory
 * fair range. No network, no LLM, no clock, no randomness — the creation
 * timestamp is injected by the caller. A fair value is never invented from
 * price data alone, and missing inputs stay null with honest notes.
 */

import type { NormalizedMarket } from '@/lib/markets/types';

import type { Confidence, ImpliedProbabilityBasis, ProbabilityEstimate } from './types';

/**
 * Minimal structural view of a research brief.
 *
 * Defined locally (instead of importing from `@/lib/research/types`) so this
 * module has no dependency on the research scaffolding. The dossier layer
 * passes a full `ResearchBrief`, which satisfies this shape structurally.
 */
export interface ResearchLike {
  /** Research status, e.g. 'not_run' | 'sourced' | 'fixture' | 'unavailable'. */
  status: string;
  /** Advisory confidence reported by the research layer. */
  confidence: Confidence;
  /** Sources backing the research; empty means no evidence. */
  sources: ReadonlyArray<{ id: string }>;
}

/** Caller-supplied advisory fair range, as fractions in [0, 1]. */
export interface FairRange {
  /** Lower bound of the fair range. */
  low: number;
  /** Midpoint of the fair range. */
  mid: number;
  /** Upper bound of the fair range. */
  high: number;
}

/** Research statuses whose sources may back a fair range. */
const SOURCED_STATUSES: readonly string[] = ['sourced', 'fixture'];

/** Cents per whole contract; converts cent prices to probability fractions. */
const CENTS_PER_CONTRACT = 100;

/** Implied probability plus how it was derived and any weakening note. */
interface ImpliedResult {
  probability: number | null;
  basis: ImpliedProbabilityBasis;
  note: string | null;
}

/** Derives the market-implied probability from listed prices only. */
function deriveImpliedProbability(market: NormalizedMarket): ImpliedResult {
  if (market.yesBidCents !== null && market.yesAskCents !== null) {
    return {
      probability: (market.yesBidCents + market.yesAskCents) / 2 / CENTS_PER_CONTRACT,
      basis: 'bid_ask_midpoint',
      note: null,
    };
  }
  if (market.lastPriceCents !== null) {
    return {
      probability: market.lastPriceCents / CENTS_PER_CONTRACT,
      basis: 'last_price',
      note: 'Implied probability is based on the last traded price, which is weaker than a bid/ask midpoint.',
    };
  }
  return {
    probability: null,
    basis: 'none',
    note: 'No bid/ask quotes and no last traded price; market-implied probability is unknown.',
  };
}

/** Returns true when research is sourced (or fixture) with at least one source. */
function hasUsableSources(research: ResearchLike | null): boolean {
  return (
    research !== null &&
    SOURCED_STATUSES.includes(research.status) &&
    research.sources.length > 0
  );
}

/** Returns true when 0 <= low <= mid <= high <= 1 and all values are finite. */
function isValidFairRange(fairRange: FairRange): boolean {
  const { low, mid, high } = fairRange;
  return (
    Number.isFinite(low) &&
    Number.isFinite(mid) &&
    Number.isFinite(high) &&
    low >= 0 &&
    high <= 1 &&
    low <= mid &&
    mid <= high
  );
}

/**
 * Builds an advisory probability estimate for one market.
 *
 * Implied probability comes from the YES bid/ask midpoint when both sides are
 * listed, falls back to the last traded price (flagged as weaker), and is null
 * otherwise. Fair low/mid/high stay null unless sourced research with at least
 * one source AND a caller-supplied fair range both exist — never derived from
 * price. Confidence is forced to 'low' whenever sources are absent.
 *
 * @param market - The normalized market to estimate
 * @param research - Research brief (structural ResearchLike), or null when none ran
 * @param createdAt - ISO 8601 creation timestamp (caller-supplied, keeps this pure)
 * @param fairRange - Optional caller-supplied fair range; ignored without sources
 * @returns The probability estimate, with missing inputs left null and noted
 */
export function estimateProbability(
  market: NormalizedMarket,
  research: ResearchLike | null,
  createdAt: string,
  fairRange?: FairRange,
): ProbabilityEstimate {
  const uncertaintyNotes: string[] = [];

  const implied = deriveImpliedProbability(market);
  if (implied.note !== null) {
    uncertaintyNotes.push(implied.note);
  }

  const sourcesUsable = hasUsableSources(research);
  if (!sourcesUsable) {
    uncertaintyNotes.push(
      'No sourced research backs this market; fair probability is unavailable.',
    );
  }

  let fairLow: number | null = null;
  let fairMid: number | null = null;
  let fairHigh: number | null = null;
  if (fairRange !== undefined && sourcesUsable) {
    if (isValidFairRange(fairRange)) {
      fairLow = fairRange.low;
      fairMid = fairRange.mid;
      fairHigh = fairRange.high;
    } else {
      uncertaintyNotes.push(
        'Supplied fair range is invalid (requires 0 <= low <= mid <= high <= 1); it was discarded.',
      );
    }
  } else if (fairRange !== undefined && !sourcesUsable) {
    uncertaintyNotes.push(
      'A fair range was supplied without sourced research; it was discarded because fair values are never accepted without sources.',
    );
  } else if (fairRange === undefined && sourcesUsable) {
    uncertaintyNotes.push(
      'Research sources exist but no fair range was supplied; fair probability stays null.',
    );
  }

  const expectedEdge =
    fairMid !== null && implied.probability !== null ? fairMid - implied.probability : null;

  const confidence: Confidence = sourcesUsable ? (research as ResearchLike).confidence : 'low';
  const sourceIds = research === null ? [] : research.sources.map((source) => source.id);

  return {
    marketId: market.id,
    createdAt,
    marketImpliedProbability: implied.probability,
    impliedProbabilityBasis: implied.basis,
    fairProbabilityLow: fairLow,
    fairProbabilityMid: fairMid,
    fairProbabilityHigh: fairHigh,
    expectedEdge,
    confidence,
    sourceIds,
    uncertaintyNotes,
  };
}
