import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import {
  createSettlementSource,
  getActiveVerifiedSettlementSource,
  listSettlementSources,
} from '@/lib/research-store/settlementSources';
import type {
  SettlementAuthorityType,
  SettlementSourceRecord,
  SettlementVerificationStatus,
  VerifiedSettlementSummary,
} from '@/lib/research-store/types';
import { validateSettlementSourceInput } from '@/lib/research-store/validation';

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

/** Response body for GET: every record plus the active verified one (or null). */
interface SettlementSourceListResponse {
  settlementSources: SettlementSourceRecord[];
  verifiedSettlementSource: VerifiedSettlementSummary | null;
}

/**
 * GET /api/research/[ticker]/settlement-source — settlement-source records
 * for one market.
 *
 * Returns the full audit trail plus the active verified record: the latest
 * row whose current status is 'human_verified' (drafts and rejected rows
 * never count). Research sources never appear here; settlement verification
 * is a separate human record.
 *
 * @param _request - Incoming request (unused).
 * @param context - Route context; params resolve to the ticker segment.
 * @returns The records and active verified summary, or 400 for a bad ticker.
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<SettlementSourceListResponse | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    return NextResponse.json({
      settlementSources: listSettlementSources(db, ticker),
      verifiedSettlementSource: getActiveVerifiedSettlementSource(db, ticker),
    });
  } catch (error: unknown) {
    console.error('GET /api/research/[ticker]/settlement-source failed:', error);
    return errorResponse(500, 'Failed to load settlement-source records');
  }
}

/**
 * POST /api/research/[ticker]/settlement-source — add a settlement-source
 * record.
 *
 * Server-side default: status 'draft'. Creating directly as 'human_verified'
 * requires a valid http(s) url, a valid authorityType, and a non-empty
 * verificationRationale. The market id is always derived from the ticker,
 * never trusted from the client. The record is plain data for the
 * deterministic risk engine; it never approves anything by itself.
 *
 * @param request - Incoming request with the record payload.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted record, or 400 with field errors.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ settlementSource: SettlementSourceRecord } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const payload = isRecord(parsed.body)
    ? { ...parsed.body, status: parsed.body.status ?? 'draft' }
    : parsed.body;
  const validation = validateSettlementSourceInput(payload);
  if (!validation.ok || !isRecord(payload)) {
    return errorResponse(400, 'Invalid settlement-source payload', validation.errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const result = createSettlementSource(
      db,
      ticker,
      {
        marketId: `kalshi:${ticker}`,
        title: (payload.title as string).trim(),
        url: optionalText(payload.url),
        publisher: optionalText(payload.publisher),
        authorityType: (payload.authorityType ?? null) as SettlementAuthorityType | null,
        status: payload.status as SettlementVerificationStatus,
        notes: optionalText(payload.notes),
        verificationRationale: optionalText(payload.verificationRationale),
      },
      nowIso,
    );
    if (!result.ok) {
      return errorResponse(400, 'Invalid settlement-source payload', result.errors);
    }
    return NextResponse.json({ settlementSource: result.value }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/settlement-source failed:', error);
    return errorResponse(500, 'Failed to save the settlement-source record');
  }
}
