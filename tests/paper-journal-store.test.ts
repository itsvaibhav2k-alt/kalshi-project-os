import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import { buildMarketDossierWithResearch } from '@/lib/dossier/buildMarketDossier';
import type {
  PersistedResearchSnapshot,
  PersistedSettlementVerificationSnapshot,
} from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { evaluatePaperEligibility } from '@/lib/paper/eligibility';
import { openDatabase } from '@/lib/research-store/db';
import {
  archivePaperEntry,
  createPaperEntry,
  getPaperEntryById,
  listAllPaperEntries,
  listPaperEntries,
} from '@/lib/research-store/paperJournal';
import type { CreatePaperEntryInput } from '@/lib/research-store/paperJournal';
import type { PaperEntryRiskVerdict, StoreResult } from '@/lib/research-store/types';

const NOW_ISO = '2026-06-12T12:00:00.000Z';
const LATER_ISO = '2026-06-12T13:00:00.000Z';
const TICKER = 'PAPER-TEST';
const OTHER_TICKER = 'PAPER-OTHER';

let dataDir: string;
let db: Database.Database;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-paper-store-test-'));
  db = openDatabase(dataDir, NOW_ISO);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function unwrap<T>(result: StoreResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got errors: ${result.errors.join('; ')}`);
  }
  return result.value;
}

/** Builds a complete, valid paper-entry input for the synthetic test market. */
function makeEntryInput(overrides: Partial<CreatePaperEntryInput> = {}): CreatePaperEntryInput {
  return {
    marketId: `kalshi:${TICKER}`,
    marketTitle: 'Synthetic paper test market resolving on an official report',
    platform: 'kalshi',
    side: 'YES',
    paperPrice: 0.21,
    impliedProbability: 0.2,
    fairLow: 0.27,
    fairMid: 0.3,
    fairHigh: 0.34,
    expectedEdge: 0.1,
    confidence: 'medium',
    thesisId: 'thesis-1',
    thesisSnapshot: 'The market underprices the officially reported trend.',
    probabilityEstimateId: 'est-1',
    researchSourceIdsJson: '["src-1"]',
    researchSourcesSnapshotJson: '[{"id":"src-1","title":"Official agency release page"}]',
    settlementSourceId: 'settle-1',
    settlementSourceSnapshotJson: '{"id":"settle-1","status":"human_verified"}',
    riskVerdict: 'PAPER_TRADE',
    riskChecklistJson: '[{"id":"paper_only_mode","status":"pass"}]',
    riskReasonsJson: '[]',
    marketSnapshotJson: '{"raw":null}',
    ...overrides,
  };
}

describe('paperJournal store', () => {
  describe('createPaperEntry', () => {
    it('should persist a logged YES entry when the input is a valid PAPER_TRADE snapshot', () => {
      const record = unwrap(createPaperEntry(db, TICKER, makeEntryInput(), NOW_ISO));

      expect(record.marketTicker).toBe(TICKER);
      expect(record.marketId).toBe(`kalshi:${TICKER}`);
      expect(record.side).toBe('YES');
      expect(record.riskVerdict).toBe('PAPER_TRADE');
      expect(record.status).toBe('logged');
      expect(record.paperPrice).toBeCloseTo(0.21, 10);
      expect(record.impliedProbability).toBeCloseTo(0.2, 10);
      expect(record.fairMid).toBeCloseTo(0.3, 10);
      expect(record.expectedEdge).toBeCloseTo(0.1, 10);
      expect(record.thesisId).toBe('thesis-1');
      expect(record.settlementSourceId).toBe('settle-1');
      expect(record.createdAt).toBe(NOW_ISO);
      expect(record.updatedAt).toBe(NOW_ISO);

      const listed = listPaperEntries(db, TICKER);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toEqual(record);
    });

    it.each(['SKIP', 'WATCH'] as const)(
      'should reject and persist nothing when riskVerdict is %s',
      (verdict) => {
        const result = createPaperEntry(
          db,
          TICKER,
          makeEntryInput({ riskVerdict: verdict as unknown as PaperEntryRiskVerdict }),
          NOW_ISO,
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.join(' ')).toContain('riskVerdict');
        }
        expect(listPaperEntries(db, TICKER)).toEqual([]);
      },
    );

    it('should reject any side other than YES', () => {
      const result = createPaperEntry(
        db,
        TICKER,
        makeEntryInput({ side: 'NO' as unknown as CreatePaperEntryInput['side'] }),
        NOW_ISO,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('side');
      }
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject an empty thesisSnapshot', () => {
      const result = createPaperEntry(db, TICKER, makeEntryInput({ thesisSnapshot: '  ' }), NOW_ISO);

      expect(result.ok).toBe(false);
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject an empty settlementSourceSnapshotJson', () => {
      const result = createPaperEntry(
        db,
        TICKER,
        makeEntryInput({ settlementSourceSnapshotJson: '' }),
        NOW_ISO,
      );

      expect(result.ok).toBe(false);
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject an empty riskChecklistJson', () => {
      const result = createPaperEntry(db, TICKER, makeEntryInput({ riskChecklistJson: '' }), NOW_ISO);

      expect(result.ok).toBe(false);
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject an empty thesisId', () => {
      const result = createPaperEntry(db, TICKER, makeEntryInput({ thesisId: '' }), NOW_ISO);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('thesisId');
      }
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject an empty settlementSourceId', () => {
      const result = createPaperEntry(db, TICKER, makeEntryInput({ settlementSourceId: '' }), NOW_ISO);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('settlementSourceId');
      }
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should accept a paperPrice exactly at the 1.0 boundary', () => {
      const record = unwrap(
        createPaperEntry(
          db,
          TICKER,
          makeEntryInput({ paperPrice: 1, fairLow: 1, fairMid: 1, fairHigh: 1 }),
          NOW_ISO,
        ),
      );

      expect(record.paperPrice).toBe(1);
    });

    it('should reject a paperPrice above 1', () => {
      const result = createPaperEntry(db, TICKER, makeEntryInput({ paperPrice: 1.01 }), NOW_ISO);

      expect(result.ok).toBe(false);
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });

    it('should reject a fair range that violates fairLow <= fairMid <= fairHigh', () => {
      const result = createPaperEntry(
        db,
        TICKER,
        makeEntryInput({ fairLow: 0.4, fairMid: 0.3, fairHigh: 0.5 }),
        NOW_ISO,
      );

      expect(result.ok).toBe(false);
      expect(listPaperEntries(db, TICKER)).toEqual([]);
    });
  });

  describe('listPaperEntries / listAllPaperEntries', () => {
    it('should return the empty list for a ticker with no entries', () => {
      expect(listPaperEntries(db, TICKER)).toEqual([]);
      expect(listAllPaperEntries(db)).toEqual([]);
    });

    it('should scope per-ticker lists while listing everything globally', () => {
      const first = unwrap(createPaperEntry(db, TICKER, makeEntryInput(), NOW_ISO));
      const second = unwrap(
        createPaperEntry(
          db,
          OTHER_TICKER,
          makeEntryInput({ marketId: `kalshi:${OTHER_TICKER}` }),
          LATER_ISO,
        ),
      );

      expect(listPaperEntries(db, TICKER)).toEqual([first]);
      expect(listPaperEntries(db, OTHER_TICKER)).toEqual([second]);
      expect(listAllPaperEntries(db)).toHaveLength(2);
    });
  });

  describe('archivePaperEntry', () => {
    it('should archive a logged entry and keep the row as an audit trail', () => {
      const record = unwrap(createPaperEntry(db, TICKER, makeEntryInput(), NOW_ISO));

      const result = archivePaperEntry(db, record.id, LATER_ISO);
      expect(result).not.toBeNull();
      const archived = unwrap(result as StoreResult<typeof record>);

      expect(archived.status).toBe('archived');
      expect(archived.updatedAt).toBe(LATER_ISO);
      expect(archived.createdAt).toBe(NOW_ISO);

      const listed = listPaperEntries(db, TICKER);
      expect(listed).toHaveLength(1);
      expect(listed[0].status).toBe('archived');
      expect(listAllPaperEntries(db)).toHaveLength(1);
      expect(getPaperEntryById(db, record.id)?.status).toBe('archived');
    });

    it('should return null for an unknown entry id', () => {
      expect(archivePaperEntry(db, 'no-such-entry', LATER_ISO)).toBeNull();
    });

    it('should reject archiving an entry that is already archived', () => {
      const record = unwrap(createPaperEntry(db, TICKER, makeEntryInput(), NOW_ISO));
      unwrap(archivePaperEntry(db, record.id, LATER_ISO) as StoreResult<typeof record>);

      const again = archivePaperEntry(db, record.id, LATER_ISO);

      expect(again).not.toBeNull();
      expect((again as StoreResult<typeof record>).ok).toBe(false);
      expect(getPaperEntryById(db, record.id)?.status).toBe('archived');
    });
  });

  describe('schema guarantees', () => {
    it('should have no PnL, stake, contract-count, outcome, or lifecycle columns', () => {
      const columns = (
        db.prepare('PRAGMA table_info(paper_decision_entries)').all() as Array<{ name: string }>
      ).map((column) => column.name);

      expect(columns).toHaveLength(27);
      for (const name of columns) {
        expect(name).not.toMatch(/pnl|profit|loss|return|stake|size|quantity|contracts|outcome|result|settled|realized|open|closed/i);
      }
      expect(columns).toEqual(
        expect.arrayContaining([
          'id',
          'market_ticker',
          'side',
          'paper_price',
          'risk_verdict',
          'thesis_snapshot',
          'settlement_source_snapshot_json',
          'status',
        ]),
      );
    });
  });
});

/**
 * Synthetic, liquidity-clean market mirroring the settlement-overlay tests:
 * implied probability 0.24, 2-cent spread, clear resolution clarity, and a
 * settlement text that derives 'unverified' from the payload alone.
 */
function makeMarket(overrides: Partial<NormalizedMarket> = {}): NormalizedMarket {
  return {
    id: `kalshi:${TICKER}`,
    platformId: 'kalshi',
    externalId: TICKER,
    eventTicker: 'SYNTH',
    title: 'Synthetic paper market resolving on an official report',
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
    ...overrides,
  };
}

/** Human-verified settlement verification snapshot for the overlay. */
function makeVerification(): PersistedSettlementVerificationSnapshot {
  return {
    id: 'settle-1',
    title: 'Official statistics agency release calendar',
    url: 'https://example.gov/releases',
    publisher: 'Example Agency',
    authorityType: 'official_government_source',
    status: 'human_verified',
    updatedAt: '2026-06-11T00:00:00Z',
  };
}

/** Research snapshot whose composed dossier reaches PAPER_TRADE. */
function makeReadySnapshot(
  overrides: Partial<PersistedResearchSnapshot> = {},
): PersistedResearchSnapshot {
  return {
    acceptedSourceCount: 2,
    briefState: 'human_reviewed',
    confidence: 'medium',
    fairLow: 0.27,
    fairMid: 0.3,
    fairHigh: 0.34,
    hasReadyThesis: true,
    settlementVerification: makeVerification(),
    ...overrides,
  };
}

describe('evaluatePaperEligibility', () => {
  it('should be eligible only for a PAPER_TRADE dossier with a current YES ask', () => {
    const dossier = buildMarketDossierWithResearch(makeMarket(), makeReadySnapshot(), NOW_ISO);
    expect(dossier.riskEvaluation.verdict).toBe('PAPER_TRADE');

    const eligibility = evaluatePaperEligibility(dossier);

    expect(eligibility).toEqual({ eligible: true, verdict: 'PAPER_TRADE', blockers: [] });
  });

  it('should be ineligible with the risk reasons as blockers when the verdict is SKIP', () => {
    const snapshot = makeReadySnapshot({ settlementVerification: null });
    const dossier = buildMarketDossierWithResearch(makeMarket(), snapshot, NOW_ISO);
    expect(dossier.riskEvaluation.verdict).toBe('SKIP');

    const eligibility = evaluatePaperEligibility(dossier);

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.verdict).toBe('SKIP');
    expect(eligibility.blockers).toEqual(dossier.riskEvaluation.reasons);
    expect(eligibility.blockers.length).toBeGreaterThan(0);
  });

  it('should be ineligible with an explicit blocker when the YES ask is missing', () => {
    const dossier = buildMarketDossierWithResearch(makeMarket(), makeReadySnapshot(), NOW_ISO);
    const withoutAsk = {
      ...dossier,
      market: { ...dossier.market, yesAskCents: null },
    };

    const eligibility = evaluatePaperEligibility(withoutAsk);

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockers.some((blocker) => /yes ask/i.test(blocker))).toBe(true);
  });

  it('should never mutate the dossier it evaluates', () => {
    const dossier = buildMarketDossierWithResearch(makeMarket(), makeReadySnapshot(), NOW_ISO);
    const frozen = JSON.parse(JSON.stringify(dossier)) as unknown;

    evaluatePaperEligibility(dossier);

    expect(dossier).toEqual(frozen);
  });
});
