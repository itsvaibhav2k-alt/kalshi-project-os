import {
  BRIEF_BASES,
  BRIEF_STATES,
  CONFIDENCE_LEVELS,
  ESTIMATE_BASES,
  SOURCE_ADDED_BY,
  SOURCE_CREDIBILITIES,
  SOURCE_KINDS,
  SOURCE_STATUSES,
} from './types';
import type {
  BriefState,
  MarketSourceRecord,
  ProbabilityEstimateRecord,
  ThesisRecord,
} from './types';

/**
 * Pure validators for the Phase 3 research store.
 *
 * Every function is data-in/data-out: no database access, no clock, no
 * environment reads. Validation failures return errors; they never throw.
 * These validators gate write-time mutations AND are re-applied at read time
 * (a thesis marked ready can decay when a linked source is later rejected).
 */

/** Result of a validation: ok with no errors, or not ok with at least one. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Maximum accepted ticker length. */
export const TICKER_MAX_LENGTH = 64;

/** Allowed ticker characters (case-insensitive). */
const TICKER_PATTERN = /^[A-Z0-9._-]+$/i;

function toResult(errors: string[]): ValidationResult {
  return { ok: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * Validates a market ticker: non-empty, at most 64 characters, and matching
 * /^[A-Z0-9._-]+$/i.
 *
 * @param ticker - Candidate ticker string.
 * @returns Validation result with field-level error messages.
 */
export function validateTicker(ticker: string): ValidationResult {
  const errors: string[] = [];
  if (ticker.length === 0) {
    errors.push('ticker must be non-empty');
  } else {
    if (ticker.length > TICKER_MAX_LENGTH) {
      errors.push(`ticker must be at most ${TICKER_MAX_LENGTH} characters`);
    }
    if (!TICKER_PATTERN.test(ticker)) {
      errors.push('ticker may only contain letters, digits, ".", "_", and "-"');
    }
  }
  return toResult(errors);
}

/**
 * Validates a source create/update payload.
 *
 * Rules: title required and non-empty after trim; kind, credibility, status,
 * and addedBy must be in their unions; url is optional, but when present as a
 * non-empty string it must parse as an http(s) URL (an empty or
 * whitespace-only url is treated as absent).
 *
 * @param payload - Untrusted request body.
 * @returns Validation result with field-level error messages.
 */
export function validateSourcePayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return toResult(['payload must be an object']);
  }

  const errors: string[] = [];

  if (!isNonEmptyString(payload.title)) {
    errors.push('title is required and must be non-empty');
  }
  if (!isOneOf(payload.kind, SOURCE_KINDS)) {
    errors.push(`kind must be one of: ${SOURCE_KINDS.join(', ')}`);
  }
  if (!isOneOf(payload.credibility, SOURCE_CREDIBILITIES)) {
    errors.push(`credibility must be one of: ${SOURCE_CREDIBILITIES.join(', ')}`);
  }
  if (!isOneOf(payload.status, SOURCE_STATUSES)) {
    errors.push(`status must be one of: ${SOURCE_STATUSES.join(', ')}`);
  }
  if (!isOneOf(payload.addedBy, SOURCE_ADDED_BY)) {
    errors.push(`addedBy must be one of: ${SOURCE_ADDED_BY.join(', ')}`);
  }

  const url = payload.url;
  if (url !== undefined && url !== null) {
    if (typeof url !== 'string') {
      errors.push('url must be a string when present');
    } else if (url.trim() !== '' && !isHttpUrl(url)) {
      errors.push('url must be a valid http(s) URL when present');
    }
  }

  return toResult(errors);
}

/**
 * Validates a brief create payload against the current accepted-source count.
 *
 * Rules: state, confidence, and basis must be in their unions; zero accepted
 * sources forces confidence 'low'; state 'human_reviewed' requires at least
 * one accepted source; basis 'ai_draft_unreviewed' caps confidence at 'low'.
 * State coercion for zero accepted sources is handled by deriveBriefState.
 *
 * @param payload - Untrusted request body.
 * @param acceptedSourceCount - Server-computed count of currently accepted sources.
 * @returns Validation result with field-level error messages.
 */
export function validateBriefPayload(
  payload: unknown,
  acceptedSourceCount: number,
): ValidationResult {
  if (!isRecord(payload)) {
    return toResult(['payload must be an object']);
  }

  const errors: string[] = [];

  if (!isOneOf(payload.state, BRIEF_STATES)) {
    errors.push(`state must be one of: ${BRIEF_STATES.join(', ')}`);
  }
  if (!isOneOf(payload.confidence, CONFIDENCE_LEVELS)) {
    errors.push(`confidence must be one of: ${CONFIDENCE_LEVELS.join(', ')}`);
  }
  if (!isOneOf(payload.basis, BRIEF_BASES)) {
    errors.push(`basis must be one of: ${BRIEF_BASES.join(', ')}`);
  }

  if (acceptedSourceCount < 1 && payload.state === 'human_reviewed') {
    errors.push('state human_reviewed requires at least 1 accepted source');
  }
  if (acceptedSourceCount < 1 && isOneOf(payload.confidence, CONFIDENCE_LEVELS)) {
    if (payload.confidence !== 'low') {
      errors.push('confidence must be low when there are 0 accepted sources');
    }
  }
  if (payload.basis === 'ai_draft_unreviewed' && isOneOf(payload.confidence, CONFIDENCE_LEVELS)) {
    if (payload.confidence !== 'low') {
      errors.push('basis ai_draft_unreviewed caps confidence at low');
    }
  }

  return toResult(errors);
}

