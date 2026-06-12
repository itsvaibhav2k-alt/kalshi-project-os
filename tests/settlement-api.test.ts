import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as bulkRoute from '@/app/api/research/route';
import * as tickerRoute from '@/app/api/research/[ticker]/route';
import * as settlementRoute from '@/app/api/research/[ticker]/settlement-source/route';
import * as settlementItemRoute from '@/app/api/research/[ticker]/settlement-source/[settlementSourceId]/route';
import * as sourcesRoute from '@/app/api/research/[ticker]/sources/route';
import * as sourceItemRoute from '@/app/api/research/[ticker]/sources/[sourceId]/route';
import { closeAllDatabases } from '@/lib/research-store/db';

const { GET: getBulk } = bulkRoute;
const { GET: getTicker } = tickerRoute;
const { GET: getSettlement, POST: postSettlement } = settlementRoute;
const { PATCH: patchSettlement } = settlementItemRoute;
const { POST: postSource } = sourcesRoute;
const { PATCH: patchSource } = sourceItemRoute;

const TICKER = 'TEST-MARKET';
const OTHER_TICKER = 'OTHER-MARKET';
const INVALID_TICKER = 'bad ticker!';

const VERIFIED_FIELDS = {
  title: 'BLS CPI news release',
  url: 'https://www.bls.gov/cpi/',
  publisher: 'Bureau of Labor Statistics',
  authorityType: 'official_government_source',
  verificationRationale: 'Matches the resolution source named in the market rules.',
};

let dataDir: string;
let savedDataDirEnv: string | undefined;

beforeEach(() => {
  savedDataDirEnv = process.env.KALSHI_DATA_DIR;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-settlement-test-'));
  process.env.KALSHI_DATA_DIR = dataDir;
});

