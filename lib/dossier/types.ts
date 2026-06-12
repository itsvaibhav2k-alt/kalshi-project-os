/**
 * Dossier types for Phase 2 (composition of pipeline stages 02-04).
 *
 * A dossier is read-only glue: it bundles the outputs of the understanding,
 * research, probability, and risk stages for one market so the UI can render
 * a single decision document. The dossier layer adds no judgment of its own —
 * verdicts come only from the deterministic risk engine.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import type { ProbabilityEstimate } from '@/lib/probability/types';
import type { ResearchBrief } from '@/lib/research/types';
import type { RiskEvaluation } from '@/lib/risk/types';
import type { ContractUnderstanding } from '@/lib/understanding/types';

/**
 * Complete decision dossier for one market.
 *
 * `source` is always 'derived': every section is computed client-side from
 * the normalized market snapshot. Nothing here is persisted or fetched.
 */
export interface MarketDossier {
  /** The normalized market snapshot the dossier was derived from. */
  market: NormalizedMarket;
  /** Deterministic contract reading (stage 02 Understand). */
  understanding: ContractUnderstanding;
  /** Advisory research brief; always 'not_run' in Phase 2 live. */
  researchBrief: ResearchBrief;
  /** Advisory probability estimate (implied price math only in Phase 2). */
  probabilityEstimate: ProbabilityEstimate;
  /** The deterministic risk verdict and its full check record. */
  riskEvaluation: RiskEvaluation;
  /** Provenance marker: dossiers are always derived, never stored. */
  source: 'derived';
}

/**
 * Aggregate pipeline counts across one scanned market list.
 *
 * Used by the pipeline row: 02 Understand shows `understood`, 03 Research /
 * Predict shows `researchSourced` (always 0 in Phase 2 — implied probability
 * is price math, not a research prediction), 04 Validate / Risk shows
 * `evaluated` with the verdict breakdown.
 */
export interface EvaluationSummary {
  /** Markets run through deterministic contract understanding. */
  understood: number;
  /** Briefs with status 'sourced'; always 0 in Phase 2 (research not run). */
  researchSourced: number;
  /** Markets evaluated by the risk engine. */
  evaluated: number;
  /** Evaluations with verdict SKIP. */
  skip: number;
  /** Evaluations with verdict WATCH. */
  watch: number;
  /** Evaluations with verdict PAPER_TRADE (eligibility only, no journal). */
  paperTrade: number;
}
