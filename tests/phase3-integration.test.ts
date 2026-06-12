import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildMarketDossier,
  buildMarketDossierWithResearch,
  summarizeEvaluations,
} from '@/lib/dossier/buildMarketDossier';
import { mapResearchState } from '@/lib/dossier/mapResearchState';
import type { PersistedResearchSnapshot } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { estimateProbability } from '@/lib/probability/estimate';
import { saveBrief } from '@/lib/research-store/briefs';
import { closeAllDatabases, openDatabase } from '@/lib/research-store/db';
import { saveEstimate } from '@/lib/research-store/probabilityEstimates';
import { createSource, updateSource } from '@/lib/research-store/sources';
import { getResearchState } from '@/lib/research-store/summary';
import { createThesis } from '@/lib/research-store/theses';
import type { ResearchStateResponse } from '@/lib/research-store/types';
import { evaluateTradeCandidate } from '@/lib/risk/evaluateTradeCandidate';
import type { RiskCheckResult, RiskEvaluation } from '@/lib/risk/types';
import type { ContractUnderstanding } from '@/lib/understanding/types';

const NOW_ISO = '2026-06-12T12:00:00Z';
const TICKER = 'SYNTH-TEST';
const ALLOWED_VERDICTS = ['SKIP', 'WATCH', 'PAPER_TRADE'] as const;

/**
 * Builds a synthetic, liquidity-clean normalized market.
 *
 * Prices are chosen so the implied probability is the bid/ask midpoint
 * (23 + 25) / 2 = 24 cents = 0.24, with a 2-cent spread, passing the
 * max-spread, volume, and liquidity checks. The title deliberately avoids
 * predictive phrasing so the deterministic understanding derives 'clear'
 * resolution clarity from the listed rules.
 */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: `kalshi:${TICKER}`,
    platformId: 'kalshi',
    externalId: TICKER,
    eventTicker: 'SYNTH',
    title: 'Synthetic integration market resolving on an official report',
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
    rulesText: 'Resolves YES if the official statistics agency reports a value at or above the listed threshold.',
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
 * Builds a fully synthetic clean understanding for tests only.
 *
 * `settlementSourceStatus: 'provided'` is forced here because the live
 * deterministic understanding can never emit it in this phase — settlement
 * source verification is a future, explicitly approved module. This object
 * exists so tests can prove the verdict algorithm grants PAPER_TRADE only
 * when every hard check genuinely passes.
 */
function makeCleanUnderstanding(
  market: NormalizedMarket,
  overrides: Partial<ContractUnderstanding> = {},
): ContractUnderstanding {
  return {
    marketId: market.id,
    title: market.title,
    summary: 'Synthetic understanding for integration tests.',
    yesCondition: 'YES if the official report meets the threshold.',
    noCondition: 'NO if the official report falls below the threshold.',
    rulesText: market.rulesText,
    resolutionCriteria: market.resolutionCriteria,
    settlementSource: market.settlementSource,
    settlementSourceStatus: 'provided',
    resolutionClarity: 'clear',
    importantDates: [],
    ambiguityFlags: [],
    missingFields: [],
    interpretationNotes: [
      'Synthetic understanding: settlement source status forced for tests only.',
    ],
    ...overrides,
  };
}

/** Builds a persisted research snapshot with a clean default state. */
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

/**
 * Converts a per-ticker research state response into the snapshot DTO the
 * dossier layer consumes, mirroring what the page wiring will do.
 */
function snapshotFromState(state: ResearchStateResponse): PersistedResearchSnapshot {
  return {
    acceptedSourceCount: state.summary.acceptedSourceCount,
    briefState: state.brief === null ? 'not_run' : state.brief.state,
    confidence: state.summary.researchConfidence,
    fairLow:
      state.summary.hasFairProbability && state.probabilityEstimate !== null
        ? state.probabilityEstimate.low
        : null,
    fairMid:
      state.summary.hasFairProbability && state.probabilityEstimate !== null
        ? state.probabilityEstimate.mid
        : null,
    fairHigh:
      state.summary.hasFairProbability && state.probabilityEstimate !== null
        ? state.probabilityEstimate.high
        : null,
    hasReadyThesis: state.summary.hasReadyThesis,
    sources: state.sources,
  };
}

