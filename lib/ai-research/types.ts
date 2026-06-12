/**
 * Advisory AI research draft generation types (Phase 5).
 *
 * Everything in this module sits OUTSIDE the deterministic risk path. A
 * generated draft is reading material for human review: it is never a
 * verdict, never satisfies a risk check, never promotes a source, brief,
 * thesis, or settlement record, and never creates a paper entry. The
 * deterministic risk engine alone issues verdicts.
 */

import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import type { AiResearchDraftType, ResearchStateResponse } from '@/lib/research-store/types';

/**
 * Everything a provider needs to generate one advisory draft. All inputs are
 * plain data composed by the caller; `nowIso` is always injected so providers
 * never read a clock.
 */
export interface AiResearchDraftInput {
  /** Which of the six advisory draft kinds to generate. */
  draftType: AiResearchDraftType;
  /** Normalized market snapshot the draft is about. */
  market: NormalizedMarket;
  /** Composed read-only dossier (understanding, research, probability, risk mirror). */
  dossier: MarketDossier;
  /** Full persisted research state for the market, as plain data. */
  researchState: ResearchStateResponse;
  /** Optional human-entered focus text; context only, never treated as fact. */
  userFocus: string | null;
  /** ISO 8601 timestamp supplied by the caller (never read from a clock). */
  nowIso: string;
}

/**
 * One generated advisory draft. `outputMarkdown` is rendered as plain text
 * downstream — never as HTML — and carries no verdict, stake, or PnL field.
 */
export interface AiResearchDraftResult {
  /** Provider label, e.g. 'local_deterministic'. */
  provider: string;
  /** Model label, e.g. 'phase5_fallback'. */
  model: string;
  /** Prompt template version the draft was generated with. */
  promptVersion: string;
  /** Generated draft body in markdown. */
  outputMarkdown: string;
  /** Optional structured payload; null for every kind in Phase 5. */
  outputJson: string | null;
}

/**
 * Provider abstraction for advisory draft generation. Implementations must
 * treat the input as the complete world: no invented facts, and every absent
 * input labeled as missing rather than filled in.
 */
export interface AiResearchProvider {
  /** Generates one advisory draft from the supplied state. */
  generateDraft(input: AiResearchDraftInput): Promise<AiResearchDraftResult>;
}