afterEach(() => {
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
  return new Request('http://localhost/api/research/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawRequest(method: 'POST' | 'PATCH', body: string): Request {
  return new Request('http://localhost/api/research/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function createSettlementRecord(
  ticker: string = TICKER,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await postSettlement(
    jsonRequest('POST', { title: 'Resolution source candidate', ...overrides }),
    routeContext({ ticker }),
  );
  expect(response.status).toBe(201);
  const body = await readJson(response);
  return body.settlementSource as Record<string, unknown>;
}

async function fetchSettlementState(ticker: string = TICKER): Promise<Record<string, unknown>> {
  const response = await getSettlement(
    new Request('http://localhost/api/research/test'),
    routeContext({ ticker }),
  );
  expect(response.status).toBe(200);
  return readJson(response);
}

describe('settlement source API routes', () => {
  describe('GET /api/research/[ticker]/settlement-source', () => {
    it('should return the empty safe state when the ticker has no records', async () => {
      const body = await fetchSettlementState();

      expect(body).toEqual({ settlementSources: [], verifiedSettlementSource: null });
    });

    it('should return 400 when the ticker is invalid', async () => {
      const response = await getSettlement(
        new Request('http://localhost/api/research/test'),
        routeContext({ ticker: INVALID_TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
      expect(Array.isArray(body.fieldErrors)).toBe(true);
    });
  });

  describe('POST /api/research/[ticker]/settlement-source', () => {
    it('should create a draft record from a title-only payload with server defaults', async () => {
      const record = await createSettlementRecord();

      expect(record.status).toBe('draft');
      expect(record.title).toBe('Resolution source candidate');
      expect(record.marketTicker).toBe(TICKER);
      expect(record.marketId).toBe(`kalshi:${TICKER}`);
      expect(record.authorityType).toBeNull();
      expect(record.url).toBeNull();
      expect(record.verificationRationale).toBeNull();
    });

    it('should return 400 with field errors when the title is missing', async () => {
      const response = await postSettlement(
        jsonRequest('POST', { url: 'https://www.bls.gov/cpi/' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.fieldErrors).toContain('title is required and must be non-empty');
    });

    it('should return 400 for human_verified without url, authorityType, and rationale', async () => {
      const response = await postSettlement(
        jsonRequest('POST', { title: 'Unverifiable claim', status: 'human_verified' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.fieldErrors).toContain('status human_verified requires a valid http(s) url');
      expect(body.fieldErrors).toContain('status human_verified requires a valid authorityType');
      expect(body.fieldErrors).toContain(
        'status human_verified requires a non-empty verificationRationale',
      );

      const state = await fetchSettlementState();
      expect(state.settlementSources).toEqual([]);
      expect(state.verifiedSettlementSource).toBeNull();
    });

    it('should return 400 when authorityType is not in the union', async () => {
      const response = await postSettlement(
        jsonRequest('POST', { title: 'Bad type', authorityType: 'trusted_blog' }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should persist a human_verified record and expose it as the active verified source', async () => {
      const record = await createSettlementRecord(TICKER, {
        ...VERIFIED_FIELDS,
        status: 'human_verified',
      });

      expect(record.status).toBe('human_verified');
      expect(record.authorityType).toBe('official_government_source');

      const state = await fetchSettlementState();
      expect(state.verifiedSettlementSource).toEqual({
        id: record.id,
        title: VERIFIED_FIELDS.title,
        url: VERIFIED_FIELDS.url,
        publisher: VERIFIED_FIELDS.publisher,
        authorityType: VERIFIED_FIELDS.authorityType,
        updatedAt: record.updatedAt,
      });
    });

    it('should return 400 when the ticker is invalid', async () => {
      const response = await postSettlement(
        jsonRequest('POST', { title: 'A settlement source' }),
        routeContext({ ticker: INVALID_TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when the body is not valid JSON', async () => {
      const response = await postSettlement(
        rawRequest('POST', 'not json at all'),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
    });
  });

  describe('PATCH /api/research/[ticker]/settlement-source/[settlementSourceId]', () => {
    it('should refuse a transition into human_verified without the required fields', async () => {
      const record = await createSettlementRecord();

      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'human_verified' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(Array.isArray(body.fieldErrors)).toBe(true);

      const state = await fetchSettlementState();
      const records = state.settlementSources as Array<Record<string, unknown>>;
      expect(records[0].status).toBe('draft');
      expect(state.verifiedSettlementSource).toBeNull();
    });

    it('should verify a draft when every required field is supplied', async () => {
      const record = await createSettlementRecord();

      const response = await patchSettlement(
        jsonRequest('PATCH', { ...VERIFIED_FIELDS, status: 'human_verified' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect((body.settlementSource as Record<string, unknown>).status).toBe('human_verified');

      const state = await fetchSettlementState();
      const verified = state.verifiedSettlementSource as Record<string, unknown>;
      expect(verified.id).toBe(record.id);
      expect(verified.authorityType).toBe('official_government_source');
    });

    it('should never count a rejected record as verified', async () => {
      const record = await createSettlementRecord();

      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );

      expect(response.status).toBe(200);

      const state = await fetchSettlementState();
      expect(state.verifiedSettlementSource).toBeNull();
    });

    it('should stop counting a previously verified record after it is rejected', async () => {
      const record = await createSettlementRecord(TICKER, {
        ...VERIFIED_FIELDS,
        status: 'human_verified',
      });
      expect((await fetchSettlementState()).verifiedSettlementSource).not.toBeNull();

      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );

      expect(response.status).toBe(200);
      expect((await fetchSettlementState()).verifiedSettlementSource).toBeNull();
    });

    it('should select the latest verified record and fall back when it is rejected', async () => {
      const first = await createSettlementRecord(TICKER, {
        ...VERIFIED_FIELDS,
        status: 'human_verified',
      });
      const second = await createSettlementRecord(TICKER, {
        ...VERIFIED_FIELDS,
        title: 'BLS CPI news release (mirror)',
        status: 'human_verified',
      });

      const active = (await fetchSettlementState()).verifiedSettlementSource as Record<
        string,
        unknown
      >;
      expect(active.id).toBe(second.id);

      await patchSettlement(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, settlementSourceId: second.id as string }),
      );

      const fallback = (await fetchSettlementState()).verifiedSettlementSource as Record<
        string,
        unknown
      >;
      expect(fallback.id).toBe(first.id);
    });

    it('should return 404 when the record id is unknown', async () => {
      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, settlementSourceId: 'no-such-record' }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 when the record belongs to a different market', async () => {
      const record = await createSettlementRecord(OTHER_TICKER);

      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 when the status value is invalid', async () => {
      const record = await createSettlementRecord();

      const response = await patchSettlement(
        jsonRequest('PATCH', { status: 'approved' }),
        routeContext({ ticker: TICKER, settlementSourceId: record.id as string }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('research sources never verify settlement', () => {
    it('should keep verifiedSettlementSource null even with an accepted official_resolution_source', async () => {
      const sourceResponse = await postSource(
        jsonRequest('POST', {
          title: 'Official resolution source',
          kind: 'official_resolution_source',
          credibility: 'official',
          url: 'https://www.bls.gov/cpi/',
        }),
        routeContext({ ticker: TICKER }),
      );
      expect(sourceResponse.status).toBe(201);
      const sourceId = ((await readJson(sourceResponse)).source as { id: string }).id;

      const accepted = await patchSource(
        jsonRequest('PATCH', { status: 'accepted' }),
        routeContext({ ticker: TICKER, sourceId }),
      );
      expect(accepted.status).toBe(200);

      const state = await fetchSettlementState();
      expect(state.settlementSources).toEqual([]);
      expect(state.verifiedSettlementSource).toBeNull();

      const tickerState = await readJson(
        await getTicker(
          new Request('http://localhost/api/research/test'),
          routeContext({ ticker: TICKER }),
        ),
      );
      expect((tickerState.summary as Record<string, unknown>).verifiedSettlementSource).toBeNull();
    });
  });

  describe('summary and ticker-listing wiring', () => {
    it('should expose verifiedSettlementSource and settlementSources in the ticker state', async () => {
      const record = await createSettlementRecord(TICKER, {
        ...VERIFIED_FIELDS,
        status: 'human_verified',
      });

      const state = await readJson(
        await getTicker(
          new Request('http://localhost/api/research/test'),
          routeContext({ ticker: TICKER }),
        ),
      );

      const settlementSources = state.settlementSources as Array<Record<string, unknown>>;
      expect(settlementSources).toHaveLength(1);
      expect(settlementSources[0].id).toBe(record.id);

      const summary = state.summary as Record<string, unknown>;
      const verified = summary.verifiedSettlementSource as Record<string, unknown>;
      expect(verified.id).toBe(record.id);
      expect(verified.authorityType).toBe('official_government_source');
    });

    it('should include a settlement-only ticker in the bulk research map', async () => {
      await createSettlementRecord();

      const body = await readJson(await getBulk());
      const summary = body[TICKER] as Record<string, unknown>;

      expect(summary).toBeDefined();
      expect(summary.acceptedSourceCount).toBe(0);
      expect(summary.verifiedSettlementSource).toBeNull();
    });
  });

  describe('error hygiene', () => {
    it('should never leak stack frames or absolute paths in error responses', async () => {
      const errorResponses = await Promise.all([
        getSettlement(
          new Request('http://localhost/api/research/test'),
          routeContext({ ticker: INVALID_TICKER }),
        ),
        postSettlement(rawRequest('POST', '{{{'), routeContext({ ticker: TICKER })),
        postSettlement(
          jsonRequest('POST', { title: 'Missing fields', status: 'human_verified' }),
          routeContext({ ticker: TICKER }),
        ),
        patchSettlement(
          jsonRequest('PATCH', { status: 'rejected' }),
          routeContext({ ticker: TICKER, settlementSourceId: 'missing' }),
        ),
      ]);

      for (const response of errorResponses) {
        expect(response.status === 400 || response.status === 404).toBe(true);
        const text = JSON.stringify(await response.json());
        expect(text).not.toContain('Error:');
        expect(text).not.toMatch(/\n\s+at /);
        expect(text).not.toContain('/Users/');
        expect(text).not.toContain(process.cwd());
        expect(text).not.toContain('node_modules');
      }
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
        name: '/api/research/[ticker]/settlement-source',
        module: settlementRoute,
        allowed: ['GET', 'POST'],
      },
      {
        name: '/api/research/[ticker]/settlement-source/[settlementSourceId]',
        module: settlementItemRoute,
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