/**
 * Derives the effective brief state from the requested state and the current
 * accepted-source count.
 *
 * With zero accepted sources, 'not_run' stays 'not_run' and every other
 * requested state is forced to 'insufficient_sources'. With at least one
 * accepted source the requested state is kept unchanged.
 *
 * @param requestedState - State requested by the caller.
 * @param acceptedSourceCount - Server-computed count of currently accepted sources.
 * @returns The effective brief state to persist.
 */
export function deriveBriefState(
  requestedState: BriefState,
  acceptedSourceCount: number,
): BriefState {
  if (acceptedSourceCount < 1 && requestedState !== 'not_run') {
    return 'insufficient_sources';
  }
  return requestedState;
}

/**
 * Validates a fair probability range payload.
 *
 * Rules: low/mid/high must be finite numbers with 0 <= low <= mid <= high <= 1
 * (fractions, never percent — see the units convention in types.ts); rationale
 * is required and non-empty; basis must be in its union; any non-fixture basis
 * requires at least one accepted source. A fair probability is never inferred
 * from the market price.
 *
 * @param payload - Untrusted request body.
 * @param acceptedSourceCount - Server-computed count of currently accepted sources.
 * @returns Validation result with field-level error messages.
 */
export function validateFairRange(
  payload: unknown,
  acceptedSourceCount: number,
): ValidationResult {
  if (!isRecord(payload)) {
    return toResult(['payload must be an object']);
  }

  const errors: string[] = [];

  const bounds: Array<['low' | 'mid' | 'high', unknown]> = [
    ['low', payload.low],
    ['mid', payload.mid],
    ['high', payload.high],
  ];
  let allNumeric = true;
  for (const [name, value] of bounds) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${name} must be a finite number`);
      allNumeric = false;
    } else if (value < 0 || value > 1) {
      errors.push(`${name} must be a fraction between 0 and 1 inclusive`);
    }
  }
  if (allNumeric) {
    const low = payload.low as number;
    const mid = payload.mid as number;
    const high = payload.high as number;
    if (!(low <= mid && mid <= high)) {
      errors.push('range must satisfy low <= mid <= high');
    }
  }

  if (!isNonEmptyString(payload.rationale)) {
    errors.push('rationale is required and must be non-empty');
  }
  if (!isOneOf(payload.basis, ESTIMATE_BASES)) {
    errors.push(`basis must be one of: ${ESTIMATE_BASES.join(', ')}`);
  } else if (payload.basis !== 'fixture' && acceptedSourceCount <= 0) {
    errors.push('a non-fixture fair range requires at least 1 accepted source');
  }

  return toResult(errors);
}

function parseLinkedSourceIds(sourceIdsJson: string | null): string[] | null {
  if (sourceIdsJson === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceIdsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
    return null;
  }
  return parsed;
}

/**
 * Validates that a thesis qualifies as ready_for_risk against CURRENT rows.
 *
 * Rules: thesis text non-empty after trim; at least one linked source id, and
 * every linked id must exist, belong to the same ticker, and be currently
 * 'accepted' (strict — a single decayed link invalidates readiness, matching
 * the default-SKIP posture); the linked probability estimate must exist, match
 * the thesis link id, and belong to the same ticker.
 *
 * Enforced at write time (POST/PATCH to ready_for_risk) AND at read time
 * (summary recomputation), so a ready thesis decays when its links do.
 *
 * @param thesis - Thesis record being checked for readiness.
 * @param sources - Current source records for the same market.
 * @param probabilityEstimate - The estimate linked by the thesis, or null.
 * @returns Validation result with field-level error messages.
 */
export function validateThesisReady(
  thesis: ThesisRecord,
  sources: readonly MarketSourceRecord[],
  probabilityEstimate: ProbabilityEstimateRecord | null,
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(thesis.thesis)) {
    errors.push('thesis text is required and must be non-empty');
  }

  const linkedIds = parseLinkedSourceIds(thesis.sourceIdsJson);
  if (linkedIds === null) {
    errors.push('linked source ids must be a JSON string array');
  } else if (linkedIds.length === 0) {
    errors.push('at least 1 linked source is required');
  } else {
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    for (const id of linkedIds) {
      const source = sourcesById.get(id);
      if (source === undefined) {
        errors.push(`linked source ${id} does not exist`);
      } else if (source.marketTicker !== thesis.marketTicker) {
        errors.push(`linked source ${id} belongs to a different market`);
      } else if (source.status !== 'accepted') {
        errors.push(`linked source ${id} is not currently accepted`);
      }
    }
  }

  if (thesis.probabilityEstimateId === null) {
    errors.push('a linked probability estimate is required');
  } else if (probabilityEstimate === null) {
    errors.push('the linked probability estimate does not exist');
  } else if (probabilityEstimate.id !== thesis.probabilityEstimateId) {
    errors.push('the linked probability estimate id does not match');
  } else if (probabilityEstimate.marketTicker !== thesis.marketTicker) {
    errors.push('the linked probability estimate belongs to a different market');
  }

  return toResult(errors);
}
