import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import {
  getSettlementSourceById,
  updateSettlementSource,
} from '@/lib/research-store/settlementSources';
import type { UpdateSettlementSourcePatch } from '@/lib/research-store/settlementSources';
import type { SettlementSourceRecord } from '@/lib/research-store/types';
import {
  SETTLEMENT_AUTHORITY_TYPES,
  SETTLEMENT_VERIFICATION_STATUSES,
} from '@/lib/research-store/types';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '../../../route-helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string; settlementSourceId: string }>;
}

function validatePatch(body: Record<string, unknown>): {
  errors: string[];
  patch: UpdateSettlementSourcePatch;
} {
  const errors: string[] = [];
  const patch: UpdateSettlementSourcePatch = {};

  if (body.status !== undefined) {
    if (
      typeof body.status === 'string' &&
      (SETTLEMENT_VERIFICATION_STATUSES as readonly string[]).includes(body.status)
    ) {
      patch.status = body.status as UpdateSettlementSourcePatch['status'];
    } else {
      errors.push(`status must be one of: ${SETTLEMENT_VERIFICATION_STATUSES.join(', ')}`);
    }
  }
  if (body.title !== undefined) {
    if (typeof body.title === 'string' && body.title.trim() !== '') {
      patch.title = body.title.trim();
    } else {
      errors.push('title must be a non-empty string when present');
    }
  }
  if (body.authorityType !== undefined) {
    if (
      body.authorityType === null ||
      (typeof body.authorityType === 'string' &&
        (SETTLEMENT_AUTHORITY_TYPES as readonly string[]).includes(body.authorityType))
    ) {
      patch.authorityType = body.authorityType as UpdateSettlementSourcePatch['authorityType'];
    } else {
      errors.push(`authorityType must be null or one of: ${SETTLEMENT_AUTHORITY_TYPES.join(', ')}`);
    }
  }
  for (const field of ['url', 'publisher', 'notes', 'verificationRationale'] as const) {
    const value = body[field];
    if (value !== undefined) {
      if (typeof value === 'string' || value === null) {
        patch[field] = value;
      } else {
        errors.push(`${field} must be a string or null when present`);
      }
    }
  }

  return { errors, patch };
}

/**
 * PATCH /api/research/[ticker]/settlement-source/[settlementSourceId] —
 * review a settlement-source record.
 *
 * Title, url, publisher, authorityType, status, notes, and
 * verificationRationale are mutable. Any transition into 'human_verified'
 * must pass the strict server-side checks (valid http(s) url, valid
 * authorityType, non-empty verificationRationale) or nothing is written.
 * Rejecting is always allowed and keeps the row as an audit trail; there is
 * no delete. The record must belong to the ticker in the path; anything else
 * is treated as not found.
 *
 * @param request - Incoming request with the patch payload.
 * @param context - Route context; params resolve to ticker and settlementSourceId.
 * @returns 200 with the updated record, 400 on invalid input or failed
 *          verification checks, 404 when the record is not under this market.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ settlementSource: SettlementSourceRecord } | ResearchApiError>> {
  const { ticker, settlementSourceId } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (!isRecord(parsed.body)) {
    return errorResponse(400, 'Invalid settlement-source patch', ['payload must be an object']);
  }

  const { errors, patch } = validatePatch(parsed.body);
  if (errors.length > 0) {
    return errorResponse(400, 'Invalid settlement-source patch', errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);

    const existing = getSettlementSourceById(db, settlementSourceId);
    if (existing === null || existing.marketTicker !== ticker) {
      return errorResponse(404, 'Settlement-source record not found for this market');
    }

    const result = updateSettlementSource(db, settlementSourceId, patch, nowIso);
    if (result === null) {
      return errorResponse(404, 'Settlement-source record not found for this market');
    }
    if (!result.ok) {
      return errorResponse(
        400,
        'Settlement-source record does not meet the verification checks',
        result.errors,
      );
    }
    return NextResponse.json({ settlementSource: result.value });
  } catch (error: unknown) {
    console.error(
      'PATCH /api/research/[ticker]/settlement-source/[settlementSourceId] failed:',
      error,
    );
    return errorResponse(500, 'Failed to update the settlement-source record');
  }
}
