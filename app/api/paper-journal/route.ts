import { NextResponse } from 'next/server';

import { errorResponse, type ResearchApiError } from '@/app/api/research/route-helpers';
import { getDatabase } from '@/lib/research-store/db';
import { listAllPaperEntries } from '@/lib/research-store/paperJournal';
import type { PaperDecisionEntryRecord } from '@/lib/research-store/types';

export const dynamic = 'force-dynamic';

/** Response body for paper-journal list routes. */
export interface PaperJournalListResponse {
  paperEntries: PaperDecisionEntryRecord[];
}

/**
 * GET /api/paper-journal — every paper decision entry across all markets.
 *
 * Read-only journal of simulated decision snapshots. Entries carry no stake,
 * no PnL, and no lifecycle; archived rows stay listed as an audit trail.
 *
 * @returns The full paper journal, earliest entry first.
 */
export async function GET(): Promise<NextResponse<PaperJournalListResponse | ResearchApiError>> {
  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    return NextResponse.json({ paperEntries: listAllPaperEntries(db) });
  } catch (error: unknown) {
    console.error('GET /api/paper-journal failed:', error);
    return errorResponse(500, 'Failed to load paper journal entries');
  }
}
