import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { countAcceptedSources } from './sources';
import type {
  BriefBasis,
  BriefState,
  Confidence,
  ResearchBriefRecord,
  ResearchBriefRow,
} from './types';
import { deriveBriefState } from './validation';

/**
 * CRUD for research_briefs.
 *
 * Briefs are human-typed (or fixture) research summaries — never labeled AI
 * research. Every save inserts a new row (audit trail); the latest row wins.
 * source_count is always server-computed from currently accepted sources, and
 * state/confidence are coerced by the validators: zero accepted sources forces
 * 'insufficient_sources' (unless 'not_run') and low confidence, and basis
 * 'ai_draft_unreviewed' never unlocks more than low confidence.
 */

/** Input for saving a brief. Any client-provided sourceCount is ignored. */
export interface SaveBriefInput {
  state: BriefState;
  summary?: string | null;
  yesCase?: string | null;
  noCase?: string | null;
  keyEvidence?: string | null;
  uncertainties?: string | null;
  missingInfo?: string | null;
  confidence: Confidence;
  basis: BriefBasis;
  /** Ignored — the server computes the count from currently accepted sources. */
  sourceCount?: number;
}

function rowToRecord(row: ResearchBriefRow): ResearchBriefRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    state: row.state,
    summary: row.summary,
    yesCase: row.yes_case,
    noCase: row.no_case,
    keyEvidence: row.key_evidence,
    uncertainties: row.uncertainties,
    missingInfo: row.missing_info,
    confidence: row.confidence,
    sourceCount: row.source_count,
    basis: row.basis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deriveConfidence(
  requested: Confidence,
  basis: BriefBasis,
  acceptedSourceCount: number,
): Confidence {
  if (acceptedSourceCount < 1 || basis === 'ai_draft_unreviewed') {
    return 'low';
  }
  return requested;
}

/**
 * Inserts a new brief row with server-authoritative source count, state, and
 * confidence.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the brief belongs to.
 * @param input - Validated brief fields (validate at the route boundary first).
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns The persisted brief record with coerced state and confidence.
 */
export function saveBrief(
  db: Database.Database,
  ticker: string,
  input: SaveBriefInput,
  nowIso: string,
): ResearchBriefRecord {
  const acceptedSourceCount = countAcceptedSources(db, ticker);
  const state = deriveBriefState(input.state, acceptedSourceCount);
  const confidence = deriveConfidence(input.confidence, input.basis, acceptedSourceCount);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO research_briefs
       (id, market_ticker, state, summary, yes_case, no_case, key_evidence,
        uncertainties, missing_info, confidence, source_count, basis,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    ticker,
    state,
    input.summary ?? null,
    input.yesCase ?? null,
    input.noCase ?? null,
    input.keyEvidence ?? null,
    input.uncertainties ?? null,
    input.missingInfo ?? null,
    confidence,
    acceptedSourceCount,
    input.basis,
    nowIso,
    nowIso,
  );

  const row = db.prepare('SELECT * FROM research_briefs WHERE id = ?').get(id) as
    | ResearchBriefRow
    | undefined;
  if (row === undefined) {
    throw new Error('brief insert failed unexpectedly');
  }
  return rowToRecord(row);
}

/**
 * Returns the latest brief for a market, ordered by created_at DESC with
 * rowid DESC as the tiebreak.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to look up.
 * @returns The latest brief record, or null when none exists.
 */
export function getLatestBrief(db: Database.Database, ticker: string): ResearchBriefRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM research_briefs WHERE market_ticker = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(ticker) as ResearchBriefRow | undefined;
  return row === undefined ? null : rowToRecord(row);
}
