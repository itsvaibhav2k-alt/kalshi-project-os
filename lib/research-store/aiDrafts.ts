import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  AiResearchDraftRecord,
  AiResearchDraftRow,
  AiResearchDraftType,
  StoreResult,
} from './types';
import { validateAiDraftRecordInput, validateAiDraftRequest } from './validation';

/**
 * Persistence for ai_research_drafts (Phase 5 advisory AI research copilot).
 *
 * A draft is advisory reading material for human review and sits entirely
 * outside the deterministic risk path: it never satisfies a risk check, never
 * promotes sources, briefs, theses, or settlement records, and never creates
 * paper entries. A draft carries no verdict, stake, size, or PnL field. Rows
 * are never deleted: archive instead. All timestamps are injected (nowIso);
 * this module never reads a clock or the environment.
 */

/** Input for creating an AI research draft. Status is always 'draft'. */
export interface CreateAiDraftInput {
  marketId: string;
  draftType: AiResearchDraftType;
  provider: string;
  model: string;
  promptVersion: string;
  /** Compact JSON of derived scalar inputs only — never raw market blobs or env values. */
  inputSnapshotJson: string;
  /** Generated draft body; rendered as plain text, never as HTML. */
  outputMarkdown: string;
  outputJson: string | null;
  userFocus: string | null;
}

function rowToRecord(row: AiResearchDraftRow): AiResearchDraftRecord {
  return {
    id: row.id,
    marketTicker: row.market_ticker,
    marketId: row.market_id,
    draftType: row.draft_type,
    status: row.status,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    inputSnapshotJson: row.input_snapshot_json,
    outputMarkdown: row.output_markdown,
    outputJson: row.output_json,
    userFocus: row.user_focus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getAiDraftRow(db: Database.Database, draftId: string): AiResearchDraftRow | undefined {
  return db
    .prepare('SELECT * FROM ai_research_drafts WHERE id = ?')
    .get(draftId) as AiResearchDraftRow | undefined;
}

/**
 * Inserts a new AI research draft with status 'draft'.
 *
 * The input is re-checked before persistence: draftType must be one of the
 * six draft kinds, and provider, model, promptVersion, inputSnapshotJson, and
 * outputMarkdown must be non-empty. Nothing is written when any check fails.
 * The persisted row is advisory data only; it never satisfies a risk check
 * and never promotes any research, thesis, or settlement record.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker the draft belongs to.
 * @param input - Draft fields assembled by the route boundary and provider.
 * @param nowIso - Injected ISO timestamp for created_at and updated_at.
 * @returns Ok with the persisted record, or the validation errors.
 */
export function createAiDraft(
  db: Database.Database,
  ticker: string,
  input: CreateAiDraftInput,
  nowIso: string,
): StoreResult<AiResearchDraftRecord> {
  const record: AiResearchDraftRecord = {
    id: randomUUID(),
    marketTicker: ticker,
    marketId: input.marketId,
    draftType: input.draftType,
    status: 'draft',
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    inputSnapshotJson: input.inputSnapshotJson,
    outputMarkdown: input.outputMarkdown,
    outputJson: input.outputJson ?? null,
    userFocus: input.userFocus ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const requestValidation = validateAiDraftRequest({
    draftType: input.draftType,
    userFocus: input.userFocus,
  });
  const recordValidation = validateAiDraftRecordInput(record);
  const errors = [...new Set([...requestValidation.errors, ...recordValidation.errors])];
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  db.prepare(
    `INSERT INTO ai_research_drafts
       (id, market_ticker, market_id, draft_type, status, provider, model,
        prompt_version, input_snapshot_json, output_markdown, output_json,
        user_focus, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.marketTicker,
    record.marketId,
    record.draftType,
    record.status,
    record.provider,
    record.model,
    record.promptVersion,
    record.inputSnapshotJson,
    record.outputMarkdown,
    record.outputJson,
    record.userFocus,
    record.createdAt,
    record.updatedAt,
  );

  return { ok: true, value: record };
}

/**
 * Lists every AI research draft for one market, newest first (created_at,
 * then insertion sequence, both descending). Archived rows stay listed as an
 * audit trail.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to list drafts for.
 * @returns AI research draft records, newest first.
 */
export function listAiDrafts(db: Database.Database, ticker: string): AiResearchDraftRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM ai_research_drafts WHERE market_ticker = ?
       ORDER BY created_at DESC, rowid DESC`,
    )
    .all(ticker) as AiResearchDraftRow[];
  return rows.map(rowToRecord);
}

/**
 * Returns an AI research draft by id, regardless of status or ticker. Callers
 * enforcing a route's scope must compare marketTicker themselves.
 *
 * @param db - Open research-store database handle.
 * @param draftId - Draft id to look up.
 * @returns The record, or null when the id does not exist.
 */
export function getAiDraftById(
  db: Database.Database,
  draftId: string,
): AiResearchDraftRecord | null {
  const row = getAiDraftRow(db, draftId);
  return row === undefined ? null : rowToRecord(row);
}

/**
 * Archives an AI research draft. The only permitted transition is
 * 'draft' -> 'archived'; there is no delete and no un-archive, so the row
 * always survives as an audit trail.
 *
 * @param db - Open research-store database handle.
 * @param draftId - Id of the draft to archive.
 * @param nowIso - Injected ISO timestamp for updated_at.
 * @returns Null when the id does not exist; otherwise ok with the archived
 *          record, or an error when the draft is not currently 'draft'.
 */
export function archiveAiDraft(
  db: Database.Database,
  draftId: string,
  nowIso: string,
): StoreResult<AiResearchDraftRecord> | null {
  const existing = getAiDraftRow(db, draftId);
  if (existing === undefined) {
    return null;
  }
  if (existing.status !== 'draft') {
    return { ok: false, errors: ['only a draft entry can be archived'] };
  }

  db.prepare(
    `UPDATE ai_research_drafts SET status = 'archived', updated_at = ? WHERE id = ?`,
  ).run(nowIso, draftId);

  return {
    ok: true,
    value: { ...rowToRecord(existing), status: 'archived', updatedAt: nowIso },
  };
}
