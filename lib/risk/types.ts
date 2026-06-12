/**
 * Risk-engine types for Phase 2 (pipeline stage 04 Validate / Risk).
 *
 * The risk engine is the only authority for verdicts. It is deterministic:
 * hard-coded rules over caller-supplied inputs. No network, no language
 * model, no clock — `evaluatedAt` is always injected by the caller.
 *
 * REAL_TRADE_ELIGIBLE_LATER exists in the design but is deliberately NOT
 * representable here: the verdict type can only express the three Training
 * Wheels outcomes. Unlocking real trading requires a future human-approved
 * phase and a DECISION_LOG entry, not a type change in passing.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import type { ProbabilityEstimate } from '@/lib/probability/types';
import type { ResearchBrief } from '@/lib/research/types';
import type { ContractUnderstanding } from '@/lib/understanding/types';

/** The only verdicts Training Wheels mode can express. PAPER_TRADE is eligibility only. */
export type RiskVerdict = 'SKIP' | 'WATCH' | 'PAPER_TRADE';

/** Outcome of a single deterministic check. */
export type RiskCheckStatus = 'pass' | 'fail' | 'warn' | 'not_applicable';

/** Stable identifiers for the twelve ordered checks. */
export type RiskCheckId =
  | 'paper_only_mode'
  | 'resolution_clarity'
  | 'settlement_source'
  | 'max_spread'
  | 'volume'
  | 'liquidity'
  | 'research_sources'
  | 'confidence'
  | 'fair_probability'
  | 'min_edge'
  | 'written_thesis'
  | 'real_trading_locked';

/** Result of one deterministic check, with a human-readable explanation. */
export interface RiskCheckResult {
  /** Stable check identifier. */
  id: RiskCheckId;
  /** Short human-readable check name for display. */
  label: string;
  /** Outcome of the check. */
  status: RiskCheckStatus;
  /** Plain-English explanation of why the check passed, failed, or warned. */
  reason: string;
}

/**
 * Complete record of one risk evaluation: every check, the verdict, and the
 * reasons. `mode` and `realTradingLocked` are literal so an evaluation can
 * never claim anything other than locked Training Wheels operation.
 */
export interface RiskEvaluation {
  /** Internal market id this evaluation belongs to. */
  marketId: string;
  /** ISO 8601 timestamp supplied by the caller (never read from a clock). */
  evaluatedAt: string;
  /** The deterministic verdict. Default is SKIP. */
  verdict: RiskVerdict;
  /** Every check that ran, in order, with its outcome. */
  checks: RiskCheckResult[];
  /** Human-readable reasons from every failed or warned check. */
  reasons: string[];
  /** Operating mode; Phase 2 is always Training Wheels. */
  mode: 'training_wheels';
  /** Real trading is locked; no evaluation can say otherwise. */
  realTradingLocked: true;
}

/**
 * Everything the engine needs to evaluate one market. All inputs are
 * advisory products of earlier pipeline stages; only this engine turns
 * them into a verdict.
 */
export interface RiskCandidate {
  /** Normalized market snapshot (prices, volume, spread). */
  market: NormalizedMarket;
  /** Deterministic contract reading (clarity, settlement source). */
  understanding: ContractUnderstanding;
  /** Advisory research brief (sources, confidence). */
  research: ResearchBrief;
  /** Advisory probability estimate (implied, fair, edge). */
  probability: ProbabilityEstimate;
  /** Whether a written thesis is attached. Phase 2 live is always false. */
  hasWrittenThesis: boolean;
  /** ISO 8601 evaluation timestamp supplied by the caller. */
  evaluatedAt: string;
}
