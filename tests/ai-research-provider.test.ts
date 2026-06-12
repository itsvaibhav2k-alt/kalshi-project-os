import { describe, expect, it } from 'vitest';

import type { AiResearchDraftInput } from '@/lib/ai-research/types';
import {
  createFallbackProvider,
  FALLBACK_MODEL_NAME,
  FALLBACK_PROVIDER_NAME,
} from '@/lib/ai-research/fallbackProvider';
import { DRAFT_SECTIONS, PROMPT_VERSION, SYSTEM_POSTURE } from '@/lib/ai-research/prompts';
import { getAiResearchProvider } from '@/lib/ai-research/provider';
import { buildMarketDossierWithResearch } from '@/lib/dossier/buildMarketDossier';
import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import type { ResearchStateResponse } from '@/lib/research-store/types';
import { AI_RESEARCH_DRAFT_TYPES } from '@/lib/research-store/types';

const NOW_ISO = '2026-06-12T12:00:00Z';
const TICKER = 'SYNTH-AI-PROVIDER';

/** Words the brief bans from generated draft copy. */
const BANNED_VOCABULARY =
  /\b(buy|sell|guaranteed|sure thing|profit|money printer|degen|ape in|easy money|place trade)\b/i;

/**
 * Builds a synthetic, liquidity-clean normalized market (mirrors the
 * settlement-overlay fixture). Prices give implied probability 0.24 with a
 * 2-cent spread; the deterministic understanding derives 'clear' resolution
 * clarity and 'unverified' settlement status from the payload alone.
 */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: `kalshi:${TICKER}`,
    platformId: 'kalshi',
    externalId: TICKER,
    eventTicker: 'SYNTH',
    title: 'Synthetic provider market resolving on an official report',
    category: 'Economics',
    yesBidCents: 23,
    yesAskCents: 25,
    noBidCents: 75,
    noAskCents: 77,
    lastPriceCents: 24,
    spreadCents: 2,
    volume: 5000,
    volume24h: 200,
    openInterest: 500,
    liquidityDollars: 10000,
    closeTime: '2026-12-31T00:00:00Z',
    expirationTime: '2026-12-31T00:00:00Z',
    status: 'active',
    rawStatus: 'active',
    rulesText:
      'Resolves YES if the official statistics agency reports a value at or above the listed threshold.',
    resolutionCriteria: 'Official published value at or above the threshold on the report date.',
    settlementSource: 'Official statistics agency release',
    isProvisional: false,
    isMultivariate: false,
    flags: [],
    raw: null,
    ...overrides,
  };
}

/**
 * Builds a market whose title is predictive but whose rules never name a
 * measurement source, so the deterministic understanding derives 'ambiguous'
 * resolution clarity and at least one ambiguity flag.
 */
function makeAmbiguousMarket(): NormalizedMarket {
  return makeMarket({
    title: 'Will the metric exceed the listed threshold before 2027',
    rulesText: 'Resolves YES if the listed threshold is met on the final date.',
    resolutionCriteria: null,
  });
}

/** Builds a hand-built empty research state: no rows of any kind exist yet. */
function makeEmptyState(): ResearchStateResponse {
  return {
    ticker: TICKER,
    sources: [],
    brief: null,
    probabilityEstimate: null,
    thesis: null,
    settlementSources: [],
    summary: {
      acceptedSourceCount: 0,
      hasHumanReviewedBrief: false,
      hasFairProbability: false,
      hasReadyThesis: false,
      researchConfidence: 'low',
      verifiedSettlementSource: null,
    },
  };
}

/**
 * Builds a complete research state (accepted source, human-reviewed brief,
 * fair range, ready thesis, human-verified settlement record) that the real
 * pipeline composes to a PAPER_TRADE verdict on the clean market.
 */
