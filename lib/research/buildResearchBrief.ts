/**
 * Research-brief builders for Phase 2 (pipeline stage 03 Research / Predict).
 *
 * Pure and deterministic: no network, no LLM, no clock — `createdAt` is
 * always injected by the caller. Phase 2 ships NO live research engine, so
 * the live app only ever builds 'not_run' briefs; 'fixture' briefs exist
 * solely for tests and are labeled as such. Citations are never fabricated:
 * a brief either carries real caller-supplied sources or an empty list.
 */

import type { Confidence, ResearchBrief, ResearchSource } from './types';

/** Standing caveat attached to every brief: research never decides. */
const ADVISORY_ONLY_NOTE =
  'Research output is advisory only; verdicts come solely from the deterministic risk engine.';

/** The no-evidence rule, stated the way the UI shows it. */
const NO_SOURCE_NOTE = 'No source = low confidence = SKIP.';

/** Label that must accompany any fixture brief so it is never mistaken for evidence. */
const FIXTURE_LABEL =
  'FIXTURE: synthetic research brief for tests only — never live evidence.';

/** Synthetic research inputs a test supplies to build a fixture brief. */
export interface ResearchFixture {
  evidenceSummary: string;
  counterarguments: string[];
  sources: ResearchSource[];
  confidence: Confidence;
}

/**
 * Builds the Phase 2 default brief: research has not been run.
 *
 * Honest about its emptiness — no sources, no evidence, low confidence,
 * and an explicit reason explaining the engine does not exist yet.
 *
 * @param marketId - Internal market id the brief belongs to
 * @param createdAt - ISO 8601 timestamp supplied by the caller
 * @returns A 'not_run' brief with empty sources and low confidence
 */
export function buildNotRunBrief(marketId: string, createdAt: string): ResearchBrief {
  return {
    marketId,
    status: 'not_run',
    createdAt,
    evidenceSummary:
      'No evidence was gathered. Research has not been run for this market.',
    counterarguments: [],
    sources: [],
    confidence: 'low',
    noSourceReason:
      'The live research engine is not implemented in Phase 2 and research has not been run for this market.',
    advisoryNotes: [NO_SOURCE_NOTE, ADVISORY_ONLY_NOTE],
  };
}

/**
 * Builds an explicitly labeled fixture brief for tests.
 *
 * Never used by the live app. The fixture label is always present in
 * `advisoryNotes`, and an empty source list forces confidence to 'low'
 * regardless of what the fixture claims — no source = low confidence.
 *
 * @param marketId - Internal market id the brief belongs to
 * @param createdAt - ISO 8601 timestamp supplied by the caller
 * @param fixture - Synthetic evidence, counterarguments, sources, confidence
 * @returns A 'fixture' brief labeled as test-only synthetic research
 */
export function buildFixtureBrief(
  marketId: string,
  createdAt: string,
  fixture: ResearchFixture,
): ResearchBrief {
  const hasSources = fixture.sources.length > 0;
  const confidence: Confidence = hasSources ? fixture.confidence : 'low';
  const advisoryNotes = hasSources
    ? [FIXTURE_LABEL, ADVISORY_ONLY_NOTE]
    : [FIXTURE_LABEL, NO_SOURCE_NOTE, ADVISORY_ONLY_NOTE];

  return {
    marketId,
    status: 'fixture',
    createdAt,
    evidenceSummary: fixture.evidenceSummary,
    counterarguments: [...fixture.counterarguments],
    sources: [...fixture.sources],
    confidence,
    advisoryNotes,
  };
}
