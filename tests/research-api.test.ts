import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as bulkRoute from '@/app/api/research/route';
import * as tickerRoute from '@/app/api/research/[ticker]/route';
import * as briefRoute from '@/app/api/research/[ticker]/brief/route';
import * as probabilityRoute from '@/app/api/research/[ticker]/probability/route';
import * as sourcesRoute from '@/app/api/research/[ticker]/sources/route';
import * as sourceItemRoute from '@/app/api/research/[ticker]/sources/[sourceId]/route';
import * as thesisRoute from '@/app/api/research/[ticker]/thesis/route';
import * as thesisItemRoute from '@/app/api/research/[ticker]/thesis/[thesisId]/route';
import { closeAllDatabases } from '@/lib/research-store/db';

const { GET: getBulk } = bulkRoute;
const { GET: getTicker } = tickerRoute;
const { POST: postSource } = sourcesRoute;
const { PATCH: patchSource } = sourceItemRoute;
const { POST: postBrief } = briefRoute;
const { POST: postProbability } = probabilityRoute;
const { POST: postThesis } = thesisRoute;
const { PATCH: patchThesis } = thesisItemRoute;

const TICKER = 'TEST-MARKET';
const OTHER_TICKER = 'OTHER-MARKET';
const INVALID_TICKER = 'bad ticker!';

const EMPTY_SUMMARY = {
  acceptedSourceCount: 0,
  hasHumanReviewedBrief: false,
  hasFairProbability: false,
  hasReadyThesis: false,
  researchConfidence: 'low',
};

let dataDir: string;
let savedDataDirEnv: string | undefined;