/**
 * Runs the persisted snapshot through the mapping, probability, and risk
 * stages with a caller-supplied understanding. This mirrors the dossier
 * builder but lets tests force a synthetic understanding, which the live
 * builder never does.
 */
function evaluateWithUnderstanding(
  market: NormalizedMarket,
  snapshot: PersistedResearchSnapshot,
  understanding: ContractUnderstanding,
): RiskEvaluation {
  const research = mapResearchState(market, snapshot, NOW_ISO);
  const fairRange =
    snapshot.fairLow !== null && snapshot.fairMid !== null && snapshot.fairHigh !== null
      ? { low: snapshot.fairLow, mid: snapshot.fairMid, high: snapshot.fairHigh }
      : undefined;
  const probability = estimateProbability(market, research, NOW_ISO, fairRange);
  return evaluateTradeCandidate({
    market,
    understanding,
    research,
    probability,
    hasWrittenThesis: snapshot.hasReadyThesis,
    evaluatedAt: NOW_ISO,
  });
}

/** Finds one check result by id, failing loudly when it is absent. */
function findCheck(checks: RiskCheckResult[], id: string): RiskCheckResult {
  const check = checks.find((entry) => entry.id === id);
  if (check === undefined) {
    throw new Error(`expected check '${id}' to be present`);
  }
  return check;
}

describe('mapResearchState', () => {
  const market = makeMarket();

  it('should map not_run to a not_run brief with no sources and low confidence', () => {
    const snapshot = makeSnapshot({
      acceptedSourceCount: 0,
      briefState: 'not_run',
      confidence: 'low',
      fairLow: null,
      fairMid: null,
      fairHigh: null,
      hasReadyThesis: false,
    });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('not_run');
    expect(brief.sources).toEqual([]);
    expect(brief.confidence).toBe('low');
    expect(brief.marketId).toBe(market.id);
    expect(brief.createdAt).toBe(NOW_ISO);
  });

  it('should map insufficient_sources to unavailable with low confidence', () => {
    const snapshot = makeSnapshot({
      acceptedSourceCount: 0,
      briefState: 'insufficient_sources',
      confidence: 'low',
      hasReadyThesis: false,
    });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('unavailable');
    expect(brief.sources).toEqual([]);
    expect(brief.confidence).toBe('low');
  });

  it('should map a draft brief with zero accepted sources to unavailable', () => {
    const snapshot = makeSnapshot({ acceptedSourceCount: 0, briefState: 'draft' });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('unavailable');
    expect(brief.sources).toEqual([]);
    expect(brief.confidence).toBe('low');
  });

  it('should map a human_reviewed brief with zero accepted sources to unavailable', () => {
    const snapshot = makeSnapshot({ acceptedSourceCount: 0, briefState: 'human_reviewed' });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('unavailable');
    expect(brief.confidence).toBe('low');
  });

  it('should map an accepted-source brief to sourced with stored-record references when no records are present', () => {
    const snapshot = makeSnapshot({ acceptedSourceCount: 2, briefState: 'human_reviewed' });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('sourced');
    expect(brief.confidence).toBe('medium');
    expect(brief.sources).toHaveLength(2);
    const ids = brief.sources.map((source) => source.id);
    expect(new Set(ids).size).toBe(2);
    for (const source of brief.sources) {
      expect(source.title).toContain('Stored source record');
      expect(source.title).toContain('not a citation');
    }
  });

  it('should map a draft brief with one accepted source to sourced', () => {
    const snapshot = makeSnapshot({ acceptedSourceCount: 1, briefState: 'draft' });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('sourced');
    expect(brief.sources).toHaveLength(1);
  });

  it('should use only accepted full source records when records are present', () => {
    const snapshot = makeSnapshot({
      acceptedSourceCount: 1,
      sources: [
        {
          id: 'src-accepted',
          title: 'Official agency methodology page',
          url: 'https://example.gov/methodology',
          publisher: 'Example Agency',
          status: 'accepted',
          createdAt: '2026-06-10T00:00:00Z',
        },
        {
          id: 'src-draft',
          title: 'Draft note',
          url: null,
          publisher: null,
          status: 'draft',
          createdAt: '2026-06-10T00:00:00Z',
        },
        {
          id: 'src-rejected',
          title: 'Rejected blog post',
          url: null,
          publisher: null,
          status: 'rejected',
          createdAt: '2026-06-10T00:00:00Z',
        },
      ],
    });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('sourced');
    expect(brief.sources).toHaveLength(1);
    expect(brief.sources[0].id).toBe('src-accepted');
    expect(brief.sources[0].title).toBe('Official agency methodology page');
    expect(brief.sources[0].url).toBe('https://example.gov/methodology');
  });

  it('should treat full records as authoritative and degrade to unavailable when none are accepted despite a stale count', () => {
    const snapshot = makeSnapshot({
      acceptedSourceCount: 2,
      sources: [
        {
          id: 'src-rejected',
          title: 'Rejected source',
          url: null,
          publisher: null,
          status: 'rejected',
          createdAt: '2026-06-10T00:00:00Z',
        },
      ],
    });

    const brief = mapResearchState(market, snapshot, NOW_ISO);

    expect(brief.status).toBe('unavailable');
    expect(brief.sources).toEqual([]);
    expect(brief.confidence).toBe('low');
  });
});

