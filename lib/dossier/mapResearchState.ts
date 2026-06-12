/**
 * Maps a persisted research snapshot to the engine's research brief shape.
 *
 * Pure and deterministic: no network, no clock, no randomness — `nowIso` is
 * injected by the caller. This mapper holds no verdict authority; it only
 * translates persisted state into an advisory input for the deterministic
 * risk engine.
 *
 * Mapping table (persisted brief state + accepted sources -> engine status):
 * - 'not_run'                                  -> 'not_run'
 * - 'insufficient_sources'                     -> 'unavailable'
 * - 'draft' / 'human_reviewed', 0 accepted     -> 'unavailable'
 * - 'draft' / 'human_reviewed', 1+ accepted    -> 'sourced'
 *
 * When full source records are present (selected market) they are
 * authoritative: only currently 'accepted' records flow through, and the
 * effective accepted count comes from them. When only the server-computed
 * count is available (bulk summaries), the source array is derived as
 * references to persisted research-store records — clearly titled as stored
 * record references, never fabricated citations.
 */

import type { NormalizedMarket } from '@/lib/markets/types';
import type { Confidence } from '@/lib/probability/types';
import type { ResearchBrief, ResearchSource, ResearchStatus } from '@/lib/research/types';

import type { PersistedResearchSnapshot, PersistedSourceSnapshot } from './types';

/** Standing caveat attached to every brief: research never decides. */
const ADVISORY_ONLY_NOTE =
  'Research output is advisory only; verdicts come solely from the deterministic risk engine.';

/** The no-evidence rule, stated the way the UI shows it. */
const NO_SOURCE_NOTE = 'No source = low confidence = SKIP.';

/** Caveat attached when sources are derived from the server-computed count. */
const STORED_RECORD_NOTE =
  'Source entries are references to records persisted in the research store; the count is server-computed.';

/** Maps one accepted persisted source record to the engine source shape. */
function mapSourceRecord(record: PersistedSourceSnapshot): ResearchSource {
  return {
    id: record.id,
    title: record.title,
    url: record.url ?? '',
    publisher: record.publisher ?? undefined,
    accessedAt: record.createdAt,
  };
}

/** Derives placeholder references to persisted records from the count alone. */
function deriveStoredRecordReferences(
  market: NormalizedMarket,
  count: number,
  nowIso: string,
): ResearchSource[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${market.id}:stored-source-${index + 1}`,
    title: `Stored source record ${index + 1} of ${count} (reference to a persisted research-store record, not a citation)`,
    url: '',
    accessedAt: nowIso,
  }));
}

/** Resolves the engine source list and the effective accepted count. */
function resolveSources(
  market: NormalizedMarket,
  snapshot: PersistedResearchSnapshot,
  nowIso: string,
): { sources: ResearchSource[]; acceptedCount: number; derivedFromCount: boolean } {
  if (snapshot.sources !== undefined) {
    const accepted = snapshot.sources.filter((record) => record.status === 'accepted');
    return {
      sources: accepted.map(mapSourceRecord),
      acceptedCount: accepted.length,
      derivedFromCount: false,
    };
  }
  const count = Math.max(0, Math.trunc(snapshot.acceptedSourceCount));
  return {
    sources: deriveStoredRecordReferences(market, count, nowIso),
    acceptedCount: count,
    derivedFromCount: true,
  };
}

/** Applies the mapping table to derive the engine research status. */
function deriveStatus(snapshot: PersistedResearchSnapshot, acceptedCount: number): ResearchStatus {
  if (snapshot.briefState === 'not_run') {
    return 'not_run';
  }
  if (snapshot.briefState === 'insufficient_sources' || acceptedCount < 1) {
    return 'unavailable';
  }
  return 'sourced';
}

/** Honest evidence summary for each mapped status. */
function buildEvidenceSummary(
  snapshot: PersistedResearchSnapshot,
  status: ResearchStatus,
  acceptedCount: number,
): string {
  if (status === 'not_run') {
    return 'No manual research brief exists for this market.';
  }
  if (status === 'unavailable') {
    return 'Research is incomplete: no accepted sources back this market.';
  }
  const briefLabel =
    snapshot.briefState === 'human_reviewed' ? 'human-reviewed brief' : 'manual draft brief';
  return `${acceptedCount} accepted source record(s) back a ${briefLabel}.`;
}

/**
 * Maps the persisted research snapshot for one market to a `ResearchBrief`.
 *
 * The mapped brief's `marketId` is the internal market id (`kalshi:<ticker>`),
 * not the store's ticker key. Confidence is forced to 'low' unless the
 * mapped status is 'sourced' — no source = low confidence, no exceptions.
 *
 * @param market - The normalized market the snapshot belongs to
 * @param snapshot - Plain-data persisted research snapshot
 * @param nowIso - ISO 8601 timestamp supplied by the caller (keeps this pure)
 * @returns The advisory research brief for the risk pipeline
 */
export function mapResearchState(
  market: NormalizedMarket,
  snapshot: PersistedResearchSnapshot,
  nowIso: string,
): ResearchBrief {
  const { sources, acceptedCount, derivedFromCount } = resolveSources(market, snapshot, nowIso);
  const status = deriveStatus(snapshot, acceptedCount);
  const sourced = status === 'sourced';

  const confidence: Confidence = sourced ? snapshot.confidence : 'low';
  const mappedSources = sourced ? sources : [];

  const advisoryNotes: string[] = [];
  if (mappedSources.length === 0) {
    advisoryNotes.push(NO_SOURCE_NOTE);
  }
  if (sourced && derivedFromCount) {
    advisoryNotes.push(STORED_RECORD_NOTE);
  }
  advisoryNotes.push(ADVISORY_ONLY_NOTE);

  const noSourceReason = sourced
    ? undefined
    : status === 'not_run'
      ? 'Research has not been run: no persisted brief exists for this market.'
      : 'No accepted sources exist; persisted research is treated as unavailable.';

  return {
    marketId: market.id,
    status,
    createdAt: nowIso,
    evidenceSummary: buildEvidenceSummary(snapshot, status, acceptedCount),
    counterarguments: [],
    sources: mappedSources,
    confidence,
    noSourceReason,
    advisoryNotes,
  };
}
