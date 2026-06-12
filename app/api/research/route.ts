import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { computeResearchSummary, listResearchTickers } from '@/lib/research-store/summary';
import type { ResearchSummaryMap } from '@/lib/research-store/types';

import { errorResponse, type ResearchApiError } from './route-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/research — bulk per-ticker research summaries.
 *
 * Returns SUMMARIES ONLY (accepted source count and recomputed boolean
 * flags) — never source lists or brief bodies, so the payload stays light as
 * the database grows. Flags are recomputed against current rows on every
 * read; only tickers with at least one research row appear.
 *
 * @returns Map of ticker to recomputed research summary.
 */
export async function GET(): Promise<NextResponse<ResearchSummaryMap | ResearchApiError>> {
  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const summaries = Object.fromEntries(
      listResearchTickers(db).map((ticker) => [ticker, computeResearchSummary(db, ticker)]),
    );
    return NextResponse.json(summaries);
  } catch (error: unknown) {
    console.error('GET /api/research failed:', error);
    return errorResponse(500, 'Failed to load research summaries');
  }
}
