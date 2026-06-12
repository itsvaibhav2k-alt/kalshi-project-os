import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as journalRoute from '@/app/api/paper-journal/route';
import * as journalTickerRoute from '@/app/api/paper-journal/[ticker]/route';
import * as journalEntriesRoute from '@/app/api/paper-journal/[ticker]/entries/route';
import * as journalEntryItemRoute from '@/app/api/paper-journal/entries/[entryId]/route';
import { saveBrief } from '@/lib/research-store/briefs';
import { closeAllDatabases, getDatabase } from '@/lib/research-store/db';
import { saveEstimate } from '@/lib/research-store/probabilityEstimates';
import { createSettlementSource } from '@/lib/research-store/settlementSources';
import { createSource } from '@/lib/research-store/sources';
import { createThesis } from '@/lib/research-store/theses';
import type {
  MarketSourceRecord,
  SettlementSourceRecord,
  SettlementVerificationStatus,
  StoreResult,
  ThesisRecord,
} from '@/lib/research-store/types';

const { GET: getAllEntries } = journalRoute;
const { GET: getTickerEntries } = journalTickerRoute;
const { POST: postEntry } = journalEntriesRoute;
const { PATCH: patchEntry } = journalEntryItemRoute;

/** The clearly-synthetic PAPER_TRADE-capable market in the fixture snapshots. */
const TICKER = 'SYNTH-PAPER-DEMO';
const UNKNOWN_TICKER = 'NO-SUCH-MARKET';
const INVALID_TICKER = 'bad ticker!';
const NOW_ISO = '2026-06-12T12:00:00.000Z';

let dataDir: string;
let savedDataDirEnv: string | undefined;

