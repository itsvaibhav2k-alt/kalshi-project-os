import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { NormalizedMarket } from '@/lib/markets/types';
import type { ProbabilityEstimate } from '@/lib/probability/types';
import type { ResearchBrief } from '@/lib/research/types';
import { RISK_CONSTANTS } from '@/lib/risk/constants';
import { evaluateTradeCandidate } from '@/lib/risk/evaluateTradeCandidate';
import type { RiskCandidate, RiskCheckResult, RiskVerdict } from '@/lib/risk/types';
import type { ContractUnderstanding } from '@/lib/understanding/types';

const MARKET_ID = 'kalshi:TEST-MKT';
const EVALUATED_AT = '2026-06-11T12:00:00Z';

/** A liquid, tight-spread market for arranging test variations. */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: MARKET_ID,
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
    settlementSource: 'NWS daily climate report (KNYC)',
    isProvisional: false,
    isMultivariate: false,
    flags: [],
    raw: {},
    ...overrides,
  };
}

/** A clear, synthetically verified understanding for test variations. */
function makeUnderstanding(
  overrides: Partial<ContractUnderstanding> = {},
): ContractUnderstanding {
  return {
    marketId: MARKET_ID,
    title: 'Will the maximum temperature at Central Park reach 88F on Jun 12?',
    summary: 'Binary market on the Central Park maximum temperature for June 12.',
    yesCondition: 'Resolves YES when the listed rules are satisfied.',
    noCondition: 'Resolves NO if the YES condition is not met by the listed deadline.',
    rulesText: 'Resolves YES per the NWS daily climate report.',
    resolutionCriteria: 'Settled per the NWS daily climate report for Central Park (KNYC).',
    settlementSource: 'NWS daily climate report (KNYC)',
    settlementSourceStatus: 'provided',
    resolutionClarity: 'clear',
    importantDates: [{ label: 'Close time', value: '2026-06-12T22:00:00Z' }],
    ambiguityFlags: [],
    missingFields: [],
    interpretationNotes: [],
    ...overrides,
  };
}

/** A sourced synthetic research brief for test variations. */
function makeResearch(overrides: Partial<ResearchBrief> = {}): ResearchBrief {
  return {
    marketId: MARKET_ID,
    status: 'fixture',
    createdAt: EVALUATED_AT,
    evidenceSummary: 'Forecast guidance clusters near 86-88F for June 12.',
    counterarguments: ['Station readings can diverge from gridded forecasts.'],
    sources: [
      {
        id: 'src-1',
        title: 'NWS daily climate report for Central Park (KNYC)',
        url: 'test://fixture-source/knyc-climate-report',
        publisher: 'National Weather Service',
        accessedAt: '2026-06-11T11:30:00Z',
      },
    ],
    confidence: 'medium',
    advisoryNotes: ['FIXTURE: synthetic research brief for tests only.'],
    ...overrides,
  };
}

/** A probability estimate with a real edge for test variations. */
function makeProbability(overrides: Partial<ProbabilityEstimate> = {}): ProbabilityEstimate {
  return {
    marketId: MARKET_ID,
    createdAt: EVALUATED_AT,
    marketImpliedProbability: 0.4,
    impliedProbabilityBasis: 'bid_ask_midpoint',
    fairProbabilityLow: 0.44,
    fairProbabilityMid: 0.48,
    fairProbabilityHigh: 0.52,
    expectedEdge: 0.08,
    confidence: 'medium',
    sourceIds: ['src-1'],
    uncertaintyNotes: [],
    ...overrides,
  };
}

/**
 * A live-like DEFAULT candidate: settlement source unverified, research not
 * run (no sources), low confidence, no fair probability, no edge, no thesis.
 * This is what Phase 2 actually evaluates live — it must SKIP.
 */
