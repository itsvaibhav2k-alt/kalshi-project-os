import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { getEstimateById } from './probabilityEstimates';
import { listSources } from './sources';
import type { StoreResult, ThesisRecord, ThesisRow, ThesisStatus } from './types';
import { validateThesisReady } from './validation';

/**
 * CRUD for theses.
 *
 * A written thesis is required before PAPER_TRADE eligibility; it never
 * approves real trades. Any transition into 'ready_for_risk' — at creation or
 * by update — must pass validateThesisReady against CURRENT rows (accepted
 * linked sources, matching probability estimate), and readiness is also
 * revalidated at read time because links can decay. Archived rows remain as
 * an audit trail; the active thesis is the latest non-archived one.
 */

/** Input for creating a thesis. Status defaults to 'draft'. */
export interface CreateThesisInput {
  status?: ThesisStatus;
  thesis: string;
  whyMispriced?: string | null;
  invalidationCriteria?: string | null;
  probabilityEstimateId?: string | null;
  sourceIds?: readonly string[] | null;
}

/** Mutable fields of a thesis. Absent fields keep their stored values. */
export interface UpdateThesisPatch {
  status?: ThesisStatus;
  thesis?: string;
  whyMispriced?: string | null;
  invalidationCriteria?: string | null;
  probabilityEstimateId?: string | null;
  sourceIds?: readonly string[] | null;
}

function rowToRecord(row: ThesisRow): ThesisRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    status: row.status,
    thesis: row.thesis,
    whyMispriced: row.why_mispriced,
    invalidationCriteria: row.invalidation_criteria,
    probabilityEstimateId: row.probability_estimate_id,
    sourceIdsJson: row.source_ids_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getThesisRow(db: Database.Database, thesisId: string): ThesisRow | undefined {
  return db.prepare('SELECT * FROM theses WHERE id = ?').get(thesisId) as ThesisRow | undefined;
}

function serializeSourceIds(sourceIds: readonly string[] | null | undefined): string | null {
  if (sourceIds === undefined || sourceIds === null) {
    return null;
  }
  return JSON.stringify([...sourceIds]);
}

function checkReadiness(db: Database.Database, candidate: ThesisRecord): StoreResult<null> {
  const sources = listSources(db, candidate.marketTicker);
  const estimate =
    candidate.probabilityEstimateId === null
      ? null
      : getEstimateById(db, candidate.probabilityEstimateId);
  const validation = validateThesisReady(candidate, sources, estimate);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, value: null };
}

/**
 * Inserts a new thesis. Creating it directly as 'ready_for_risk' requires the
 * readiness checks to pass against current rows; otherwise nothing is written.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the thesis belongs to.
 * @param input - Thesis fields; status defaults to 'draft'.
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns Ok with the persisted record, or the readiness errors.
 */
export function createThesis(
  db: Database.Database,
  ticker: string,
  input: CreateThesisInput,
  nowIso: string,
): StoreResult<ThesisRecord> {
  const candidate: ThesisRecord = {
    id: randomUUID(),
    marketTicker: ticker,
    status: input.status ?? 'draft',
    thesis: input.thesis,
    whyMispriced: input.whyMispriced ?? null,
    invalidationCriteria: input.invalidationCriteria ?? null,
    probabilityEstimateId: input.probabilityEstimateId ?? null,
    sourceIdsJson: serializeSourceIds(input.sourceIds),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (candidate.status === 'ready_for_risk') {
    const readiness = checkReadiness(db, candidate);
    if (!readiness.ok) {
      return { ok: false, errors: readiness.errors };
    }
  }

  db.prepare(
    `INSERT INTO theses
       (id, market_ticker, status, thesis, why_mispriced, invalidation_criteria,
        probability_estimate_id, source_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    candidate.id,
    candidate.marketTicker,
    candidate.status,
    candidate.thesis,
    candidate.whyMispriced,
    candidate.invalidationCriteria,
    candidate.probabilityEstimateId,
    candidate.sourceIdsJson,
    candidate.createdAt,
    candidate.updatedAt,
  );

  return { ok: true, value: candidate };
}

/**
 * Updates a thesis (text fields, links, status transitions). When the merged
 * result has status 'ready_for_risk', the readiness checks must pass against
 * current rows or nothing is written.
 *
 * @param db - Open research-store database handle.
 * @param thesisId - Id of the thesis to update.
 * @param patch - Field changes; absent fields keep their stored values.
 * @param nowIso - Injected ISO timestamp for updated_at.
 * @returns Null when the id does not exist; otherwise ok with the updated
 *          record or the readiness errors.
 */
export function updateThesis(
  db: Database.Database,
  thesisId: string,
  patch: UpdateThesisPatch,
  nowIso: string,
): StoreResult<ThesisRecord> | null {
  const existing = getThesisRow(db, thesisId);
  if (existing === undefined) {
    return null;
  }

  const current = rowToRecord(existing);
  const merged: ThesisRecord = {
    ...current,
    status: patch.status ?? current.status,
    thesis: patch.thesis ?? current.thesis,
    whyMispriced: patch.whyMispriced !== undefined ? patch.whyMispriced : current.whyMispriced,
    invalidationCriteria:
      patch.invalidationCriteria !== undefined
        ? patch.invalidationCriteria
        : current.invalidationCriteria,
    probabilityEstimateId:
      patch.probabilityEstimateId !== undefined
        ? patch.probabilityEstimateId
        : current.probabilityEstimateId,
    sourceIdsJson:
      patch.sourceIds !== undefined ? serializeSourceIds(patch.sourceIds) : current.sourceIdsJson,
    updatedAt: nowIso,
  };

  if (merged.status === 'ready_for_risk') {
    const readiness = checkReadiness(db, merged);
    if (!readiness.ok) {
      return { ok: false, errors: readiness.errors };
    }
  }

  db.prepare(
    `UPDATE theses
        SET status = ?, thesis = ?, why_mispriced = ?, invalidation_criteria = ?,
            probability_estimate_id = ?, source_ids_json = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    merged.status,
    merged.thesis,
    merged.whyMispriced,
    merged.invalidationCriteria,
    merged.probabilityEstimateId,
    merged.sourceIdsJson,
    merged.updatedAt,
    thesisId,
  );

  return { ok: true, value: merged };
}

/**
 * Returns the active thesis for a market: the latest non-archived row,
 * ordered by created_at DESC with rowid DESC as the tiebreak.
 *
 * Note: a stored 'ready_for_risk' status is not trusted on its own — callers
 * computing readiness must revalidate with validateThesisReady against
 * current rows, because linked sources can decay after the fact.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to look up.
 * @returns The active thesis record, or null when none exists.
 */
export function getActiveThesis(db: Database.Database, ticker: string): ThesisRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM theses WHERE market_ticker = ? AND status != 'archived'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(ticker) as ThesisRow | undefined;
  return row === undefined ? null : rowToRecord(row);
}
