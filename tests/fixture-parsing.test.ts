import { describe, expect, it } from 'vitest';

import { ALL_DATA_FLAGS } from '@/lib/markets/types';
import type {
  KalshiEventsResponse,
  KalshiMarketsResponse,
} from '@/lib/platforms/kalshi/types';
import {
  buildCategoryIndex,
  normalizeKalshiMarket,
} from '@/lib/platforms/kalshi/normalize';
import eventsFixtureJson from '@/tests/fixtures/kalshi-events.json';
import marketsFixtureJson from '@/tests/fixtures/kalshi-markets.json';

const marketsFixture = marketsFixtureJson as unknown as KalshiMarketsResponse;
const eventsFixture = eventsFixtureJson as unknown as KalshiEventsResponse;

describe('kalshi fixtures', () => {
  it('should expose a non-empty markets array when the markets fixture loads', () => {
    expect(Array.isArray(marketsFixture.markets)).toBe(true);
    expect(marketsFixture.markets.length).toBeGreaterThan(0);
  });

  it('should expose a non-empty events array when the events fixture loads', () => {
    expect(Array.isArray(eventsFixture.events)).toBe(true);
    expect(eventsFixture.events.length).toBeGreaterThan(0);
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
