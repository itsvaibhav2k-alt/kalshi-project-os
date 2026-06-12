/**
 * Dossier composition for Phase 2 (pipeline stages 02-04 glued together).
 *
 * Pure and deterministic: no network, no LLM, no clock, no randomness —
 * `nowIso` is always injected by the caller (one timestamp per refresh).
 * This module is the enforced composition boundary: understanding parses,
 * research carries evidence, probability does the math, risk renders the
 * verdict, and the dossier only assembles their outputs. It never alters
 * a verdict or invents data.
 *
 * Phase 2 facts baked in here:
 * - The live research engine does not exist, so every brief is 'not_run'.
 * - No fair range is ever supplied, so fair probability stays null.
 * - No paper journal exists, so `hasWrittenThesis` is hard-coded false.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import { estimateProbability } from '@/lib/probability/estimate';
import { buildNotRunBrief } from '@/lib/research/buildResearchBrief';
import { evaluateTradeCandidate } from '@/lib/risk/evaluateTradeCandidate';
import { understandMarket } from '@/lib/understanding/understandMarket';

import type { EvaluationSummary, MarketDossier } from './types';

/**
 * Builds the complete read-only decision dossier for one market.
 *
 * Runs the Phase 2 pipeline stages in order — understand, research (not
 * run), probability, risk — and bundles their outputs without modification.
 *
 * @param market - The normalized market to derive the dossier from
 * @param nowIso - ISO 8601 timestamp supplied by the caller (keeps this pure)
 * @returns The dossier with all five sections and `source: 'derived'`
 */
export function buildMarketDossier(market: NormalizedMarket, nowIso: string): MarketDossier {
  const understanding = understandMarket(market);
  const researchBrief = buildNotRunBrief(market.id, nowIso);
  const probabilityEstimate = estimateProbability(market, researchBrief, nowIso);
  const riskEvaluation = evaluateTradeCandidate({
    market,
    understanding,
    research: researchBrief,
    probability: probabilityEstimate,
    hasWrittenThesis: false,
    evaluatedAt: nowIso,
  });

  return {
    market,
    understanding,
    researchBrief,
    probabilityEstimate,
    riskEvaluation,
    source: 'derived',
  };
}

/**
 * Derives dossiers for every market and tallies the pipeline counts.
 *
 * `researchSourced` counts briefs with status 'sourced', which is always 0
 * in Phase 2 because the live research engine does not exist — implied
 * probability is price math and is never counted as a research prediction.
 *
 * @param markets - The scanned normalized markets
 * @param nowIso - ISO 8601 timestamp supplied by the caller (one per refresh)
 * @returns Aggregate counts for the pipeline row
 */
export function summarizeEvaluations(
  markets: NormalizedMarket[],
  nowIso: string,
): EvaluationSummary {
  return markets.reduce<EvaluationSummary>(
    (summary, market) => {
      const dossier = buildMarketDossier(market, nowIso);
      const verdict = dossier.riskEvaluation.verdict;
      return {
        understood: summary.understood + 1,
        researchSourced:
          summary.researchSourced + (dossier.researchBrief.status === 'sourced' ? 1 : 0),
        evaluated: summary.evaluated + 1,
        skip: summary.skip + (verdict === 'SKIP' ? 1 : 0),
        watch: summary.watch + (verdict === 'WATCH' ? 1 : 0),
        paperTrade: summary.paperTrade + (verdict === 'PAPER_TRADE' ? 1 : 0),
      };
    },
    { understood: 0, researchSourced: 0, evaluated: 0, skip: 0, watch: 0, paperTrade: 0 },
  );
}
