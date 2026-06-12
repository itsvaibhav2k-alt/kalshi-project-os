import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as aiDraftItemRoute from '@/app/api/research/[ticker]/ai-drafts/[draftId]/route';
import * as aiDraftsRoute from '@/app/api/research/[ticker]/ai-drafts/route';
import { closeAllDatabases, getDatabase } from '@/lib/research-store/db';
import { listPaperEntries } from '@/lib/research-store/paperJournal';
import { getResearchState } from '@/lib/research-store/summary';
import { AI_RESEARCH_DRAFT_TYPES } from '@/lib/research-store/types';

const { GET: getDrafts, POST: postDrafts } = aiDraftsRoute;
const { PATCH: patchDraft } = aiDraftItemRoute;

/** The clearly-synthetic fixture market used as the draft subject. */
const TICKER = 'SYNTH-PAPER-DEMO';
/** A different real fixture ticker, used for ticker-mismatch checks. */
const OTHER_TICKER = 'KXELONMARS-99';
const UNKNOWN_TICKER = 'NO-SUCH-MARKET';
const INVALID_TICKER = 'bad ticker!';
const NOW_ISO = '2026-06-12T12:00:00.000Z';

/** Exact key set of the compact input snapshot (derived scalars only). */
const SNAPSHOT_KEYS = [
  'acceptedSourceCount',
  'hasFairProbability',
  'hasHumanReviewedBrief',
  'hasReadyThesis',
  'hasVerifiedSettlement',
  'impliedProbability',
  'marketId',
  'resolutionClarity',
  'riskReasons',
  'settlementSourceStatus',
  'ticker',
  'title',
  'userFocus',
  'verdict',
  'yesAskCents',
] as const;

let dataDir: string;
let savedDataDirEnv: string | undefined;

beforeEach(() => {
  savedDataDirEnv = process.env.KALSHI_DATA_DIR;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-ai-drafts-api-test-'));
  process.env.KALSHI_DATA_DIR = dataDir;
  vi.stubEnv('KALSHI_MARKETS_SOURCE', 'fixture');
});

afterEach(() => {
  vi.unstubAllEnvs();
  closeAllDatabases();
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (savedDataDirEnv === undefined) {
    delete process.env.KALSHI_DATA_DIR;
  } else {
    process.env.KALSHI_DATA_DIR = savedDataDirEnv;
  }
});

function routeContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): Request {
  return new Request('http://localhost/api/research/test/ai-drafts', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(method: 'POST' | 'PATCH', body: string): Request {
  return new Request('http://localhost/api/research/test/ai-drafts', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function postDraft(
  draftType: string,
  ticker: string = TICKER,
  userFocus?: string,
): Promise<Response> {
  const body: Record<string, unknown> = { draftType };
  if (userFocus !== undefined) {
    body.userFocus = userFocus;
  }
  return postDrafts(jsonRequest('POST', body), routeContext({ ticker }));
}

async function listDrafts(ticker: string = TICKER): Promise<Response> {
  return getDrafts(
    new Request('http://localhost/api/research/test/ai-drafts'),
    routeContext({ ticker }),
  );
}

async function createDraftId(): Promise<string> {
  const body = await readJson(await postDraft('research_questions'));
  return (body.aiDraft as Record<string, unknown>).id as string;
}

describe('AI research drafts API routes', () => {
  describe('GET /api/research/[ticker]/ai-drafts', () => {
    it('should return an empty list when no drafts exist', async () => {
      const response = await listDrafts();

      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({ aiDrafts: [] });
    });

    it('should return 400 for an invalid ticker', async () => {
      const response = await listDrafts(INVALID_TICKER);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/research/[ticker]/ai-drafts', () => {
    it.each([...AI_RESEARCH_DRAFT_TYPES])(
      'should create a %s draft with fallback provenance when the market is in the scan',
      async (draftType) => {
        const response = await postDraft(draftType);
        const body = await readJson(response);

        expect(response.status).toBe(201);
        const draft = body.aiDraft as Record<string, unknown>;
        expect(draft.marketTicker).toBe(TICKER);
        expect(draft.draftType).toBe(draftType);
        expect(draft.status).toBe('draft');
        expect(draft.provider).toBe('local_deterministic');
        expect(draft.model).toBe('phase5_fallback');
        expect(draft.promptVersion).toBe('phase5.v1');
        expect(typeof draft.outputMarkdown).toBe('string');
        expect((draft.outputMarkdown as string).length).toBeGreaterThan(0);
      },
    );

    it('should store a compact derived-scalars snapshot when a draft is created', async () => {
      const response = await postDraft('missing_info', TICKER, 'check the data release cadence');
      const body = await readJson(response);

      expect(response.status).toBe(201);
      const draft = body.aiDraft as Record<string, unknown>;
      const snapshot = JSON.parse(draft.inputSnapshotJson as string) as Record<string, unknown>;

      expect(Object.keys(snapshot).sort()).toEqual([...SNAPSHOT_KEYS]);
      expect(snapshot.ticker).toBe(TICKER);
      expect(snapshot.verdict).toBe('SKIP');
      expect(Array.isArray(snapshot.riskReasons)).toBe(true);
      expect((snapshot.riskReasons as string[]).length).toBeGreaterThan(0);
      expect(snapshot.yesAskCents).toBe(21);
      expect(snapshot.userFocus).toBe('check the data release cadence');

      // Derived scalars only: no raw payloads, rules text, env, or secrets.
      for (const key of Object.keys(snapshot)) {
        expect(key).not.toMatch(/raw|rules|payload|env|secret|token|credential/i);
      }
      for (const value of Object.values(snapshot)) {
        const scalar =
          value === null || ['string', 'number', 'boolean'].includes(typeof value);
        expect(scalar || Array.isArray(value)).toBe(true);
      }
    });

    it('should generate a draft when no AI env vars are set', async () => {
      expect(process.env.AI_RESEARCH_API_KEY).toBeUndefined();

      const response = await postDraft('skeptical_countercase');

      expect(response.status).toBe(201);
    });

    it('should return 400 with field errors when the draftType is unknown', async () => {
      const response = await postDraft('hot_take');
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(Array.isArray(body.fieldErrors)).toBe(true);
      expect((body.fieldErrors as string[]).length).toBeGreaterThan(0);
    });

    it('should return 400 for an invalid ticker', async () => {
      const response = await postDraft('research_questions', INVALID_TICKER);

      expect(response.status).toBe(400);
    });

    it('should return 404 for a valid-format ticker missing from the current scan', async () => {
      const response = await postDraft('research_questions', UNKNOWN_TICKER);
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(typeof body.error).toBe('string');
    });

    it('should return 400 without stack traces when the body is malformed JSON', async () => {
      const response = await postDrafts(
        rawRequest('POST', '{{{not json'),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain('/Users/');
      expect(text).not.toContain(process.cwd());
    });
  });

  describe('PATCH /api/research/[ticker]/ai-drafts/[draftId]', () => {
    it('should archive a draft and keep it listed', async () => {
      const draftId = await createDraftId();

      const response = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, draftId }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect((body.aiDraft as Record<string, unknown>).status).toBe('archived');

      const listed = await readJson(await listDrafts());
      const drafts = listed.aiDrafts as Array<Record<string, unknown>>;
      expect(drafts).toHaveLength(1);
      expect(drafts[0].status).toBe('archived');
    });

    it('should return 400 when archiving an already archived draft', async () => {
      const draftId = await createDraftId();
      await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, draftId }),
      );

      const response = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, draftId }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 404 for an unknown draft id', async () => {
      const response = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, draftId: 'no-such-draft' }),
      );

      expect(response.status).toBe(404);
    });

    it.each([
      ['a non-archived status', { status: 'draft' }],
      ['an unexpected extra field', { status: 'archived', extra: 1 }],
      ['an empty object', {}],
    ])('should return 400 when the payload is %s', async (_label, payload) => {
      const draftId = await createDraftId();

      const response = await patchDraft(
        jsonRequest('PATCH', payload),
        routeContext({ ticker: TICKER, draftId }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 404 when the draft belongs to a different ticker', async () => {
      const draftId = await createDraftId();

      const response = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: OTHER_TICKER, draftId }),
      );

      expect(response.status).toBe(404);

      // The draft is untouched and still archivable under its own ticker.
      const listed = await readJson(await listDrafts());
      expect((listed.aiDrafts as Array<Record<string, unknown>>)[0].status).toBe('draft');
    });

    it('should return 400 for an invalid ticker', async () => {
      const response = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: INVALID_TICKER, draftId: 'irrelevant' }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 without stack traces for malformed JSON', async () => {
      const draftId = await createDraftId();

      const response = await patchDraft(
        rawRequest('PATCH', 'not json'),
        routeContext({ ticker: TICKER, draftId }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain('/Users/');
    });
  });

  describe('research and paper state isolation', () => {
    it('should leave the research state and paper journal unchanged when drafts are created and archived', async () => {
      const db = getDatabase(NOW_ISO);
      const stateBefore = JSON.stringify(getResearchState(db, TICKER));
      expect(listPaperEntries(db, TICKER)).toEqual([]);

      let firstDraftId: string | null = null;
      for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
        const body = await readJson(await postDraft(draftType));
        const draft = body.aiDraft as Record<string, unknown>;
        if (firstDraftId === null) {
          firstDraftId = draft.id as string;
        }
      }
      const archiveResponse = await patchDraft(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, draftId: firstDraftId as string }),
      );
      expect(archiveResponse.status).toBe(200);

      const stateAfter = JSON.stringify(getResearchState(db, TICKER));
      expect(stateAfter).toBe(stateBefore);
      expect(listPaperEntries(db, TICKER)).toEqual([]);

      const listed = await readJson(await listDrafts());
      expect(listed.aiDrafts as Array<Record<string, unknown>>).toHaveLength(
        AI_RESEARCH_DRAFT_TYPES.length,
      );
    });
  });

  describe('HTTP method allowlist', () => {
    const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'] as const;

    const routeModules: Array<{
      name: string;
      module: Record<string, unknown>;
      allowed: readonly string[];
    }> = [
      {
        name: '/api/research/[ticker]/ai-drafts',
        module: aiDraftsRoute,
        allowed: ['GET', 'POST'],
      },
      {
        name: '/api/research/[ticker]/ai-drafts/[draftId]',
        module: aiDraftItemRoute,
        allowed: ['PATCH'],
      },
    ];

    it.each(routeModules)('should export only allowed methods from $name', ({
      module,
      allowed,
    }) => {
      for (const method of HTTP_METHODS) {
        if (allowed.includes(method)) {
          expect(typeof module[method]).toBe('function');
        } else {
          expect(module[method]).toBeUndefined();
        }
      }
    });

    it('should export exactly the handlers plus the dynamic flag from each route module', () => {
      expect(Object.keys(aiDraftsRoute).sort()).toEqual(['GET', 'POST', 'dynamic']);
      expect(Object.keys(aiDraftItemRoute).sort()).toEqual(['PATCH', 'dynamic']);
      expect(aiDraftsRoute.dynamic).toBe('force-dynamic');
      expect(aiDraftItemRoute.dynamic).toBe('force-dynamic');
    });
  });
});
