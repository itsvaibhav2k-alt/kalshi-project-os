import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/research-store/db';
import { createSource } from '@/lib/research-store/sources';
import type {
  MarketSourceRecord,
  SourceAddedBy,
  SourceCredibility,
  SourceKind,
  SourceStatus,
} from '@/lib/research-store/types';
import { validateSourcePayload } from '@/lib/research-store/validation';

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
 * POST /api/research/[ticker]/sources — add a research source record.
 *
 * Server-side defaults: status 'draft', addedBy 'human'. The market id is
 * always derived from the ticker, never trusted from the client. Sources are
 * research input only; only later acceptance makes them count.
 *
 * @param request - Incoming request with the source payload.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted source, or 400 with field errors.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ source: MarketSourceRecord } | ResearchApiError>> {
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
    ? { ...parsed.body, status: parsed.body.status ?? 'draft', addedBy: parsed.body.addedBy ?? 'human' }
    : parsed.body;
  const validation = validateSourcePayload(payload);
  if (!validation.ok || !isRecord(payload)) {
    return errorResponse(400, 'Invalid source payload', validation.errors);
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const source = createSource(
      db,
      ticker,
      {
        marketId: `kalshi:${ticker}`,
        kind: payload.kind as SourceKind,
        title: (payload.title as string).trim(),
        url: optionalText(payload.url),
        publisher: optionalText(payload.publisher),
        excerpt: optionalText(payload.excerpt),
        notes: optionalText(payload.notes),
        credibility: payload.credibility as SourceCredibility,
        status: payload.status as SourceStatus,
        addedBy: payload.addedBy as SourceAddedBy,
      },
      nowIso,
    );
    return NextResponse.json({ source }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/sources failed:', error);
    return errorResponse(500, 'Failed to save the source');
  }
}
