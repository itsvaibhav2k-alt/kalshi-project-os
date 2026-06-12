/**
 * Probability types for Phase 2 (pipeline stage 03 Research / Predict).
 *
 * Probability estimates are ADVISORY INPUTS only. They never approve
 * anything; only the deterministic risk engine produces verdicts.
 * Probabilities are expressed as fractions in [0, 1].
 */

/** Advisory confidence level. No source means low, always. */
export type Confidence = 'low' | 'medium' | 'high';

/** How the market-implied probability was derived. */
export type ImpliedProbabilityBasis = 'bid_ask_midpoint' | 'last_price' | 'none';

/**
 * Advisory probability estimate for one market.
 *
 * Fair-probability fields stay null unless sourced research exists —
 * an estimate is never invented from price data alone.
 */
export interface ProbabilityEstimate {
  /** Internal market id this estimate belongs to. */
  marketId: string;
  /** ISO 8601 creation timestamp (caller-supplied, keeps this pure). */
  createdAt: string;
  /** Probability implied by current market prices, in [0, 1], or null. */
  marketImpliedProbability: number | null;
  /** How the implied probability was derived. */
  impliedProbabilityBasis: ImpliedProbabilityBasis;
  /** Lower bound of the advisory fair range, or null without research. */
  fairProbabilityLow: number | null;
  /** Midpoint of the advisory fair range, or null without research. */
  fairProbabilityMid: number | null;
  /** Upper bound of the advisory fair range, or null without research. */
  fairProbabilityHigh: number | null;
  /** fairMid − marketImplied, before spread/fees, or null when either is missing. */
  expectedEdge: number | null;
  /** Advisory confidence; low whenever sources are absent. */
  confidence: Confidence;
  /** Research source ids backing the fair range (empty without research). */
  sourceIds: string[];
  /** Reasons this estimate could be wrong or weak. */
  uncertaintyNotes: string[];
}
