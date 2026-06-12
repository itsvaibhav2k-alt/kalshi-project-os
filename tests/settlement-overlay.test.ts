import { describe, expect, it } from 'vitest';

import { applySettlementVerification } from '@/lib/dossier/applySettlementVerification';
import {
  buildMarketDossier,
  buildMarketDossierWithResearch,
} from '@/lib/dossier/buildMarketDossier';
import type {
  PersistedResearchSnapshot,
  PersistedSettlementVerificationSnapshot,
} from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import type {
  MarketSourceRecord,
  ResearchStateResponse,
  SettlementSourceRecord,
  VerifiedSettlementSummary,
} from '@/lib/research-store/types';
import type { RiskCheckResult } from '@/lib/risk/types';
import { understandMarket } from '@/lib/understanding/understandMarket';
import type { ContractUnderstanding } from '@/lib/understanding/types';

const NOW_ISO = '2026-06-12T12:00:00Z';
const TICKER = 'SYNTH-OVERLAY';

/**
 * Builds a synthetic, liquidity-clean normalized market (mirrors the Phase 3
 * integration fixture). Prices give implied probability 0.24 with a 2-cent
 * spread; the title avoids predictive phrasing so the deterministic
 * understanding derives 'clear' resolution clarity, and the listed settlement
 * text derives 'unverified' — never 'provided' — from the payload alone.
 */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: `kalshi:${TICKER}`,
    platformId: 'kalshi',
    externalId: TICKER,
    eventTicker: 'SYNTH',
    title: 'Synthetic overlay market resolving on an official report',
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
 * resolution clarity independently of any settlement verification.
 */
function makeAmbiguousMarket(): NormalizedMarket {
  return makeMarket({
    title: 'Will the metric exceed the listed threshold before 2027',
    rulesText: 'Resolves YES if the listed threshold is met on the final date.',
    resolutionCriteria: null,
  });
}

/** Builds a human-verified settlement verification snapshot for the overlay. */
function makeVerification(
  overrides: Partial<PersistedSettlementVerificationSnapshot> = {},
): PersistedSettlementVerificationSnapshot {
  return {
    id: 'settle-1',
    title: 'Official statistics agency release calendar',
    url: 'https://example.gov/releases',
    publisher: 'Example Agency',
    authorityType: 'official_government_source',
    status: 'human_verified',
    updatedAt: '2026-06-11T00:00:00Z',
    ...overrides,
  };
}

/** Builds a persisted research snapshot with a clean ready default state. */
function makeSnapshot(
  overrides: Partial<PersistedResearchSnapshot> = {},
): PersistedResearchSnapshot {
  return {
    acceptedSourceCount: 2,
    briefState: 'human_reviewed',
    confidence: 'medium',
    fairLow: 0.27,
    fairMid: 0.3,
    fairHigh: 0.34,
    hasReadyThesis: true,
    ...overrides,
  };
}

/** Builds one accepted official-resolution-source research record. */
function makeAcceptedSourceRecord(): MarketSourceRecord {
  return {
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
  };
}

/** Builds one human-verified settlement record in store record shape. */
function makeSettlementRecord(): SettlementSourceRecord {
  return {
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
  };
}

/** Compact view of the verified settlement record for the summary. */
function makeVerifiedSummary(): VerifiedSettlementSummary {
  return {
    id: 'settle-1',
    title: 'Official statistics agency release calendar',
    url: 'https://example.gov/releases',
    publisher: 'Example Agency',
    authorityType: 'official_government_source',
    updatedAt: '2026-06-11T00:00:00Z',
  };
}

/**
 * Builds a complete per-ticker research state response by hand, mirroring
 * what GET /api/research/[ticker] returns for a fully researched market with
 * a human-verified settlement record.
 */
