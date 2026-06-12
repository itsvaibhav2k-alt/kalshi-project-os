import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { getSourcesByIds, updateSource } from '@/lib/research-store/sources';
import type { UpdateSourcePatch } from '@/lib/research-store/sources';
import type { MarketSourceRecord } from '@/lib/research-store/types';
import { SOURCE_CREDIBILITIES, SOURCE_STATUSES } from '@/lib/research-store/types';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '../../../route-helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string; sourceId: string }>;
}

function validatePatch(body: Record<string, unknown>): { errors: string[]; patch: UpdateSourcePatch } {
  const errors: string[] = [];
  const patch: UpdateSourcePatch = {};

  if (body.status !== undefined) {
    if (typeof body.status === 'string' && (SOURCE_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as UpdateSourcePatch['status'];
    } else {
      errors.push(`status must be one of: ${SOURCE_STATUSES.join(', ')}`);
    }
  }
  if (body.credibility !== undefined) {
    if (
      typeof body.credibility === 'string' &&
      (SOURCE_CREDIBILITIES as readonly string[]).includes(body.credibility)
    ) {
      patch.credibility = body.credibility as UpdateSourcePatch['credibility'];
    } else {
      errors.push(`credibility must be one of: ${SOURCE_CREDIBILITIES.join(', ')}`);
    }
  }
  for (const field of ['notes', 'excerpt'] as const) {
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
 * PATCH /api/research/[ticker]/sources/[sourceId] — review a source.
 *
 * Only status, credibility, notes, and excerpt are mutable. The source must
 * belong to the ticker in the path; anything else is treated as not found.
 *
 * @param request - Incoming request with the patch payload.
 * @param context - Route context; params resolve to ticker and sourceId.
 * @returns 200 with the updated source, 400 on invalid input, 404 when the
 *          source does not exist under this market.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ source: MarketSourceRecord } | ResearchApiError>> {
  const { ticker, sourceId } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (!isRecord(parsed.body)) {
    return errorResponse(400, 'Invalid source patch', ['payload must be an object']);
  }

  const { errors, patch } = validatePatch(parsed.body);
  if (errors.length > 0) {
    return errorResponse(400, 'Invalid source patch', errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);

    const existing = getSourcesByIds(db, [sourceId]);
    if (existing.length === 0 || existing[0].marketTicker !== ticker) {
      return errorResponse(404, 'Source not found for this market');
    }

    const source = updateSource(db, sourceId, patch, nowIso);
    if (source === null) {
      return errorResponse(404, 'Source not found for this market');
    }
    return NextResponse.json({ source });
  } catch (error: unknown) {
    console.error('PATCH /api/research/[ticker]/sources/[sourceId] failed:', error);
    return errorResponse(500, 'Failed to update the source');
  }
}
