/**
 * Research-brief types for Phase 2 (pipeline stage 03 Research / Predict).
 *
 * Research output is ADVISORY ONLY. It informs the human and feeds the
 * deterministic risk engine as an input, but it never carries verdict
 * authority — verdicts come only from `lib/risk`. No source means low
 * confidence, always; missing evidence is reported honestly, never invented.
 */

import type { Confidence } from '@/lib/probability/types';

/** Re-exported for convenience so research callers need one import. */
export type { Confidence } from '@/lib/probability/types';

/**
 * Lifecycle state of research for a market.
 *
 * - 'not_run' — the research engine has not been executed (Phase 2 default).
 * - 'sourced' — live research ran and produced real, cited sources.
 * - 'fixture' — synthetic research injected for tests; never live evidence.
 * - 'unavailable' — research ran but no usable evidence could be obtained.
 */
export type ResearchStatus = 'not_run' | 'sourced' | 'fixture' | 'unavailable';

/** One cited piece of evidence. Never fabricated — real or absent. */
export interface ResearchSource {
  /** Stable identifier for cross-referencing from other modules. */
  id: string;
  /** Title of the cited document or page. */
  title: string;
  /** URL where the source was accessed. */
  url: string;
  /** Publishing organization, when known. */
  publisher?: string;
  /** ISO 8601 timestamp of when the source was accessed (caller-supplied). */
  accessedAt: string;
  /** Short verbatim quote supporting the evidence summary, when available. */
  quote?: string;
}

/**
 * Advisory research brief for one market.
 *
 * A brief is never a verdict input authority: the deterministic risk engine
 * alone decides SKIP / WATCH / PAPER_TRADE. A brief with no sources must
 * carry low confidence — no source = low confidence, no exceptions.
 */
export interface ResearchBrief {
  /** Internal market id this brief belongs to. */
  marketId: string;
  /** Lifecycle state of this research. */
  status: ResearchStatus;
  /** ISO 8601 creation timestamp (caller-supplied, keeps builders pure). */
  createdAt: string;
  /** Honest summary of gathered evidence, or of its absence. */
  evidenceSummary: string;
  /** Reasons the thesis could be wrong; empty when none were gathered. */
  counterarguments: string[];
  /** Cited sources backing the summary (empty means no evidence). */
  sources: ResearchSource[];
  /** Advisory confidence; forced to 'low' whenever sources are empty. */
  confidence: Confidence;
  /** Why no sources exist, when they do not. */
  noSourceReason?: string;
  /** Standing caveats, e.g. advisory-only and fixture labels. */
  advisoryNotes: string[];
}