beforeEach(() => {
  savedDataDirEnv = process.env.KALSHI_DATA_DIR;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-paper-api-test-'));
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
  return new Request('http://localhost/api/paper-journal/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(method: 'POST' | 'PATCH', body: string): Request {
  return new Request('http://localhost/api/paper-journal/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function emptyRequest(method: 'POST'): Request {
  return new Request('http://localhost/api/paper-journal/test', { method });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function unwrap<T>(result: StoreResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got errors: ${result.errors.join('; ')}`);
  }
  return result.value;
}

interface SeededResearch {
  source: MarketSourceRecord;
  thesis: ThesisRecord;
}

/**
 * Seeds accepted research, a human-reviewed brief, a fair range with enough
 * edge against the fixture ask (implied 0.20, fair mid 0.30), and a ready
 * thesis — everything the PAPER_TRADE verdict needs except settlement.
 */
function seedReadyResearch(ticker: string = TICKER): SeededResearch {
  const db = getDatabase(NOW_ISO);
  const source = createSource(
    db,
    ticker,
    {
      marketId: `kalshi:${ticker}`,
      kind: 'official_resolution_source',
      title: 'Synthetic Demo Data Agency publication page',
      url: 'https://example.gov/synthetic-demo-index',
      credibility: 'official',
      status: 'accepted',
      addedBy: 'human',
    },
    NOW_ISO,
  );
  saveBrief(
    db,
    ticker,
    {
      state: 'human_reviewed',
      summary: 'Human-reviewed brief backed by the official publication page.',
      confidence: 'medium',
      basis: 'manual',
    },
    NOW_ISO,
  );
  const estimate = unwrap(
    saveEstimate(
      db,
      ticker,
      {
        low: 0.27,
        mid: 0.3,
        high: 0.34,
        rationale: 'Official publication history supports a fair value near 30 cents.',
        basis: 'human_entered',
        confidence: 'medium',
      },
      NOW_ISO,
    ),
  );
  const thesis = unwrap(
    createThesis(
      db,
      ticker,
      {
        status: 'ready_for_risk',
        thesis: 'The market underprices the officially published index trend.',
        whyMispriced: 'Recent official readings are not reflected in the price.',
        invalidationCriteria: 'A contrary official reading before the close date.',
        probabilityEstimateId: estimate.id,
        sourceIds: [source.id],
      },
      NOW_ISO,
    ),
  );
  return { source, thesis };
}

/** Seeds one settlement-source record with the given verification status. */
function seedSettlement(
  status: SettlementVerificationStatus,
  ticker: string = TICKER,
): SettlementSourceRecord {
  const db = getDatabase(NOW_ISO);
  return unwrap(
    createSettlementSource(
      db,
      ticker,
      {
        marketId: `kalshi:${ticker}`,
        title: 'Synthetic Demo Data Agency site',
        url: 'https://example.gov/synthetic-demo-agency',
        publisher: 'Synthetic Demo Data Agency',
        authorityType: 'official_government_source',
        status,
        verificationRationale:
          status === 'human_verified'
            ? 'URL matches the resolution agency named in the listed rules.'
            : null,
      },
      NOW_ISO,
    ),
  );
}

async function postPaperEntry(
  ticker: string = TICKER,
  request: Request = jsonRequest('POST', {}),
): Promise<Response> {
  return postEntry(request, routeContext({ ticker }));
}

describe('paper journal API routes', () => {
  describe('POST /api/paper-journal/[ticker]/entries', () => {
    it('should return 409 with the risk reasons when no research exists at all', async () => {
      const response = await postPaperEntry();
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.error).toBe(
        'Paper decision logging is locked until the deterministic verdict is PAPER_TRADE.',
      );
      expect(Array.isArray(body.fieldErrors)).toBe(true);
      expect((body.fieldErrors as string[]).length).toBeGreaterThan(0);
    });

    it('should return 409 when research is ready but no settlement record exists', async () => {
      seedReadyResearch();

      const response = await postPaperEntry();
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body.error).toBe(
        'Paper decision logging is locked until the deterministic verdict is PAPER_TRADE.',
      );
      expect((body.fieldErrors as string[]).some((reason) => /settlement/i.test(reason))).toBe(
        true,
      );
    });

    it('should return 409 when the only settlement record is a draft', async () => {
      seedReadyResearch();
      seedSettlement('draft');

      const response = await postPaperEntry();

      expect(response.status).toBe(409);
    });

    it('should return 409 when the only settlement record is rejected', async () => {
      seedReadyResearch();
      seedSettlement('rejected');

      const response = await postPaperEntry();

      expect(response.status).toBe(409);
    });

    it('should create a complete snapshot entry when the dossier verdict is PAPER_TRADE', async () => {
      const seeded = seedReadyResearch();
      const settlement = seedSettlement('human_verified');

      const response = await postPaperEntry();
      const body = await readJson(response);

      expect(response.status).toBe(201);
      const entry = body.paperEntry as Record<string, unknown>;

      expect(entry.marketTicker).toBe(TICKER);
      expect(entry.marketId).toBe(`kalshi:${TICKER}`);
      expect(entry.platform).toBe('kalshi');
      expect(entry.side).toBe('YES');
      expect(entry.status).toBe('logged');
      expect(entry.riskVerdict).toBe('PAPER_TRADE');

      // Paper price MUST be the current YES ask as a fraction (fixture ask 21c).
      expect(entry.paperPrice).toBeCloseTo(0.21, 10);
      expect(entry.impliedProbability).toBeCloseTo(0.2, 10);
      expect(entry.fairLow).toBeCloseTo(0.27, 10);
      expect(entry.fairMid).toBeCloseTo(0.3, 10);
      expect(entry.fairHigh).toBeCloseTo(0.34, 10);
      expect(entry.expectedEdge).toBeCloseTo(0.1, 10);
      expect(entry.confidence).toBe('medium');

      expect(entry.thesisId).toBe(seeded.thesis.id);
      expect(entry.thesisSnapshot).toBe(seeded.thesis.thesis);
      expect(entry.settlementSourceId).toBe(settlement.id);

      const settlementSnapshot = JSON.parse(entry.settlementSourceSnapshotJson as string) as {
        id: string;
        status: string;
      };
      expect(settlementSnapshot.id).toBe(settlement.id);
      expect(settlementSnapshot.status).toBe('human_verified');

      expect(JSON.parse(entry.researchSourceIdsJson as string)).toEqual([seeded.source.id]);
      const sourcesSnapshot = JSON.parse(entry.researchSourcesSnapshotJson as string) as Array<{
        id: string;
      }>;
      expect(sourcesSnapshot.map((record) => record.id)).toEqual([seeded.source.id]);

      const checklist = JSON.parse(entry.riskChecklistJson as string) as Array<{
        id: string;
        status: string;
      }>;
      expect(checklist).toHaveLength(12);
      for (const check of checklist) {
        expect(check.status).toBe('pass');
      }
      expect(JSON.parse(entry.riskReasonsJson as string)).toEqual([]);

      const marketSnapshot = JSON.parse(entry.marketSnapshotJson as string) as Record<
        string,
        unknown
      >;
      expect(marketSnapshot.externalId).toBe(TICKER);
      expect(marketSnapshot.raw).toBeNull();

      // Simulated decision snapshots only: no PnL/stake/lifecycle fields exist.
      for (const key of Object.keys(entry)) {
        expect(key).not.toMatch(/pnl|profit|stake|quantity|contracts|outcome|realized/i);
      }
    });

    it('should accept a POST without a body and default the side to YES', async () => {
      seedReadyResearch();
      seedSettlement('human_verified');

      const response = await postPaperEntry(TICKER, emptyRequest('POST'));
      const body = await readJson(response);

      expect(response.status).toBe(201);
      expect((body.paperEntry as Record<string, unknown>).side).toBe('YES');
    });

    it('should return 400 when the body requests a side other than YES', async () => {
      seedReadyResearch();
      seedSettlement('human_verified');

      const response = await postPaperEntry(TICKER, jsonRequest('POST', { side: 'NO' }));
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(Array.isArray(body.fieldErrors)).toBe(true);
    });

    it('should return 404 for a ticker missing from the current scan', async () => {
      const response = await postPaperEntry(UNKNOWN_TICKER);
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(typeof body.error).toBe('string');
    });

    it('should return 400 for an invalid ticker', async () => {
      const response = await postPaperEntry(INVALID_TICKER);

      expect(response.status).toBe(400);
    });

    it('should return 400 without stack traces when the body is malformed JSON', async () => {
      const response = await postPaperEntry(TICKER, rawRequest('POST', '{{{not json'));
      const body = await readJson(response);

      expect(response.status).toBe(400);
      const text = JSON.stringify(body);
      expect(text).not.toContain('Error:');
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain('/Users/');
      expect(text).not.toContain(process.cwd());
    });
  });

  describe('GET /api/paper-journal and GET /api/paper-journal/[ticker]', () => {
    it('should return empty lists when no entries exist', async () => {
      const allResponse = await getAllEntries();
      expect(allResponse.status).toBe(200);
      expect(await readJson(allResponse)).toEqual({ paperEntries: [] });

      const tickerResponse = await getTickerEntries(
        new Request('http://localhost/api/paper-journal/test'),
        routeContext({ ticker: TICKER }),
      );
      expect(tickerResponse.status).toBe(200);
      expect(await readJson(tickerResponse)).toEqual({ paperEntries: [] });
    });

    it('should return 400 for an invalid ticker on the per-ticker list', async () => {
      const response = await getTickerEntries(
        new Request('http://localhost/api/paper-journal/test'),
        routeContext({ ticker: INVALID_TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should list a created entry globally and per ticker', async () => {
      seedReadyResearch();
      seedSettlement('human_verified');
      const created = await readJson(await postPaperEntry());
      const entryId = (created.paperEntry as Record<string, unknown>).id;

      const allBody = await readJson(await getAllEntries());
      const allEntries = allBody.paperEntries as Array<Record<string, unknown>>;
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0].id).toBe(entryId);

      const tickerBody = await readJson(
        await getTickerEntries(
          new Request('http://localhost/api/paper-journal/test'),
          routeContext({ ticker: TICKER }),
        ),
      );
      expect((tickerBody.paperEntries as Array<Record<string, unknown>>)[0].id).toBe(entryId);
    });
  });

  describe('PATCH /api/paper-journal/entries/[entryId]', () => {
    async function createEntry(): Promise<string> {
      seedReadyResearch();
      seedSettlement('human_verified');
      const body = await readJson(await postPaperEntry());
      return (body.paperEntry as Record<string, unknown>).id as string;
    }

    it('should archive a logged entry and keep it listed', async () => {
      const entryId = await createEntry();

      const response = await patchEntry(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ entryId }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect((body.paperEntry as Record<string, unknown>).status).toBe('archived');

      const listed = await readJson(await getAllEntries());
      const entries = listed.paperEntries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('archived');
    });

    it('should reject any status other than archived', async () => {
      const entryId = await createEntry();

      const response = await patchEntry(
        jsonRequest('PATCH', { status: 'logged' }),
        routeContext({ entryId }),
      );

      expect(response.status).toBe(400);
    });

    it('should reject a patch with unexpected fields', async () => {
      const entryId = await createEntry();

      const response = await patchEntry(
        jsonRequest('PATCH', { status: 'archived', paperPrice: 0.5 }),
        routeContext({ entryId }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when archiving an already archived entry', async () => {
      const entryId = await createEntry();
      await patchEntry(jsonRequest('PATCH', { status: 'archived' }), routeContext({ entryId }));

      const response = await patchEntry(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ entryId }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 404 for an unknown entry id', async () => {
      const response = await patchEntry(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ entryId: 'no-such-entry' }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 without stack traces for malformed JSON', async () => {
      const entryId = await createEntry();

      const response = await patchEntry(rawRequest('PATCH', 'not json'), routeContext({ entryId }));
      const body = await readJson(response);

      expect(response.status).toBe(400);
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/\n\s+at /);
      expect(text).not.toContain('/Users/');
    });
  });

  describe('HTTP method allowlist', () => {
    const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'] as const;

    const routeModules: Array<{
      name: string;
      module: Record<string, unknown>;
      allowed: readonly string[];
    }> = [
      { name: '/api/paper-journal', module: journalRoute, allowed: ['GET'] },
      { name: '/api/paper-journal/[ticker]', module: journalTickerRoute, allowed: ['GET'] },
      {
        name: '/api/paper-journal/[ticker]/entries',
        module: journalEntriesRoute,
        allowed: ['POST'],
      },
      {
        name: '/api/paper-journal/entries/[entryId]',
        module: journalEntryItemRoute,
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
  });
});