describe('buildMarketDossierWithResearch', () => {
  it('should behave exactly like buildMarketDossier when the snapshot is null', () => {
    const market = makeMarket();

    expect(buildMarketDossierWithResearch(market, null, NOW_ISO)).toEqual(
      buildMarketDossier(market, NOW_ISO),
    );
  });

  it('should yield SKIP with a failing research_sources check when the snapshot has no accepted sources', () => {
    const market = makeMarket();
    const snapshot = makeSnapshot({
      acceptedSourceCount: 0,
      briefState: 'insufficient_sources',
      confidence: 'low',
      fairLow: null,
      fairMid: null,
      fairHigh: null,
      hasReadyThesis: false,
    });

    const dossier = buildMarketDossierWithResearch(market, snapshot, NOW_ISO);

    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
    expect(findCheck(dossier.riskEvaluation.checks, 'research_sources').status).toBe('fail');
    expect(dossier.probabilityEstimate.fairProbabilityMid).toBeNull();
  });

  it('should yield SKIP with a failing settlement_source check even with accepted sources, a fair range, and a ready thesis', () => {
    // The live understanding can only ever report 'unverified' or 'missing'
    // settlement status in this phase, so even fully researched markets SKIP.
    const market = makeMarket();
    const snapshot = makeSnapshot();

    const dossier = buildMarketDossierWithResearch(market, snapshot, NOW_ISO);

    expect(dossier.understanding.settlementSourceStatus).toBe('unverified');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    // Everything research-shaped passes; the settlement source alone blocks.
    expect(findCheck(dossier.riskEvaluation.checks, 'research_sources').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'fair_probability').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'written_thesis').status).toBe('pass');
  });

  it('should pass the persisted fair range through to the probability estimate when sources are accepted', () => {
    const market = makeMarket();
    const snapshot = makeSnapshot();

    const dossier = buildMarketDossierWithResearch(market, snapshot, NOW_ISO);

    expect(dossier.probabilityEstimate.fairProbabilityLow).toBe(0.27);
    expect(dossier.probabilityEstimate.fairProbabilityMid).toBe(0.3);
    expect(dossier.probabilityEstimate.fairProbabilityHigh).toBe(0.34);
    expect(dossier.probabilityEstimate.confidence).toBe('medium');
  });
});