beforeEach(() => {
  savedDataDirEnv = process.env.KALSHI_DATA_DIR;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-api-test-'));
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

async function createDraftSource(
  ticker: string = TICKER,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await postSource(
    jsonRequest('POST', {
      title: 'CPI release schedule',
      kind: 'data',
      credibility: 'official',
      url: 'https://www.bls.gov/schedule/news_release/cpi.htm',
      ...overrides,
    }),
    routeContext({ ticker }),
  );
  expect(response.status).toBe(201);
  const body = await readJson(response);
  const source = body.source as { id: string };
  return source.id;
}

async function createAcceptedSource(ticker: string = TICKER): Promise<string> {
  const sourceId = await createDraftSource(ticker);
  const response = await patchSource(
    jsonRequest('PATCH', { status: 'accepted' }),
    routeContext({ ticker, sourceId }),
  );
  expect(response.status).toBe(200);
  return sourceId;
}

async function createEstimate(ticker: string = TICKER): Promise<string> {
  const response = await postProbability(
    jsonRequest('POST', {
      low: 0.25,
      mid: 0.3,
      high: 0.4,
      rationale: 'Official schedule confirms the release window.',
      basis: 'human_entered',
      confidence: 'medium',
    }),
    routeContext({ ticker }),
  );
  expect(response.status).toBe(201);
  const body = await readJson(response);
  const estimate = body.probabilityEstimate as { id: string };
  return estimate.id;
}

async function fetchSummary(ticker: string = TICKER): Promise<Record<string, unknown>> {
  const response = await getTicker(
    new Request('http://localhost/api/research/test'),
    routeContext({ ticker }),
  );
  expect(response.status).toBe(200);
  const body = await readJson(response);
  return body.summary as Record<string, unknown>;
}

describe('research API routes', () => {
  describe('GET /api/research', () => {
    it('should return an empty map when no research exists', async () => {
      const response = await getBulk();

      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({});
    });

    it('should return a safe default summary when a ticker has only draft rows', async () => {
      await createDraftSource();

      const response = await getBulk();
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body[TICKER]).toEqual(EMPTY_SUMMARY);
    });

    it('should expose only summary fields and never source lists or brief bodies', async () => {
      await createAcceptedSource();
      const briefResponse = await postBrief(
        jsonRequest('POST', {
          state: 'human_reviewed',
          confidence: 'medium',
          basis: 'manual',
          summary: 'A distinctive brief body sentence.',
        }),
        routeContext({ ticker: TICKER }),
      );
      expect(briefResponse.status).toBe(201);

      const response = await getBulk();
      const body = await readJson(response);
      const summary = body[TICKER] as Record<string, unknown>;

      expect(Object.keys(summary).sort()).toEqual([
        'acceptedSourceCount',
        'hasFairProbability',
        'hasHumanReviewedBrief',
        'hasReadyThesis',
        'researchConfidence',
      ]);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('CPI release schedule');
      expect(serialized).not.toContain('A distinctive brief body sentence.');
    });

    it('should recompute hasHumanReviewedBrief from current rows when sources decay', async () => {
      const sourceId = await createAcceptedSource();
      await postBrief(
        jsonRequest('POST', { state: 'human_reviewed', confidence: 'medium', basis: 'manual' }),
        routeContext({ ticker: TICKER }),
      );

      const before = await readJson(await getBulk());
      expect((before[TICKER] as Record<string, unknown>).hasHumanReviewedBrief).toBe(true);
      expect((before[TICKER] as Record<string, unknown>).researchConfidence).toBe('medium');

      await patchSource(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, sourceId }),
      );

      const after = await readJson(await getBulk());
      expect((after[TICKER] as Record<string, unknown>).hasHumanReviewedBrief).toBe(false);
      expect((after[TICKER] as Record<string, unknown>).researchConfidence).toBe('low');
    });
  });

  describe('GET /api/research/[ticker]', () => {
    it('should return the empty safe state when the ticker has no rows', async () => {
      const response = await getTicker(
        new Request('http://localhost/api/research/test'),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ticker: TICKER,
        sources: [],
        brief: null,
        probabilityEstimate: null,
        thesis: null,
        summary: EMPTY_SUMMARY,
      });
    });

    it('should return 400 when the ticker is invalid', async () => {
      const response = await getTicker(
        new Request('http://localhost/api/research/test'),
        routeContext({ ticker: INVALID_TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
      expect(Array.isArray(body.fieldErrors)).toBe(true);
    });

    it('should return full source records with a recomputed summary', async () => {
      await createAcceptedSource();

      const response = await getTicker(
        new Request('http://localhost/api/research/test'),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const sources = body.sources as Array<Record<string, unknown>>;

      expect(sources).toHaveLength(1);
      expect(sources[0].status).toBe('accepted');
      expect(sources[0].title).toBe('CPI release schedule');
      expect((body.summary as Record<string, unknown>).acceptedSourceCount).toBe(1);
    });
  });

  describe('POST /api/research/[ticker]/sources', () => {
    it('should create a draft source with server-side defaults', async () => {
      const response = await postSource(
        jsonRequest('POST', { title: 'NOAA forecast page', kind: 'data', credibility: 'official' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const source = body.source as Record<string, unknown>;

      expect(response.status).toBe(201);
      expect(source.status).toBe('draft');
      expect(source.addedBy).toBe('human');
      expect(source.marketTicker).toBe(TICKER);
      expect(source.marketId).toBe(`kalshi:${TICKER}`);
    });

    it('should return 400 with field errors when the title is missing', async () => {
      const response = await postSource(
        jsonRequest('POST', { kind: 'news', credibility: 'medium' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.fieldErrors).toContain('title is required and must be non-empty');
    });

    it('should return 400 when the ticker is invalid', async () => {
      const response = await postSource(
        jsonRequest('POST', { title: 'A source', kind: 'news', credibility: 'medium' }),
        routeContext({ ticker: INVALID_TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when the body is not valid JSON', async () => {
      const response = await postSource(
        rawRequest('POST', 'not json at all'),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(typeof body.error).toBe('string');
    });

    it('should return 400 when the url is not http(s)', async () => {
      const response = await postSource(
        jsonRequest('POST', {
          title: 'A source',
          kind: 'news',
          credibility: 'medium',
          url: 'ftp://example.com/file',
        }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/research/[ticker]/sources/[sourceId]', () => {
    it('should accept a source and reflect it in the recomputed GET summary', async () => {
      const sourceId = await createDraftSource();

      const response = await patchSource(
        jsonRequest('PATCH', { status: 'accepted' }),
        routeContext({ ticker: TICKER, sourceId }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect((body.source as Record<string, unknown>).status).toBe('accepted');

      const summary = await fetchSummary();
      expect(summary.acceptedSourceCount).toBe(1);
    });

    it('should return 404 when the source id is unknown', async () => {
      const response = await patchSource(
        jsonRequest('PATCH', { status: 'accepted' }),
        routeContext({ ticker: TICKER, sourceId: 'no-such-source' }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 when the source belongs to a different market', async () => {
      const sourceId = await createDraftSource(OTHER_TICKER);

      const response = await patchSource(
        jsonRequest('PATCH', { status: 'accepted' }),
        routeContext({ ticker: TICKER, sourceId }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 400 when the status value is invalid', async () => {
      const sourceId = await createDraftSource();

      const response = await patchSource(
        jsonRequest('PATCH', { status: 'approved' }),
        routeContext({ ticker: TICKER, sourceId }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/research/[ticker]/brief', () => {
    it('should return 400 for human_reviewed when there are no accepted sources', async () => {
      const response = await postBrief(
        jsonRequest('POST', { state: 'human_reviewed', confidence: 'low', basis: 'manual' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.fieldErrors).toContain('state human_reviewed requires at least 1 accepted source');
    });

    it('should coerce a draft brief to insufficient_sources when no sources are accepted', async () => {
      const response = await postBrief(
        jsonRequest('POST', { state: 'draft', confidence: 'low', basis: 'manual' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const brief = body.brief as Record<string, unknown>;

      expect(response.status).toBe(201);
      expect(brief.state).toBe('insufficient_sources');
      expect(brief.confidence).toBe('low');
      expect(brief.sourceCount).toBe(0);
    });

    it('should persist a human_reviewed brief when an accepted source exists', async () => {
      await createAcceptedSource();

      const response = await postBrief(
        jsonRequest('POST', { state: 'human_reviewed', confidence: 'medium', basis: 'manual' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const brief = body.brief as Record<string, unknown>;

      expect(response.status).toBe(201);
      expect(brief.state).toBe('human_reviewed');
      expect(brief.confidence).toBe('medium');
      expect(brief.sourceCount).toBe(1);

      const summary = await fetchSummary();
      expect(summary.hasHumanReviewedBrief).toBe(true);
      expect(summary.researchConfidence).toBe('medium');
    });

    it('should return 400 when required brief fields are missing', async () => {
      const response = await postBrief(
        jsonRequest('POST', { summary: 'text only' }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/research/[ticker]/probability', () => {
    it('should return 400 and write nothing when there are no accepted sources', async () => {
      const response = await postProbability(
        jsonRequest('POST', {
          low: 0.2,
          mid: 0.3,
          high: 0.4,
          rationale: 'Some rationale.',
          basis: 'human_entered',
          confidence: 'low',
        }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.fieldErrors).toContain(
        'a non-fixture fair range requires at least 1 accepted source',
      );

      const stateResponse = await getTicker(
        new Request('http://localhost/api/research/test'),
        routeContext({ ticker: TICKER }),
      );
      const state = await readJson(stateResponse);
      expect(state.probabilityEstimate).toBeNull();
    });

    it('should persist a fair range as fractions when an accepted source exists', async () => {
      await createAcceptedSource();

      const response = await postProbability(
        jsonRequest('POST', {
          low: 0.25,
          mid: 0.3,
          high: 0.4,
          rationale: 'Official schedule confirms the release window.',
          basis: 'human_entered',
          confidence: 'medium',
        }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const estimate = body.probabilityEstimate as Record<string, unknown>;

      expect(response.status).toBe(201);
      expect(estimate.low).toBe(0.25);
      expect(estimate.mid).toBe(0.3);
      expect(estimate.high).toBe(0.4);
      expect(estimate.sourceCount).toBe(1);

      const summary = await fetchSummary();
      expect(summary.hasFairProbability).toBe(true);
    });

    it('should return 400 when the range ordering is violated', async () => {
      await createAcceptedSource();

      const response = await postProbability(
        jsonRequest('POST', {
          low: 0.5,
          mid: 0.3,
          high: 0.6,
          rationale: 'Bad ordering.',
          basis: 'human_entered',
          confidence: 'low',
        }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when values look like percent instead of fractions', async () => {
      await createAcceptedSource();

      const response = await postProbability(
        jsonRequest('POST', {
          low: 25,
          mid: 30,
          high: 40,
          rationale: 'Percent values, not fractions.',
          basis: 'human_entered',
          confidence: 'low',
        }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when confidence is missing or invalid', async () => {
      await createAcceptedSource();

      const response = await postProbability(
        jsonRequest('POST', {
          low: 0.2,
          mid: 0.3,
          high: 0.4,
          rationale: 'Missing confidence.',
          basis: 'human_entered',
        }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/research/[ticker]/thesis and PATCH thesis/[thesisId]', () => {
    it('should create a draft thesis', async () => {
      const response = await postThesis(
        jsonRequest('POST', { thesis: 'The market underprices the official schedule.' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);
      const thesis = body.thesis as Record<string, unknown>;

      expect(response.status).toBe(201);
      expect(thesis.status).toBe('draft');
    });

    it('should return 400 when the thesis text is empty', async () => {
      const response = await postThesis(
        jsonRequest('POST', { thesis: '   ' }),
        routeContext({ ticker: TICKER }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when created directly as ready_for_risk without links', async () => {
      const response = await postThesis(
        jsonRequest('POST', { thesis: 'Not actually ready.', status: 'ready_for_risk' }),
        routeContext({ ticker: TICKER }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(Array.isArray(body.fieldErrors)).toBe(true);
    });

    it('should mark a fully linked thesis ready and reflect it in summaries', async () => {
      const sourceId = await createAcceptedSource();
      const estimateId = await createEstimate();

      const created = await postThesis(
        jsonRequest('POST', {
          thesis: 'The implied probability ignores the official schedule.',
          sourceIds: [sourceId],
          probabilityEstimateId: estimateId,
        }),
        routeContext({ ticker: TICKER }),
      );
      const createdBody = await readJson(created);
      const thesisId = (createdBody.thesis as { id: string }).id;

      const patched = await patchThesis(
        jsonRequest('PATCH', { status: 'ready_for_risk' }),
        routeContext({ ticker: TICKER, thesisId }),
      );
      const patchedBody = await readJson(patched);

      expect(patched.status).toBe(200);
      expect((patchedBody.thesis as Record<string, unknown>).status).toBe('ready_for_risk');

      const summary = await fetchSummary();
      expect(summary.hasReadyThesis).toBe(true);

      const bulk = await readJson(await getBulk());
      expect((bulk[TICKER] as Record<string, unknown>).hasReadyThesis).toBe(true);
    });

    it('should return 400 when marking ready without a linked estimate', async () => {
      const sourceId = await createAcceptedSource();

      const created = await postThesis(
        jsonRequest('POST', { thesis: 'Linked sources but no estimate.', sourceIds: [sourceId] }),
        routeContext({ ticker: TICKER }),
      );
      const thesisId = ((await readJson(created)).thesis as { id: string }).id;

      const patched = await patchThesis(
        jsonRequest('PATCH', { status: 'ready_for_risk' }),
        routeContext({ ticker: TICKER, thesisId }),
      );
      const body = await readJson(patched);

      expect(patched.status).toBe(400);
      expect(body.fieldErrors).toContain('a linked probability estimate is required');
    });

    it('should decay a ready thesis in summaries when a linked source is rejected', async () => {
      const sourceId = await createAcceptedSource();
      const estimateId = await createEstimate();
      const created = await postThesis(
        jsonRequest('POST', {
          thesis: 'Ready now, decayed later.',
          status: 'ready_for_risk',
          sourceIds: [sourceId],
          probabilityEstimateId: estimateId,
        }),
        routeContext({ ticker: TICKER }),
      );
      expect(created.status).toBe(201);
      expect((await fetchSummary()).hasReadyThesis).toBe(true);

      await patchSource(
        jsonRequest('PATCH', { status: 'rejected' }),
        routeContext({ ticker: TICKER, sourceId }),
      );

      const summary = await fetchSummary();
      expect(summary.hasReadyThesis).toBe(false);
      expect(summary.hasFairProbability).toBe(false);
    });

    it('should return 404 when the thesis id is unknown', async () => {
      const response = await patchThesis(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, thesisId: 'no-such-thesis' }),
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 when the thesis belongs to a different market', async () => {
      const created = await postThesis(
        jsonRequest('POST', { thesis: 'Belongs to the other market.' }),
        routeContext({ ticker: OTHER_TICKER }),
      );
      const thesisId = ((await readJson(created)).thesis as { id: string }).id;

      const response = await patchThesis(
        jsonRequest('PATCH', { status: 'archived' }),
        routeContext({ ticker: TICKER, thesisId }),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('error hygiene', () => {
    it('should never leak stack frames or absolute paths in error responses', async () => {
      const errorResponses = await Promise.all([
        getTicker(
          new Request('http://localhost/api/research/test'),
          routeContext({ ticker: INVALID_TICKER }),
        ),
        postSource(rawRequest('POST', '{{{'), routeContext({ ticker: TICKER })),
        patchSource(
          jsonRequest('PATCH', { status: 'accepted' }),
          routeContext({ ticker: TICKER, sourceId: 'missing' }),
        ),
        postProbability(
          jsonRequest('POST', {
            low: 0.2,
            mid: 0.3,
            high: 0.4,
            rationale: 'No accepted sources yet.',
            basis: 'human_entered',
            confidence: 'low',
          }),
          routeContext({ ticker: TICKER }),
        ),
        patchThesis(
          jsonRequest('PATCH', { status: 'archived' }),
          routeContext({ ticker: TICKER, thesisId: 'missing' }),
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
      { name: '/api/research', module: bulkRoute, allowed: ['GET'] },
      { name: '/api/research/[ticker]', module: tickerRoute, allowed: ['GET'] },
      { name: '/api/research/[ticker]/sources', module: sourcesRoute, allowed: ['POST'] },
      {
        name: '/api/research/[ticker]/sources/[sourceId]',
        module: sourceItemRoute,
        allowed: ['PATCH'],
      },
      { name: '/api/research/[ticker]/brief', module: briefRoute, allowed: ['POST'] },
      { name: '/api/research/[ticker]/probability', module: probabilityRoute, allowed: ['POST'] },
      { name: '/api/research/[ticker]/thesis', module: thesisRoute, allowed: ['POST'] },
      {
        name: '/api/research/[ticker]/thesis/[thesisId]',
        module: thesisItemRoute,
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
