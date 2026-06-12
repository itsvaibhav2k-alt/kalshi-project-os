import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import * as aiDraftsModule from '@/lib/research-store/aiDrafts';
import {
  archiveAiDraft,
  createAiDraft,
  getAiDraftById,
  listAiDrafts,
} from '@/lib/research-store/aiDrafts';
import type { CreateAiDraftInput } from '@/lib/research-store/aiDrafts';
import { closeAllDatabases, getDatabase } from '@/lib/research-store/db';
import { AI_RESEARCH_DRAFT_TYPES } from '@/lib/research-store/types';
import type { AiResearchDraftType, StoreResult } from '@/lib/research-store/types';

const NOW_ISO = '2026-06-12T12:00:00.000Z';
const LATER_ISO = '2026-06-12T13:00:00.000Z';
const TICKER = 'AI-DRAFT-TEST';
const OTHER_TICKER = 'AI-DRAFT-OTHER';

/**
 * The complete ai_research_drafts column set. Deliberately advisory-only:
 * no verdict, stake, size, PnL, approval, review, readiness, fill, or
 * exposure column may ever appear here.
 */
const EXPECTED_COLUMNS = [
  'id',
  'market_ticker',
  'market_id',
  'draft_type',
  'status',
  'provider',
  'model',
  'prompt_version',
  'input_snapshot_json',
  'output_markdown',
  'output_json',
  'user_focus',
  'created_at',
  'updated_at',
];

let dataDir: string;
let db: Database.Database;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-ai-draft-store-test-'));
  vi.stubEnv('KALSHI_DATA_DIR', dataDir);
  db = getDatabase(NOW_ISO);
});