describe('verdict paths with a synthetic clean understanding', () => {
  it('should yield WATCH when only the written thesis is missing (thesis-only-missing rule)', () => {
    const market = makeMarket();
    const snapshot = makeSnapshot({ hasReadyThesis: false });

    const evaluation = evaluateWithUnderstanding(
      market,
      snapshot,
      makeCleanUnderstanding(market),
    );

    expect(evaluation.verdict).toBe('WATCH');
    const failing = evaluation.checks.filter((check) => check.status === 'fail');
    expect(failing.map((check) => check.id)).toEqual(['written_thesis']);
  });

  it('should yield PAPER_TRADE only when every hard check genuinely passes on a synthetic clean candidate', () => {
    const market = makeMarket();
    const snapshot = makeSnapshot();

    const evaluation = evaluateWithUnderstanding(
      market,
      snapshot,
      makeCleanUnderstanding(market),
    );

    expect(evaluation.verdict).toBe('PAPER_TRADE');
    for (const check of evaluation.checks) {
      expect(check.status, `check '${check.id}' should pass`).toBe('pass');
    }
    expect(evaluation.realTradingLocked).toBe(true);
    expect(evaluation.mode).toBe('training_wheels');
  });

  it('should degrade the same candidate to SKIP when accepted sources decay to zero', () => {
    const market = makeMarket();
    const decayed = makeSnapshot({ acceptedSourceCount: 0, hasReadyThesis: false });

    const research = mapResearchState(market, decayed, NOW_ISO);
    const probability = estimateProbability(market, research, NOW_ISO, {
      low: 0.27,
      mid: 0.3,
      high: 0.34,
    });
    const evaluation = evaluateTradeCandidate({
      market,
      understanding: makeCleanUnderstanding(market),
      research,
      probability,
      hasWrittenThesis: decayed.hasReadyThesis,
      evaluatedAt: NOW_ISO,
    });

    // The engine discards a fair range that has no accepted sources behind it.
    expect(probability.fairProbabilityMid).toBeNull();
    expect(probability.confidence).toBe('low');
    expect(evaluation.verdict).toBe('SKIP');
    expect(findCheck(evaluation.checks, 'research_sources').status).toBe('fail');
    expect(findCheck(evaluation.checks, 'fair_probability').status).toBe('fail');
  });
});

describe('persisted research store end-to-end', () => {
  let dataDir: string;
  let db: Database.Database;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-phase3-int-'));
    db = openDatabase(dataDir, NOW_ISO);
  });

  afterEach(() => {
    closeAllDatabases();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /** Persists a complete, currently-valid ready research state for TICKER. */
  function persistReadyState(): { sourceId: string } {
    const source = createSource(
      db,
      TICKER,
      {
        marketId: `kalshi:${TICKER}`,
        kind: 'official_resolution_source',
        title: 'Official agency release page',
        url: 'https://example.gov/release',
        publisher: 'Example Agency',
        credibility: 'official',
        status: 'accepted',
        addedBy: 'human',
      },
      NOW_ISO,
    );
    saveBrief(
      db,
      TICKER,
      {
        state: 'human_reviewed',
        summary: 'Human-reviewed brief backed by the official release page.',
        confidence: 'medium',
        basis: 'manual',
      },
      NOW_ISO,
    );
    const estimate = saveEstimate(
      db,
      TICKER,
      {
        low: 0.27,
        mid: 0.3,
        high: 0.34,
        rationale: 'Official release history supports a fair value near 30 cents.',
        basis: 'human_entered',
        confidence: 'medium',
      },
      NOW_ISO,
    );
    if (!estimate.ok) {
      throw new Error(`expected estimate save to succeed: ${estimate.errors.join('; ')}`);
    }
    const thesis = createThesis(
      db,
      TICKER,
      {
        status: 'ready_for_risk',
        thesis: 'The market underprices the officially reported trend.',
        whyMispriced: 'Recent official releases are not reflected in the price.',
        invalidationCriteria: 'A contrary official release before the close date.',
        probabilityEstimateId: estimate.value.id,
        sourceIds: [source.id],
      },
      NOW_ISO,
    );
    if (!thesis.ok) {
      throw new Error(`expected thesis create to succeed: ${thesis.errors.join('; ')}`);
    }
    return { sourceId: source.id };
  }

  it('should still fail the settlement_source check when an accepted official_resolution_source source exists (settlement-source policy)', () => {
    persistReadyState();
    const market = makeMarket();
    const snapshot = snapshotFromState(getResearchState(db, TICKER));

    const dossier = buildMarketDossierWithResearch(market, snapshot, NOW_ISO);

    // A human-labeled "official" source record is human-entered text, not
    // verification of the resolution authority. Live markets stay SKIP.
    expect(snapshot.acceptedSourceCount).toBe(1);
    expect(snapshot.hasReadyThesis).toBe(true);
    expect(findCheck(dossier.riskEvaluation.checks, 'settlement_source').status).toBe('fail');
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');
    // Every research-side check passes; only settlement verification blocks.
    expect(findCheck(dossier.riskEvaluation.checks, 'research_sources').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'confidence').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'fair_probability').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'min_edge').status).toBe('pass');
    expect(findCheck(dossier.riskEvaluation.checks, 'written_thesis').status).toBe('pass');
  });

  it('should decay a PAPER_TRADE-eligible candidate to SKIP after its only accepted source is rejected', () => {
    const { sourceId } = persistReadyState();
    const market = makeMarket();
    const understanding = makeCleanUnderstanding(market);

    const before = evaluateWithUnderstanding(
      market,
      snapshotFromState(getResearchState(db, TICKER)),
      understanding,
    );
    expect(before.verdict).toBe('PAPER_TRADE');

    updateSource(db, sourceId, { status: 'rejected' }, NOW_ISO);
    const decayedState = getResearchState(db, TICKER);
    const after = evaluateWithUnderstanding(
      market,
      snapshotFromState(decayedState),
      understanding,
    );

    expect(decayedState.summary.acceptedSourceCount).toBe(0);
    expect(decayedState.summary.hasReadyThesis).toBe(false);
    expect(decayedState.summary.hasFairProbability).toBe(false);
    expect(after.verdict).toBe('SKIP');
    expect(findCheck(after.checks, 'research_sources').status).toBe('fail');
    expect(findCheck(after.checks, 'fair_probability').status).toBe('fail');
    expect(findCheck(after.checks, 'written_thesis').status).toBe('fail');
  });
});

