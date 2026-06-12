import { NextResponse } from 'next/server';

import {
  errorResponse,
  isRecord,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '@/app/api/research/route-helpers';
import { archiveAiDraft, getAiDraftById } from '@/lib/research-store/aiDrafts';
import { getDatabase } from '@/lib/research-store/db';
import type { AiResearchDraftRecord } from '@/lib/research-store/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string; draftId: string }>;
}

/**
 * PATCH /api/research/[ticker]/ai-drafts/[draftId] — archive one AI draft.
 *
 * The only permitted payload is exactly { status: 'archived' } and the only
 * permitted transition is 'draft' -> 'archived'. There is no delete and no
 * un-archive; archived rows stay listed as an audit trail. A draft that does
 * not belong to the ticker in the path is treated as not found. Archiving is
 * pure housekeeping on advisory text — it changes nothing in the research
 * state, the dossier, or the deterministic verdict.
 *
 * @param request - Incoming request with the patch payload.
 * @param context - Route context; params resolve to ticker and draftId.
 * @returns 200 with the archived draft, 400 for any other payload or a draft
 *          that is not currently 'draft', 404 for an unknown or mismatched id.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ aiDraft: AiResearchDraftRecord } | ResearchApiError>> {
  const { ticker, draftId } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  if (
    !isRecord(parsed.body) ||
    parsed.body.status !== 'archived' ||
    Object.keys(parsed.body).some((key) => key !== 'status')
  ) {
    return errorResponse(400, 'Invalid AI draft patch', [
      "the only permitted patch is { status: 'archived' }",
    ]);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);

    const existing = getAiDraftById(db, draftId);
    if (existing === null || existing.marketTicker !== ticker) {
      return errorResponse(404, 'AI research draft not found');
    }

    const result = archiveAiDraft(db, draftId, nowIso);
    if (result === null) {
      return errorResponse(404, 'AI research draft not found');
    }
    if (!result.ok) {
      return errorResponse(400, 'AI research draft could not be archived', result.errors);
    }
    return NextResponse.json({ aiDraft: result.value });
  } catch (error: unknown) {
    console.error('PATCH /api/research/[ticker]/ai-drafts/[draftId] failed:', error);
    return errorResponse(500, 'Failed to archive the AI research draft');
  }
}
