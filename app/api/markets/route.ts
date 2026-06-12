/**
 * GET /api/markets — read-only market scan endpoint.
 *
 * Thin wrapper around loadCurrentMarkets (see ./loadMarkets), which calls the
 * read-only Kalshi connector (public market data, no credentials), applies
 * the factual junk filter, and falls back to clearly-labeled fixture
 * snapshots on any fetch/parse failure.
 */

import { NextResponse } from 'next/server';

import type { MarketsResult } from '@/lib/markets/types';

import { loadCurrentMarkets } from './loadMarkets';

export const dynamic = 'force-dynamic';

/**
 * Returns the current market scan as a MarketsResult.
 *
 * @returns Live data when the public API call succeeds; otherwise the
 *   fixture fallback with source 'fixture' and the real failure message.
 */
export async function GET(): Promise<NextResponse<MarketsResult>> {
  return NextResponse.json(await loadCurrentMarkets());
}