afterEach(() => {
  closeAllDatabases();
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function unwrap<T>(result: StoreResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got errors: ${result.errors.join('; ')}`);
  }
  return result.value;
}

/** Builds a complete, valid AI draft input for the synthetic test market. */
function makeDraftInput(overrides: Partial<CreateAiDraftInput> = {}): CreateAiDraftInput {
  return {
    marketId: `kalshi:${TICKER}`,
    draftType: 'research_questions',
    provider: 'local_deterministic',
    model: 'phase5_fallback',
    promptVersion: 'phase5.v1',
    inputSnapshotJson: `{"ticker":"${TICKER}","resolutionClarity":"clear"}`,
    outputMarkdown:
      '## Research questions (draft)\n\n- What does the settlement text require, exactly?\n- Which official source publishes the deciding number?',
    outputJson: null,
    userFocus: null,
    ...overrides,
  };
}

describe('aiDrafts store', () => {
  describe('migration', () => {
    it('should create the ai_research_drafts table when migrations run', () => {
      const tables = (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);

      expect(tables).toContain('ai_research_drafts');
    });

    it('should record version 3 in the schema_migrations ledger', () => {
      const versions = (
        db
          .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
          .all() as Array<{ version: number }>
      ).map((row) => row.version);

      expect(versions).toContain(3);
    });
  });

  describe('schema guarantees', () => {
    it('should expose exactly the advisory-only column set', () => {
      const columns = (
        db.prepare('PRAGMA table_info(ai_research_drafts)').all() as Array<{ name: string }>
      ).map((column) => column.name);

      expect(columns).toEqual(EXPECTED_COLUMNS);
    });

    it('should have no stake, size, pnl, verdict, approval, review, readiness, fill, or exposure columns', () => {
      const columns = (
        db.prepare('PRAGMA table_info(ai_research_drafts)').all() as Array<{ name: string }>
      ).map((column) => column.name);

      expect(columns.length).toBeGreaterThan(0);
      for (const name of columns) {
        expect(name).not.toMatch(/stake|size|pnl|verdict|approved|reviewed|ready|fill|exposure/i);
      }
    });
  });

  describe('createAiDraft', () => {
    it.each(AI_RESEARCH_DRAFT_TYPES)(
      'should persist and round-trip a camelCase record when draftType is %s',
      (draftType) => {
        const record = unwrap(createAiDraft(db, TICKER, makeDraftInput({ draftType }), NOW_ISO));

        expect(record.marketTicker).toBe(TICKER);
        expect(record.marketId).toBe(`kalshi:${TICKER}`);
        expect(record.draftType).toBe(draftType);
        expect(record.status).toBe('draft');
        expect(record.provider).toBe('local_deterministic');
        expect(record.model).toBe('phase5_fallback');
        expect(record.promptVersion).toBe('phase5.v1');
        expect(record.inputSnapshotJson).toContain(TICKER);
        expect(record.outputMarkdown).toContain('Research questions (draft)');
        expect(record.outputJson).toBeNull();
        expect(record.userFocus).toBeNull();
        expect(record.createdAt).toBe(NOW_ISO);
        expect(record.updatedAt).toBe(NOW_ISO);

        expect(getAiDraftById(db, record.id)).toEqual(record);
        expect(listAiDrafts(db, TICKER)).toEqual([record]);
      },
    );

    it('should persist optional outputJson and userFocus when provided', () => {
      const record = unwrap(
        createAiDraft(
          db,
          TICKER,
          makeDraftInput({
            outputJson: '{"sections":["questions"]}',
            userFocus: 'settlement wording ambiguity',
          }),
          NOW_ISO,
        ),
      );

      expect(record.outputJson).toBe('{"sections":["questions"]}');
      expect(record.userFocus).toBe('settlement wording ambiguity');
      expect(getAiDraftById(db, record.id)).toEqual(record);
    });

    it('should reject and persist nothing when draftType is unknown', () => {
      const result = createAiDraft(
        db,
        TICKER,
        makeDraftInput({ draftType: 'trade_plan' as unknown as AiResearchDraftType }),
        NOW_ISO,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('draftType');
      }
      expect(listAiDrafts(db, TICKER)).toEqual([]);
    });

    it('should reject and persist nothing when outputMarkdown is empty', () => {
      const result = createAiDraft(db, TICKER, makeDraftInput({ outputMarkdown: '  ' }), NOW_ISO);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('outputMarkdown');
      }
      expect(listAiDrafts(db, TICKER)).toEqual([]);
    });

    it.each(['provider', 'model', 'promptVersion', 'inputSnapshotJson'] as const)(
      'should reject and persist nothing when %s is empty',
      (field) => {
        const result = createAiDraft(db, TICKER, makeDraftInput({ [field]: '' }), NOW_ISO);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.join(' ')).toContain(field);
        }
        expect(listAiDrafts(db, TICKER)).toEqual([]);
      },
    );
  });

  describe('listAiDrafts', () => {
    it('should return the empty list for a ticker with no drafts', () => {
      expect(listAiDrafts(db, TICKER)).toEqual([]);
    });

    it('should list drafts newest first by created_at', () => {
      const earlier = unwrap(createAiDraft(db, TICKER, makeDraftInput(), NOW_ISO));
      const later = unwrap(
        createAiDraft(db, TICKER, makeDraftInput({ draftType: 'missing_info' }), LATER_ISO),
      );

      expect(listAiDrafts(db, TICKER)).toEqual([later, earlier]);
    });

    it('should list the most recently inserted draft first when created_at ties', () => {
      const first = unwrap(createAiDraft(db, TICKER, makeDraftInput(), NOW_ISO));
      const second = unwrap(
        createAiDraft(db, TICKER, makeDraftInput({ draftType: 'source_checklist' }), NOW_ISO),
      );

      expect(listAiDrafts(db, TICKER)).toEqual([second, first]);
    });

    it('should scope the list to the requested ticker', () => {
      const mine = unwrap(createAiDraft(db, TICKER, makeDraftInput(), NOW_ISO));
      const other = unwrap(
        createAiDraft(
          db,
          OTHER_TICKER,
          makeDraftInput({ marketId: `kalshi:${OTHER_TICKER}` }),
          NOW_ISO,
        ),
      );

      expect(listAiDrafts(db, TICKER)).toEqual([mine]);
      expect(listAiDrafts(db, OTHER_TICKER)).toEqual([other]);
    });
  });

  describe('getAiDraftById', () => {
    it('should return null when the id does not exist', () => {
      expect(getAiDraftById(db, 'no-such-draft')).toBeNull();
    });
  });

  describe('archiveAiDraft', () => {
    it('should archive a draft and keep the row as an audit trail', () => {
      const record = unwrap(createAiDraft(db, TICKER, makeDraftInput(), NOW_ISO));

      const result = archiveAiDraft(db, record.id, LATER_ISO);
      expect(result).not.toBeNull();
      const archived = unwrap(result as StoreResult<typeof record>);

      expect(archived.status).toBe('archived');
      expect(archived.updatedAt).toBe(LATER_ISO);
      expect(archived.createdAt).toBe(NOW_ISO);

      const listed = listAiDrafts(db, TICKER);
      expect(listed).toHaveLength(1);
      expect(listed[0].status).toBe('archived');
      expect(getAiDraftById(db, record.id)?.status).toBe('archived');
    });

    it('should return null for an unknown draft id', () => {
      expect(archiveAiDraft(db, 'no-such-draft', LATER_ISO)).toBeNull();
    });

    it('should reject archiving a draft that is already archived', () => {
      const record = unwrap(createAiDraft(db, TICKER, makeDraftInput(), NOW_ISO));
      unwrap(archiveAiDraft(db, record.id, LATER_ISO) as StoreResult<typeof record>);

      const again = archiveAiDraft(db, record.id, LATER_ISO);

      expect(again).not.toBeNull();
      expect((again as StoreResult<typeof record>).ok).toBe(false);
      if (again !== null && !again.ok) {
        expect(again.errors).toEqual(['only a draft entry can be archived']);
      }
      expect(getAiDraftById(db, record.id)?.status).toBe('archived');
    });
  });

  describe('module export surface', () => {
    it('should export no delete, remove, promote, or approve function', () => {
      for (const exportName of Object.keys(aiDraftsModule)) {
        expect(exportName).not.toMatch(/delete|remove|promote|approve/i);
      }
    });

    it('should export exactly the archive-only draft operations', () => {
      expect(Object.keys(aiDraftsModule).sort()).toEqual([
        'archiveAiDraft',
        'createAiDraft',
        'getAiDraftById',
        'listAiDrafts',
      ]);
    });
  });
});
