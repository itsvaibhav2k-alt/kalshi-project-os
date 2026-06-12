import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAiResearchProvider } from '@/lib/ai-research/provider';
import { buildMarketDossierWithResearch } from '@/lib/dossier/buildMarketDossier';
import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { createAiDraft, listAiDrafts } from '@/lib/research-store/aiDrafts';
import { saveBrief } from '@/lib/research-store/briefs';
import { closeAllDatabases, getDatabase } from '@/lib/research-store/db';
import { saveEstimate } from '@/lib/research-store/probabilityEstimates';
import { createSettlementSource } from '@/lib/research-store/settlementSources';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import { createSource } from '@/lib/research-store/sources';
import {
  computeResearchSummary,
  getResearchState,
  listResearchTickers,
} from '@/lib/research-store/summary';
import { createThesis } from '@/lib/research-store/theses';
import type { AiResearchDraftType } from '@/lib/research-store/types';
import { AI_RESEARCH_DRAFT_TYPES } from '@/lib/research-store/types';

const NOW_ISO = '2026-06-12T12:00:00Z';
const SKIP_TICKER = 'SYNTH-ISOLATION-SKIP';
const PAPER_TICKER = 'SYNTH-ISOLATION-PAPER';
const DRAFTS_ONLY_TICKER = 'SYNTH-ISOLATION-DRAFTS-ONLY';

/**
 * Phase 5 core safety proof: AI research drafts are advisory artifacts that
 * sit entirely outside the deterministic risk path. Creating drafts — any
 * kind, any number — must never change a verdict, a reason list, a check
 * result, the persisted research snapshot the dossier consumes, or the
 * recomputed research summary. These tests drive the REAL pipeline
 * (store rows → getResearchState → toPersistedResearchSnapshot →
 * buildMarketDossierWithResearch) before and after draft creation and assert
 * byte/deep equality.
 */

/**
 * Builds a synthetic, liquidity-clean normalized market (mirrors the
 * settlement-overlay fixture). Prices give implied probability 0.24 with a
 * 2-cent spread; the title avoids predictive phrasing so the deterministic
 * understanding derives 'clear' resolution clarity, and the listed settlement
 * text derives 'unverified' from the payload alone.
 */
function makeMarket(ticker: string): NormalizedMarket {
  return {
    id: `kalshi:${ticker}`,
    platformId: 'kalshi',
    externalId: ticker,
    eventTicker: 'SYNTH',
    title: 'Synthetic isolation market resolving on an official report',
    category: 'Economics',
    yesBidCents: 23,
    yesAskCents: 25,
    noBidCents: 75,
    noAskCents: 77,
    lastPriceCents: 24,
    spreadCents: 2,
    volume: 5000,
    volume24h: 200,
    openInterest: 500,
    liquidityDollars: 10000,
    closeTime: '2026-12-31T00:00:00Z',
    expirationTime: '2026-12-31T00:00:00Z',
    status: 'active',
    rawStatus: 'active',
    rulesText:
      'Resolves YES if the official statistics agency reports a value at or above the listed threshold.',
    resolutionCriteria: 'Official published value at or above the threshold on the report date.',
    settlementSource: 'Official statistics agency release',
    isProvisional: false,
    isMultivariate: false,
    flags: [],
    raw: null,
  };
}

/** Builds the dossier exactly as the live route/page wiring does. */
function buildDossier(db: Database.Database, market: NormalizedMarket): MarketDossier {
  const snapshot = toPersistedResearchSnapshot(getResearchState(db, market.externalId));
  return buildMarketDossierWithResearch(market, snapshot, NOW_ISO);
}

/**
 * Generates one advisory draft through the real provider and persists it via
 * the real store path, failing loudly when either step is rejected.
 */
