/**
 * Dossier composition (pipeline stages 02-04 glued together).
 *
 * Pure and deterministic: no network, no LLM, no clock, no randomness —
 * `nowIso` is always injected by the caller (one timestamp per refresh).
 * This module is the enforced composition boundary: understanding parses,
 * research carries evidence, probability does the math, risk renders the
 * verdict, and the dossier only assembles their outputs. It never alters
 * a verdict or invents data.
 *
 * Two research paths exist:
 * - Without a persisted snapshot (null), the brief is 'not_run', no fair
 *   range exists, and the written-thesis flag is false — the original
 *   no-research path, byte-compatible with Phase 2 behavior.
 * - With a persisted snapshot (plain data supplied by the caller; this
 *   module performs no I/O), the brief is mapped from persisted state, the
 *   persisted fair range feeds the probability stage, and the thesis flag
 *   reflects a currently-valid ready thesis. The risk engine still applies
 *   every check unchanged.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import { estimateProbability } from '@/lib/probability/estimate';
import type { FairRange } from '@/lib/probability/estimate';
import { buildNotRunBrief } from '@/lib/research/buildResearchBrief';
import { evaluateTradeCandidate } from '@/lib/risk/evaluateTradeCandidate';
import { understandMarket } from '@/lib/understanding/understandMarket';

import { mapResearchState } from './mapResearchState';
import type { EvaluationSummary, MarketDossier, PersistedResearchSnapshot } from './types';

/** Extracts the persisted fair range, or undefined when any bound is null. */
function resolveFairRange(snapshot: PersistedResearchSnapshot): FairRange | undefined {
  if (snapshot.fairLow === null || snapshot.fairMid === null || snapshot.fairHigh === null) {
    return undefined;
  }
  return { low: snapshot.fairLow, mid: snapshot.fairMid, high: snapshot.fairHigh };
}

/**
 * Builds the complete read-only decision dossier for one market, optionally
 * consuming a persisted research snapshot.
 *
 * A null snapshot is the no-research path and behaves exactly like
 * `buildMarketDossier`. With a snapshot, persisted research flows into the
 * pipeline as advisory data only — the deterministic risk engine remains the
 * sole verdict authority, and a fair range without accepted sources is
 * discarded by the probability stage.
 *
 * @param market - The normalized market to derive the dossier from
 * @param snapshot - Persisted research snapshot as plain data, or null
 * @param nowIso - ISO 8601 timestamp supplied by the caller (keeps this pure)
 * @returns The dossier with all five sections and `source: 'derived'`
 */
export function buildMarketDossierWithResearch(
  market: NormalizedMarket,
  snapshot: PersistedResearchSnapshot | null,
  nowIso: string,
): MarketDossier {
  const understanding = understandMarket(market);
  const researchBrief =
    snapshot === null
      ? buildNotRunBrief(market.id, nowIso)
      : mapResearchState(market, snapshot, nowIso);
  const fairRange = snapshot === null ? undefined : resolveFairRange(snapshot);
  const probabilityEstimate = estimateProbability(market, researchBrief, nowIso, fairRange);
  const riskEvaluation = evaluateTradeCandidate({
    market,
    understanding,
    research: researchBrief,
    probability: probabilityEstimate,
    hasWrittenThesis: snapshot === null ? false : snapshot.hasReadyThesis,
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
 * Builds the complete read-only decision dossier for one market without
 * persisted research (the original no-research path).
 *
 * @param market - The normalized market to derive the dossier from
 * @param nowIso - ISO 8601 timestamp supplied by the caller (keeps this pure)
 * @returns The dossier with all five sections and `source: 'derived'`
 */
export function buildMarketDossier(market: NormalizedMarket, nowIso: string): MarketDossier {
  return buildMarketDossierWithResearch(market, null, nowIso);
}

/**
 * Derives dossiers for every market and tallies the pipeline counts.
 *
 * `researchSourced` counts briefs that mapped to status 'sourced', which
 * requires a persisted snapshot with at least one accepted source. Without
 * the optional snapshot map the count is always 0 — implied probability is
 * price math and is never counted as a research prediction.
 *
 * @param markets - The scanned normalized markets
 * @param nowIso - ISO 8601 timestamp supplied by the caller (one per refresh)
 * @param researchByTicker - Optional persisted research snapshots keyed by
 *   the market's external id (ticker)
 * @returns Aggregate counts for the pipeline row
 */
export function summarizeEvaluations(
  markets: NormalizedMarket[],
  nowIso: string,
  researchByTicker?: Readonly<Record<string, PersistedResearchSnapshot>>,
): EvaluationSummary {
  return markets.reduce<EvaluationSummary>(
    (summary, market) => {
      const snapshot = researchByTicker?.[market.externalId] ?? null;
      const dossier = buildMarketDossierWithResearch(market, snapshot, nowIso);
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
