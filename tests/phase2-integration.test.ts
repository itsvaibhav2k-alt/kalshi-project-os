import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildMarketDossier, summarizeEvaluations } from '@/lib/dossier/buildMarketDossier';
import type { NormalizedMarket } from '@/lib/markets/types';
import {
  buildCategoryIndex,
  normalizeKalshiMarket,
} from '@/lib/platforms/kalshi/normalize';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
} from '@/lib/platforms/kalshi/types';
import type { RiskCheckResult } from '@/lib/risk/types';
import eventsFixtureJson from '@/tests/fixtures/kalshi-events.json';
import marketsFixtureJson from '@/tests/fixtures/kalshi-markets.json';

const marketsFixture = marketsFixtureJson as unknown as KalshiMarketsResponse;
const eventsFixture = eventsFixtureJson as unknown as KalshiEventsResponse;

const NOW_ISO = '2026-06-11T12:00:00Z';

/** Normalizes every fixture market with the real category index. */
function normalizeFixtureMarkets(): NormalizedMarket[] {
  const categoryIndex = buildCategoryIndex(eventsFixture.events);
  return marketsFixture.markets.map((raw) => normalizeKalshiMarket(raw, categoryIndex));
}

/** Normalizes one fixture market by ticker, failing loudly when absent. */
function normalizeFixtureMarket(ticker: string): NormalizedMarket {
  const market = normalizeFixtureMarkets().find((entry) => entry.externalId === ticker);
  if (market === undefined) {
    throw new Error(`expected fixture market '${ticker}' to be present`);
  }
  return market;
}

/** Finds one check result by id, failing loudly when it is absent. */
function findCheck(checks: RiskCheckResult[], id: string): RiskCheckResult {
  const check = checks.find((entry) => entry.id === id);
  if (check === undefined) {
    throw new Error(`expected check '${id}' to be present`);
  }
  return check;
}

describe('buildMarketDossier', () => {
  describe('composition', () => {
    it('should compose all five sections from a real fixture market when given a fixed timestamp', () => {
      // Arrange
      const market = normalizeFixtureMarket('KXELONMARS-99');

      // Act
      const dossier = buildMarketDossier(market, NOW_ISO);

      // Assert: every section is present and belongs to the same market.
      expect(dossier.market).toBe(market);
      expect(dossier.understanding.marketId).toBe(market.id);
      expect(dossier.researchBrief.marketId).toBe(market.id);
      expect(dossier.probabilityEstimate.marketId).toBe(market.id);
      expect(dossier.riskEvaluation.marketId).toBe(market.id);
      expect(dossier.source).toBe('derived');
    });

    it('should stamp every derived section with the injected timestamp, never a clock', () => {
      const market = normalizeFixtureMarket('KXELONMARS-99');

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(dossier.researchBrief.createdAt).toBe(NOW_ISO);
      expect(dossier.probabilityEstimate.createdAt).toBe(NOW_ISO);
      expect(dossier.riskEvaluation.evaluatedAt).toBe(NOW_ISO);
    });

    it('should always carry a not_run research brief with no sources in Phase 2', () => {
      const market = normalizeFixtureMarket('KXELONMARS-99');

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(dossier.researchBrief.status).toBe('not_run');
      expect(dossier.researchBrief.sources).toEqual([]);
      expect(dossier.researchBrief.confidence).toBe('low');
    });

    it('should derive an implied probability from listed prices but never a fair probability', () => {
      // KXELONMARS-99 lists yes bid 8 / ask 10 cents => midpoint 0.09.
      const market = normalizeFixtureMarket('KXELONMARS-99');

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(dossier.probabilityEstimate.marketImpliedProbability).toBeCloseTo(0.09, 10);
      expect(dossier.probabilityEstimate.impliedProbabilityBasis).toBe('bid_ask_midpoint');
      expect(dossier.probabilityEstimate.fairProbabilityMid).toBeNull();
      expect(dossier.probabilityEstimate.expectedEdge).toBeNull();
    });

    it('should hard-code hasWrittenThesis to false so the thesis check always fails in Phase 2', () => {
      const market = normalizeFixtureMarket('KXELONMARS-99');

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(findCheck(dossier.riskEvaluation.checks, 'written_thesis').status).toBe('fail');
    });

    it('should return deep-equal dossiers for the same market and timestamp', () => {
      const market = normalizeFixtureMarket('KXELONMARS-99');

      expect(buildMarketDossier(market, NOW_ISO)).toEqual(buildMarketDossier(market, NOW_ISO));
    });
  });

  describe('settlement source behavior on live-like data', () => {
    it('should return SKIP with a settlement-source reason when the source is missing from the payload', () => {
      // No Kalshi public payload includes a settlement source; this fixture
      // market is live-like and must SKIP with the explaining reason.
      const market = normalizeFixtureMarket('KXELONMARS-99');
      expect(market.settlementSource).toBeNull();

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(dossier.understanding.settlementSourceStatus).toBe('missing');
      expect(dossier.riskEvaluation.verdict).toBe('SKIP');
      expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
      expect(
        dossier.riskEvaluation.reasons.some((reason) =>
          reason.includes('No settlement source is listed in the public payload.'),
        ),
      ).toBe(true);
    });

    it('should return SKIP for every fixture market because none carries a settlement source', () => {
      const markets = normalizeFixtureMarkets();
      expect(markets.length).toBeGreaterThan(0);

      for (const market of markets) {
        const dossier = buildMarketDossier(market, NOW_ISO);

        expect(dossier.riskEvaluation.verdict).toBe('SKIP');
        expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
      }
    });
  });

  describe('understanding and risk consistency', () => {
    it('should fail resolution_clarity for an ambiguous fixture market and flag the ambiguity', () => {
      // KXELONMARS-99 is predictive ("Will ... before ...") but its rules
      // name no measurement source, so understanding marks it ambiguous.
      const market = normalizeFixtureMarket('KXELONMARS-99');

      const dossier = buildMarketDossier(market, NOW_ISO);

      expect(dossier.understanding.resolutionClarity).toBe('ambiguous');
      expect(dossier.understanding.ambiguityFlags.length).toBeGreaterThan(0);
      expect(findCheck(dossier.riskEvaluation.checks, 'resolution_clarity').status).toBe('fail');
    });

    it('should keep resolution clarity and the resolution_clarity check consistent on every fixture market', () => {
      for (const market of normalizeFixtureMarkets()) {
        const dossier = buildMarketDossier(market, NOW_ISO);
        const check = findCheck(dossier.riskEvaluation.checks, 'resolution_clarity');

        if (dossier.understanding.resolutionClarity === 'clear') {
          expect(check.status).toBe('pass');
        } else {
          expect(check.status).toBe('fail');
          expect(dossier.riskEvaluation.reasons).toContain(check.reason);
        }
      }
    });
  });
});

