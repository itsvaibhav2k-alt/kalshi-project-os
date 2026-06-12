import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  MarketSourceRecord,
  MarketSourceRow,
  SourceAddedBy,
  SourceCredibility,
  SourceKind,
  SourceStatus,
} from './types';

/**
 * CRUD for market_sources.
 *
 * Sources are research input only — never trades. Only 'accepted' sources
 * count toward research; 'draft' and 'rejected' never do. All timestamps are
 * injected (nowIso); this module never reads a clock or the environment.
 */

/** Input for creating a source. Status defaults are applied by callers. */
export interface CreateSourceInput {
  marketId: string;
  kind: SourceKind;
  title: string;
  url?: string | null;
  publisher?: string | null;
  excerpt?: string | null;
  notes?: string | null;
  credibility: SourceCredibility;
  status: SourceStatus;
  addedBy: SourceAddedBy;
}

/** Mutable fields of a source. Everything else is fixed at creation. */
export interface UpdateSourcePatch {
  status?: SourceStatus;
  credibility?: SourceCredibility;
  notes?: string | null;
  excerpt?: string | null;
}

function rowToRecord(row: MarketSourceRow): MarketSourceRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    marketId: row.market_id,
    kind: row.kind,
    title: row.title,
    url: row.url,
    publisher: row.publisher,
    excerpt: row.excerpt,
    notes: row.notes,
    credibility: row.credibility,
    status: row.status,
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSourceRow(db: Database.Database, sourceId: string): MarketSourceRow | undefined {
  return db.prepare('SELECT * FROM market_sources WHERE id = ?').get(sourceId) as
    | MarketSourceRow
    | undefined;
}

/**
 * Inserts a new source for a market.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the source belongs to.
 * @param input - Validated source fields (validate at the route boundary first).
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns The persisted source record.
 */
export function createSource(
  db: Database.Database,
  ticker: string,
  input: CreateSourceInput,
  nowIso: string,
): MarketSourceRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO market_sources
       (id, market_ticker, market_id, kind, title, url, publisher, excerpt, notes,
        credibility, status, added_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ticker,
    input.marketId,
    input.kind,
    input.title,
    input.url ?? null,
    input.publisher ?? null,
    input.excerpt ?? null,
    input.notes ?? null,
    input.credibility,
    input.status,
    input.addedBy,
    nowIso,
    nowIso,
  );
  const row = getSourceRow(db, id);
  if (row === undefined) {
    throw new Error('source insert failed unexpectedly');
  }
  return rowToRecord(row);
}

/**
 * Lists every source for a market in chronological (audit-trail) order.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to list sources for.
 * @returns Source records ordered by created_at, then insertion order.
 */
export function listSources(db: Database.Database, ticker: string): MarketSourceRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM market_sources WHERE market_ticker = ? ORDER BY created_at ASC, rowid ASC',
    )
    .all(ticker) as MarketSourceRow[];
  return rows.map(rowToRecord);
}

/**
 * Updates the mutable fields of a source (status, credibility, notes,
 * excerpt). All other fields — including any extra properties on the patch —
 * are ignored.
 *
 * @param db - Open research-store database handle.
 * @param sourceId - Id of the source to update.
 * @param patch - Allowed-field changes; absent fields keep their values.
 * @param nowIso - Injected ISO timestamp for updated_at.
 * @returns The updated record, or null when the id does not exist.
 */
export function updateSource(
  db: Database.Database,
  sourceId: string,
  patch: UpdateSourcePatch,
  nowIso: string,
): MarketSourceRecord | null {
  const existing = getSourceRow(db, sourceId);
  if (existing === undefined) {
    return null;
  }

  const next = {
    status: patch.status ?? existing.status,
    credibility: patch.credibility ?? existing.credibility,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    excerpt: patch.excerpt !== undefined ? patch.excerpt : existing.excerpt,
  };

  db.prepare(
    `UPDATE market_sources
        SET status = ?, credibility = ?, notes = ?, excerpt = ?, updated_at = ?
      WHERE id = ?`,
  ).run(next.status, next.credibility, next.notes, next.excerpt, nowIso, sourceId);

  const updated = getSourceRow(db, sourceId);
  return updated === undefined ? null : rowToRecord(updated);
}

/**
 * Counts the currently accepted sources for a market. This is the only count
 * the server trusts — client-provided counts are always ignored.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to count accepted sources for.
 * @returns Number of sources with status 'accepted'.
 */
export function countAcceptedSources(db: Database.Database, ticker: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM market_sources WHERE market_ticker = ? AND status = 'accepted'",
    )
    .get(ticker) as { n: number };
  return row.n;
}

/**
 * Fetches sources by id. Unknown ids are omitted from the result.
 *
 * @param db - Open research-store database handle.
 * @param ids - Source ids to look up.
 * @returns Matching source records in chronological order.
 */
export function getSourcesByIds(
  db: Database.Database,
  ids: readonly string[],
): MarketSourceRecord[] {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM market_sources WHERE id IN (${placeholders})
       ORDER BY created_at ASC, rowid ASC`,
    )
    .all(...ids) as MarketSourceRow[];
  return rows.map(rowToRecord);
}
