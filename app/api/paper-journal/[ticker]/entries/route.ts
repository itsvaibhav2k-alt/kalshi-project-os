import { NextResponse } from 'next/server';

import { loadCurrentMarkets } from '@/app/api/markets/loadMarkets';
import {
  errorResponse,
  isRecord,
  rejectInvalidTicker,
  type ResearchApiError,
} from '@/app/api/research/route-helpers';
import { buildMarketDossierWithResearch } from '@/lib/dossier/buildMarketDossier';
import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { evaluatePaperEligibility } from '@/lib/paper/eligibility';
import { getDatabase } from '@/lib/research-store/db';
import { createPaperEntry } from '@/lib/research-store/paperJournal';
import type { CreatePaperEntryInput } from '@/lib/research-store/paperJournal';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import { getResearchState } from '@/lib/research-store/summary';
import type {
  PaperDecisionEntryRecord,
  ResearchStateResponse,
} from '@/lib/research-store/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/** The 409 message whenever the deterministic verdict is not PAPER_TRADE. */
const LOCKED_MESSAGE =
  'Paper decision logging is locked until the deterministic verdict is PAPER_TRADE.';

/** Result of reading the optional request body ({ side?: 'YES' } only). */
type SideResult =
  | { ok: true }
  | { ok: false; response: NextResponse<ResearchApiError> };

/**
 * Reads the optional POST body. An empty body is allowed and defaults the
 * side to YES; any present body must be a JSON object whose only meaningful
 * field is side: 'YES'.
 */
async function readOptionalSide(request: Request): Promise<SideResult> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: errorResponse(400, 'Request body must be valid JSON') };
  }
  if (text.trim() === '') {
    return { ok: true };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: errorResponse(400, 'Request body must be valid JSON') };
  }
  if (!isRecord(body)) {
    return {
      ok: false,
      response: errorResponse(400, 'Invalid paper entry payload', ['payload must be an object']),
    };
  }
  const side = body.side ?? 'YES';
  if (side !== 'YES') {
    return {
      ok: false,
      response: errorResponse(400, 'Invalid paper entry payload', ["side must be 'YES'"]),
    };
  }
  return { ok: true };
}

/**
 * Assembles the full snapshot input from the server-composed dossier and
 * research state. Returns null when any required piece is missing — the
 * caller treats that as still locked (default-SKIP posture).
 */
function buildEntryInput(
  market: NormalizedMarket,
  state: ResearchStateResponse,
  dossier: MarketDossier,
): CreatePaperEntryInput | null {
  const estimate = dossier.probabilityEstimate;
  const thesis = state.thesis;
  const verified = state.summary.verifiedSettlementSource;
  if (
    market.yesAskCents === null ||
    thesis === null ||
    verified === null ||
    estimate.marketImpliedProbability === null ||
    estimate.fairProbabilityLow === null ||
    estimate.fairProbabilityMid === null ||
    estimate.fairProbabilityHigh === null ||
    estimate.expectedEdge === null
  ) {
    return null;
  }

  const acceptedSources = state.sources.filter((record) => record.status === 'accepted');
  const settlementRecord =
    state.settlementSources.find((record) => record.id === verified.id) ?? verified;

  return {
    marketId: market.id,
    marketTitle: market.title,
    platform: market.platformId,
    side: 'YES',
    paperPrice: market.yesAskCents / 100,
    impliedProbability: estimate.marketImpliedProbability,
    fairLow: estimate.fairProbabilityLow,
    fairMid: estimate.fairProbabilityMid,
    fairHigh: estimate.fairProbabilityHigh,
    expectedEdge: estimate.expectedEdge,
    confidence: estimate.confidence,
    thesisId: thesis.id,
    thesisSnapshot: thesis.thesis,
    probabilityEstimateId: state.probabilityEstimate?.id ?? null,
    researchSourceIdsJson: JSON.stringify(acceptedSources.map((record) => record.id)),
    researchSourcesSnapshotJson: JSON.stringify(acceptedSources),
    settlementSourceId: verified.id,
    settlementSourceSnapshotJson: JSON.stringify(settlementRecord),
    riskVerdict: 'PAPER_TRADE',
    riskChecklistJson: JSON.stringify(dossier.riskEvaluation.checks),
    riskReasonsJson: JSON.stringify(dossier.riskEvaluation.reasons),
    marketSnapshotJson: JSON.stringify({ ...market, raw: null }),
  };
}

/**
 * POST /api/paper-journal/[ticker]/entries — log one paper decision entry.
 *
 * Server-side eligibility, never client-trusted: the handler re-loads the
 * current market scan, re-reads the persisted research state, re-composes the
 * dossier, and re-runs the deterministic risk engine. Anything other than a
 * PAPER_TRADE verdict is 409 — the route records eligibility, it never grants
 * it. The paper price is always the current YES ask as a fraction; when no
 * YES ask exists the request is refused, never priced from the last trade.
 * Entries are simulated decision snapshots only.
 *
 * @param request - Incoming request; body is optional ({ side?: 'YES' }).
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted entry, 400 for bad input, 404 when the
 *          ticker is not in the current scan, 409 when logging is locked.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ paperEntry: PaperDecisionEntryRecord } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const sideResult = await readOptionalSide(request);
  if (!sideResult.ok) {
    return sideResult.response;
  }

  try {
    const marketsResult = await loadCurrentMarkets();
    const market = marketsResult.markets.find((candidate) => candidate.externalId === ticker);
    if (market === undefined) {
      return errorResponse(404, 'Market not found in the current scan');
    }

    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    const state = getResearchState(db, ticker);
    const dossier = buildMarketDossierWithResearch(
      market,
      toPersistedResearchSnapshot(state),
      nowIso,
    );

    if (dossier.riskEvaluation.verdict !== 'PAPER_TRADE') {
      return errorResponse(409, LOCKED_MESSAGE, dossier.riskEvaluation.reasons);
    }

    const eligibility = evaluatePaperEligibility(dossier);
    if (!eligibility.eligible) {
      // Verdict is PAPER_TRADE here, so the blocker is the missing YES ask.
      return errorResponse(
        409,
        'A current YES ask price is required for a paper decision entry.',
        eligibility.blockers,
      );
    }

    const input = buildEntryInput(market, state, dossier);
    if (input === null) {
      return errorResponse(409, LOCKED_MESSAGE, dossier.riskEvaluation.reasons);
    }

    const result = createPaperEntry(db, ticker, input, nowIso);
    if (!result.ok) {
      return errorResponse(400, 'Invalid paper entry payload', result.errors);
    }
    return NextResponse.json({ paperEntry: result.value }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/paper-journal/[ticker]/entries failed:', error);
    return errorResponse(500, 'Failed to log the paper decision entry');
  }
}
