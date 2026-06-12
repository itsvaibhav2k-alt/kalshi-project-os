import { describe, expect, it } from 'vitest';

import type { NormalizedMarket } from '@/lib/markets/types';
import { estimateProbability } from '@/lib/probability/estimate';
import type { FairRange, ResearchLike } from '@/lib/probability/estimate';
import { formatProbability } from '@/lib/utils/format';

const CREATED_AT = '2026-06-11T12:00:00Z';

/** A complete, well-formed market for arranging test variations. */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: 'kalshi:TEST-MKT',
    platformId: 'kalshi',
    externalId: 'TEST-MKT',
    eventTicker: 'TEST-EVT',
    title: 'Will the maximum temperature at Central Park reach 88F on Jun 12?',
    category: 'Climate and Weather',
    yesBidCents: 39,
    yesAskCents: 42,
    noBidCents: 58,
    noAskCents: 61,
    lastPriceCents: 40,
    spreadCents: 3,
    volume: 18200,
    volume24h: 5400,
    openInterest: 9100,
    liquidityDollars: 25000,
    closeTime: '2026-06-12T22:00:00Z',
    expirationTime: '2026-06-13T00:00:00Z',
    status: 'active',
    rawStatus: 'active',
    rulesText:
      'Resolves YES if the maximum temperature recorded at Central Park station, according to the NWS daily climate report, is 88F or higher on June 12.',
    resolutionCriteria: 'Settled per the NWS daily climate report for Central Park (KNYC).',
    settlementSource: null,
    isProvisional: false,
    isMultivariate: false,
    flags: ['missing settlement source', 'not evaluated'],
    raw: {},
    ...overrides,
  };
}

/** A sourced research stand-in (the dossier passes a full ResearchBrief). */
function makeResearch(overrides: Partial<ResearchLike> = {}): ResearchLike {
  return {
    status: 'fixture',
    confidence: 'medium',
    sources: [{ id: 'src-1' }, { id: 'src-2' }],
    ...overrides,
  };
}

/** A valid caller-supplied fair range. */
function makeFairRange(overrides: Partial<FairRange> = {}): FairRange {
  return { low: 0.45, mid: 0.5, high: 0.55, ...overrides };
}

