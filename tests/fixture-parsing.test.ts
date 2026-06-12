import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadCurrentMarkets } from '@/app/api/markets/loadMarkets';
import { isJunk } from '@/lib/markets/filters';
import { ALL_DATA_FLAGS } from '@/lib/markets/types';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
  KalshiRawMarket,
} from '@/lib/platforms/kalshi/types';
import {
  buildCategoryIndex,
  normalizeKalshiMarket,
} from '@/lib/platforms/kalshi/normalize';
import { understandMarket } from '@/lib/understanding/understandMarket';
import eventsFixtureJson from '@/tests/fixtures/kalshi-events.json';
import marketsFixtureJson from '@/tests/fixtures/kalshi-markets.json';

const marketsFixture = marketsFixtureJson as unknown as KalshiMarketsResponse;
const eventsFixture = eventsFixtureJson as unknown as KalshiEventsResponse;

const EXPECTED_MARKET_COUNT = 11;
const EXPECTED_EVENT_COUNT = 5;
const SYNTHETIC_TICKER = 'SYNTH-PAPER-DEMO';

describe('kalshi fixtures', () => {
  it('should expose the expected markets array when the markets fixture loads', () => {
    expect(Array.isArray(marketsFixture.markets)).toBe(true);
    expect(marketsFixture.markets.length).toBe(EXPECTED_MARKET_COUNT);
  });

  it('should expose the expected events array when the events fixture loads', () => {
    expect(Array.isArray(eventsFixture.events)).toBe(true);
    expect(eventsFixture.events.length).toBe(EXPECTED_EVENT_COUNT);
  });

  it('should normalize every fixture market into a valid NormalizedMarket', () => {
    // Arrange
    const categoryIndex = buildCategoryIndex(eventsFixture.events);

    for (const raw of marketsFixture.markets) {
      // Act
      const market = normalizeKalshiMarket(raw, categoryIndex);

      // Assert
      expect(market.id.startsWith('kalshi:')).toBe(true);
      expect(market.id.length).toBeGreaterThan('kalshi:'.length);
      expect(market.platformId).toBe('kalshi');
      expect(market.externalId).toBe(raw.ticker);
      expect(typeof market.title).toBe('string');
      expect(['active', 'closed', 'settled', 'unknown']).toContain(market.status);
      expect(market.flags.length).toBeGreaterThan(0);
      for (const flag of market.flags) {
        expect(ALL_DATA_FLAGS).toContain(flag);
      }
      expect(market.flags[market.flags.length - 1]).toBe('not evaluated');
      expect(market.raw).toBe(raw);
    }
  });

  it('should produce categories for every event ticker in the events fixture', () => {
    const index = buildCategoryIndex(eventsFixture.events);

    for (const event of eventsFixture.events) {
      expect(typeof event.event_ticker).toBe('string');
      if (event.event_ticker !== undefined && event.category !== undefined) {
        expect(index[event.event_ticker]).toBe(event.category);
      }
    }
  });
});

describe('synthetic paper-demo fixture market', () => {
  function findSyntheticRaw(): KalshiRawMarket {
    const raw = marketsFixture.markets.find((market) => market.ticker === SYNTHETIC_TICKER);
    expect(raw).toBeDefined();
    return raw as KalshiRawMarket;
  }

  it('should normalize with a present yes ask, a 2-cent spread, and healthy activity when parsed', () => {
    // Arrange
    const categoryIndex = buildCategoryIndex(eventsFixture.events);
    const raw = findSyntheticRaw();

    // Act
    const market = normalizeKalshiMarket(raw, categoryIndex);

    // Assert
    expect(market.status).toBe('active');
    expect(market.yesAskCents).toBe(21);
    expect(market.yesBidCents).toBe(19);
    expect(market.spreadCents).toBe(2);
    expect(market.volume).toBeGreaterThan(1000);
    expect(market.openInterest).toBeGreaterThan(1000);
    expect(market.settlementSource).not.toBeNull();
    expect(market.category).toBe('Science and Technology');
    expect(isJunk(market)).toBe(false);
  });

  it('should derive clear resolution clarity and unverified settlement status when understood', () => {
    // Arrange
    const categoryIndex = buildCategoryIndex(eventsFixture.events);
    const raw = findSyntheticRaw();
    const market = normalizeKalshiMarket(raw, categoryIndex);

    // Act
    const understanding = understandMarket(market);

    // Assert — the fixture must NOT bypass the Phase 4 overlay: only a
    // human-verified settlement record can ever flip the status to 'provided'.
    expect(understanding.resolutionClarity).toBe('clear');
    expect(understanding.settlementSourceStatus).toBe('unverified');
    expect(understanding.ambiguityFlags).toEqual([]);
  });
});

describe('loadCurrentMarkets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return fixture-sourced markets including the synthetic ticker when KALSHI_MARKETS_SOURCE is fixture', async () => {
    // Arrange
    vi.stubEnv('KALSHI_MARKETS_SOURCE', 'fixture');

    // Act
    const result = await loadCurrentMarkets();

    // Assert
    expect(result.source).toBe('fixture');
    expect(result.error).toBeNull();
    expect(result.counts.scanned).toBe(EXPECTED_MARKET_COUNT);
    expect(result.counts.shown).toBe(result.markets.length);

    const synthetic = result.markets.find((market) => market.externalId === SYNTHETIC_TICKER);
    expect(synthetic).toBeDefined();
    expect(synthetic?.status).toBe('active');
    expect(synthetic?.yesAskCents).toBe(21);
    expect(synthetic?.spreadCents).toBe(2);
  });
});
