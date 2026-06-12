import { describe, expect, it } from 'vitest';

import { ALL_DATA_FLAGS } from '@/lib/markets/types';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
  KalshiRawMarket,
} from '@/lib/platforms/kalshi/types';
import {
  buildCategoryIndex,
  deriveFlags,
  deriveSpreadCents,
  mapStatus,
  normalizeKalshiMarket,
  parseDollarsToCents,
  parseFixedPoint,
} from '@/lib/platforms/kalshi/normalize';
import eventsFixtureJson from '@/tests/fixtures/kalshi-events.json';
import marketsFixtureJson from '@/tests/fixtures/kalshi-markets.json';

const marketsFixture = marketsFixtureJson as unknown as KalshiMarketsResponse;
const eventsFixture = eventsFixtureJson as unknown as KalshiEventsResponse;

const FLAG_BASE = {
  spreadCents: 1 as number | null,
  openInterest: 5000 as number | null,
  volume: 100 as number | null,
  rulesText: 'Some rules.' as string | null,
  settlementSource: 'Some source' as string | null,
  isMultivariate: false,
  isProvisional: false,
};

describe('parseDollarsToCents', () => {
  it('should return integer cents when given a valid dollar string', () => {
    expect(parseDollarsToCents('0.4100')).toBe(41);
  });

  it('should return 0 when given a zero dollar string', () => {
    expect(parseDollarsToCents('0.0000')).toBe(0);
  });

  it('should return 100 when given one dollar', () => {
    expect(parseDollarsToCents('1.0000')).toBe(100);
  });

  it('should return null when given a malformed string', () => {
    expect(parseDollarsToCents('abc')).toBeNull();
    expect(parseDollarsToCents('0.41.00')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
  });

  it('should return null when given null or undefined', () => {
    expect(parseDollarsToCents(null)).toBeNull();
    expect(parseDollarsToCents(undefined)).toBeNull();
  });
});

describe('parseFixedPoint', () => {
  it('should return a number when given a valid fixed-point string', () => {
    expect(parseFixedPoint('18200.00')).toBe(18200);
  });

  it('should preserve fractional values when present', () => {
    expect(parseFixedPoint('94864.88')).toBeCloseTo(94864.88);
  });

  it('should return 0 when given a zero string', () => {
    expect(parseFixedPoint('0.00')).toBe(0);
  });

  it('should return null when given a malformed string', () => {
    expect(parseFixedPoint('not-a-number')).toBeNull();
    expect(parseFixedPoint('')).toBeNull();
  });

  it('should return null when given null or undefined', () => {
    expect(parseFixedPoint(null)).toBeNull();
    expect(parseFixedPoint(undefined)).toBeNull();
  });
});

describe('deriveSpreadCents', () => {
  it('should return ask minus bid when both sides are present', () => {
    expect(deriveSpreadCents(8, 10)).toBe(2);
  });

  it('should return null when the bid side is null', () => {
    expect(deriveSpreadCents(null, 10)).toBeNull();
  });

  it('should return null when the ask side is null', () => {
    expect(deriveSpreadCents(8, null)).toBeNull();
  });

  it('should return null when both sides are null', () => {
    expect(deriveSpreadCents(null, null)).toBeNull();
  });
});

describe('mapStatus', () => {
  it('should return active when raw status is active', () => {
    expect(mapStatus('active')).toBe('active');
  });

  it('should return closed when raw status is closed', () => {
    expect(mapStatus('closed')).toBe('closed');
  });

  it('should return settled when raw status is settled', () => {
    expect(mapStatus('settled')).toBe('settled');
  });

  it('should return settled when raw status is finalized', () => {
    expect(mapStatus('finalized')).toBe('settled');
  });

  it('should return unknown when raw status is unrecognized', () => {
    expect(mapStatus('paused')).toBe('unknown');
    expect(mapStatus('')).toBe('unknown');
  });
});

describe('deriveFlags', () => {
  it('should include wide spread when spread exceeds 4 cents', () => {
    const flags = deriveFlags({ ...FLAG_BASE, spreadCents: 5 });
    expect(flags).toContain('wide spread');
  });

  it('should not include wide spread when spread is 4 cents or below', () => {
    expect(deriveFlags({ ...FLAG_BASE, spreadCents: 4 })).not.toContain('wide spread');
  });

  it('should not include wide spread when spread is null', () => {
    expect(deriveFlags({ ...FLAG_BASE, spreadCents: null })).not.toContain('wide spread');
  });

  it('should include thin open interest when open interest is below 1000', () => {
    expect(deriveFlags({ ...FLAG_BASE, openInterest: 999 })).toContain('thin open interest');
  });

  it('should not include thin open interest when open interest is 1000 or more', () => {
    expect(deriveFlags({ ...FLAG_BASE, openInterest: 1000 })).not.toContain('thin open interest');
  });

  it('should not include thin open interest when open interest is null', () => {
    expect(deriveFlags({ ...FLAG_BASE, openInterest: null })).not.toContain('thin open interest');
  });

  it('should include zero volume when volume is exactly zero', () => {
    expect(deriveFlags({ ...FLAG_BASE, volume: 0 })).toContain('zero volume');
  });

  it('should not include zero volume when volume is positive or null', () => {
    expect(deriveFlags({ ...FLAG_BASE, volume: 10 })).not.toContain('zero volume');
    expect(deriveFlags({ ...FLAG_BASE, volume: null })).not.toContain('zero volume');
  });

  it('should include missing rules when rules text is null', () => {
    expect(deriveFlags({ ...FLAG_BASE, rulesText: null })).toContain('missing rules');
  });

  it('should not include missing rules when rules text is present', () => {
    expect(deriveFlags(FLAG_BASE)).not.toContain('missing rules');
  });

  it('should include missing settlement source when the field is absent', () => {
    const flags = deriveFlags({ ...FLAG_BASE, settlementSource: null });
    expect(flags).toContain('missing settlement source');
  });

  it('should not include missing settlement source when the field is present', () => {
    expect(deriveFlags(FLAG_BASE)).not.toContain('missing settlement source');
  });

  it('should include likely junk / parlay when the market is multivariate', () => {
    expect(deriveFlags({ ...FLAG_BASE, isMultivariate: true })).toContain('likely junk / parlay');
  });

  it('should include likely junk / parlay when the market is provisional', () => {
    expect(deriveFlags({ ...FLAG_BASE, isProvisional: true })).toContain('likely junk / parlay');
  });

  it('should always include not evaluated as the last flag', () => {
    const clean = deriveFlags(FLAG_BASE);
    expect(clean[clean.length - 1]).toBe('not evaluated');
    const noisy = deriveFlags({
      ...FLAG_BASE,
      spreadCents: 50,
      openInterest: 0,
      volume: 0,
      rulesText: null,
      settlementSource: null,
      isMultivariate: true,
    });
    expect(noisy[noisy.length - 1]).toBe('not evaluated');
  });

  it('should only emit flags from the approved vocabulary', () => {
    const flags = deriveFlags({
      ...FLAG_BASE,
      spreadCents: 50,
      openInterest: 0,
      volume: 0,
      rulesText: null,
      settlementSource: null,
      isMultivariate: true,
      isProvisional: true,
    });
    for (const flag of flags) {
      expect(ALL_DATA_FLAGS).toContain(flag);
    }
  });
});

describe('normalizeKalshiMarket', () => {
  const categoryIndex = buildCategoryIndex(eventsFixture.events);

  it('should normalize a fixture market with all fields mapped', () => {
    const raw = marketsFixture.markets[0];

    const market = normalizeKalshiMarket(raw, categoryIndex);

    expect(market.id).toBe('kalshi:KXELONMARS-99');
    expect(market.platformId).toBe('kalshi');
    expect(market.externalId).toBe('KXELONMARS-99');
    expect(market.eventTicker).toBe('KXELONMARS-99');
    expect(market.title).toBe('Will Elon Musk visit Mars before Aug 1, 2099?');
    expect(market.category).toBe('World');
    expect(market.yesBidCents).toBe(8);
    expect(market.yesAskCents).toBe(10);
    expect(market.noBidCents).toBe(90);
    expect(market.noAskCents).toBe(92);
    expect(market.lastPriceCents).toBe(8);
    expect(market.spreadCents).toBe(2);
    expect(market.volume).toBeCloseTo(94864.88);
    expect(market.volume24h).toBe(9);
    expect(market.openInterest).toBeCloseTo(32755.57);
    expect(market.liquidityDollars).toBe(0);
    expect(market.closeTime).toBe('2099-08-01T04:59:00Z');
    expect(market.expirationTime).toBe('2099-08-08T15:00:00Z');
    expect(market.status).toBe('active');
    expect(market.rawStatus).toBe('active');
    expect(market.rulesText).toContain('Elon Musk');
    expect(market.settlementSource).toBeNull();
    expect(market.isProvisional).toBe(false);
    expect(market.isMultivariate).toBe(false);
    expect(market.flags).toContain('missing settlement source');
    expect(market.flags).not.toContain('missing rules');
    expect(market.flags[market.flags.length - 1]).toBe('not evaluated');
  });

  it('should preserve the raw payload by reference', () => {
    const raw = marketsFixture.markets[0];

    const market = normalizeKalshiMarket(raw, categoryIndex);

    expect(market.raw).toBe(raw);
  });

  it('should mark multivariate provisional fixture markets as junk-flagged', () => {
    const raw = marketsFixture.markets.find(
      (m) => typeof m.mve_collection_ticker === 'string' && m.mve_collection_ticker.length > 0,
    ) as KalshiRawMarket;

    const market = normalizeKalshiMarket(raw, categoryIndex);

    expect(market.isMultivariate).toBe(true);
    expect(market.isProvisional).toBe(true);
    expect(market.flags).toContain('likely junk / parlay');
    expect(market.flags).toContain('zero volume');
    expect(market.flags).toContain('missing rules');
  });

  it('should use null for missing fields instead of inventing values', () => {
    const sparse: KalshiRawMarket = { ticker: 'SPARSE-1', title: 'Sparse market' };

    const market = normalizeKalshiMarket(sparse, categoryIndex);

    expect(market.id).toBe('kalshi:SPARSE-1');
    expect(market.eventTicker).toBeNull();
    expect(market.category).toBeNull();
    expect(market.yesBidCents).toBeNull();
    expect(market.yesAskCents).toBeNull();
    expect(market.noBidCents).toBeNull();
    expect(market.noAskCents).toBeNull();
    expect(market.lastPriceCents).toBeNull();
    expect(market.spreadCents).toBeNull();
    expect(market.volume).toBeNull();
    expect(market.volume24h).toBeNull();
    expect(market.openInterest).toBeNull();
    expect(market.liquidityDollars).toBeNull();
    expect(market.closeTime).toBeNull();
    expect(market.expirationTime).toBeNull();
    expect(market.rulesText).toBeNull();
    expect(market.resolutionCriteria).toBeNull();
    expect(market.settlementSource).toBeNull();
    expect(market.status).toBe('unknown');
    expect(market.rawStatus).toBe('');
  });

  it('should treat empty rules strings as missing rules', () => {
    const raw: KalshiRawMarket = { ticker: 'EMPTY-RULES', title: 'X', rules_primary: '' };

    const market = normalizeKalshiMarket(raw, {});

    expect(market.rulesText).toBeNull();
    expect(market.flags).toContain('missing rules');
  });
});

describe('buildCategoryIndex', () => {
  it('should map event tickers to categories from the events fixture', () => {
    const index = buildCategoryIndex(eventsFixture.events);

    expect(index['KXELONMARS-99']).toBe('World');
    expect(index['KXNEWPOPE-70']).toBe('Elections');
    expect(index['KXWARMING-50']).toBe('Climate and Weather');
    expect(index['KXCOLONIZEMARS-50']).toBe('Science and Technology');
  });

  it('should skip events when ticker or category is missing', () => {
    const index = buildCategoryIndex([
      { event_ticker: 'A', category: 'World' },
      { event_ticker: 'B' },
      { category: 'Orphan' },
    ]);

    expect(index).toEqual({ A: 'World' });
  });

  it('should return an empty index when given no events', () => {
    expect(buildCategoryIndex([])).toEqual({});
  });
});
