import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { getResearchState } from '@/lib/research-store/summary';
import type { ResearchStateResponse } from '@/lib/research-store/types';

import { errorResponse, rejectInvalidTicker, type ResearchApiError } from '../route-helpers';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/**
 * GET /api/research/[ticker] — full research state for one market.
 *
 * Returns every source record, the latest brief and probability estimate,
 * the active thesis, and a summary recomputed against current rows (stored
 * ready flags are never trusted at read time).
 *
 * @param _request - Incoming request (unused).
 * @param context - Route context; params resolve to the ticker segment.
 * @returns The research state, or a 400 error for an invalid ticker.
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<ResearchStateResponse | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    return NextResponse.json(getResearchState(db, ticker));
  } catch (error: unknown) {
    console.error('GET /api/research/[ticker] failed:', error);
    return errorResponse(500, 'Failed to load research state');
  }
}