async function createDraftViaProvider(
  db: Database.Database,
  market: NormalizedMarket,
  draftType: AiResearchDraftType,
): Promise<void> {
  const researchState = getResearchState(db, market.externalId);
  const dossier = buildMarketDossierWithResearch(
    market,
    toPersistedResearchSnapshot(researchState),
    NOW_ISO,
  );
  const generated = await getAiResearchProvider().generateDraft({
    draftType,
    market,
    dossier,
    researchState,
    userFocus: null,
    nowIso: NOW_ISO,
  });
  const created = createAiDraft(
    db,
    market.externalId,
    {
      marketId: market.id,
      draftType,
      provider: generated.provider,
      model: generated.model,
      promptVersion: generated.promptVersion,
      inputSnapshotJson: JSON.stringify({
        ticker: market.externalId,
        marketId: market.id,
        draftType,
        verdict: dossier.riskEvaluation.verdict,
      }),
      outputMarkdown: generated.outputMarkdown,
      outputJson: generated.outputJson,
      userFocus: null,
    },
    NOW_ISO,
  );
  if (!created.ok) {
    throw new Error(`expected draft create to succeed: ${created.errors.join('; ')}`);
  }
}

/**
 * Persists the complete human research loop for a ticker so the real builder
 * derives PAPER_TRADE: one accepted official source, a human-reviewed brief,
 * a fair range with sufficient edge, a ready thesis, and a human-verified
 * settlement record (mirrors the settlement-overlay seeding).
 */
function persistPaperReadyState(db: Database.Database, ticker: string): void {
  const source = createSource(
    db,
    ticker,
    {
      marketId: `kalshi:${ticker}`,
      kind: 'official_resolution_source',
      title: 'Official agency release page',
      url: 'https://example.gov/release',
      publisher: 'Example Agency',
      credibility: 'official',
      status: 'accepted',
      addedBy: 'human',
    },
    NOW_ISO,
  );
  saveBrief(
    db,
    ticker,
    {
      state: 'human_reviewed',
      summary: 'Human-reviewed brief backed by the official release page.',
      confidence: 'medium',
      basis: 'manual',
    },
    NOW_ISO,
  );
  const estimate = saveEstimate(
    db,
    ticker,
    {
      low: 0.27,
      mid: 0.3,
      high: 0.34,
      rationale: 'Official release history supports a fair value near 30 cents.',
      basis: 'human_entered',
      confidence: 'medium',
    },
    NOW_ISO,
  );
  if (!estimate.ok) {
    throw new Error(`expected estimate save to succeed: ${estimate.errors.join('; ')}`);
  }
  const thesis = createThesis(
    db,
    ticker,
    {
      status: 'ready_for_risk',
      thesis: 'The market underprices the officially reported trend.',
      whyMispriced: 'Recent official releases are not reflected in the price.',
      invalidationCriteria: 'A contrary official release before the close date.',
      probabilityEstimateId: estimate.value.id,
      sourceIds: [source.id],
    },
    NOW_ISO,
  );
  if (!thesis.ok) {
    throw new Error(`expected thesis create to succeed: ${thesis.errors.join('; ')}`);
  }
  const settlement = createSettlementSource(
    db,
    ticker,
    {
      marketId: `kalshi:${ticker}`,
      title: 'Official statistics agency release calendar',
      url: 'https://example.gov/releases',
      publisher: 'Example Agency',
      authorityType: 'official_government_source',
      status: 'human_verified',
      verificationRationale: 'URL matches the resolution authority named in the listed rules.',
    },
    NOW_ISO,
  );
  if (!settlement.ok) {
    throw new Error(`expected settlement create to succeed: ${settlement.errors.join('; ')}`);
  }
}

