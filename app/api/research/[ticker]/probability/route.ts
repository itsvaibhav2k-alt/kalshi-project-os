import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { saveEstimate } from '@/lib/research-store/probabilityEstimates';
import { countAcceptedSources } from '@/lib/research-store/sources';
import type { Confidence, EstimateBasis, ProbabilityEstimateRecord } from '@/lib/research-store/types';
import { CONFIDENCE_LEVELS } from '@/lib/research-store/types';
import { validateFairRange } from '@/lib/research-store/validation';

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
 * POST /api/research/[ticker]/probability — save a fair probability range.
 *
 * Values are fractions in [0, 1] with low <= mid <= high (the UI converts
 * percent to fractions before posting). A rationale is required; a
 * non-fixture basis requires at least one currently accepted source, checked
 * server-side. A fair probability is never inferred from the market price
 * and never decides a verdict — the deterministic risk engine alone does.
 *
 * @param request - Incoming request with the estimate payload.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted estimate, or 400 with field errors.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ probabilityEstimate: ProbabilityEstimateRecord } | ResearchApiError>> {
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

    const validation = validateFairRange(parsed.body, acceptedSourceCount);
    const errors = [...validation.errors];
    const body = isRecord(parsed.body) ? parsed.body : {};
    if (
      typeof body.confidence !== 'string' ||
      !(CONFIDENCE_LEVELS as readonly string[]).includes(body.confidence)
    ) {
      errors.push(`confidence must be one of: ${CONFIDENCE_LEVELS.join(', ')}`);
    }
    if (errors.length > 0) {
      return errorResponse(400, 'Invalid fair probability payload', errors);
    }

    const result = saveEstimate(
      db,
      ticker,
      {
        low: body.low as number,
        mid: body.mid as number,
        high: body.high as number,
        rationale: (body.rationale as string).trim(),
        basis: body.basis as EstimateBasis,
        confidence: body.confidence as Confidence,
        briefId: optionalText(body.briefId),
      },
      nowIso,
    );
    if (!result.ok) {
      return errorResponse(400, 'Invalid fair probability payload', result.errors);
    }
    return NextResponse.json({ probabilityEstimate: result.value }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/probability failed:', error);
    return errorResponse(500, 'Failed to save the fair probability');
  }
}