describe('estimateProbability', () => {
  describe('implied probability', () => {
    it('should use the bid/ask midpoint when both sides are listed', () => {
      const estimate = estimateProbability(makeMarket(), null, CREATED_AT);

      expect(estimate.marketImpliedProbability).toBeCloseTo(0.405, 10);
      expect(estimate.impliedProbabilityBasis).toBe('bid_ask_midpoint');
      expect(estimate.uncertaintyNotes.join(' ')).not.toContain('last traded price');
    });

    it('should fall back to last price and note it is weaker when a quote side is missing', () => {
      const market = makeMarket({ yesBidCents: null, lastPriceCents: 37 });

      const estimate = estimateProbability(market, null, CREATED_AT);

      expect(estimate.marketImpliedProbability).toBeCloseTo(0.37, 10);
      expect(estimate.impliedProbabilityBasis).toBe('last_price');
      expect(estimate.uncertaintyNotes.join(' ')).toContain('weaker than a bid/ask midpoint');
    });

    it('should return null with basis none and a note when no prices exist', () => {
      const market = makeMarket({
        yesBidCents: null,
        yesAskCents: null,
        lastPriceCents: null,
      });

      const estimate = estimateProbability(market, null, CREATED_AT);

      expect(estimate.marketImpliedProbability).toBeNull();
      expect(estimate.impliedProbabilityBasis).toBe('none');
      expect(estimate.uncertaintyNotes.join(' ')).toContain(
        'market-implied probability is unknown',
      );
    });
  });

  describe('fair probability', () => {
    it('should keep fair values null when research is null even with a fair range', () => {
      const estimate = estimateProbability(makeMarket(), null, CREATED_AT, makeFairRange());

      expect(estimate.fairProbabilityLow).toBeNull();
      expect(estimate.fairProbabilityMid).toBeNull();
      expect(estimate.fairProbabilityHigh).toBeNull();
      expect(estimate.expectedEdge).toBeNull();
    });

    it('should keep fair values null when research has no sources', () => {
      const research = makeResearch({ sources: [] });

      const estimate = estimateProbability(makeMarket(), research, CREATED_AT, makeFairRange());

      expect(estimate.fairProbabilityMid).toBeNull();
      expect(estimate.expectedEdge).toBeNull();
    });

    it('should keep fair values null when research status is not sourced or fixture', () => {
      const research = makeResearch({ status: 'not_run' });

      const estimate = estimateProbability(makeMarket(), research, CREATED_AT, makeFairRange());

      expect(estimate.fairProbabilityMid).toBeNull();
    });

    it('should keep fair values null when no fair range is supplied despite sources', () => {
      const estimate = estimateProbability(makeMarket(), makeResearch(), CREATED_AT);

      expect(estimate.fairProbabilityLow).toBeNull();
      expect(estimate.fairProbabilityMid).toBeNull();
      expect(estimate.fairProbabilityHigh).toBeNull();
      expect(estimate.uncertaintyNotes.join(' ')).toContain('no fair range was supplied');
    });

    it('should accept a valid fair range only when sourced research exists', () => {
      const estimate = estimateProbability(
        makeMarket(),
        makeResearch(),
        CREATED_AT,
        makeFairRange(),
      );

      expect(estimate.fairProbabilityLow).toBe(0.45);
      expect(estimate.fairProbabilityMid).toBe(0.5);
      expect(estimate.fairProbabilityHigh).toBe(0.55);
    });

    it('should discard a fair range whose ordering is invalid', () => {
      const estimate = estimateProbability(
        makeMarket(),
        makeResearch(),
        CREATED_AT,
        makeFairRange({ low: 0.6, mid: 0.5 }),
      );

      expect(estimate.fairProbabilityLow).toBeNull();
      expect(estimate.fairProbabilityMid).toBeNull();
      expect(estimate.fairProbabilityHigh).toBeNull();
      expect(estimate.uncertaintyNotes.join(' ')).toContain('fair range is invalid');
    });

    it('should discard a fair range outside [0, 1]', () => {
      const estimate = estimateProbability(
        makeMarket(),
        makeResearch(),
        CREATED_AT,
        makeFairRange({ high: 1.2 }),
      );

      expect(estimate.fairProbabilityMid).toBeNull();
      expect(estimate.uncertaintyNotes.join(' ')).toContain('fair range is invalid');
    });
  });

  describe('expected edge', () => {
    it('should compute fairMid minus implied when both are present', () => {
      const estimate = estimateProbability(
        makeMarket(),
        makeResearch(),
        CREATED_AT,
        makeFairRange(),
      );

      // fairMid 0.5 − implied midpoint 0.405
      expect(estimate.expectedEdge).toBeCloseTo(0.095, 10);
    });

    it('should be null when implied is missing even with a valid fair range', () => {
      const market = makeMarket({
        yesBidCents: null,
        yesAskCents: null,
        lastPriceCents: null,
      });

      const estimate = estimateProbability(market, makeResearch(), CREATED_AT, makeFairRange());

      expect(estimate.fairProbabilityMid).toBe(0.5);
      expect(estimate.expectedEdge).toBeNull();
    });
  });

  describe('confidence and sources', () => {
    it('should force confidence to low when sources are empty regardless of research claim', () => {
      const research = makeResearch({ confidence: 'high', sources: [] });

      const estimate = estimateProbability(makeMarket(), research, CREATED_AT);

      expect(estimate.confidence).toBe('low');
    });

    it('should force confidence to low when research is null', () => {
      const estimate = estimateProbability(makeMarket(), null, CREATED_AT);

      expect(estimate.confidence).toBe('low');
      expect(estimate.sourceIds).toEqual([]);
    });

    it('should pass through research confidence and source ids when sources exist', () => {
      const estimate = estimateProbability(makeMarket(), makeResearch(), CREATED_AT);

      expect(estimate.confidence).toBe('medium');
      expect(estimate.sourceIds).toEqual(['src-1', 'src-2']);
    });
  });

  describe('determinism', () => {
    it('should return identical output for identical input', () => {
      const market = makeMarket();
      const research = makeResearch();
      const fairRange = makeFairRange();

      expect(estimateProbability(market, research, CREATED_AT, fairRange)).toEqual(
        estimateProbability(market, research, CREATED_AT, fairRange),
      );
    });

    it('should echo the caller-supplied timestamp without reading a clock', () => {
      const estimate = estimateProbability(makeMarket(), null, '1999-01-01T00:00:00Z');

      expect(estimate.createdAt).toBe('1999-01-01T00:00:00Z');
    });
  });
});

describe('formatProbability', () => {
  it('should render a fraction as a whole percent', () => {
    expect(formatProbability(0.41)).toBe('41%');
    expect(formatProbability(0)).toBe('0%');
    expect(formatProbability(1)).toBe('100%');
  });

  it('should round to whole percent with no fake precision', () => {
    expect(formatProbability(0.405)).toBe('41%');
    expect(formatProbability(0.4149)).toBe('41%');
  });

  it('should render an em dash for null', () => {
    expect(formatProbability(null)).toBe('—');
  });
});
