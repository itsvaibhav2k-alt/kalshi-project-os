import type Database from 'better-sqlite3';

import { getLatestBrief } from './briefs';
import { getEstimateById, getLatestEstimate } from './probabilityEstimates';
import { getActiveVerifiedSettlementSource, listSettlementSources } from './settlementSources';
import { listSources } from './sources';
import { getActiveThesis } from './theses';
import type {
  Confidence,
  MarketSourceRecord,
  ProbabilityEstimateRecord,
  ResearchBriefRecord,
  ResearchStateResponse,
  ResearchSummary,
  SettlementSourceRecord,
  ThesisRecord,
  VerifiedSettlementSummary,
} from './types';
import { deriveBriefState, validateFairRange, validateThesisReady } from './validation';

/**
 * Read-side summary assembly for the research store.
 *
 * Summary flags are ALWAYS recomputed against current rows via the validators
 * — never echoed from stored flags — because research state can decay (a
 * thesis marked ready stops being ready when a linked source is later
 * rejected). This is the read-time layer of the three-layer validation
 * described in the Phase 3 plan; the default posture is the safe one
 * (everything false, confidence low).
 */

interface ResearchRecords {
  sources: MarketSourceRecord[];
  brief: ResearchBriefRecord | null;
  probabilityEstimate: ProbabilityEstimateRecord | null;
  thesis: ThesisRecord | null;
  settlementSources: SettlementSourceRecord[];
  verifiedSettlementSource: VerifiedSettlementSummary | null;
}

function loadRecords(db: Database.Database, ticker: string): ResearchRecords {
  return {
    sources: listSources(db, ticker),
    brief: getLatestBrief(db, ticker),
    probabilityEstimate: getLatestEstimate(db, ticker),
    thesis: getActiveThesis(db, ticker),
    settlementSources: listSettlementSources(db, ticker),
    verifiedSettlementSource: getActiveVerifiedSettlementSource(db, ticker),
  };
}

function summarizeRecords(db: Database.Database, records: ResearchRecords): ResearchSummary {
  const { sources, brief, probabilityEstimate, thesis } = records;
  const acceptedSourceCount = sources.filter((source) => source.status === 'accepted').length;

  const hasHumanReviewedBrief =
    brief !== null && deriveBriefState(brief.state, acceptedSourceCount) === 'human_reviewed';

  const hasFairProbability =
    probabilityEstimate !== null &&
    validateFairRange(
      {
        low: probabilityEstimate.low,
        mid: probabilityEstimate.mid,
        high: probabilityEstimate.high,
        rationale: probabilityEstimate.rationale,
        basis: probabilityEstimate.basis,
      },
      acceptedSourceCount,
    ).ok;

  const linkedEstimate =
    thesis === null || thesis.probabilityEstimateId === null
      ? null
      : getEstimateById(db, thesis.probabilityEstimateId);
  const hasReadyThesis =
    thesis !== null &&
    thesis.status === 'ready_for_risk' &&
    validateThesisReady(thesis, sources, linkedEstimate).ok;

  const researchConfidence: Confidence =
    brief === null || acceptedSourceCount < 1 ? 'low' : brief.confidence;

  return {
    acceptedSourceCount,
    hasHumanReviewedBrief,
    hasFairProbability,
    hasReadyThesis,
    researchConfidence,
    verifiedSettlementSource: records.verifiedSettlementSource,
  };
}

/**
 * Lists every market ticker that has at least one research row in any table.
 *
 * @param db - Open research-store database handle.
 * @returns Distinct tickers in ascending order.
 */
export function listResearchTickers(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT market_ticker FROM market_sources
       UNION SELECT market_ticker FROM research_briefs
       UNION SELECT market_ticker FROM probability_estimates
       UNION SELECT market_ticker FROM theses
       UNION SELECT market_ticker FROM market_settlement_sources
       ORDER BY market_ticker ASC`,
    )
    .all() as Array<{ market_ticker: string }>;
  return rows.map((row) => row.market_ticker);
}

/**
 * Computes the per-ticker research summary against current rows.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to summarize.
 * @returns Recomputed summary; safe defaults when no rows exist.
 */
export function computeResearchSummary(db: Database.Database, ticker: string): ResearchSummary {
  return summarizeRecords(db, loadRecords(db, ticker));
}

/**
 * Assembles the full per-ticker research state: source records, the latest
 * brief and estimate, the active thesis, and the recomputed summary.
 *
 * @param db - Open research-store database handle.
 * @param ticker - Market ticker to assemble state for.
 * @returns Full research state with a recomputed (never stored) summary.
 */
export function getResearchState(db: Database.Database, ticker: string): ResearchStateResponse {
  const records = loadRecords(db, ticker);
  return {
    ticker,
    sources: records.sources,
    brief: records.brief,
    probabilityEstimate: records.probabilityEstimate,
    thesis: records.thesis,
    settlementSources: records.settlementSources,
    summary: summarizeRecords(db, records),
  };
}
