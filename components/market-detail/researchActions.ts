/**
 * Shared payload and callback types for the Phase 3 research dossier editors.
 *
 * Type-only module: the panels collect human-typed research input and hand it
 * to callbacks implemented in `app/page.tsx`, which performs the actual
 * `/api/research/**` and `/api/paper-journal/**` fetches. Research, thesis,
 * settlement-verification, and paper-only decision-journal records are the
 * ONLY mutations in V1 — nothing here touches trading, and nothing here
 * carries verdict authority. Probabilities cross this boundary as fractions in
 * [0, 1]; the forms convert from percent before calling back.
 */

import type {
  Confidence,
  SettlementAuthorityType,
  SettlementVerificationStatus,
  SourceCredibility,
  SourceKind,
  SourceStatus,
} from '@/lib/research-store/types';

/**
 * Result of one research mutation: null on success, or a plain-English
 * error message for calm inline display next to the form that sent it.
 */
export type MutationOutcome = string | null;

/** Human-entered fields for a new source record (status defaults server-side). */
export interface AddSourcePayload {
  kind: SourceKind;
  title: string;
  url: string;
  publisher: string;
  excerpt: string;
  notes: string;
  credibility: SourceCredibility;
}

/** Review patch for an existing source (the only mutable review fields). */
export interface SourceReviewPatch {
  status?: SourceStatus;
  credibility?: SourceCredibility;
}

/** Human-typed manual brief fields. Never labeled AI research. */
export interface BriefFormPayload {
  /** Requested state; the server coerces when accepted sources are missing. */
  state: 'draft' | 'human_reviewed';
  summary: string;
  yesCase: string;
  noCase: string;
  keyEvidence: string;
  uncertainties: string;
  missingInfo: string;
  confidence: Confidence;
}

/** Human-entered fair range. Values are FRACTIONS in [0, 1], already converted. */
export interface FairRangeFormPayload {
  low: number;
  mid: number;
  high: number;
  rationale: string;
  confidence: Confidence;
}

/** Human-written thesis fields. A thesis never approves real trades. */
export interface ThesisFormPayload {
  /** 'draft' saves; 'ready_for_risk' asks the server-side readiness gate. */
  status: 'draft' | 'ready_for_risk';
  thesis: string;
  whyMispriced: string;
  invalidationCriteria: string;
}

/**
 * Human-entered fields for a settlement-source record. Research sources never
 * verify settlement; only a record verified by a human can satisfy the
 * deterministic settlement-source risk check, and even then the risk engine
 * alone issues verdicts. 'human_verified' triggers the strict server checks.
 */
export interface SettlementSourcePayload {
  status: SettlementVerificationStatus;
  title: string;
  url: string;
  publisher: string;
  authorityType: SettlementAuthorityType | null;
  notes: string;
  verificationRationale: string;
}

/** Review patch for an existing settlement-source record (all mutable fields). */
export interface SettlementSourcePatch {
  status?: SettlementVerificationStatus;
  title?: string;
  url?: string | null;
  publisher?: string | null;
  authorityType?: SettlementAuthorityType | null;
  notes?: string | null;
  verificationRationale?: string | null;
}

/** Mutation callbacks the page supplies to the detail panels. */
export interface ResearchActions {
  addSource: (payload: AddSourcePayload) => Promise<MutationOutcome>;
  updateSource: (sourceId: string, patch: SourceReviewPatch) => Promise<MutationOutcome>;
  saveBrief: (payload: BriefFormPayload) => Promise<MutationOutcome>;
  saveFairRange: (payload: FairRangeFormPayload) => Promise<MutationOutcome>;
  /** Creates when `thesisId` is null; otherwise patches the existing thesis. */
  saveThesis: (payload: ThesisFormPayload, thesisId: string | null) => Promise<MutationOutcome>;
  /** Adds a new settlement-source record (POST). */
  saveSettlementSource: (payload: SettlementSourcePayload) => Promise<MutationOutcome>;
  /** Reviews/edits one settlement-source record (PATCH). */
  updateSettlementSource: (
    settlementSourceId: string,
    patch: SettlementSourcePatch,
  ) => Promise<MutationOutcome>;
}

/**
 * Paper-journal mutation callbacks the page supplies to the journal panel.
 * Entries are simulated decision records only: the server re-validates the
 * deterministic PAPER_TRADE verdict before writing anything, no real money is
 * involved, and archived rows persist as an audit trail (no deletes).
 */
export interface PaperJournalActions {
  /** Logs one paper decision for the selected market (POST; server-gated). */
  logPaperDecision: () => Promise<MutationOutcome>;
  /** Archives one journal entry (PATCH; the only permitted entry change). */
  archiveEntry: (entryId: string) => Promise<MutationOutcome>;
}
