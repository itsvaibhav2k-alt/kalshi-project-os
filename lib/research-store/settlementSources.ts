import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  SettlementAuthorityType,
  SettlementSourceRecord,
  SettlementSourceRow,
  SettlementVerificationStatus,
  StoreResult,
  VerifiedSettlementSummary,
} from './types';
import { validateSettlementSourceInput } from './validation';

/**
 * CRUD for market_settlement_sources (Phase 4 settlement verification).
 *
 * A settlement-source record names the resolution authority a human checked
 * for one market. Research sources never verify settlement; only a record
 * here with status 'human_verified' counts, and even then it is plain data —
 * the deterministic risk engine alone issues verdicts. Records are never
 * deleted: reject instead. All timestamps are injected (nowIso); this module
 * never reads a clock or the environment.
 */

/** Input for creating a settlement-source record. Status defaults to 'draft'. */
export interface CreateSettlementSourceInput {
  marketId: string;
  title: string;
  url?: string | null;
  publisher?: string | null;
  authorityType?: SettlementAuthorityType | null;
  status?: SettlementVerificationStatus;
  notes?: string | null;
  verificationRationale?: string | null;
}

/** Mutable fields of a settlement-source record. Absent fields keep their values. */
export interface UpdateSettlementSourcePatch {
  title?: string;
  url?: string | null;
  publisher?: string | null;
  authorityType?: SettlementAuthorityType | null;
  status?: SettlementVerificationStatus;
  notes?: string | null;
  verificationRationale?: string | null;
}

function rowToRecord(row: SettlementSourceRow): SettlementSourceRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    marketId: row.market_id,
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    authorityType: row.authority_type,
    status: row.status,
    notes: row.notes,
    verificationRationale: row.verification_rationale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSettlementSourceRow(
  db: Database.Database,
  settlementSourceId: string,
): SettlementSourceRow | undefined {
  return db
    .prepare('SELECT * FROM market_settlement_sources WHERE id = ?')
    .get(settlementSourceId) as SettlementSourceRow | undefined;
}

