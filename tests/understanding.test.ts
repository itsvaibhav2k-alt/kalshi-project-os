import { describe, expect, it } from 'vitest';

import type { NormalizedMarket } from '@/lib/markets/types';
import { understandMarket } from '@/lib/understanding/understandMarket';

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
    yesAskCents: 41,
    noBidCents: 59,
    noAskCents: 61,
    lastPriceCents: 40,
    spreadCents: 2,
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

describe('understandMarket', () => {
  describe('with rules text present', () => {
    it('should generate summary and conditions without inventing a source', () => {
      const market = makeMarket();

      const understanding = understandMarket(market);

      expect(understanding.summary).toContain(market.title);
      expect(understanding.yesCondition).toContain('Resolves YES');
      expect(understanding.noCondition).toContain('Resolves NO');
      // settlement source was null — must not be invented anywhere
      expect(understanding.settlementSource).toBeNull();
      expect(understanding.settlementSourceStatus).toBe('missing');
    });

    it('should not flag a measurement-source ambiguity when rules name a source', () => {
      const understanding = understandMarket(makeMarket());

      expect(understanding.ambiguityFlags).not.toContain(
        'predictive question but listed rules do not name a measurement source',
      );
    });
  });

  describe('with missing rules', () => {
    it('should report missing field and missing clarity when rules are absent', () => {
      const market = makeMarket({ rulesText: null });

      const understanding = understandMarket(market);

      expect(understanding.missingFields).toContain('rulesText');
      expect(understanding.resolutionClarity).toBe('missing');
      expect(understanding.yesCondition).toContain('Not derivable');
    });

    it('should treat whitespace-only rules as missing', () => {
      const understanding = understandMarket(makeMarket({ rulesText: '   ' }));

      expect(understanding.resolutionClarity).toBe('missing');
      expect(understanding.rulesText).toBeNull();
    });
  });

  describe('settlement source handling', () => {
    it('should report status missing when settlement source is absent', () => {
      const understanding = understandMarket(makeMarket({ settlementSource: null }));

      expect(understanding.settlementSourceStatus).toBe('missing');
      expect(understanding.missingFields).toContain('settlementSource');
    });

    it('should report status unverified (never provided) when source text exists', () => {
      const understanding = understandMarket(
        makeMarket({ settlementSource: 'NWS daily climate report' }),
      );

      expect(understanding.settlementSourceStatus).toBe('unverified');
      expect(understanding.settlementSource).toBe('NWS daily climate report');
    });
  });

  describe('important dates', () => {
    it('should surface close and expiration times as important dates', () => {
      const understanding = understandMarket(makeMarket());

      expect(understanding.importantDates).toEqual([
        { label: 'Close time', value: '2026-06-12T22:00:00Z' },
        { label: 'Expiration time', value: '2026-06-13T00:00:00Z' },
      ]);
    });

    it('should flag ambiguity when no dates are provided', () => {
      const understanding = understandMarket(
        makeMarket({ closeTime: null, expirationTime: null }),
      );

      expect(understanding.importantDates).toEqual([]);
      expect(understanding.ambiguityFlags).toContain('no close or expiration time provided');
    });
  });

  describe('ambiguity detection', () => {
    it('should flag a predictive title whose rules lack a measurement source', () => {
      const market = makeMarket({
        title: 'Will a hurricane make landfall before Jul 31?',
        rulesText: 'Resolves YES if a hurricane makes landfall in the United States.',
        resolutionCriteria: null,
      });

      const understanding = understandMarket(market);

      expect(understanding.ambiguityFlags).toContain(
        'predictive question but listed rules do not name a measurement source',
      );
      expect(understanding.resolutionClarity).toBe('ambiguous');
    });

    it('should flag missing resolution criteria as ambiguity', () => {
      const understanding = understandMarket(makeMarket({ resolutionCriteria: null }));

      expect(understanding.ambiguityFlags).toContain('no explicit resolution criteria provided');
      expect(understanding.missingFields).toContain('resolutionCriteria');
    });

    it('should note provisional and multivariate hazards', () => {
      const understanding = understandMarket(
        makeMarket({ isProvisional: true, isMultivariate: true }),
      );

      expect(understanding.interpretationNotes.join(' ')).toContain('provisional');
      expect(understanding.interpretationNotes.join(' ')).toContain('Multivariate');
    });
  });

  describe('determinism', () => {
    it('should return identical output for identical input', () => {
      const market = makeMarket();

      expect(understandMarket(market)).toEqual(understandMarket(market));
    });
  });
});
