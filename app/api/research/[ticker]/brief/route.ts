import { NextResponse } from 'next/server';

import { saveBrief } from '@/lib/research-store/briefs';
import { getDatabase } from '@/lib/research-store/db';
import { countAcceptedSources } from '@/lib/research-store/sources';
import type { BriefBasis, BriefState, Confidence, ResearchBriefRecord } from '@/lib/research-store/types';
import { validateBriefPayload } from '@/lib/research-store/validation';

import {
  errorResponse,
  isRecord,
  optionalText,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '../../route-helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/**
 * POST /api/research/[ticker]/brief — save a manual research brief.
 *
 * Briefs are human-typed research notes — never labeled AI research. Every
 * save inserts a new row (audit trail). The payload is validated against the
 * server-computed accepted-source count: zero accepted sources caps
 * confidence at low and coerces the state to insufficient_sources, and
 * human_reviewed requires at least one accepted source.
 *
 * @param request - Incoming request with the brief payload.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted brief, or 400 with field errors.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ brief: ResearchBriefRecord } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const acceptedSourceCount = countAcceptedSources(db, ticker);

    const validation = validateBriefPayload(parsed.body, acceptedSourceCount);
    if (!validation.ok || !isRecord(parsed.body)) {
      return errorResponse(400, 'Invalid brief payload', validation.errors);
    }
    const body = parsed.body;

    const brief = saveBrief(
      db,
      ticker,
      {
        state: body.state as BriefState,
        summary: optionalText(body.summary),
        yesCase: optionalText(body.yesCase),
        noCase: optionalText(body.noCase),
        keyEvidence: optionalText(body.keyEvidence),
        uncertainties: optionalText(body.uncertainties),
        missingInfo: optionalText(body.missingInfo),
        confidence: body.confidence as Confidence,
        basis: body.basis as BriefBasis,
      },
      nowIso,
    );
    return NextResponse.json({ brief }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/brief failed:', error);
    return errorResponse(500, 'Failed to save the brief');
  }
}
