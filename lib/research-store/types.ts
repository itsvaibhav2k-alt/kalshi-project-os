/**
 * Types for the research store: Phase 3 research/thesis records plus Phase 4
 * settlement verification and the paper decision journal.
 *
 * UNITS CONVENTION (stated once, binding for the whole research store):
 * The database and the API store probabilities as fractions in [0, 1] with
 * low <= mid <= high. The UI converts to percent for display and form input,
 * and expected edge is displayed in cents (edge x 100), matching the risk
 * engine's reason strings.
 *
 * Everything in this module is research input. Records here never approve or
 * execute trades; the deterministic risk engine alone issues verdicts.
 */

/** What kind of source a record is. */
export const SOURCE_KINDS = [
  'official_resolution_source',
  'supporting_source',
  'news',
  'forecast',
  'data',
  'other',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Human-assigned credibility label for a source. */
export const SOURCE_CREDIBILITIES = ['official', 'high', 'medium', 'low', 'unknown'] as const;
export type SourceCredibility = (typeof SOURCE_CREDIBILITIES)[number];

/** Review status of a source. Only 'accepted' sources count toward research. */
export const SOURCE_STATUSES = ['draft', 'accepted', 'rejected'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** Who added a source record. */
export const SOURCE_ADDED_BY = ['human', 'fixture', 'ai_draft'] as const;
export type SourceAddedBy = (typeof SOURCE_ADDED_BY)[number];

/** Lifecycle state of a research brief. Human-typed content is never labeled AI research. */
export const BRIEF_STATES = ['not_run', 'insufficient_sources', 'draft', 'human_reviewed'] as const;
export type BriefState = (typeof BRIEF_STATES)[number];

/** How a brief was produced. 'ai_draft_unreviewed' never unlocks more than low confidence. */
export const BRIEF_BASES = [
  'manual',
  'assembled_from_sources',
  'ai_draft_unreviewed',
  'fixture',
] as const;
export type BriefBasis = (typeof BRIEF_BASES)[number];

/** How a fair probability estimate was produced. Never inferred from market price. */
export const ESTIMATE_BASES = [
  'human_entered',
  'human_reviewed',
  'ai_suggested_unreviewed',
  'fixture',
] as const;
export type EstimateBasis = (typeof ESTIMATE_BASES)[number];

/** Lifecycle status of a thesis. Archived rows remain as an audit trail. */
export const THESIS_STATUSES = ['draft', 'ready_for_risk', 'archived'] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

/** Confidence level attached to briefs and probability estimates. */
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Result of a store write: ok with the persisted record, or rejected with at
 * least one error message. Store functions validate and reject; they do not
 * throw for validation failures.
 */
export type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** Raw market_sources row exactly as stored in SQLite (snake_case columns). */
export interface MarketSourceRow {
  id: string;
  market_ticker: string;
  market_id: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  publisher: string | null;
  excerpt: string | null;
  notes: string | null;
  credibility: SourceCredibility;
  status: SourceStatus;
  added_by: SourceAddedBy;
  created_at: string;
  updated_at: string;
}

/** market_sources record in API/application shape (camelCase). */
export interface MarketSourceRecord {
  id: string;
  marketTicker: string;
  marketId: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  publisher: string | null;
  excerpt: string | null;
  notes: string | null;
  credibility: SourceCredibility;
  status: SourceStatus;
  addedBy: SourceAddedBy;
  createdAt: string;
  updatedAt: string;
}

/** Raw research_briefs row exactly as stored in SQLite (snake_case columns). */
export interface ResearchBriefRow {
  id: string;
  market_ticker: string;
  state: BriefState;
  summary: string | null;
  yes_case: string | null;
  no_case: string | null;
  key_evidence: string | null;
  uncertainties: string | null;
  missing_info: string | null;
  confidence: Confidence;
  source_count: number;
  basis: BriefBasis;
  created_at: string;
  updated_at: string;
}

/** research_briefs record in API/application shape (camelCase). */
export interface ResearchBriefRecord {
  id: string;
  marketTicker: string;
  state: BriefState;
  summary: string | null;
  yesCase: string | null;
  noCase: string | null;
  keyEvidence: string | null;
  uncertainties: string | null;
  missingInfo: string | null;
  confidence: Confidence;
  /** Server-computed count of currently accepted sources; never trusted from the client. */
  sourceCount: number;
  basis: BriefBasis;
  createdAt: string;
  updatedAt: string;
}

/** Raw probability_estimates row exactly as stored in SQLite (snake_case columns). */
export interface ProbabilityEstimateRow {
  id: string;
  market_ticker: string;
  low: number;
  mid: number;
  high: number;
  rationale: string;
  basis: EstimateBasis;
  confidence: Confidence;
  source_count: number;
  brief_id: string | null;
  created_at: string;
  updated_at: string;
}

/** probability_estimates record in API/application shape (camelCase). */
export interface ProbabilityEstimateRecord {
  id: string;
  marketTicker: string;
  /** Fraction in [0, 1]; low <= mid <= high (see units convention above). */
  low: number;
  /** Fraction in [0, 1]; low <= mid <= high (see units convention above). */
  mid: number;
  /** Fraction in [0, 1]; low <= mid <= high (see units convention above). */
  high: number;
  rationale: string;
  basis: EstimateBasis;
  confidence: Confidence;
  /** Server-computed count of currently accepted sources; never trusted from the client. */
  sourceCount: number;
  briefId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Raw theses row exactly as stored in SQLite (snake_case columns). */
export interface ThesisRow {
  id: string;
  market_ticker: string;
  status: ThesisStatus;
  thesis: string;
  why_mispriced: string | null;
  invalidation_criteria: string | null;
  probability_estimate_id: string | null;
  source_ids_json: string | null;
  created_at: string;
  updated_at: string;
}

/** theses record in API/application shape (camelCase). */
export interface ThesisRecord {
  id: string;
  marketTicker: string;
  status: ThesisStatus;
  thesis: string;
  whyMispriced: string | null;
  invalidationCriteria: string | null;
  probabilityEstimateId: string | null;
  /** JSON string array of linked market_sources ids, stored verbatim. */
  sourceIdsJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What kind of resolution authority a settlement-source record points at.
 * Phase 4: research sources never satisfy the settlement-source risk check;
 * only a human-verified record here does, via pure dossier composition.
 */
export const SETTLEMENT_AUTHORITY_TYPES = [
  'kalshi_rules',
  'official_government_source',
  'official_organization_source',
  'exchange_resolution_source',
  'other',
] as const;
export type SettlementAuthorityType = (typeof SETTLEMENT_AUTHORITY_TYPES)[number];

/**
 * Verification status of a settlement-source record. Named distinctly from
 * lib/understanding's SettlementSourceStatus, which describes the market
 * payload, not this local record. Only 'human_verified' ever counts.
 */
export const SETTLEMENT_VERIFICATION_STATUSES = ['draft', 'human_verified', 'rejected'] as const;
export type SettlementVerificationStatus = (typeof SETTLEMENT_VERIFICATION_STATUSES)[number];

/** Raw market_settlement_sources row exactly as stored in SQLite (snake_case columns). */
export interface SettlementSourceRow {
  id: string;
  market_ticker: string;
  market_id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  authority_type: SettlementAuthorityType | null;
  status: SettlementVerificationStatus;
  notes: string | null;
  verification_rationale: string | null;
  created_at: string;
  updated_at: string;
}

/** market_settlement_sources record in API/application shape (camelCase). */
export interface SettlementSourceRecord {
  id: string;
  marketTicker: string;
  marketId: string;
  title: string;
  url: string | null;
  publisher: string | null;
  /** Required (non-null) when status is 'human_verified'; may be null for drafts. */
  authorityType: SettlementAuthorityType | null;
  status: SettlementVerificationStatus;
  notes: string | null;
  verificationRationale: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Compact view of the active human-verified settlement record: the latest
 * row whose current status is 'human_verified'. Drafts and rejected rows
 * never count. Null whenever no verified record exists.
 */
export interface VerifiedSettlementSummary {
  id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  authorityType: SettlementAuthorityType;
  updatedAt: string;
}

/** Allowed sides for a paper decision entry. V1 records YES-side studies only. */
export const PAPER_ENTRY_SIDES = ['YES'] as const;
export type PaperEntrySide = (typeof PAPER_ENTRY_SIDES)[number];

/** Lifecycle status of a paper decision entry. Archived rows remain as an audit trail. */
export const PAPER_ENTRY_STATUSES = ['logged', 'archived'] as const;
export type PaperEntryStatus = (typeof PAPER_ENTRY_STATUSES)[number];

/**
 * The only verdict a paper decision entry may record. The deterministic risk
 * engine alone issues verdicts; this union re-states its PAPER_TRADE gate as
 * defense in depth at the persistence boundary.
 */
export const PAPER_ENTRY_RISK_VERDICTS = ['PAPER_TRADE'] as const;
export type PaperEntryRiskVerdict = (typeof PAPER_ENTRY_RISK_VERDICTS)[number];

/** Raw paper_decision_entries row exactly as stored in SQLite (snake_case columns). */
export interface PaperDecisionEntryRow {
  id: string;
  market_ticker: string;
  market_id: string;
  market_title: string;
  platform: string;
  side: PaperEntrySide;
  paper_price: number;
  implied_probability: number;
  fair_low: number;
  fair_mid: number;
  fair_high: number;
  expected_edge: number;
  confidence: Confidence;
  thesis_id: string;
  thesis_snapshot: string;
  probability_estimate_id: string | null;
  research_source_ids_json: string | null;
  research_sources_snapshot_json: string | null;
  settlement_source_id: string;
  settlement_source_snapshot_json: string;
  risk_verdict: PaperEntryRiskVerdict;
  risk_checklist_json: string;
  risk_reasons_json: string | null;
  market_snapshot_json: string | null;
  status: PaperEntryStatus;
  created_at: string;
  updated_at: string;
}

/**
 * paper_decision_entries record in API/application shape (camelCase).
 * A simulated decision snapshot only: no stake, no contract count, no PnL,
 * no lifecycle, no settlement outcome.
 */
export interface PaperDecisionEntryRecord {
  id: string;
  marketTicker: string;
  marketId: string;
  marketTitle: string;
  platform: string;
  side: PaperEntrySide;
  /** Fraction in [0, 1] (see units convention above); cents only at display time. */
  paperPrice: number;
  /** Fraction in [0, 1] (see units convention above). */
  impliedProbability: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairLow: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairMid: number;
  /** Fraction in [0, 1]; fairLow <= fairMid <= fairHigh. */
  fairHigh: number;
  /** Fraction difference in [-1, 1]; displayed in cents (edge x 100). */
  expectedEdge: number;
  confidence: Confidence;
  thesisId: string;
  thesisSnapshot: string;
  probabilityEstimateId: string | null;
  researchSourceIdsJson: string | null;
  researchSourcesSnapshotJson: string | null;
  settlementSourceId: string;
  settlementSourceSnapshotJson: string;
  riskVerdict: PaperEntryRiskVerdict;
  riskChecklistJson: string;
  riskReasonsJson: string | null;
  marketSnapshotJson: string | null;
  status: PaperEntryStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-ticker research summary. Server-recomputed against current rows on
 * every read (a thesis marked ready can decay if a linked source is later
 * rejected), so these flags are never stale snapshots.
 */
export interface ResearchSummary {
  acceptedSourceCount: number;
  hasHumanReviewedBrief: boolean;
  hasFairProbability: boolean;
  hasReadyThesis: boolean;
  researchConfidence: Confidence;
  /**
   * Active human-verified settlement record, or null. Research sources never
   * verify settlement; only this record can satisfy the settlement risk check.
   */
  verifiedSettlementSource: VerifiedSettlementSummary | null;
}

/**
 * Bulk response for GET /api/research: per-ticker summaries only — never
 * full source lists or brief bodies. Only tickers with rows appear.
 */
export type ResearchSummaryMap = Record<string, ResearchSummary>;

/**
 * Response for GET /api/research/[ticker]: full records for one market plus
 * the recomputed summary.
 */
export interface ResearchStateResponse {
  ticker: string;
  sources: MarketSourceRecord[];
  brief: ResearchBriefRecord | null;
  probabilityEstimate: ProbabilityEstimateRecord | null;
  thesis: ThesisRecord | null;
  settlementSources: SettlementSourceRecord[];
  summary: ResearchSummary;
}
