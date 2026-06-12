import { THESIS_STATUSES } from '@/lib/research-store/types';
import type { ThesisStatus } from '@/lib/research-store/types';

/**
 * Shared payload validation for the thesis POST and PATCH routes (not a route
 * module — it exports no HTTP methods).
 *
 * Field rules: thesis must be a non-empty string (required at creation,
 * optional in a patch); status must be in the thesis status union;
 * whyMispriced and invalidationCriteria are free text or null;
 * probabilityEstimateId is a string or null; sourceIds is an array of
 * strings or null. Readiness itself (linked accepted sources, matching
 * estimate) is enforced by the store against current rows.
 */

/** Validated, typed thesis fields extracted from an untrusted body. */
export interface ThesisFields {
  status?: ThesisStatus;
  thesis?: string;
  whyMispriced?: string | null;
  invalidationCriteria?: string | null;
  probabilityEstimateId?: string | null;
  sourceIds?: readonly string[] | null;
}

/** Result of validating a thesis payload. */
export interface ThesisPayloadResult {
  errors: string[];
  fields: ThesisFields;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Validates an untrusted thesis payload into typed fields.
 *
 * @param body - Untrusted request body object.
 * @param requireThesis - When true (POST), the thesis text is mandatory.
 * @returns Field-level errors and the typed fields that passed.
 */
export function validateThesisPayload(
  body: Record<string, unknown>,
  requireThesis: boolean,
): ThesisPayloadResult {
  const errors: string[] = [];
  const fields: ThesisFields = {};

  if (body.thesis !== undefined || requireThesis) {
    if (typeof body.thesis === 'string' && body.thesis.trim() !== '') {
      fields.thesis = body.thesis;
    } else {
      errors.push('thesis text is required and must be non-empty');
    }
  }

  if (body.status !== undefined) {
    if (
      typeof body.status === 'string' &&
      (THESIS_STATUSES as readonly string[]).includes(body.status)
    ) {
      fields.status = body.status as ThesisStatus;
    } else {
      errors.push(`status must be one of: ${THESIS_STATUSES.join(', ')}`);
    }
  }

  for (const field of ['whyMispriced', 'invalidationCriteria'] as const) {
    const value = body[field];
    if (value !== undefined) {
      if (typeof value === 'string' || value === null) {
        fields[field] = value;
      } else {
        errors.push(`${field} must be a string or null when present`);
      }
    }
  }

  if (body.probabilityEstimateId !== undefined) {
    if (typeof body.probabilityEstimateId === 'string' || body.probabilityEstimateId === null) {
      fields.probabilityEstimateId = body.probabilityEstimateId;
    } else {
      errors.push('probabilityEstimateId must be a string or null when present');
    }
  }

  if (body.sourceIds !== undefined) {
    if (isStringArray(body.sourceIds) || body.sourceIds === null) {
      fields.sourceIds = body.sourceIds;
    } else {
      errors.push('sourceIds must be an array of strings or null when present');
    }
  }

  return { errors, fields };
}
