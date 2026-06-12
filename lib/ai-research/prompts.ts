/**
 * Prompt constants for advisory AI research drafts (Phase 5).
 *
 * Shared by the deterministic fallback provider today and by any future
 * human-approved provider. All text here is advisory posture and section
 * scaffolding — it can never approve anything; the deterministic risk engine
 * alone issues verdicts.
 */

import type { AiResearchDraftType } from '@/lib/research-store/types';

/** Version label recorded on every draft generated from these templates. */
export const PROMPT_VERSION = 'phase5.v1';

/**
 * System posture for every draft, real or fallback. One line of the brief's
 * posture text was adapted for the repository safety-token scan; every other
 * line is verbatim.
 */
export const SYSTEM_POSTURE =
  'You are a skeptical event-market research analyst for a paper-only research OS.\n' +
  'You do not approve trades.\n' +
  'You do not recommend real-money action.\n' +
  'You do not create or request any marketplace transaction.\n' +
  'You identify what must be verified by a human.\n' +
  'If evidence is missing, say so.\n' +
  'No source = low confidence.\n' +
  'Ambiguous resolution = SKIP.\n' +
  'Your output is advisory draft material outside the deterministic risk path.';

/**
 * Section headings for each draft kind, in display sequence. The fallback
 * provider renders exactly these headings; future providers should follow the
 * same skeletons so drafts stay comparable across providers.
 */
export const DRAFT_SECTIONS: Record<AiResearchDraftType, readonly string[]> = {
  research_questions: [
    'Resolution mechanics',
    'Official source of truth',
    'Measurement ambiguity',
    'Base rates and historical data',
    'Market microstructure issues',
    'Missing information',
    'What would make this SKIP?',
  ],
  source_checklist: [
    'Required official settlement source',
    'Supporting data source',
    'Historical / base-rate source',
    'Contrary evidence source',
    'Ambiguity-resolution source',
    'Timeliness / freshness check',
  ],
  brief_draft: [
    'Summary',
    'YES case',
    'NO case',
    'Key evidence',
    'Uncertainties',
    'Missing info',
    'Confidence caveat',
  ],
  thesis_critique: [
    'Strongest part of the thesis',
    'Weakest assumption',
    'Missing source',
    'Ambiguity risk',
    'Edge-quality critique',
    'Confidence critique',
    'Falsification test',
    'Suggested human edits',
  ],
  missing_info: [
    'Current state of the dossier',
    'Missing research inputs',
    'Risk blockers to resolve',
    'Suggested next verification steps',
  ],
  skeptical_countercase: [
    'Why the apparent edge may be fake',
    'What the market may already know',
    'Why the resolution could be ambiguous',
    'Why liquidity or spread could erase the edge',
    'What evidence would change the view',
    'Why SKIP may still be best',
  ],
};

/** Human-readable label for each draft kind, used in titles and metadata. */
export const DRAFT_TYPE_LABELS: Record<AiResearchDraftType, string> = {
  research_questions: 'research questions',
  source_checklist: 'source checklist',
  brief_draft: 'brief draft',
  thesis_critique: 'thesis critique',
  missing_info: 'missing-info analysis',
  skeptical_countercase: 'skeptical countercase',
};
