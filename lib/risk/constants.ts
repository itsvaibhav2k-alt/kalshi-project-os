/**
 * Risk-engine thresholds for Phase 2 (pipeline stage 04 Validate / Risk).
 *
 * These are conservative STARTER values taken verbatim from the approved
 * Phase 2 brief. They carry no claim of profitability — they exist to make
 * the engine say SKIP unless a candidate affirmatively clears strict checks.
 *
 * Values may be changed only by a future explicit human decision recorded
 * in docs/DECISION_LOG.md. No agent or model output may tune, relax, or
 * rewrite them at runtime or in code.
 *
 * Units: `minEdgeCents` and `maxSpreadCents` are binary-contract cents,
 * which equal probability points (1 cent = 0.01 of probability). Expected
 * edge arrives as a fraction in [0, 1], so callers must compare
 * `expectedEdge * 100` against `minEdgeCents` — never the raw fraction.
 */

/** Human-reviewed thresholds; the engine reads only from this object. */
export const RISK_CONSTANTS = {
  /** Hard-coded true in Training Wheels mode; real-money paths are closed. */
  paperOnlyMode: true,
  /** Maximum acceptable bid/ask spread, in binary-contract cents. */
  maxSpreadCents: 10,
  /** Minimum lifetime contract volume before liquidity stops warning. */
  minVolume: 1000,
  /** Minimum open interest before liquidity stops warning. */
  minOpenInterest: 100,
  /** Minimum expected edge, in binary-contract cents (= probability points). */
  minEdgeCents: 5,
  /** Minimum advisory confidence for paper-trade eligibility. */
  minConfidenceForPaperTrade: 'medium',
} as const;
