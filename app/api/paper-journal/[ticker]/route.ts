import { NextResponse } from 'next/server';

import type { PaperJournalListResponse } from '@/app/api/paper-journal/route';
import {
  errorResponse,
  rejectInvalidTicker,
  type ResearchApiError,
} from '@/app/api/research/route-helpers';
import { getDatabase } from '@/lib/research-store/db';
import { listPaperEntries } from '@/lib/research-store/paperJournal';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/**
 * GET /api/paper-journal/[ticker] — paper decision entries for one market.
 *
 * Read-only journal of simulated decision snapshots for the ticker. Archived
 * rows stay listed as an audit trail.
 *
 * @param _request - Incoming request (unused).
 * @param context - Route context; params resolve to the ticker segment.
 * @returns The market's paper entries, or 400 for a bad ticker.
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<PaperJournalListResponse | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    return NextResponse.json({ paperEntries: listPaperEntries(db, ticker) });
  } catch (error: unknown) {
    console.error('GET /api/paper-journal/[ticker] failed:', error);
    return errorResponse(500, 'Failed to load paper journal entries');
  }
}