function makeCandidate(overrides: Partial<RiskCandidate> = {}): RiskCandidate {
  return {
    market: makeMarket({ settlementSource: null }),
    understanding: makeUnderstanding({
      settlementSource: null,
      settlementSourceStatus: 'missing',
    }),
    research: makeResearch({
      status: 'not_run',
      sources: [],
      confidence: 'low',
      evidenceSummary: 'No evidence was gathered. Research has not been run for this market.',
    }),
    probability: makeProbability({
      fairProbabilityLow: null,
      fairProbabilityMid: null,
      fairProbabilityHigh: null,
      expectedEdge: null,
      confidence: 'low',
      sourceIds: [],
    }),
    hasWrittenThesis: false,
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

/**
 * A synthetic candidate that passes every check, with a written thesis.
 * Unreachable live in Phase 2 (no verified settlement sources, no research
 * engine, no thesis form); exists to prove the PAPER_TRADE path works.
 */
function makeEligibleCandidate(overrides: Partial<RiskCandidate> = {}): RiskCandidate {
  return {
    market: makeMarket(),
    understanding: makeUnderstanding(),
    research: makeResearch(),
    probability: makeProbability(),
    hasWrittenThesis: true,
    evaluatedAt: EVALUATED_AT,
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

describe('evaluateTradeCandidate', () => {
  describe('default behavior', () => {
    it('should return SKIP for a default live-like candidate', () => {
      const candidate = makeCandidate();

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(evaluation.reasons.length).toBeGreaterThan(0);
    });

    it('should carry training-wheels mode and locked real trading on every evaluation', () => {
      const evaluation = evaluateTradeCandidate(makeCandidate());

      expect(evaluation.mode).toBe('training_wheels');
      expect(evaluation.realTradingLocked).toBe(true);
      expect(evaluation.marketId).toBe(MARKET_ID);
    });

    it('should use the caller-supplied timestamp, never a clock', () => {
      const evaluation = evaluateTradeCandidate(makeCandidate());

      expect(evaluation.evaluatedAt).toBe(EVALUATED_AT);
    });

    it('should run all twelve checks in the documented order', () => {
      const evaluation = evaluateTradeCandidate(makeCandidate());

      expect(evaluation.checks.map((check) => check.id)).toEqual([
        'paper_only_mode',
        'resolution_clarity',
        'settlement_source',
        'max_spread',
        'volume',
        'liquidity',
        'research_sources',
        'confidence',
        'fair_probability',
        'min_edge',
        'written_thesis',
        'real_trading_locked',
      ]);
    });

    it('should pass the informational paper-only and real-trading-locked checks', () => {
      const evaluation = evaluateTradeCandidate(makeCandidate());

      expect(findCheck(evaluation.checks, 'paper_only_mode').status).toBe('pass');
      expect(findCheck(evaluation.checks, 'real_trading_locked').status).toBe('pass');
    });
  });

  describe('resolution clarity', () => {
    it('should return SKIP when resolution clarity is ambiguous', () => {
      const candidate = makeEligibleCandidate({
        understanding: makeUnderstanding({ resolutionClarity: 'ambiguous' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'resolution_clarity').status).toBe('fail');
    });

    it('should return SKIP when resolution clarity is missing', () => {
      const candidate = makeEligibleCandidate({
        understanding: makeUnderstanding({ resolutionClarity: 'missing' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'resolution_clarity').status).toBe('fail');
    });
  });

  describe('settlement source', () => {
    it('should return SKIP when the settlement source is missing', () => {
      const candidate = makeEligibleCandidate({
        understanding: makeUnderstanding({
          settlementSource: null,
          settlementSourceStatus: 'missing',
        }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'settlement_source').status).toBe('fail');
    });

    it('should return SKIP when the settlement source is unverified', () => {
      const candidate = makeEligibleCandidate({
        understanding: makeUnderstanding({ settlementSourceStatus: 'unverified' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'settlement_source').status).toBe('fail');
    });
  });

  describe('max spread', () => {
    it('should return SKIP when the spread is null', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ spreadCents: null }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'max_spread').status).toBe('fail');
    });

    it('should return SKIP when the spread exceeds the maximum', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ spreadCents: RISK_CONSTANTS.maxSpreadCents + 1 }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'max_spread').status).toBe('fail');
    });
  });

  describe('volume', () => {
    it('should return SKIP when volume is zero', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ volume: 0 }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'volume').status).toBe('fail');
    });

    it('should return SKIP when volume is null', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ volume: null }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'volume').status).toBe('fail');
    });
  });

  describe('research sources', () => {
    it('should return SKIP when the research brief has no sources', () => {
      const candidate = makeEligibleCandidate({
        research: makeResearch({ sources: [], confidence: 'low' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'research_sources').status).toBe('fail');
    });
  });

  describe('confidence', () => {
    it('should return SKIP when confidence is below medium', () => {
      const candidate = makeEligibleCandidate({
        probability: makeProbability({ confidence: 'low' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'confidence').status).toBe('fail');
    });

    it('should pass the confidence check when confidence is high', () => {
      const candidate = makeEligibleCandidate({
        probability: makeProbability({ confidence: 'high' }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(findCheck(evaluation.checks, 'confidence').status).toBe('pass');
    });
  });

  describe('fair probability', () => {
    it('should return SKIP when the fair probability is null', () => {
      const candidate = makeEligibleCandidate({
        probability: makeProbability({ fairProbabilityMid: null, expectedEdge: null }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'fair_probability').status).toBe('fail');
    });
  });

  describe('min edge', () => {
    it('should return SKIP when the expected edge is null', () => {
      const candidate = makeEligibleCandidate({
        probability: makeProbability({ expectedEdge: null }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'min_edge').status).toBe('fail');
    });

    it('should return SKIP when the edge in cents is below the minimum', () => {
      // 0.03 fraction = 3 cents, below the 5-cent minimum.
      const candidate = makeEligibleCandidate({
        probability: makeProbability({
          fairProbabilityMid: 0.43,
          expectedEdge: 0.03,
        }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'min_edge').status).toBe('fail');
    });

    it('should return SKIP when the edge does not exceed the spread', () => {
      // 0.06 fraction = 6 cents edge against a 6-cent spread: not enough.
      const candidate = makeEligibleCandidate({
        market: makeMarket({ spreadCents: 6 }),
        probability: makeProbability({
          fairProbabilityMid: 0.46,
          expectedEdge: 0.06,
        }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
      expect(findCheck(evaluation.checks, 'min_edge').status).toBe('fail');
    });

    it('should compare edge as cents, never the raw fraction, against minEdgeCents', () => {
      // A naive `0.08 >= 5` comparison would wrongly fail this candidate.
      const evaluation = evaluateTradeCandidate(makeEligibleCandidate());

      expect(findCheck(evaluation.checks, 'min_edge').status).toBe('pass');
    });
  });

  describe('liquidity warnings', () => {
    it('should cap the verdict at WATCH when volume is below the minimum', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ volume: RISK_CONSTANTS.minVolume - 1 }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('WATCH');
      expect(findCheck(evaluation.checks, 'liquidity').status).toBe('warn');
    });

    it('should cap the verdict at WATCH when open interest is below the minimum', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ openInterest: RISK_CONSTANTS.minOpenInterest - 1 }),
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('WATCH');
      expect(findCheck(evaluation.checks, 'liquidity').status).toBe('warn');
    });

    it('should never return PAPER_TRADE for a thin market even with a thesis', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ volume: 500, openInterest: 50 }),
        hasWrittenThesis: true,
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).not.toBe('PAPER_TRADE');
      expect(evaluation.verdict).toBe('WATCH');
    });
  });

  describe('written thesis', () => {
    it('should return WATCH when a missing thesis is the only blocker', () => {
      const candidate = makeEligibleCandidate({ hasWrittenThesis: false });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('WATCH');
      expect(findCheck(evaluation.checks, 'written_thesis').status).toBe('fail');
    });

    it('should include a thesis reason when the thesis is missing', () => {
      const candidate = makeEligibleCandidate({ hasWrittenThesis: false });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.reasons.join(' ').toLowerCase()).toContain('thesis');
    });

    it('should still return SKIP when hard failures exist alongside a missing thesis', () => {
      const candidate = makeEligibleCandidate({
        market: makeMarket({ spreadCents: null }),
        hasWrittenThesis: false,
      });

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('SKIP');
    });
  });

  describe('paper trade eligibility', () => {
    it('should return PAPER_TRADE for a fully passing synthetic candidate with a thesis', () => {
      const candidate = makeEligibleCandidate();

      const evaluation = evaluateTradeCandidate(candidate);

      expect(evaluation.verdict).toBe('PAPER_TRADE');
      expect(evaluation.reasons).toEqual([]);
      expect(
        evaluation.checks.every(
          (check) => check.status === 'pass' || check.status === 'not_applicable',
        ),
      ).toBe(true);
    });
  });

  describe('reasons', () => {
    it('should collect a reason for every failed or warned check', () => {
      const candidate = makeCandidate();

      const evaluation = evaluateTradeCandidate(candidate);

      const blockers = evaluation.checks.filter(
        (check) => check.status === 'fail' || check.status === 'warn',
      );
      expect(blockers.length).toBeGreaterThan(0);
      expect(evaluation.reasons).toHaveLength(blockers.length);
      for (const blocker of blockers) {
        expect(evaluation.reasons).toContain(blocker.reason);
      }
    });
  });

  describe('determinism', () => {
    it('should return deep-equal evaluations for the same candidate evaluated twice', () => {
      const candidate = makeCandidate();

      expect(evaluateTradeCandidate(candidate)).toEqual(evaluateTradeCandidate(candidate));
    });

    it('should return deep-equal evaluations for the same eligible candidate twice', () => {
      const candidate = makeEligibleCandidate();

      expect(evaluateTradeCandidate(candidate)).toEqual(evaluateTradeCandidate(candidate));
    });
  });

  describe('verdict vocabulary', () => {
    it('should only ever emit SKIP, WATCH, or PAPER_TRADE', () => {
      const allowed: RiskVerdict[] = ['SKIP', 'WATCH', 'PAPER_TRADE'];
      const candidates = [
        makeCandidate(),
        makeEligibleCandidate(),
        makeEligibleCandidate({ hasWrittenThesis: false }),
        makeEligibleCandidate({ market: makeMarket({ volume: 500 }) }),
      ];

      for (const candidate of candidates) {
        const evaluation = evaluateTradeCandidate(candidate);
        expect(allowed).toContain(evaluation.verdict);
      }
    });
  });
});

describe('RISK_CONSTANTS', () => {
  it('should hold the approved conservative starter values verbatim', () => {
    expect(RISK_CONSTANTS).toEqual({
      paperOnlyMode: true,
      maxSpreadCents: 10,
      minVolume: 1000,
      minOpenInterest: 100,
      minEdgeCents: 5,
      minConfidenceForPaperTrade: 'medium',
    });
  });
});

describe('lib/risk purity', () => {
  const FORBIDDEN_FRAGMENTS = [
    'fetch(',
    'http',
    'https',
    'openai',
    'anthropic',
    'llm',
    'process.env',
    'Date.now',
    'new Date(',
  ] as const;

  it('should contain no network, model, environment, or clock code in any lib/risk file', () => {
    const riskDir = fileURLToPath(new URL('../lib/risk', import.meta.url));
    const files = fs.readdirSync(riskDir).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(`${riskDir}/${file}`, 'utf8').toLowerCase();
      for (const fragment of FORBIDDEN_FRAGMENTS) {
        expect(content, `${file} must not contain '${fragment}'`).not.toContain(
          fragment.toLowerCase(),
        );
      }
    }
  });
});
