import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { getThesisById, updateThesis } from '@/lib/research-store/theses';
import type { ThesisRecord } from '@/lib/research-store/types';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '../../../route-helpers';
import { validateThesisPayload } from '../payload';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string; thesisId: string }>;
}

/**
 * PATCH /api/research/[ticker]/thesis/[thesisId] — edit, mark ready, or
 * archive a thesis.
 *
 * The thesis must belong to the ticker in the path; anything else is treated
 * as not found. Any transition into ready_for_risk must pass the server-side
 * readiness checks against CURRENT rows (linked accepted sources and a
 * matching probability estimate) or nothing is written. Archived theses
 * remain as an audit trail; there is no delete.
 *
 * @param request - Incoming request with the patch payload.
 * @param context - Route context; params resolve to ticker and thesisId.
 * @returns 200 with the updated thesis, 400 on invalid input or failed
 *          readiness checks, 404 when the thesis is not under this market.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ thesis: ThesisRecord } | ResearchApiError>> {
  const { ticker, thesisId } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (!isRecord(parsed.body)) {
    return errorResponse(400, 'Invalid thesis patch', ['payload must be an object']);
  }

  const { errors, fields } = validateThesisPayload(parsed.body, false);
  if (errors.length > 0) {
    return errorResponse(400, 'Invalid thesis patch', errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);

    const existing = getThesisById(db, thesisId);
    if (existing === null || existing.marketTicker !== ticker) {
      return errorResponse(404, 'Thesis not found for this market');
    }

    const result = updateThesis(db, thesisId, fields, nowIso);
    if (result === null) {
      return errorResponse(404, 'Thesis not found for this market');
    }
    if (!result.ok) {
      return errorResponse(400, 'Thesis does not meet the readiness checks', result.errors);
    }
    return NextResponse.json({ thesis: result.value });
  } catch (error: unknown) {
    console.error('PATCH /api/research/[ticker]/thesis/[thesisId] failed:', error);
    return errorResponse(500, 'Failed to update the thesis');
  }
}