describe('AI draft risk isolation', () => {
  let dataDir: string;
  let db: Database.Database;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-ai-isolation-'));
    vi.stubEnv('KALSHI_DATA_DIR', dataDir);
    db = getDatabase(NOW_ISO);
  });

  afterEach(() => {
    closeAllDatabases();
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  describe('SKIP market with no research', () => {
    it('should keep the verdict SKIP with identical reasons and checks when all six draft kinds are created', async () => {
      const market = makeMarket(SKIP_TICKER);
      const before = buildDossier(db, market);
      expect(before.riskEvaluation.verdict).toBe('SKIP');

      for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
        await createDraftViaProvider(db, market, draftType);
      }
      const after = buildDossier(db, market);

      // The drafts genuinely exist — the isolation proof is not vacuous.
      expect(listAiDrafts(db, SKIP_TICKER)).toHaveLength(AI_RESEARCH_DRAFT_TYPES.length);
      expect(after.riskEvaluation.verdict).toBe('SKIP');
      expect(after.riskEvaluation.reasons).toEqual(before.riskEvaluation.reasons);
      expect(after.riskEvaluation.checks).toEqual(before.riskEvaluation.checks);
    });

    it('should keep the persisted research snapshot byte-identical when all six draft kinds are created', async () => {
      const market = makeMarket(SKIP_TICKER);
      const snapshotBefore = JSON.stringify(
        toPersistedResearchSnapshot(getResearchState(db, SKIP_TICKER)),
      );

      for (const draftType of AI_RESEARCH_DRAFT_TYPES) {
        await createDraftViaProvider(db, market, draftType);
      }
      const snapshotAfter = JSON.stringify(
        toPersistedResearchSnapshot(getResearchState(db, SKIP_TICKER)),
      );

      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });

  describe('PAPER_TRADE market with the full human loop', () => {
    it('should keep the verdict PAPER_TRADE with identical reasons when a skeptical countercase draft is created', async () => {
      persistPaperReadyState(db, PAPER_TICKER);
      const market = makeMarket(PAPER_TICKER);
      const before = buildDossier(db, market);
      expect(before.riskEvaluation.verdict).toBe('PAPER_TRADE');

      await createDraftViaProvider(db, market, 'skeptical_countercase');
      const after = buildDossier(db, market);

      expect(listAiDrafts(db, PAPER_TICKER)).toHaveLength(1);
      expect(after.riskEvaluation.verdict).toBe('PAPER_TRADE');
      expect(after.riskEvaluation.reasons).toEqual(before.riskEvaluation.reasons);
      expect(after.riskEvaluation.checks).toEqual(before.riskEvaluation.checks);
    });

    it('should keep the persisted research snapshot byte-identical when a draft is created', async () => {
      persistPaperReadyState(db, PAPER_TICKER);
      const market = makeMarket(PAPER_TICKER);
      const snapshotBefore = JSON.stringify(
        toPersistedResearchSnapshot(getResearchState(db, PAPER_TICKER)),
      );

      await createDraftViaProvider(db, market, 'skeptical_countercase');
      const snapshotAfter = JSON.stringify(
        toPersistedResearchSnapshot(getResearchState(db, PAPER_TICKER)),
      );

      expect(snapshotAfter).toBe(snapshotBefore);
    });
  });

  describe('summary invisibility for a drafts-only ticker', () => {
    it('should keep the recomputed research summary deep-equal when a ticker has only drafts', async () => {
      const market = makeMarket(DRAFTS_ONLY_TICKER);
      const summaryBefore = computeResearchSummary(db, DRAFTS_ONLY_TICKER);
      const stateSummaryBefore = getResearchState(db, DRAFTS_ONLY_TICKER).summary;

      await createDraftViaProvider(db, market, 'research_questions');

      expect(listAiDrafts(db, DRAFTS_ONLY_TICKER)).toHaveLength(1);
      expect(computeResearchSummary(db, DRAFTS_ONLY_TICKER)).toEqual(summaryBefore);
      expect(getResearchState(db, DRAFTS_ONLY_TICKER).summary).toEqual(stateSummaryBefore);
    });

    it('should omit a drafts-only ticker from listResearchTickers while listing researched tickers', async () => {
      persistPaperReadyState(db, PAPER_TICKER);
      await createDraftViaProvider(db, makeMarket(DRAFTS_ONLY_TICKER), 'missing_info');

      const tickers = listResearchTickers(db);

      expect(listAiDrafts(db, DRAFTS_ONLY_TICKER)).toHaveLength(1);
      expect(tickers).toContain(PAPER_TICKER);
      expect(tickers).not.toContain(DRAFTS_ONLY_TICKER);
    });
  });
});
