/**
 * Pure paper-journal eligibility (Phase 4).
 *
 * Data-in/data-out over an already-composed dossier: no database, no fetch,
 * no clock, no environment reads, and no judgment of its own. The verdict is
 * read from the deterministic risk evaluation — never recomputed, never
 * overridden. This module can only ever say "locked" more often than the
 * risk engine, not less.
 */

import type { MarketDossier } from '@/lib/dossier/types';

import type { PaperEligibility } from './types';

/** Blocker recorded when the market has no current YES ask to price against. */
export const MISSING_YES_ASK_BLOCKER =
  'No current YES ask price is available, so a paper decision cannot be priced.';

/**
 * Evaluates whether a dossier currently permits logging a paper decision.
 *
 * Eligible only when the deterministic verdict is PAPER_TRADE AND the market
 * has a current YES ask (the paper price always comes from the live YES ask,
 * never the last traded price). Blockers are the risk evaluation's reasons
 * plus an explicit missing-ask blocker when no YES ask exists.
 *
 * @param dossier - The composed read-only dossier for one market.
 * @returns Eligibility, the verdict it derives from, and any blockers.
 */
export function evaluatePaperEligibility(dossier: MarketDossier): PaperEligibility {
  const verdict = dossier.riskEvaluation.verdict;
  const hasYesAsk = dossier.market.yesAskCents !== null;

  const blockers = hasYesAsk
    ? [...dossier.riskEvaluation.reasons]
    : [...dossier.riskEvaluation.reasons, MISSING_YES_ASK_BLOCKER];

  return {
    eligible: verdict === 'PAPER_TRADE' && hasYesAsk,
    verdict,
    blockers,
  };
}
