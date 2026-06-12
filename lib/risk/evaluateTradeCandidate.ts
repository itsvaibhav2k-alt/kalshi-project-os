/**
 * Deterministic risk evaluation (pipeline stage 04 Validate / Risk).
 *
 * Pure function: no network, no language model, no randomness, no clock —
 * `evaluatedAt` comes from the candidate. The same candidate always yields
 * the same evaluation. Rules permit; model output never approves anything.
 *
 * Twelve ordered checks run on every candidate. Verdict algorithm:
 *   1. Any hard fail except `written_thesis` => SKIP.
 *   2. No hard fails, but the thesis is missing => WATCH (a missing thesis
 *      never turns an otherwise clean candidate into SKIP).
 *   3. No hard fails, but any warning (e.g. thin liquidity) => WATCH.
 *   4. No hard fails, no warnings, thesis present => PAPER_TRADE
 *      (eligibility only — there is no paper journal in Phase 2).
 */

import type { Confidence } from '@/lib/probability/types';

import { RISK_CONSTANTS } from './constants';
import type { RiskCandidate, RiskCheckResult, RiskEvaluation, RiskVerdict } from './types';

/** Ordering for confidence comparisons; higher is more confident. */
const CONFIDENCE_RANK: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Informational check 1: the system is paper-only by constitution. */
function checkPaperOnlyMode(): RiskCheckResult {
  return {
    id: 'paper_only_mode',
    label: 'Paper-only mode',
    status: 'pass',
    reason: 'Training Wheels mode is active; real-money paths are closed by design.',
  };
}

/** Check 2: resolution terms must be unambiguously clear. */
function checkResolutionClarity(candidate: RiskCandidate): RiskCheckResult {
  const clarity = candidate.understanding.resolutionClarity;
  if (clarity === 'clear') {
    return {
      id: 'resolution_clarity',
      label: 'Resolution clarity',
      status: 'pass',
      reason: 'Resolution terms are clear per the listed rules.',
    };
  }
  return {
    id: 'resolution_clarity',
    label: 'Resolution clarity',
    status: 'fail',
    reason: `Resolution terms are ${clarity}; ambiguous or missing wording cannot be priced honestly.`,
  };
}

/** Check 3: the settlement source must exist AND be verified. */
function checkSettlementSource(candidate: RiskCandidate): RiskCheckResult {
  const status = candidate.understanding.settlementSourceStatus;
  if (status === 'provided') {
    return {
      id: 'settlement_source',
      label: 'Settlement source',
      status: 'pass',
      reason: 'A verified settlement source is on record.',
    };
  }
  const detail =
    status === 'missing'
      ? 'No settlement source is listed in the public payload.'
      : 'The listed settlement source has not been independently verified.';
  return {
    id: 'settlement_source',
    label: 'Settlement source',
    status: 'fail',
    reason: `${detail} Without a verified source the contract cannot be researched.`,
  };
}

/** Check 4: the bid/ask spread must be known and within the maximum. */
function checkMaxSpread(candidate: RiskCandidate): RiskCheckResult {
  const spread = candidate.market.spreadCents;
  if (spread === null) {
    return {
      id: 'max_spread',
      label: 'Maximum spread',
      status: 'fail',
      reason: 'Spread is unknown (missing bid or ask); cost of entry cannot be assessed.',
    };
  }
  if (spread > RISK_CONSTANTS.maxSpreadCents) {
    return {
      id: 'max_spread',
      label: 'Maximum spread',
      status: 'fail',
      reason: `Spread of ${spread} cents exceeds the ${RISK_CONSTANTS.maxSpreadCents}-cent maximum; crossing it would consume the edge.`,
    };
  }
  return {
    id: 'max_spread',
    label: 'Maximum spread',
    status: 'pass',
    reason: `Spread of ${spread} cents is within the ${RISK_CONSTANTS.maxSpreadCents}-cent maximum.`,
  };
}

