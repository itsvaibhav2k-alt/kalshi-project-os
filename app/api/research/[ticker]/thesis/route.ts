import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { createThesis } from '@/lib/research-store/theses';
import type { ThesisRecord } from '@/lib/research-store/types';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '../../route-helpers';
import { validateThesisPayload } from './payload';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/**
 * POST /api/research/[ticker]/thesis — create a written thesis.
 *
 * Status defaults to draft. Creating a thesis directly as ready_for_risk
 * requires the server-side readiness checks to pass against current rows
 * (linked accepted sources and a matching probability estimate), otherwise
 * nothing is written. A written thesis is a paper-trade prerequisite; it
 * never approves real trades.
 *
 * @param request - Incoming request with the thesis payload.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted thesis, or 400 with field errors.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ thesis: ThesisRecord } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (!isRecord(parsed.body)) {
    return errorResponse(400, 'Invalid thesis payload', ['payload must be an object']);
  }

  const { errors, fields } = validateThesisPayload(parsed.body, true);
  if (errors.length > 0 || fields.thesis === undefined) {
    return errorResponse(400, 'Invalid thesis payload', errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const result = createThesis(
      db,
      ticker,
      {
        status: fields.status,
        thesis: fields.thesis,
        whyMispriced: fields.whyMispriced,
        invalidationCriteria: fields.invalidationCriteria,
        probabilityEstimateId: fields.probabilityEstimateId,
        sourceIds: fields.sourceIds,
      },
      nowIso,
    );
    if (!result.ok) {
      return errorResponse(400, 'Thesis does not meet the readiness checks', result.errors);
    }
    return NextResponse.json({ thesis: result.value }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/thesis failed:', error);
    return errorResponse(500, 'Failed to save the thesis');
  }
}
