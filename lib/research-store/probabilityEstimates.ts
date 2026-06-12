import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { countAcceptedSources } from './sources';
import type {
  Confidence,
  EstimateBasis,
  ProbabilityEstimateRecord,
  ProbabilityEstimateRow,
  StoreResult,
} from './types';
import { validateFairRange } from './validation';

/**
 * CRUD for probability_estimates.
 *
 * Fair probabilities are human research input — fractions in [0, 1] with
 * low <= mid <= high (see the units convention in types.ts). They are never
 * inferred from the market price and never decide a verdict; the deterministic
 * risk engine alone does that. A non-fixture estimate requires at least one
 * currently accepted source, and source_count is always server-computed.
 */

/** Input for saving an estimate. Any client-provided sourceCount is ignored. */
export interface SaveEstimateInput {
  /** Fraction in [0, 1]; low <= mid <= high. */
  low: number;
  /** Fraction in [0, 1]; low <= mid <= high. */
  mid: number;
  /** Fraction in [0, 1]; low <= mid <= high. */
  high: number;
  rationale: string;
  basis: EstimateBasis;
  confidence: Confidence;
  briefId?: string | null;
  /** Ignored — the server computes the count from currently accepted sources. */
  sourceCount?: number;
}

function rowToRecord(row: ProbabilityEstimateRow): ProbabilityEstimateRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    low: row.low,
    mid: row.mid,
    high: row.high,
    rationale: row.rationale,
    basis: row.basis,
    confidence: row.confidence,
    sourceCount: row.source_count,
    briefId: row.brief_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Validates and inserts a fair probability estimate.
 *
 * Rejects (without writing) when the range is invalid or when a non-fixture
 * basis is used while the accepted source count is 0.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the estimate belongs to.
 * @param input - Untrusted estimate fields; validated here against current rows.
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns Ok with the persisted record, or the validation errors.
 */
export function saveEstimate(
  db: Database.Database,
  ticker: string,
  input: SaveEstimateInput,
  nowIso: string,
): StoreResult<ProbabilityEstimateRecord> {
  const acceptedSourceCount = countAcceptedSources(db, ticker);
  const validation = validateFairRange(input, acceptedSourceCount);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO probability_estimates
       (id, market_ticker, low, mid, high, rationale, basis, confidence,
        source_count, brief_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ticker,
    input.low,
    input.mid,
    input.high,
    input.rationale,
    input.basis,
    input.confidence,
    acceptedSourceCount,
    input.briefId ?? null,
    nowIso,
    nowIso,
  );

  const record = getEstimateById(db, id);
  if (record === null) {
    throw new Error('estimate insert failed unexpectedly');
  }
  return { ok: true, value: record };
}

/**
 * Returns the latest estimate for a market, ordered by created_at DESC with
 * rowid DESC as the tiebreak.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to look up.
 * @returns The latest estimate record, or null when none exists.
 */
export function getLatestEstimate(
  db: Database.Database,
  ticker: string,
): ProbabilityEstimateRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM probability_estimates WHERE market_ticker = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(ticker) as ProbabilityEstimateRow | undefined;
  return row === undefined ? null : rowToRecord(row);
}

/**
 * Returns an estimate by id.
 *
 * @param db - Open research-store database handle.
 * @param id - Estimate id to look up.
 * @returns The estimate record, or null when the id does not exist.
 */
export function getEstimateById(
  db: Database.Database,
  id: string,
): ProbabilityEstimateRecord | null {
  const row = db.prepare('SELECT * FROM probability_estimates WHERE id = ?').get(id) as
    | ProbabilityEstimateRow
    | undefined;
  return row === undefined ? null : rowToRecord(row);
}