describe('edge units (hand-computed)', () => {
  it('should compute expectedEdge 0.06 (6.0 cents) for fair mid 0.30 against implied 0.24', () => {
    const market = makeMarket();
    const snapshot = makeSnapshot();
    const research = mapResearchState(market, snapshot, NOW_ISO);

    const estimate = estimateProbability(market, research, NOW_ISO, {
      low: 0.27,
      mid: 0.3,
      high: 0.34,
    });

    expect(estimate.marketImpliedProbability).toBeCloseTo(0.24, 10);
    expect(estimate.expectedEdge).toBeCloseTo(0.06, 10);
    expect(((estimate.expectedEdge as number) * 100).toFixed(1)).toBe('6.0');

    const evaluation = evaluateWithUnderstanding(
      market,
      snapshot,
      makeCleanUnderstanding(market),
    );
    expect(findCheck(evaluation.checks, 'min_edge').reason).toContain('6.0 cents');
  });
});

describe('summarizeEvaluations with persisted research', () => {
  it('should count sourced research from the optional per-ticker snapshot map', () => {
    const researched = makeMarket();
    const bare = makeMarket({
      id: 'kalshi:SYNTH-BARE',
      externalId: 'SYNTH-BARE',
      title: 'Second synthetic market with no persisted research',
    });
    const researchByTicker = { [researched.externalId]: makeSnapshot() };

    const summary = summarizeEvaluations([researched, bare], NOW_ISO, researchByTicker);

    expect(summary.understood).toBe(2);
    expect(summary.evaluated).toBe(2);
    expect(summary.researchSourced).toBe(1);
    expect(summary.skip + summary.watch + summary.paperTrade).toBe(2);
  });

  it('should keep counting zero sourced research when no map is supplied', () => {
    const summary = summarizeEvaluations([makeMarket()], NOW_ISO);

    expect(summary.researchSourced).toBe(0);
  });
});

describe('runtime verdict whitelist', () => {
  it('should emit only SKIP, WATCH, or PAPER_TRADE across every exercised path and never a real-trade label', () => {
    const market = makeMarket();
    const evaluations: RiskEvaluation[] = [
      buildMarketDossierWithResearch(market, null, NOW_ISO).riskEvaluation,
      buildMarketDossierWithResearch(market, makeSnapshot(), NOW_ISO).riskEvaluation,
      evaluateWithUnderstanding(
        market,
        makeSnapshot({ hasReadyThesis: false }),
        makeCleanUnderstanding(market),
      ),
      evaluateWithUnderstanding(market, makeSnapshot(), makeCleanUnderstanding(market)),
    ];

    for (const evaluation of evaluations) {
      expect(ALLOWED_VERDICTS).toContain(evaluation.verdict);
      expect(evaluation.realTradingLocked).toBe(true);
      expect(evaluation.mode).toBe('training_wheels');
    }
    expect(JSON.stringify(evaluations)).not.toContain('REAL_TRADE');
  });
});