describe('summarizeEvaluations', () => {
  it('should evaluate every input market and tally verdicts that sum to the evaluated count', () => {
    const markets = normalizeFixtureMarkets();

    const summary = summarizeEvaluations(markets, NOW_ISO);

    expect(summary.evaluated).toBe(markets.length);
    expect(summary.understood).toBe(markets.length);
    expect(summary.skip + summary.watch + summary.paperTrade).toBe(summary.evaluated);
  });

  it('should report zero sourced research in Phase 2 because the engine does not exist', () => {
    const summary = summarizeEvaluations(normalizeFixtureMarkets(), NOW_ISO);

    expect(summary.researchSourced).toBe(0);
  });

  it('should return all-zero counts for an empty market list', () => {
    const summary = summarizeEvaluations([], NOW_ISO);

    expect(summary).toEqual({
      understood: 0,
      researchSourced: 0,
      evaluated: 0,
      skip: 0,
      watch: 0,
      paperTrade: 0,
    });
  });

  it('should be deterministic for the same markets and timestamp', () => {
    const markets = normalizeFixtureMarkets();

    expect(summarizeEvaluations(markets, NOW_ISO)).toEqual(
      summarizeEvaluations(markets, NOW_ISO),
    );
  });
});

describe('lib/dossier purity', () => {
  const FORBIDDEN_FRAGMENTS = ['fetch(', 'Date.now', 'new Date(', 'process.env'] as const;

  it('should contain no network, clock, or environment code in any lib/dossier file', () => {
    const dossierDir = fileURLToPath(new URL('../lib/dossier', import.meta.url));
    const files = fs.readdirSync(dossierDir).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(`${dossierDir}/${file}`, 'utf8');
      for (const fragment of FORBIDDEN_FRAGMENTS) {
        expect(content, `${file} must not contain '${fragment}'`).not.toContain(fragment);
      }
    }
  });
});
