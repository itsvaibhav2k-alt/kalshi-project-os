/**
 * Shared mapping from a per-ticker research state response to the dossier
 * snapshot DTO (Phase 4).
 *
 * Used by both the client page and the paper-journal POST handler so client
 * and server compose dossiers identically. Importing dossier types from the
 * store is allowed; the dossier layer must never import from the store.
 * Probabilities stay fractions in [0, 1]; fair values flow only while the
 * server-recomputed summary still vouches for them.
 */

import type {
  PersistedResearchSnapshot,
  PersistedSettlementVerificationSnapshot,
} from '@/lib/dossier/types';

import type { ResearchStateResponse, VerifiedSettlementSummary } from './types';

/**
 * Maps the active verified settlement summary into the dossier's structural
 * snapshot shape. The summary exists only for a record whose current status
 * is 'human_verified', so the status literal is fixed here.
 */
function toSettlementVerification(
  verified: VerifiedSettlementSummary,
): PersistedSettlementVerificationSnapshot {
  return {
    id: verified.id,
    title: verified.title,
    url: verified.url,
    publisher: verified.publisher,
    authorityType: verified.authorityType,
    status: 'human_verified',
    updatedAt: verified.updatedAt,
  };
}

/**
 * Converts the per-ticker research state into the dossier snapshot DTO.
 *
 * Fair values flow only when the server-recomputed summary still vouches for
 * them; full source records ride along for the selected market; the active
 * verified settlement record maps into `settlementVerification` (null when
 * none exists, including responses from servers predating Phase 4).
 *
 * @param state - The full per-ticker research state response
 * @returns The plain-data snapshot the dossier layer consumes
 */
export function toPersistedResearchSnapshot(
  state: ResearchStateResponse,
): PersistedResearchSnapshot {
  const verified = state.summary.verifiedSettlementSource ?? null;
  const estimate = state.summary.hasFairProbability ? state.probabilityEstimate : null;
  return {
    acceptedSourceCount: state.summary.acceptedSourceCount,
    briefState: state.brief === null ? 'not_run' : state.brief.state,
    confidence: state.summary.researchConfidence,
    fairLow: estimate === null ? null : estimate.low,
    fairMid: estimate === null ? null : estimate.mid,
    fairHigh: estimate === null ? null : estimate.high,
    hasReadyThesis: state.summary.hasReadyThesis,
    sources: state.sources,
    settlementVerification: verified === null ? null : toSettlementVerification(verified),
  };
}