function makeReadyState(overrides: Partial<ResearchStateResponse> = {}): ResearchStateResponse {
  return {
    ticker: TICKER,
    sources: [makeAcceptedSourceRecord()],
    brief: {
      id: 'brief-1',
      marketTicker: TICKER,
      state: 'human_reviewed',
      summary: 'Human-reviewed brief backed by the official release page.',
      yesCase: null,
      noCase: null,
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
    settlementSources: [makeSettlementRecord()],
    summary: {
      acceptedSourceCount: 1,
      hasHumanReviewedBrief: true,
      hasFairProbability: true,
      hasReadyThesis: true,
      researchConfidence: 'medium',
      verifiedSettlementSource: makeVerifiedSummary(),
    },
    ...overrides,
  };
}

/** Finds one check result by id, failing loudly when it is absent. */
function findCheck(checks: RiskCheckResult[], id: string): RiskCheckResult {
  const check = checks.find((entry) => entry.id === id);
  if (check === undefined) {
    throw new Error(`expected check '${id}' to be present`);
  }
  return check;
}

describe('applySettlementVerification', () => {
  it('should return the same reference when verification is absent', () => {
    const understanding = understandMarket(makeMarket());

    expect(applySettlementVerification(understanding, null)).toBe(understanding);
    expect(applySettlementVerification(understanding, undefined)).toBe(understanding);
  });

  it('should return the same reference when status is draft', () => {
    const understanding = understandMarket(makeMarket());

    const result = applySettlementVerification(
      understanding,
      makeVerification({ status: 'draft' }),
    );

    expect(result).toBe(understanding);
    expect(result.settlementSourceStatus).toBe('unverified');
  });

  it('should return the same reference when status is rejected', () => {
    const understanding = understandMarket(makeMarket());

    const result = applySettlementVerification(
      understanding,
      makeVerification({ status: 'rejected' }),
    );

    expect(result).toBe(understanding);
    expect(result.settlementSourceStatus).toBe('unverified');
  });

  it('should flip settlementSourceStatus to provided when status is human_verified', () => {
    const understanding = understandMarket(makeMarket());

    const result = applySettlementVerification(understanding, makeVerification());

    expect(result).not.toBe(understanding);
    expect(result.settlementSourceStatus).toBe('provided');
  });

  it('should set a compact label from title and url when url is present', () => {
    const result = applySettlementVerification(
      understandMarket(makeMarket()),
      makeVerification(),
    );

    expect(result.settlementSource).toBe(
      'Official statistics agency release calendar — https://example.gov/releases',
    );
  });

  it('should fall back to the publisher in the label when url is null', () => {
    const result = applySettlementVerification(
      understandMarket(makeMarket()),
      makeVerification({ url: null }),
    );

    expect(result.settlementSource).toBe(
      'Official statistics agency release calendar — Example Agency',
    );
  });

  it('should keep a title-only label when url and publisher are null', () => {
    const result = applySettlementVerification(
      understandMarket(makeMarket()),
      makeVerification({ url: null, publisher: null }),
    );

    expect(result.settlementSource).toBe('Official statistics agency release calendar');
  });

  it('should remove settlementSource from missingFields when the payload listed none', () => {
    const understanding = understandMarket(makeMarket({ settlementSource: null }));
    expect(understanding.settlementSourceStatus).toBe('missing');
    expect(understanding.missingFields).toContain('settlementSource');

    const result = applySettlementVerification(understanding, makeVerification());

    expect(result.settlementSourceStatus).toBe('provided');
    expect(result.missingFields).not.toContain('settlementSource');
  });

  it('should append the human-verification interpretation note', () => {
    const understanding = understandMarket(makeMarket());

    const result = applySettlementVerification(understanding, makeVerification());

    expect(result.interpretationNotes).toContain(
      'Settlement source provided by local human verification record.',
    );
    expect(result.interpretationNotes.length).toBe(understanding.interpretationNotes.length + 1);
  });

  it('should not mutate the input understanding', () => {
    const understanding = understandMarket(makeMarket({ settlementSource: null }));
    const frozen: ContractUnderstanding = JSON.parse(JSON.stringify(understanding));

    applySettlementVerification(understanding, makeVerification());

    expect(understanding).toEqual(frozen);
    expect(understanding.settlementSourceStatus).toBe('missing');
    expect(understanding.missingFields).toContain('settlementSource');
  });

  it('should never touch resolutionClarity or ambiguityFlags', () => {
    const understanding = understandMarket(makeAmbiguousMarket());
    expect(understanding.resolutionClarity).toBe('ambiguous');
    expect(understanding.ambiguityFlags.length).toBeGreaterThan(0);

    const result = applySettlementVerification(understanding, makeVerification());

    expect(result.resolutionClarity).toBe('ambiguous');
    expect(result.ambiguityFlags).toBe(understanding.ambiguityFlags);
    expect(result.ambiguityFlags).toEqual(understanding.ambiguityFlags);
  });
});

describe('buildMarketDossierWithResearch settlement overlay', () => {
  it('should derive unverified from raw settlement text through the real pipeline', () => {
    const dossier = buildMarketDossier(makeMarket(), NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('unverified');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
  });

  it('should keep the settlement_source check failing when the verification is a draft', () => {
    const snapshot = makeSnapshot({
      settlementVerification: makeVerification({ status: 'draft' }),
    });

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('unverified');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
  });

  it('should keep the settlement_source check failing when the verification is rejected', () => {
    const snapshot = makeSnapshot({
      settlementVerification: makeVerification({ status: 'rejected' }),
    });

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('unverified');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
  });

  it('should keep the settlement_source check failing with accepted research sources only, including official_resolution_source', () => {
    // A human-labeled "official" research source is human-entered text, not
    // verification of the resolution authority. Only the dedicated record counts.
    const snapshot = makeSnapshot({
      acceptedSourceCount: 1,
      sources: [
        {
          id: 'src-accepted',
          title: 'Official agency release page',
          url: 'https://example.gov/release',
          publisher: 'Example Agency',
          status: 'accepted',
          createdAt: '2026-06-10T00:00:00Z',
        },
      ],
    });

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(findCheck(dossier.riskEvaluation.checks, 'research_sources').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
  });

  it('should still SKIP an ambiguous market via resolution_clarity even with a verified settlement record', () => {
    const snapshot = makeSnapshot({ settlementVerification: makeVerification() });

    const dossier = buildMarketDossierWithResearch(makeAmbiguousMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('provided');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('pass');
    expect(dossier.understanding.resolutionClarity).toBe('ambiguous');
    expect(findCheck(dossier.riskEvaluation.checks, 'resolution_clarity').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
  });

  it('should reach PAPER_TRADE through the real pipeline with verified settlement, sources, fair range, and a ready thesis', () => {
    // First time the real builder (no forced understanding) reaches PAPER_TRADE.
    const snapshot = makeSnapshot({ settlementVerification: makeVerification() });

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('provided');
    expect(dossier.riskEvaluation.verdict).toBe('PAPER_TRADE');
    for (const check of dossier.riskEvaluation.checks) {
      expect(check.status, `check '${check.id}' should pass`).toBe('pass');
    }
    expect(dossier.riskEvaluation.realTradingLocked).toBe(true);
    expect(dossier.riskEvaluation.mode).toBe('training_wheels');
  });
});

describe('toPersistedResearchSnapshot', () => {
  it('should map a verified settlement record into the settlementVerification snapshot', () => {
    const snapshot = toPersistedResearchSnapshot(makeReadyState());

    expect(snapshot.settlementVerification).toEqual({
      id: 'settle-1',
      title: 'Official statistics agency release calendar',
      url: 'https://example.gov/releases',
      publisher: 'Example Agency',
      authorityType: 'official_government_source',
      status: 'human_verified',
      updatedAt: '2026-06-11T00:00:00Z',
    });
  });

  it('should map a missing verified settlement record to null', () => {
    const state = makeReadyState();
    const snapshot = toPersistedResearchSnapshot({
      ...state,
      summary: { ...state.summary, verifiedSettlementSource: null },
    });

    expect(snapshot.settlementVerification).toBeNull();
  });

  it('should tolerate a summary without the verified settlement field at runtime', () => {
    const state = makeReadyState();
    const summary = { ...state.summary } as Record<string, unknown>;
    delete summary.verifiedSettlementSource;
    const legacy = { ...state, summary } as unknown as ResearchStateResponse;

    expect(toPersistedResearchSnapshot(legacy).settlementVerification).toBeNull();
  });

  it('should map state fields and pass full source records through', () => {
    const state = makeReadyState();

    const snapshot = toPersistedResearchSnapshot(state);

    expect(snapshot.acceptedSourceCount).toBe(1);
    expect(snapshot.briefState).toBe('human_reviewed');
    expect(snapshot.confidence).toBe('medium');
    expect(snapshot.fairLow).toBe(0.27);
    expect(snapshot.fairMid).toBe(0.3);
    expect(snapshot.fairHigh).toBe(0.34);
    expect(snapshot.hasReadyThesis).toBe(true);
    expect(snapshot.sources).toBe(state.sources);
  });

  it('should map a null brief to not_run', () => {
    const snapshot = toPersistedResearchSnapshot(makeReadyState({ brief: null }));

    expect(snapshot.briefState).toBe('not_run');
  });

  it('should null the fair range when the summary no longer vouches for it', () => {
    const state = makeReadyState();
    const snapshot = toPersistedResearchSnapshot({
      ...state,
      summary: { ...state.summary, hasFairProbability: false },
    });

    expect(snapshot.fairLow).toBeNull();
    expect(snapshot.fairMid).toBeNull();
    expect(snapshot.fairHigh).toBeNull();
  });

  it('should compose to PAPER_TRADE end-to-end through the real builder', () => {
    const snapshot = toPersistedResearchSnapshot(makeReadyState());

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('provided');
    expect(dossier.riskEvaluation.verdict).toBe('PAPER_TRADE');
  });

  it('should compose to SKIP end-to-end when no settlement record is verified', () => {
    const state = makeReadyState();
    const snapshot = toPersistedResearchSnapshot({
      ...state,
      settlementSources: [],
      summary: { ...state.summary, verifiedSettlementSource: null },
    });

    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('unverified');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
  });
});
