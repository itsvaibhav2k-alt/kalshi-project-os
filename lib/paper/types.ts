/**
 * Paper decision journal types (Phase 4).
 *
 * Paper entries are simulated decision snapshots only. Nothing in this module
 * touches money, marketplaces, or execution: eligibility is a pure read of an
 * already-computed dossier, and the deterministic risk engine remains the only
 * verdict authority. V1 Training Wheels mode stays paper-only.
 */

import type { RiskVerdict } from '@/lib/risk/types';

/**
 * Whether one market's dossier currently permits logging a paper decision.
 *
 * `eligible` is true only when the deterministic verdict is PAPER_TRADE AND a
 * current YES ask price exists to record as the simulated paper price.
 * `blockers` lists every human-readable reason the journal stays locked.
 */
export interface PaperEligibility {
  /** True only for verdict PAPER_TRADE with a current YES ask available. */
  eligible: boolean;
  /** The deterministic risk verdict the eligibility was derived from. */
  verdict: RiskVerdict;
  /** Human-readable reasons logging is locked; empty when eligible. */
  blockers: string[];
}
