import { NextResponse } from 'next/server';

import { loadCurrentMarkets } from '@/app/api/markets/loadMarkets';
import {
  errorResponse,
  isRecord,
  optionalText,
  readJsonBody,
  rejectInvalidTicker,
  type ResearchApiError,
} from '@/app/api/research/route-helpers';
import { getAiResearchProvider } from '@/lib/ai-research/provider';
import { buildMarketDossierWithResearch } from '@/lib/dossier/buildMarketDossier';
import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { createAiDraft, listAiDrafts } from '@/lib/research-store/aiDrafts';
import { getDatabase } from '@/lib/research-store/db';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import { getResearchState } from '@/lib/research-store/summary';
import type {
  AiResearchDraftRecord,
  AiResearchDraftType,
  ResearchStateResponse,
} from '@/lib/research-store/types';
import { validateAiDraftRequest } from '@/lib/research-store/validation';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

/**
 * Builds the compact input-snapshot JSON stored with a draft: derived scalar
 * fields only. It never includes raw market payloads, environment values, or
 * anything secret-shaped — just enough provenance so a human can later see
 * what state the draft was generated from.
 */
function buildInputSnapshotJson(
  ticker: string,
  market: NormalizedMarket,
  state: ResearchStateResponse,
  dossier: MarketDossier,
  userFocus: string | null,
): string {
  return JSON.stringify({
    ticker,
    marketId: market.id,
    title: market.title,
    verdict: dossier.riskEvaluation.verdict,
    riskReasons: dossier.riskEvaluation.reasons,
    acceptedSourceCount: state.summary.acceptedSourceCount,
    hasHumanReviewedBrief: state.summary.hasHumanReviewedBrief,
    hasFairProbability: state.summary.hasFairProbability,
    hasReadyThesis: state.summary.hasReadyThesis,
    hasVerifiedSettlement: state.summary.verifiedSettlementSource !== null,
    resolutionClarity: dossier.understanding.resolutionClarity,
    settlementSourceStatus: dossier.understanding.settlementSourceStatus,
    impliedProbability: dossier.probabilityEstimate.marketImpliedProbability,
    yesAskCents: market.yesAskCents,
    userFocus,
  });
}

/**
 * GET /api/research/[ticker]/ai-drafts — advisory AI drafts for one market.
 *
 * Drafts are reading material for human review and sit entirely outside the
 * deterministic risk path. Archived drafts stay listed as an audit trail;
 * results are sorted newest first.
 *
 * @param _request - Incoming request (unused).
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 200 with the drafts, or 400 for a bad ticker.
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<{ aiDrafts: AiResearchDraftRecord[] } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  try {
    const nowIso = new Date().toISOString();
    const db = getDatabase(nowIso);
    return NextResponse.json({ aiDrafts: listAiDrafts(db, ticker) });
  } catch (error: unknown) {
    console.error('GET /api/research/[ticker]/ai-drafts failed:', error);
    return errorResponse(500, 'Failed to load AI research drafts');
  }
}

/**
 * POST /api/research/[ticker]/ai-drafts — generate one advisory AI draft.
 *
 * The handler re-loads the current market scan, re-reads the persisted
 * research state, and re-composes the dossier purely as read-only inputs for
 * the draft provider. It writes ONLY to the ai_research_drafts ledger: it
 * never touches sources, briefs, probability estimates, theses, settlement
 * records, or paper entries, and never alters the dossier or its verdict.
 * The generated draft is advisory text for human review — it satisfies no
 * risk check and approves nothing.
 *
 * @param request - Incoming request with { draftType, userFocus? }.
 * @param context - Route context; params resolve to the ticker segment.
 * @returns 201 with the persisted draft, 400 for bad input, 404 when the
 *          ticker is not in the current scan.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<{ aiDraft: AiResearchDraftRecord } | ResearchApiError>> {
  const { ticker } = await context.params;
  const invalid = rejectInvalidTicker(ticker);
  if (invalid !== null) {
    return invalid;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const validation = validateAiDraftRequest(parsed.body);
  if (!validation.ok || !isRecord(parsed.body)) {
    return errorResponse(400, 'Invalid AI draft request', validation.errors);
  }
  const draftType = parsed.body.draftType as AiResearchDraftType;
  const userFocus = optionalText(parsed.body.userFocus);

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

    const generated = await getAiResearchProvider().generateDraft({
      draftType,
      market,
      dossier,
      researchState: state,
      userFocus,
      nowIso,
    });

    const result = createAiDraft(
      db,
      ticker,
      {
        marketId: market.id,
        draftType,
        provider: generated.provider,
        model: generated.model,
        promptVersion: generated.promptVersion,
        inputSnapshotJson: buildInputSnapshotJson(ticker, market, state, dossier, userFocus),
        outputMarkdown: generated.outputMarkdown,
        outputJson: generated.outputJson,
        userFocus,
      },
      nowIso,
    );
    if (!result.ok) {
      return errorResponse(400, 'Invalid AI draft request', result.errors);
    }
    return NextResponse.json({ aiDraft: result.value }, { status: 201 });
  } catch (error: unknown) {
    console.error('POST /api/research/[ticker]/ai-drafts failed:', error);
    return errorResponse(500, 'Failed to generate the AI research draft');
  }
}
