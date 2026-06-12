/**
 * Settlement-verification overlay (Phase 4, pure dossier composition).
 *
 * The deterministic understanding can never emit `settlementSourceStatus:
 * 'provided'` from the market payload alone — listed settlement text stays
 * 'unverified'. This overlay is the only path that flips it, and only when a
 * human-verified settlement record exists for the market. It is pure plain-
 * data composition: no DB, no fetch, no env, no clock, and no judgment — the
 * deterministic risk engine remains the sole verdict authority, and the
 * overlay never touches resolution clarity or ambiguity flags.
 */

import type { ContractUnderstanding } from '@/lib/understanding/types';

import type { PersistedSettlementVerificationSnapshot } from './types';

/** Note appended to the understanding when the overlay applies. */
const VERIFICATION_NOTE = 'Settlement source provided by local human verification record.';

/** Compact display label for the verified resolution authority. */
function buildSettlementLabel(verification: PersistedSettlementVerificationSnapshot): string {
  const detail = verification.url ?? verification.publisher;
  return detail === null ? verification.title : `${verification.title} — ${detail}`;
}

/**
 * Applies a human-verified settlement record to a contract understanding.
 *
 * Anything other than a record with status 'human_verified' (including null,
 * undefined, drafts, and rejected records) returns the input unchanged — the
 * same reference, with no mutation. A verified record returns a NEW object
 * with `settlementSourceStatus: 'provided'`, a compact settlement label,
 * 'settlementSource' removed from `missingFields`, and an appended
 * interpretation note. `resolutionClarity` and `ambiguityFlags` are never
 * altered; an ambiguous contract still fails its own risk check.
 *
 * @param understanding - The deterministic contract understanding
 * @param verification - The persisted settlement-verification snapshot, if any
 * @returns The input unchanged, or a new overlaid understanding
 */
export function applySettlementVerification(
  understanding: ContractUnderstanding,
  verification: PersistedSettlementVerificationSnapshot | null | undefined,
): ContractUnderstanding {
  if (verification === null || verification === undefined) {
    return understanding;
  }
  if (verification.status !== 'human_verified') {
    return understanding;
  }

  return {
    ...understanding,
    settlementSource: buildSettlementLabel(verification),
    settlementSourceStatus: 'provided',
    missingFields: understanding.missingFields.filter((field) => field !== 'settlementSource'),
    interpretationNotes: [...understanding.interpretationNotes, VERIFICATION_NOTE],
  };
}
