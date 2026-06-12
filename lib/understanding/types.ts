/**
 * Contract-understanding types for Phase 2 (pipeline stage 02 Understand).
 *
 * Understanding is deterministic: derived purely from the normalized market
 * payload. No network, no LLM, no invention. Anything the platform did not
 * provide is reported as missing — never guessed.
 */

/** How clearly the contract's resolution can be determined from listed rules. */
export type ResolutionClarity = 'clear' | 'ambiguous' | 'missing';

/**
 * Status of the settlement source.
 *
 * Deterministic understanding only ever emits 'unverified' (text present) or
 * 'missing'. 'provided' is set solely by the Phase 4 dossier overlay when a
 * human_verified local settlement record exists (lib/dossier/applySettlementVerification.ts).
 */
export type SettlementSourceStatus = 'provided' | 'missing' | 'unverified';

/** A labeled date relevant to contract interpretation. */
export interface ImportantDate {
  label: string;
  /** ISO 8601 timestamp as provided by the platform. */
  value: string;
}

/**
 * Deterministic reading of one market's contract.
 *
 * Every field is derived from the normalized market only. Missing inputs
 * surface in `missingFields`; interpretive hazards surface in
 * `ambiguityFlags` and `interpretationNotes`.
 */
export interface ContractUnderstanding {
  /** Internal market id this understanding belongs to. */
  marketId: string;
  /** Market title as listed. */
  title: string;
  /** Plain-English description of what the contract asks. */
  summary: string;
  /** What must happen for YES, per the listed rules. */
  yesCondition: string;
  /** What must happen for NO, per the listed rules. */
  noCondition: string;
  /** Full rules text as listed, or null when not provided. */
  rulesText: string | null;
  /** Resolution criteria as listed, or null when not provided. */
  resolutionCriteria: string | null;
  /** Settlement source as listed, or null when not provided. */
  settlementSource: string | null;
  /** Whether a settlement source exists and can be trusted. */
  settlementSourceStatus: SettlementSourceStatus;
  /** Overall clarity of the resolution terms. */
  resolutionClarity: ResolutionClarity;
  /** Dates that matter for interpreting the contract. */
  importantDates: ImportantDate[];
  /** Specific reasons the contract wording is hazardous to interpret. */
  ambiguityFlags: string[];
  /** Names of fields the public payload did not provide. */
  missingFields: string[];
  /** Notes on why this contract is risky to interpret. */
  interpretationNotes: string[];
}