function checkRecord(candidate: SettlementSourceRecord): StoreResult<null> {
  const validation = validateSettlementSourceInput({
    title: candidate.title,
    url: candidate.url,
    authorityType: candidate.authorityType,
    status: candidate.status,
    verificationRationale: candidate.verificationRationale,
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, value: null };
}

/**
 * Inserts a new settlement-source record. Status defaults to 'draft'; the
 * merged candidate is re-checked with the strict validator (defense in depth
 * on top of route-boundary validation), so a 'human_verified' record can only
 * be created with a valid url, authorityType, and verificationRationale.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the record belongs to.
 * @param input - Record fields; status defaults to 'draft'.
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns Ok with the persisted record, or the validation errors.
 */
export function createSettlementSource(
  db: Database.Database,
  ticker: string,
  input: CreateSettlementSourceInput,
  nowIso: string,
): StoreResult<SettlementSourceRecord> {
  const candidate: SettlementSourceRecord = {
    id: randomUUID(),
    marketTicker: ticker,
    marketId: input.marketId,
    title: input.title,
    url: input.url ?? null,
    publisher: input.publisher ?? null,
    authorityType: input.authorityType ?? null,
    status: input.status ?? 'draft',
    notes: input.notes ?? null,
    verificationRationale: input.verificationRationale ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const check = checkRecord(candidate);
  if (!check.ok) {
    return { ok: false, errors: check.errors };
  }

  db.prepare(
    `INSERT INTO market_settlement_sources
       (id, market_ticker, market_id, title, url, publisher, authority_type,
        status, notes, verification_rationale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    candidate.id,
    candidate.marketTicker,
    candidate.marketId,
    candidate.title,
    candidate.url,
    candidate.publisher,
    candidate.authorityType,
    candidate.status,
    candidate.notes,
    candidate.verificationRationale,
    candidate.createdAt,
    candidate.updatedAt,
  );

  return { ok: true, value: candidate };
}

/**
 * Lists every settlement-source record for a market as an audit trail,
 * sorted by created_at ascending with insertion sequence as the tiebreak.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to list records for.
 * @returns Settlement-source records, earliest first.
 */
export function listSettlementSources(
  db: Database.Database,
  ticker: string,
): SettlementSourceRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM market_settlement_sources WHERE market_ticker = ?
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all(ticker) as SettlementSourceRow[];
  return rows.map(rowToRecord);
}

/**
 * Returns a settlement-source record by id, regardless of status or ticker.
 * Callers enforcing a route's ticker scope must compare marketTicker
 * themselves.
 *
 * @param db - Open research-store database handle.
 * @param settlementSourceId - Record id to look up.
 * @returns The record, or null when the id does not exist.
 */
export function getSettlementSourceById(
  db: Database.Database,
  settlementSourceId: string,
): SettlementSourceRecord | null {
  const row = getSettlementSourceRow(db, settlementSourceId);
  return row === undefined ? null : rowToRecord(row);
}

/**
 * Updates the mutable fields of a settlement-source record. The merged result
 * is re-checked with the strict validator, so any transition into
 * 'human_verified' must carry a valid url, authorityType, and
 * verificationRationale or nothing is written. There is no delete; rejecting
 * keeps the row as an audit trail.
 *
 * @param db - Open research-store database handle.
 * @param settlementSourceId - Id of the record to update.
 * @param patch - Field changes; absent fields keep their stored values.
 * @param nowIso - Injected ISO timestamp for updated_at.
 * @returns Null when the id does not exist; otherwise ok with the updated
 *          record or the validation errors.
 */
export function updateSettlementSource(
  db: Database.Database,
  settlementSourceId: string,
  patch: UpdateSettlementSourcePatch,
  nowIso: string,
): StoreResult<SettlementSourceRecord> | null {
  const existing = getSettlementSourceRow(db, settlementSourceId);
  if (existing === undefined) {
    return null;
  }

  const current = rowToRecord(existing);
  const merged: SettlementSourceRecord = {
    ...current,
    title: patch.title ?? current.title,
    url: patch.url !== undefined ? patch.url : current.url,
    publisher: patch.publisher !== undefined ? patch.publisher : current.publisher,
    authorityType: patch.authorityType !== undefined ? patch.authorityType : current.authorityType,
    status: patch.status ?? current.status,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    verificationRationale:
      patch.verificationRationale !== undefined
        ? patch.verificationRationale
        : current.verificationRationale,
    updatedAt: nowIso,
  };

  const check = checkRecord(merged);
  if (!check.ok) {
    return { ok: false, errors: check.errors };
  }

  db.prepare(
    `UPDATE market_settlement_sources
        SET title = ?, url = ?, publisher = ?, authority_type = ?, status = ?,
            notes = ?, verification_rationale = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.title,
    merged.url,
    merged.publisher,
    merged.authorityType,
    merged.status,
    merged.notes,
    merged.verificationRationale,
    merged.updatedAt,
    settlementSourceId,
  );

  return { ok: true, value: merged };
}

/**
 * Returns the active human-verified settlement source for a market: the
 * latest row whose CURRENT status is 'human_verified', by created_at DESC
 * with rowid DESC as the tiebreak. Drafts and rejected rows never count, and
 * a verified row missing its authority_type never counts (default-SKIP
 * posture).
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to look up.
 * @returns The compact verified summary, or null when none qualifies.
 */
export function getActiveVerifiedSettlementSource(
  db: Database.Database,
  ticker: string,
): VerifiedSettlementSummary | null {
  const row = db
    .prepare(
      `SELECT * FROM market_settlement_sources
        WHERE market_ticker = ? AND status = 'human_verified' AND authority_type IS NOT NULL
        ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(ticker) as SettlementSourceRow | undefined;
  if (row === undefined || row.authority_type === null) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    authorityType: row.authority_type,
    updatedAt: row.updated_at,
  };
}
