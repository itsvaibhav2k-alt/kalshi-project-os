import { describe, expect, it } from 'vitest';

import {
  applyJunkFilter,
  computeCounts,
  filterByCategory,
  filterByStatus,
  isJunk,
  searchMarkets,
} from '@/lib/markets/filters';
import type { NormalizedMarket } from '@/lib/markets/types';

function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: 'kalshi:TEST-1',
    platformId: 'kalshi',
    externalId: 'TEST-1',
    eventTicker: 'TEST',
    title: 'Will the test pass?',
    category: 'World',
    yesBidCents: 40,
    yesAskCents: 42,
    noBidCents: 58,
    noAskCents: 60,
    lastPriceCents: 41,
    spreadCents: 2,
    volume: 1200,
    volume24h: 30,
    openInterest: 5000,
    liquidityDollars: 100,
    closeTime: '2030-01-01T00:00:00Z',
    expirationTime: '2030-01-01T00:00:00Z',
    status: 'active',
    rawStatus: 'active',
    rulesText: 'Resolves yes when the test passes.',
    resolutionCriteria: null,
    settlementSource: null,
    isProvisional: false,
    isMultivariate: false,
    flags: ['missing settlement source', 'not evaluated'],
    raw: {},
    ...overrides,
  };
}

describe('isJunk', () => {
  it('should return true when a multivariate parlay has zero volume and zero open interest', () => {
    const parlay = makeMarket({ isMultivariate: true, volume: 0, openInterest: 0 });
    expect(isJunk(parlay)).toBe(true);
  });

  it('should return true when a provisional market has zero volume and zero open interest', () => {
    const provisional = makeMarket({ isProvisional: true, volume: 0, openInterest: 0 });
    expect(isJunk(provisional)).toBe(true);
  });

  it('should return false when a multivariate market has real volume', () => {
    const traded = makeMarket({ isMultivariate: true, volume: 500, openInterest: 0 });
    expect(isJunk(traded)).toBe(false);
  });

  it('should return false when a normal market has zero volume', () => {
    const quiet = makeMarket({ volume: 0, openInterest: 0 });
    expect(isJunk(quiet)).toBe(false);
  });

  it('should return true when the title is missing or empty', () => {
    expect(isJunk(makeMarket({ title: '' }))).toBe(true);
    expect(isJunk(makeMarket({ title: '   ' }))).toBe(true);
  });

  it('should return false for a normal active market', () => {
    expect(isJunk(makeMarket())).toBe(false);
  });
});

describe('applyJunkFilter', () => {
  it('should keep normal markets and count filtered junk', () => {
    const normal = makeMarket({ id: 'kalshi:GOOD' });
    const junk = makeMarket({
      id: 'kalshi:JUNK',
      isMultivariate: true,
      isProvisional: true,
      volume: 0,
      openInterest: 0,
    });

    const result = applyJunkFilter([normal, junk]);

    expect(result.kept).toEqual([normal]);
    expect(result.junkFiltered).toBe(1);
  });

  it('should not mutate the input array', () => {
    const markets = [makeMarket(), makeMarket({ title: '' })];
    const before = [...markets];

    applyJunkFilter(markets);

    expect(markets).toEqual(before);
  });

  it('should return empty results when given no markets', () => {
    expect(applyJunkFilter([])).toEqual({ kept: [], junkFiltered: 0 });
  });
});

describe('searchMarkets', () => {
  const markets = [
    makeMarket({ id: 'kalshi:A', title: 'Will Elon Musk visit Mars?', externalId: 'KXMARS' }),
    makeMarket({ id: 'kalshi:B', title: 'Who will the next Pope be?', externalId: 'KXPOPE' }),
    makeMarket({ id: 'kalshi:C', title: 'Warming question', category: 'Climate and Weather' }),
  ];

  it('should match titles case-insensitively when query differs in case', () => {
    const result = searchMarkets(markets, 'eLoN');
    expect(result.map((m) => m.id)).toEqual(['kalshi:A']);
  });

  it('should match tickers when the query is a ticker fragment', () => {
    const result = searchMarkets(markets, 'kxpope');
    expect(result.map((m) => m.id)).toEqual(['kalshi:B']);
  });

  it('should match categories when the query is a category fragment', () => {
    const result = searchMarkets(markets, 'climate');
    expect(result.map((m) => m.id)).toEqual(['kalshi:C']);
  });

  it('should return all markets when the query is empty or whitespace', () => {
    expect(searchMarkets(markets, '')).toEqual(markets);
    expect(searchMarkets(markets, '   ')).toEqual(markets);
  });

  it('should return no markets when nothing matches', () => {
    expect(searchMarkets(markets, 'zzz-no-match')).toEqual([]);
  });
});

describe('filterByCategory', () => {
  const markets = [
    makeMarket({ id: 'kalshi:A', category: 'World' }),
    makeMarket({ id: 'kalshi:B', category: 'Elections' }),
    makeMarket({ id: 'kalshi:C', category: null }),
  ];

  it('should return only markets in the category when one is given', () => {
    const result = filterByCategory(markets, 'Elections');
    expect(result.map((m) => m.id)).toEqual(['kalshi:B']);
  });

  it('should return all markets when category is null', () => {
    expect(filterByCategory(markets, null)).toEqual(markets);
  });
});

describe('filterByStatus', () => {
  const markets = [
    makeMarket({ id: 'kalshi:A', status: 'active' }),
    makeMarket({ id: 'kalshi:B', status: 'closed' }),
    makeMarket({ id: 'kalshi:C', status: 'settled' }),
  ];

  it('should return only markets with the status when one is given', () => {
    const result = filterByStatus(markets, 'closed');
    expect(result.map((m) => m.id)).toEqual(['kalshi:B']);
  });

  it('should return all markets when status is null', () => {
    expect(filterByStatus(markets, null)).toEqual(markets);
  });
});

describe('computeCounts', () => {
  it('should return the counts envelope when given pipeline numbers', () => {
    expect(computeCounts(120, 15, 105)).toEqual({
      scanned: 120,
      junkFiltered: 15,
      shown: 105,
    });
  });

  it('should handle all-zero counts when nothing was scanned', () => {
    expect(computeCounts(0, 0, 0)).toEqual({ scanned: 0, junkFiltered: 0, shown: 0 });
  });
});