/** Check 5: the market must have traded at all. */
function checkVolume(candidate: RiskCandidate): RiskCheckResult {
  const volume = candidate.market.volume;
  if (volume === null || volume === 0) {
    return {
      id: 'volume',
      label: 'Volume',
      status: 'fail',
      reason:
        volume === null
          ? 'Volume is not provided in the public payload; activity cannot be confirmed.'
          : 'Volume is zero; the market has never traded.',
    };
  }
  return {
    id: 'volume',
    label: 'Volume',
    status: 'pass',
    reason: `Lifetime volume of ${volume} contracts confirms trading activity.`,
  };
}

/** Check 6: thin liquidity warns and caps the verdict at WATCH. */
function checkLiquidity(candidate: RiskCandidate): RiskCheckResult {
  const { volume, openInterest } = candidate.market;
  const thinVolume = volume === null || volume < RISK_CONSTANTS.minVolume;
  const thinOpenInterest =
    openInterest === null || openInterest < RISK_CONSTANTS.minOpenInterest;
  if (thinVolume || thinOpenInterest) {
    const details: string[] = [];
    if (thinVolume) {
      details.push(
        `volume ${volume ?? 'unknown'} is below the ${RISK_CONSTANTS.minVolume} minimum`,
      );
    }
    if (thinOpenInterest) {
      details.push(
        `open interest ${openInterest ?? 'unknown'} is below the ${RISK_CONSTANTS.minOpenInterest} minimum`,
      );
    }
    return {
      id: 'liquidity',
      label: 'Liquidity',
      status: 'warn',
      reason: `Thin liquidity: ${details.join(' and ')}; verdict is capped at WATCH.`,
    };
  }
  return {
    id: 'liquidity',
    label: 'Liquidity',
    status: 'pass',
    reason: 'Volume and open interest meet the liquidity minimums.',
  };
}

/** Check 7: research must cite at least one real source. */
function checkResearchSources(candidate: RiskCandidate): RiskCheckResult {
  if (candidate.research.sources.length === 0) {
    return {
      id: 'research_sources',
      label: 'Research sources',
      status: 'fail',
      reason: 'No research sources exist. No source = low confidence = SKIP.',
    };
  }
  return {
    id: 'research_sources',
    label: 'Research sources',
    status: 'pass',
    reason: `${candidate.research.sources.length} cited source(s) back the research brief.`,
  };
}

/** Check 8: advisory confidence must reach the configured minimum. */
function checkConfidence(candidate: RiskCandidate): RiskCheckResult {
  const confidence = candidate.probability.confidence;
  const required = RISK_CONSTANTS.minConfidenceForPaperTrade;
  if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[required]) {
    return {
      id: 'confidence',
      label: 'Confidence',
      status: 'fail',
      reason: `Confidence '${confidence}' is below the required '${required}'; ungrounded estimates are not actionable.`,
    };
  }
  return {
    id: 'confidence',
    label: 'Confidence',
    status: 'pass',
    reason: `Confidence '${confidence}' meets the required '${required}'.`,
  };
}

/** Check 9: a fair probability must exist (it is never invented). */
function checkFairProbability(candidate: RiskCandidate): RiskCheckResult {
  if (candidate.probability.fairProbabilityMid === null) {
    return {
      id: 'fair_probability',
      label: 'Fair probability',
      status: 'fail',
      reason: 'No fair probability exists; without one there is no honest edge to measure.',
    };
  }
  return {
    id: 'fair_probability',
    label: 'Fair probability',
    status: 'pass',
    reason: 'A research-backed fair probability is present.',
  };
}

/**
 * Check 10: expected edge must clear the minimum AND exceed the spread.
 *
 * `expectedEdge` is a fraction in [0, 1]; `minEdgeCents` is binary-contract
 * cents (= probability points), so the edge is converted to cents before
 * comparison. A raw-fraction comparison would be a unit bug.
 */
