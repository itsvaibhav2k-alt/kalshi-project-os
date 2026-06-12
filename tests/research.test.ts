import { describe, expect, it } from 'vitest';

import { buildFixtureBrief, buildNotRunBrief } from '@/lib/research/buildResearchBrief';
import type { ResearchFixture } from '@/lib/research/buildResearchBrief';
import type { ResearchSource } from '@/lib/research/types';

const MARKET_ID = 'kalshi:TEST-MKT';
const CREATED_AT = '2026-06-11T12:00:00Z';

/** A real-shaped source a test can supply; builders never invent these. */
function makeSource(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: 'src-1',
    title: 'NWS daily climate report for Central Park (KNYC)',
    url: 'https://www.weather.gov/okx/climate',
    publisher: 'National Weather Service',
    accessedAt: '2026-06-11T11:30:00Z',
    quote: 'The maximum temperature recorded at Central Park was 87F.',
    ...overrides,
  };
}

/** A fully populated fixture for arranging test variations. */
function makeFixture(overrides: Partial<ResearchFixture> = {}): ResearchFixture {
  return {
    evidenceSummary: 'Forecast guidance clusters near 86-88F for June 12.',
    counterarguments: ['Station readings can diverge from gridded forecasts.'],
    sources: [makeSource()],
    confidence: 'medium',
    ...overrides,
  };
}

describe('buildNotRunBrief', () => {
  describe('brief shape', () => {
    it('should return status not_run with empty sources and low confidence', () => {
      const brief = buildNotRunBrief(MARKET_ID, CREATED_AT);

      expect(brief.marketId).toBe(MARKET_ID);
      expect(brief.createdAt).toBe(CREATED_AT);
      expect(brief.status).toBe('not_run');
      expect(brief.sources).toEqual([]);
      expect(brief.confidence).toBe('low');
    });

    it('should explain that the research engine is not implemented in Phase 2', () => {
      const brief = buildNotRunBrief(MARKET_ID, CREATED_AT);

      expect(brief.noSourceReason).toContain('not implemented in Phase 2');
      expect(brief.noSourceReason).toContain('has not been run');
    });

    it('should state honestly that no evidence was gathered', () => {
      const brief = buildNotRunBrief(MARKET_ID, CREATED_AT);

      expect(brief.evidenceSummary).toContain('No evidence was gathered');
      expect(brief.counterarguments).toEqual([]);
    });
  });

  describe('no fake citations', () => {
    it('should never fabricate sources when research has not run', () => {
      const brief = buildNotRunBrief(MARKET_ID, CREATED_AT);

      expect(Array.isArray(brief.sources)).toBe(true);
      expect(brief.sources).toHaveLength(0);
    });
  });

  describe('advisory notes', () => {
    it('should include the no-source rule and the advisory-only caveat', () => {
      const brief = buildNotRunBrief(MARKET_ID, CREATED_AT);

      expect(brief.advisoryNotes).toContain('No source = low confidence = SKIP.');
      expect(brief.advisoryNotes.join(' ')).toContain('advisory only');
    });
  });

  describe('determinism', () => {
    it('should return identical output for identical input', () => {
      expect(buildNotRunBrief(MARKET_ID, CREATED_AT)).toEqual(
        buildNotRunBrief(MARKET_ID, CREATED_AT),
      );
    });
  });
});

describe('buildFixtureBrief', () => {
  describe('fixture labeling', () => {
    it('should label the brief as fixture research, never live evidence', () => {
      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, makeFixture());

      expect(brief.status).toBe('fixture');
      const notes = brief.advisoryNotes.join(' ');
      expect(notes).toContain('FIXTURE');
      expect(notes).toContain('tests only');
      expect(notes).toContain('never live evidence');
    });

    it('should keep the advisory-only caveat on fixture briefs', () => {
      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, makeFixture());

      expect(brief.advisoryNotes.join(' ')).toContain('advisory only');
    });
  });

  describe('with sources present', () => {
    it('should carry the supplied evidence, sources, and confidence through', () => {
      const fixture = makeFixture();

      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, fixture);

      expect(brief.evidenceSummary).toBe(fixture.evidenceSummary);
      expect(brief.counterarguments).toEqual(fixture.counterarguments);
      expect(brief.sources).toEqual(fixture.sources);
      expect(brief.confidence).toBe('medium');
    });

    it('should not mutate the supplied fixture arrays', () => {
      const fixture = makeFixture();

      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, fixture);

      expect(brief.sources).not.toBe(fixture.sources);
      expect(brief.counterarguments).not.toBe(fixture.counterarguments);
    });
  });

  describe('with empty sources', () => {
    it('should force confidence low when fixture claims high with no sources', () => {
      const fixture = makeFixture({ sources: [], confidence: 'high' });

      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, fixture);

      expect(brief.sources).toEqual([]);
      expect(brief.confidence).toBe('low');
    });

    it('should surface the no-source rule when sources are empty', () => {
      const fixture = makeFixture({ sources: [], confidence: 'medium' });

      const brief = buildFixtureBrief(MARKET_ID, CREATED_AT, fixture);

      expect(brief.advisoryNotes).toContain('No source = low confidence = SKIP.');
    });
  });

  describe('determinism', () => {
    it('should return identical output for identical input', () => {
      const fixture = makeFixture();

      expect(buildFixtureBrief(MARKET_ID, CREATED_AT, fixture)).toEqual(
        buildFixtureBrief(MARKET_ID, CREATED_AT, fixture),
      );
    });
  });
});
