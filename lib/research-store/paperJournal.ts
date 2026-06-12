import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  Confidence,
  PaperDecisionEntryRecord,
  PaperDecisionEntryRow,
  PaperEntryRiskVerdict,
  PaperEntrySide,
  StoreResult,
} from './types';
import { validatePaperEntryInput } from './validation';

/**
 * CRUD for paper_decision_entries (Phase 4 paper decision journal).
 *
 * A paper entry is a simulated decision snapshot only: no stake, no contract
 * count, no PnL, no lifecycle, no settlement outcome. Entries can record only
 * the PAPER_TRADE verdict and the YES side; the deterministic risk engine
 * alone issues verdicts, and the route boundary re-checks the dossier before
 * calling this module — the validation here is defense in depth, never an
 * approval. Rows are never deleted: archive instead. All timestamps are
 * injected (nowIso); this module never reads a clock or the environment.
 */

/** Input for creating a paper decision entry. Status is always 'logged'. */
export interface CreatePaperEntryInput {
  marketId: string;
  marketTitle: string;
  platform: string;
  side: PaperEntrySide;
  /** Fraction in [0, 1]; always the current YES ask, never the last price. */
  paperPrice: number;
  /** Fraction in [0, 1]. */
  impliedProbability: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairLow: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairMid: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairHigh: number;
  /** Fraction difference in [-1, 1]. */
  expectedEdge: number;
  confidence: Confidence;
  thesisId: string;
  thesisSnapshot: string;
  probabilityEstimateId?: string | null;
  researchSourceIdsJson?: string | null;
  researchSourcesSnapshotJson?: string | null;
  settlementSourceId: string;
  settlementSourceSnapshotJson: string;
  riskVerdict: PaperEntryRiskVerdict;
  riskChecklistJson: string;
  riskReasonsJson?: string | null;
  marketSnapshotJson?: string | null;
}