function checkMinEdge(candidate: RiskCandidate): RiskCheckResult {
  const edge = candidate.probability.expectedEdge;
  if (edge === null) {
    return {
      id: 'min_edge',
      label: 'Minimum edge',
      status: 'fail',
      reason: 'No expected edge could be computed (fair or implied probability missing).',
    };
  }
  const edgeCents = edge * 100;
  if (edgeCents < RISK_CONSTANTS.minEdgeCents) {
    return {
      id: 'min_edge',
      label: 'Minimum edge',
      status: 'fail',
      reason: `Expected edge of ${edgeCents.toFixed(1)} cents is below the ${RISK_CONSTANTS.minEdgeCents}-cent minimum.`,
    };
  }
  const spread = candidate.market.spreadCents;
  if (spread === null) {
    return {
      id: 'min_edge',
      label: 'Minimum edge',
      status: 'fail',
      reason: 'Spread is unknown, so the edge net of spread cannot be confirmed.',
    };
  }
  if (edgeCents <= spread) {
    return {
      id: 'min_edge',
      label: 'Minimum edge',
      status: 'fail',
      reason: `Expected edge of ${edgeCents.toFixed(1)} cents does not exceed the ${spread}-cent spread; crossing the spread eats it.`,
    };
  }
  return {
    id: 'min_edge',
    label: 'Minimum edge',
    status: 'pass',
    reason: `Expected edge of ${edgeCents.toFixed(1)} cents clears the ${RISK_CONSTANTS.minEdgeCents}-cent minimum and the ${spread}-cent spread.`,
  };
}

/** Check 11: a written thesis is required; absence caps at WATCH alone. */
function checkWrittenThesis(candidate: RiskCandidate): RiskCheckResult {
  if (!candidate.hasWrittenThesis) {
    return {
      id: 'written_thesis',
      label: 'Written thesis',
      status: 'fail',
      reason:
        'No written thesis is attached; without deliberate reasoning the best verdict is WATCH.',
    };
  }
  return {
    id: 'written_thesis',
    label: 'Written thesis',
    status: 'pass',
    reason: 'A written thesis is attached to the candidate.',
  };
}

/** Informational check 12: the real-trading path stays locked. */
function checkRealTradingLocked(): RiskCheckResult {
  return {
    id: 'real_trading_locked',
    label: 'Real trading locked',
    status: 'pass',
    reason:
      'Real trading is locked; PAPER_TRADE means paper eligibility only, never an order.',
  };
}

/**
 * Derives the verdict from completed checks.
 *
 * Any hard fail other than `written_thesis` means SKIP. A missing thesis or
 * any warning caps an otherwise clean candidate at WATCH. PAPER_TRADE
 * requires zero hard fails, zero warnings, and a written thesis.
 */
function deriveVerdict(checks: RiskCheckResult[]): RiskVerdict {
  const hasHardFail = checks.some(
    (check) => check.status === 'fail' && check.id !== 'written_thesis',
  );
  if (hasHardFail) {
    return 'SKIP';
  }
  const thesisMissing = checks.some(
    (check) => check.id === 'written_thesis' && check.status === 'fail',
  );
  const hasWarning = checks.some((check) => check.status === 'warn');
  if (thesisMissing || hasWarning) {
    return 'WATCH';
  }
  return 'PAPER_TRADE';
}

/**
 * Evaluates one trade candidate with the twelve ordered deterministic checks.
 *
 * @param candidate - Outputs of the earlier pipeline stages plus the
 *   caller-supplied evaluation timestamp
 * @returns The full evaluation: every check result, the verdict, and a
 *   human-readable reason for every failed or warned check
 *
 * @example
 * const evaluation = evaluateTradeCandidate(candidate);
 * // evaluation.verdict is 'SKIP' | 'WATCH' | 'PAPER_TRADE'
 */
export function evaluateTradeCandidate(candidate: RiskCandidate): RiskEvaluation {
  const checks: RiskCheckResult[] = [
    checkPaperOnlyMode(),
    checkResolutionClarity(candidate),
    checkSettlementSource(candidate),
    checkMaxSpread(candidate),
    checkVolume(candidate),
    checkLiquidity(candidate),
    checkResearchSources(candidate),
    checkConfidence(candidate),
    checkFairProbability(candidate),
    checkMinEdge(candidate),
    checkWrittenThesis(candidate),
    checkRealTradingLocked(),
  ];

  const reasons = checks
    .filter((check) => check.status === 'fail' || check.status === 'warn')
    .map((check) => check.reason);

  return {
    marketId: candidate.market.id,
    evaluatedAt: candidate.evaluatedAt,
    verdict: deriveVerdict(checks),
    checks,
    reasons,
    mode: 'training_wheels',
    realTradingLocked: true,
  };
}