function makeReadyState(): ResearchStateResponse {
  return {
    ticker: TICKER,
    sources: [
      {
        id: 'src-accepted',
        marketTicker: TICKER,
        marketId: `kalshi:${TICKER}`,
        kind: 'official_resolution_source',
        title: 'Official agency release page',
        url: 'https://example.gov/release',
        publisher: 'Example Agency',
        excerpt: null,
        notes: null,
        credibility: 'official',
        status: 'accepted',
        addedBy: 'human',
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:00:00Z',
      },
    ],
    brief: {
      id: 'brief-1',
      marketTicker: TICKER,
      state: 'human_reviewed',
      summary: 'Human-reviewed brief backed by the official release page.',
      yesCase: 'Recent official releases trend above the listed threshold.',
      noCase: 'A downward revision before the report date.',
      keyEvidence: null,
      uncertainties: null,
      missingInfo: null,
      confidence: 'medium',
      sourceCount: 1,
      basis: 'manual',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    probabilityEstimate: {
      id: 'est-1',
      marketTicker: TICKER,
      low: 0.27,
      mid: 0.3,
      high: 0.34,
      rationale: 'Official release history supports a fair value near 30 cents.',
      basis: 'human_entered',
      confidence: 'medium',
      sourceCount: 1,
      briefId: 'brief-1',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    thesis: {
      id: 'thesis-1',
      marketTicker: TICKER,
      status: 'ready_for_risk',
      thesis: 'The market underprices the officially reported trend.',
      whyMispriced: 'Recent official releases are not reflected in the price.',
      invalidationCriteria: 'A contrary official release before the close date.',
      probabilityEstimateId: 'est-1',
      sourceIdsJson: '["src-accepted"]',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
    },
    settlementSources: [
      {
        id: 'settle-1',
        marketTicker: TICKER,
        marketId: `kalshi:${TICKER}`,
        title: 'Official statistics agency release calendar',
        url: 'https://example.gov/releases',
        publisher: 'Example Agency',
        authorityType: 'official_government_source',
        status: 'human_verified',
        notes: null,
        verificationRationale: 'URL matches the resolution authority named in the listed rules.',
        createdAt: '2026-06-11T00:00:00Z',
        updatedAt: '2026-06-11T00:00:00Z',
      },
    ],
    summary: {
      acceptedSourceCount: 1,
      hasHumanReviewedBrief: true,
      hasFairProbability: true,
      hasReadyThesis: true,
      researchConfidence: 'medium',
      verifiedSettlementSource: {
        id: 'settle-1',
        title: 'Official statistics agency release calendar',
        url: 'https://example.gov/releases',
        publisher: 'Example Agency',
        authorityType: 'official_government_source',
        updatedAt: '2026-06-11T00:00:00Z',
      },
    },
  };
}

/** Composes a dossier from a market and state through the real pipeline. */
function makeDossier(market: NormalizedMarket, state: ResearchStateResponse): MarketDossier {
  return buildMarketDossierWithResearch(market, toPersistedResearchSnapshot(state), NOW_ISO);
}

/** Builds one provider input from a market, state, and draft kind. */
function makeInput(
  draftType: AiResearchDraftInput['draftType'],
  overrides: Partial<AiResearchDraftInput> = {},
): AiResearchDraftInput {
  const market = overrides.market ?? makeMarket();
  const researchState = overrides.researchState ?? makeEmptyState();
  return {
    draftType,
    market,
    dossier: makeDossier(market, researchState),
    researchState,
    userFocus: null,
    nowIso: NOW_ISO,
    ...overrides,
  };
}

describe('createFallbackProvider', () => {
  describe('generateDraft', () => {
    it('should return non-empty markdown with every section heading when generating each kind', async () => {
      // Arrange
      const provider = createFallbackProvider();

      for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
        // Act
        const result = await provider.generateDraft(makeInput(draftType));

        // Assert
        expect(result.provider).toBe('local_deterministic');
        expect(result.model).toBe('phase5_fallback');
        expect(result.promptVersion).toBe('phase5.v1');
        expect(result.outputJson).toBeNull();
        expect(result.outputMarkdown.length).toBeGreaterThan(0);
        for (const heading of DRAFT_SECTIONS[draftType]) {
          expect(result.outputMarkdown, `kind '${draftType}' should contain '${heading}'`).toContain(
            `## ${heading}`,
          );
        }
      }
    });

    it('should produce identical markdown when called twice with identical input', async () => {
      // Arrange
      const provider = createFallbackProvider();

      // Act
      const first = await provider.generateDraft(makeInput('missing_info'));
      const second = await provider.generateDraft(makeInput('missing_info'));

      // Assert
      expect(second.outputMarkdown).toBe(first.outputMarkdown);
    });

    it('should mention the unverified settlement state when no settlement record is verified', async () => {
      // Arrange
      const provider = createFallbackProvider();

      // Act
      const result = await provider.generateDraft(makeInput('missing_info'));

      // Assert
      expect(result.outputMarkdown).toContain('no human-verified settlement record is on file');
      expect(result.outputMarkdown).toContain('Missing evidence: human-verified settlement record.');
    });

    it('should state no source = low confidence when zero sources are accepted', async () => {
      // Arrange
      const provider = createFallbackProvider();

      for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
        // Act
        const result = await provider.generateDraft(makeInput(draftType));

        // Assert
        expect(result.outputMarkdown).toContain('no source = low confidence');
      }
    });

    it('should state that no honest edge can be measured when the fair probability range is missing', async () => {
      // Arrange
      const provider = createFallbackProvider();

      // Act
      const result = await provider.generateDraft(makeInput('skeptical_countercase'));

      // Assert
      expect(result.outputMarkdown).toContain('no honest edge can be measured');
    });

    it('should produce thesis-building questions when no thesis exists', async () => {
      // Arrange
      const provider = createFallbackProvider();

      // Act
      const result = await provider.generateDraft(makeInput('thesis_critique'));

      // Assert
      expect(result.outputMarkdown).toMatch(/thesis-building questions/i);
      expect(result.outputMarkdown).toContain('no thesis has been written');
      expect(result.outputMarkdown).toContain('?');
    });

    it('should quote the stored thesis text when a thesis exists', async () => {
      // Arrange
      const provider = createFallbackProvider();
      const input = makeInput('thesis_critique', { researchState: makeReadyState() });

      // Act
      const result = await provider.generateDraft(input);

      // Assert
      expect(result.outputMarkdown).toContain(
        'The stored thesis reads: "The market underprices the officially reported trend."',
      );
      expect(result.outputMarkdown).toContain('A contrary official release before the close date.');
      expect(result.outputMarkdown).not.toMatch(/thesis-building questions/i);
    });

    it('should list ambiguity flags when the contract reading derives them', async () => {
      // Arrange
      const provider = createFallbackProvider();
      const input = makeInput('research_questions', { market: makeAmbiguousMarket() });
      expect(input.dossier.understanding.ambiguityFlags.length).toBeGreaterThan(0);

      // Act
      const result = await provider.generateDraft(input);

      // Assert
      expect(result.outputMarkdown).toContain('Ambiguity flags:');
      expect(result.outputMarkdown).toContain(input.dossier.understanding.ambiguityFlags[0]);
    });

    it('should still produce skeptical checks when the verdict is PAPER_TRADE', async () => {
      // Arrange
      const provider = createFallbackProvider();
      const input = makeInput('skeptical_countercase', { researchState: makeReadyState() });
      expect(input.dossier.riskEvaluation.verdict).toBe('PAPER_TRADE');

      // Act
      const result = await provider.generateDraft(input);

      // Assert
      expect(result.outputMarkdown).toContain('Even with a PAPER_TRADE verdict');
      expect(result.outputMarkdown).toContain('paper decision');
      expect(result.outputMarkdown).toContain('## Why SKIP may still be best');
    });

    it('should not contain banned vocabulary when generating any kind from any state', async () => {
      // Arrange
      const provider = createFallbackProvider();
      const states = [makeEmptyState(), makeReadyState()];

      for (const state of states) {
        for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
          // Act
          const result = await provider.generateDraft(
            makeInput(draftType, { researchState: state }),
          );

          // Assert
          expect(result.outputMarkdown, `kind '${draftType}' should avoid banned vocabulary`).not.toMatch(
            BANNED_VOCABULARY,
          );
        }
      }
    });

    it('should echo the user focus under the requested-focus heading when provided', async () => {
      // Arrange
      const provider = createFallbackProvider();
      const input = makeInput('research_questions', {
        userFocus: 'Check the official release calendar timing.',
      });

      // Act
      const result = await provider.generateDraft(input);

      // Assert
      expect(result.outputMarkdown).toContain('## Requested focus');
      expect(result.outputMarkdown).toContain(
        'Human-entered context (not a verified fact): "Check the official release calendar timing."',
      );
    });

    it('should omit the requested-focus heading when the focus is null', async () => {
      // Arrange
      const provider = createFallbackProvider();

      // Act
      const result = await provider.generateDraft(makeInput('research_questions'));

      // Assert
      expect(result.outputMarkdown).not.toContain('## Requested focus');
    });
  });
});

describe('getAiResearchProvider', () => {
  it('should return the deterministic fallback provider when called', async () => {
    // Arrange
    const provider = getAiResearchProvider();

    // Act
    const result = await provider.generateDraft(makeInput('missing_info'));

    // Assert
    expect(result.provider).toBe(FALLBACK_PROVIDER_NAME);
    expect(result.model).toBe(FALLBACK_MODEL_NAME);
    expect(result.promptVersion).toBe(PROMPT_VERSION);
  });
});

describe('SYSTEM_POSTURE', () => {
  it('should keep the advisory posture lines when read by any provider', () => {
    // Assert
    expect(SYSTEM_POSTURE).toContain('You do not approve trades.');
    expect(SYSTEM_POSTURE).toContain('No source = low confidence.');
    expect(SYSTEM_POSTURE).toContain('Ambiguous resolution = SKIP.');
    expect(SYSTEM_POSTURE).toContain(
      'advisory draft material outside the deterministic risk path',
    );
  });
});