function rowToRecord(row: PaperDecisionEntryRow): PaperDecisionEntryRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    marketId: row.market_id,
    marketTitle: row.market_title,
    platform: row.platform,
    side: row.side,
    paperPrice: row.paper_price,
    impliedProbability: row.implied_probability,
    fairLow: row.fair_low,
    fairMid: row.fair_mid,
    fairHigh: row.fair_high,
    expectedEdge: row.expected_edge,
    confidence: row.confidence,
    thesisId: row.thesis_id,
    thesisSnapshot: row.thesis_snapshot,
    probabilityEstimateId: row.probability_estimate_id,
    researchSourceIdsJson: row.research_source_ids_json,
    researchSourcesSnapshotJson: row.research_sources_snapshot_json,
    settlementSourceId: row.settlement_source_id,
    settlementSourceSnapshotJson: row.settlement_source_snapshot_json,
    riskVerdict: row.risk_verdict,
    riskChecklistJson: row.risk_checklist_json,
    riskReasonsJson: row.risk_reasons_json,
    marketSnapshotJson: row.market_snapshot_json,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getPaperEntryRow(
  db: Database.Database,
  entryId: string,
): PaperDecisionEntryRow | undefined {
  return db
    .prepare('SELECT * FROM paper_decision_entries WHERE id = ?')
    .get(entryId) as PaperDecisionEntryRow | undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Inserts a new paper decision entry with status 'logged'.
 *
 * The input is re-checked with the strict shape validator (side YES only,
 * riskVerdict PAPER_TRADE only, fractions in bounds, required snapshots
 * present), plus required thesis and settlement record ids — defense in depth
 * on top of the route boundary's dossier check. Nothing is written when any
 * check fails.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the entry belongs to.
 * @param input - Entry snapshot fields assembled by the route boundary.
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns Ok with the persisted record, or the validation errors.
 */
export function createPaperEntry(
  db: Database.Database,
  ticker: string,
  input: CreatePaperEntryInput,
  nowIso: string,
): StoreResult<PaperDecisionEntryRecord> {
  const validation = validatePaperEntryInput(input);
  const errors = [...validation.errors];
  if (!isNonEmptyString(input.thesisId)) {
    errors.push('thesisId is required and must be non-empty');
  }
  if (!isNonEmptyString(input.settlementSourceId)) {
    errors.push('settlementSourceId is required and must be non-empty');
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const record: PaperDecisionEntryRecord = {
    id: randomUUID(),
    marketTicker: ticker,
    marketId: input.marketId,
    marketTitle: input.marketTitle,
    platform: input.platform,
    side: input.side,
    paperPrice: input.paperPrice,
    impliedProbability: input.impliedProbability,
    fairLow: input.fairLow,
    fairMid: input.fairMid,
    fairHigh: input.fairHigh,
    expectedEdge: input.expectedEdge,
    confidence: input.confidence,
    thesisId: input.thesisId,
    thesisSnapshot: input.thesisSnapshot,
    probabilityEstimateId: input.probabilityEstimateId ?? null,
    researchSourceIdsJson: input.researchSourceIdsJson ?? null,
    researchSourcesSnapshotJson: input.researchSourcesSnapshotJson ?? null,
    settlementSourceId: input.settlementSourceId,
    settlementSourceSnapshotJson: input.settlementSourceSnapshotJson,
    riskVerdict: input.riskVerdict,
    riskChecklistJson: input.riskChecklistJson,
    riskReasonsJson: input.riskReasonsJson ?? null,
    marketSnapshotJson: input.marketSnapshotJson ?? null,
    status: 'logged',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.prepare(
    `INSERT INTO paper_decision_entries
       (id, market_ticker, market_id, market_title, platform, side, paper_price,
        implied_probability, fair_low, fair_mid, fair_high, expected_edge,
        confidence, thesis_id, thesis_snapshot, probability_estimate_id,
        research_source_ids_json, research_sources_snapshot_json,
        settlement_source_id, settlement_source_snapshot_json, risk_verdict,
        risk_checklist_json, risk_reasons_json, market_snapshot_json, status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.marketTicker,
    record.marketId,
    record.marketTitle,
    record.platform,
    record.side,
    record.paperPrice,
    record.impliedProbability,
    record.fairLow,
    record.fairMid,
    record.fairHigh,
    record.expectedEdge,
    record.confidence,
    record.thesisId,
    record.thesisSnapshot,
    record.probabilityEstimateId,
    record.researchSourceIdsJson,
    record.researchSourcesSnapshotJson,
    record.settlementSourceId,
    record.settlementSourceSnapshotJson,
    record.riskVerdict,
    record.riskChecklistJson,
    record.riskReasonsJson,
    record.marketSnapshotJson,
    record.status,
    record.createdAt,
    record.updatedAt,
  );

  return { ok: true, value: record };
}

/**
 * Lists every paper entry for one market, earliest first (created_at, then
 * insertion sequence). Archived rows stay listed as an audit trail.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to list entries for.
 * @returns Paper entry records, earliest first.
 */
export function listPaperEntries(
  db: Database.Database,
  ticker: string,
): PaperDecisionEntryRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM paper_decision_entries WHERE market_ticker = ?
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all(ticker) as PaperDecisionEntryRow[];
  return rows.map(rowToRecord);
}

/**
 * Lists every paper entry across all markets, earliest first (created_at,
 * then insertion sequence). Archived rows stay listed as an audit trail.
 *
 * @param db - Open research-store database handle.
 * @returns Paper entry records, earliest first.
 */
export function listAllPaperEntries(db: Database.Database): PaperDecisionEntryRecord[] {
  const rows = db
    .prepare('SELECT * FROM paper_decision_entries ORDER BY created_at ASC, rowid ASC')
    .all() as PaperDecisionEntryRow[];
  return rows.map(rowToRecord);
}

/**
 * Returns a paper entry by id, regardless of status or ticker. Callers
 * enforcing a route's scope must compare marketTicker themselves.
 *
 * @param db - Open research-store database handle.
 * @param entryId - Entry id to look up.
 * @returns The record, or null when the id does not exist.
 */
export function getPaperEntryById(
  db: Database.Database,
  entryId: string,
): PaperDecisionEntryRecord | null {
  const row = getPaperEntryRow(db, entryId);
  return row === undefined ? null : rowToRecord(row);
}

/**
 * Archives a paper entry. The only permitted transition is
 * 'logged' -> 'archived'; there is no delete and no un-archive, so the row
 * always survives as an audit trail.
 *
 * @param db - Open research-store database handle.
 * @param entryId - Id of the entry to archive.
 * @param nowIso - Injected ISO timestamp for updated_at.
 * @returns Null when the id does not exist; otherwise ok with the archived
 *          record, or an error when the entry is not currently 'logged'.
 */
export function archivePaperEntry(
  db: Database.Database,
  entryId: string,
  nowIso: string,
): StoreResult<PaperDecisionEntryRecord> | null {
  const existing = getPaperEntryRow(db, entryId);
  if (existing === undefined) {
    return null;
  }
  if (existing.status !== 'logged') {
    return { ok: false, errors: ['only a logged entry can be archived'] };
  }

  db.prepare(
    `UPDATE paper_decision_entries SET status = 'archived', updated_at = ? WHERE id = ?`,
  ).run(nowIso, entryId);

  return {
    ok: true,
    value: { ...rowToRecord(existing), status: 'archived', updatedAt: nowIso },
  };
}
