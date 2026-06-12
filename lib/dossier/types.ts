/**
 * Dossier types (composition of pipeline stages 02-04).
 *
 * A dossier is read-only glue: it bundles the outputs of the understanding,
 * research, probability, and risk stages for one market so the UI can render
 * a single decision document. The dossier layer adds no judgment of its own —
 * verdicts come only from the deterministic risk engine.
 *
 * This module stays pure and structurally decoupled: it imports nothing from
 * the persisted research store. Persisted research enters as the plain-data
 * `PersistedResearchSnapshot` DTO below, supplied by the caller.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import type { Confidence, ProbabilityEstimate } from '@/lib/probability/types';
import type { ResearchBrief } from '@/lib/research/types';
import type { RiskEvaluation } from '@/lib/risk/types';
import type { ContractUnderstanding } from '@/lib/understanding/types';

/**
 * Brief lifecycle states the persisted research store can report.
 *
 * Defined locally as a structural copy of the store's `BriefState` union so
 * this module never imports from the research store. Human-typed content is
 * never labeled AI research.
 */
export type PersistedBriefState = 'not_run' | 'insufficient_sources' | 'draft' | 'human_reviewed';

/**
 * Minimal structural view of one persisted source record.
 *
 * Mirrors the `ResearchLike` precedent: the store's full `MarketSourceRecord`
 * satisfies this shape structurally. Only records whose `status` is
 * 'accepted' flow into the research engine's source list.
 */
export interface PersistedSourceSnapshot {
  /** Stable id of the persisted source record. */
  id: string;
  /** Human-entered title of the source. */
  title: string;
  /** Source URL, or null when none was recorded. */
  url: string | null;
  /** Publishing organization, or null when none was recorded. */
  publisher: string | null;
  /** Review status; only 'accepted' counts toward research. */
  status: string;
  /** ISO 8601 creation timestamp of the persisted record. */
  createdAt: string;
}

/**
 * Plain-data snapshot of the persisted research state for one market.
 *
 * Built by the caller from the research API responses and passed in as data —
 * the dossier layer performs no I/O. Probabilities are fractions in [0, 1].
 * All flags and counts are server-recomputed against current rows by the
 * research store, so a decayed thesis or rejected source is already reflected
 * here. `sources` is populated only for the selected market (from the
 * per-ticker response); bulk summaries deliberately omit it.
 */
export interface PersistedResearchSnapshot {
  /** Server-computed count of currently accepted sources. */
  acceptedSourceCount: number;
  /** Lifecycle state of the latest persisted brief ('not_run' when none). */
  briefState: PersistedBriefState;
  /** Research confidence; the store forces 'low' without accepted sources. */
  confidence: Confidence;
  /** Lower bound of the persisted fair range as a fraction, or null. */
  fairLow: number | null;
  /** Midpoint of the persisted fair range as a fraction, or null. */
  fairMid: number | null;
  /** Upper bound of the persisted fair range as a fraction, or null. */
  fairHigh: number | null;
  /** True only for a currently-valid active ready-for-risk thesis. */
  hasReadyThesis: boolean;
  /** Full source records for the selected market; absent in bulk summaries. */
  sources?: readonly PersistedSourceSnapshot[];
}

/**
 * Complete decision dossier for one market.
 *
 * `source` is always 'derived': every section is computed from the
 * normalized market snapshot plus, when present, a persisted research
 * snapshot supplied as plain data. The dossier itself is never stored.
 */
export interface MarketDossier {
  /** The normalized market snapshot the dossier was derived from. */
  market: NormalizedMarket;
  /** Deterministic contract reading (stage 02 Understand). */
  understanding: ContractUnderstanding;
  /**
   * Advisory research brief. 'not_run' when no persisted research exists;
   * otherwise mapped from the persisted snapshot ('sourced' only with at
   * least one accepted source, 'unavailable' when research is incomplete).
   */
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
 * Predict shows `researchSourced` (markets whose persisted research maps to a
 * 'sourced' brief — at least one accepted source; implied probability alone
 * is price math and never counts), 04 Validate / Risk shows `evaluated` with
 * the verdict breakdown.
 */
export interface EvaluationSummary {
  /** Markets run through deterministic contract understanding. */
  understood: number;
  /**
   * Briefs with status 'sourced'. Zero when no persisted research snapshots
   * are supplied; counts markets with at least one accepted source otherwise.
   */
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
