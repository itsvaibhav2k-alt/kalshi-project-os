import { NextResponse } from 'next/server';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  type ResearchApiError,
} from '@/app/api/research/route-helpers';
import { getDatabase } from '@/lib/research-store/db';
import { archivePaperEntry, getPaperEntryById } from '@/lib/research-store/paperJournal';
import type { PaperDecisionEntryRecord } from '@/lib/research-store/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ entryId: string }>;
}

/**
 * PATCH /api/paper-journal/entries/[entryId] — archive one paper entry.
 *
 * The only permitted payload is exactly { status: 'archived' } and the only
 * permitted transition is 'logged' -> 'archived'. There is no delete and no
 * un-archive; archived rows stay listed as an audit trail.
 *
 * @param request - Incoming request with the patch payload.
 * @param context - Route context; params resolve to the entryId segment.
 * @returns 200 with the archived entry, 400 for any other payload or an
 *          entry that is not currently 'logged', 404 for an unknown id.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ paperEntry: PaperDecisionEntryRecord } | ResearchApiError>> {
  const { entryId } = await context.params;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (
    !isRecord(parsed.body) ||
    parsed.body.status !== 'archived' ||
    Object.keys(parsed.body).some((key) => key !== 'status')
  ) {
    return errorResponse(400, 'Invalid paper entry patch', [
      "the only permitted patch is { status: 'archived' }",
    ]);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);

    if (getPaperEntryById(db, entryId) === null) {
      return errorResponse(404, 'Paper journal entry not found');
    }

    const result = archivePaperEntry(db, entryId, nowIso);
    if (result === null) {
      return errorResponse(404, 'Paper journal entry not found');
    }
    if (!result.ok) {
      return errorResponse(400, 'Paper journal entry could not be archived', result.errors);
    }
    return NextResponse.json({ paperEntry: result.value });
  } catch (error: unknown) {
    console.error('PATCH /api/paper-journal/entries/[entryId] failed:', error);
    return errorResponse(500, 'Failed to archive the paper journal entry');
  }
}
