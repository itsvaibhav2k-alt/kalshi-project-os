import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';

import { saveBrief, getLatestBrief } from '@/lib/research-store/briefs';
import { openDatabase } from '@/lib/research-store/db';
import {
  getEstimateById,
  getLatestEstimate,
  saveEstimate,
} from '@/lib/research-store/probabilityEstimates';
import {
  countAcceptedSources,
  createSource,
  getSourcesByIds,
  listSources,
  updateSource,
} from '@/lib/research-store/sources';
import { createThesis, getActiveThesis, updateThesis } from '@/lib/research-store/theses';
import type {
  MarketSourceRecord,
  ProbabilityEstimateRecord,
  SourceStatus,
  StoreResult,
} from '@/lib/research-store/types';
import { validateThesisReady } from '@/lib/research-store/validation';

const NOW_ISO = '2026-06-11T12:00:00.000Z';
const LATER_ISO = '2026-06-12T12:00:00.000Z';
const TICKER = 'TEST-MARKET';
const OTHER_TICKER = 'OTHER-MARKET';

let dataDir: string;
let db: Database.Database;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-crud-test-'));
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

function seedSource(
  ticker: string,
  status: SourceStatus,
  nowIso: string = NOW_ISO,
): MarketSourceRecord {
  return createSource(
    db,
    ticker,
    {
      marketId: `kalshi:${ticker}`,
      kind: 'news',
      title: 'Example source',
      credibility: 'medium',
      status,
      addedBy: 'human',
    },
    nowIso,
  );
}

function seedEstimate(ticker: string, nowIso: string = NOW_ISO): ProbabilityEstimateRecord {
  return unwrap(
    saveEstimate(
      db,
      ticker,
      {
        low: 0.2,
        mid: 0.3,
        high: 0.4,
        rationale: 'Backed by an accepted source.',
        basis: 'human_entered',
        confidence: 'medium',
      },
      nowIso,
    ),
  );
}

describe('sources', () => {
  describe('createSource', () => {
    it('should persist a source with a generated id and injected timestamps when payload is valid', () => {
      // Arrange + Act
      const record = createSource(
        db,
        TICKER,
        {
          marketId: `kalshi:${TICKER}`,
          kind: 'official_resolution_source',
          title: 'Resolution source page',
          url: 'https://example.gov/data',
          publisher: 'Example Agency',
          excerpt: 'The relevant excerpt.',
          notes: 'Notes here.',
          credibility: 'official',
          status: 'draft',
          addedBy: 'human',
        },
        NOW_ISO,
      );

      // Assert
      expect(record.id).toBeTruthy();
      expect(record.marketTicker).toBe(TICKER);
      expect(record.marketId).toBe(`kalshi:${TICKER}`);
      expect(record.kind).toBe('official_resolution_source');
      expect(record.url).toBe('https://example.gov/data');
      expect(record.createdAt).toBe(NOW_ISO);
      expect(record.updatedAt).toBe(NOW_ISO);
      const listed = listSources(db, TICKER);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toEqual(record);
    });

    it('should store null for optional fields when they are omitted', () => {
      // Act
      const record = seedSource(TICKER, 'draft');

      // Assert
      expect(record.url).toBeNull();
      expect(record.publisher).toBeNull();
      expect(record.excerpt).toBeNull();
      expect(record.notes).toBeNull();
    });
  });

  describe('listSources', () => {
    it('should return only sources for the given ticker when multiple markets have rows', () => {
      // Arrange
      seedSource(TICKER, 'draft');
      seedSource(TICKER, 'accepted');
      seedSource(OTHER_TICKER, 'accepted');

      // Act
      const listed = listSources(db, TICKER);

      // Assert
      expect(listed).toHaveLength(2);
      for (const source of listed) {
        expect(source.marketTicker).toBe(TICKER);
      }
    });

    it('should return an empty array when the ticker has no sources', () => {
      expect(listSources(db, TICKER)).toEqual([]);
    });
  });

  describe('updateSource', () => {
    it('should update status, credibility, notes, and excerpt with the injected timestamp when the source exists', () => {
      // Arrange
      const created = seedSource(TICKER, 'draft');

      // Act
      const updated = updateSource(
        db,
        created.id,
        { status: 'accepted', credibility: 'high', notes: 'Now reviewed.', excerpt: 'Quote.' },
        LATER_ISO,
      );

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('accepted');
      expect(updated?.credibility).toBe('high');
      expect(updated?.notes).toBe('Now reviewed.');
      expect(updated?.excerpt).toBe('Quote.');
      expect(updated?.createdAt).toBe(NOW_ISO);
      expect(updated?.updatedAt).toBe(LATER_ISO);
    });

    it('should ignore fields outside the allowed set when extra fields are passed', () => {
      // Arrange
      const created = seedSource(TICKER, 'draft');
      const patch = {
        status: 'accepted',
        title: 'Tampered title',
        marketTicker: 'TAMPERED',
        addedBy: 'ai_draft',
      } as unknown as Parameters<typeof updateSource>[2];

      // Act
      const updated = updateSource(db, created.id, patch, LATER_ISO);

      // Assert
      expect(updated?.status).toBe('accepted');
      expect(updated?.title).toBe('Example source');
      expect(updated?.marketTicker).toBe(TICKER);
      expect(updated?.addedBy).toBe('human');
    });

    it('should return null when the source id does not exist', () => {
      expect(updateSource(db, 'missing-id', { status: 'accepted' }, NOW_ISO)).toBeNull();
    });
  });

  describe('countAcceptedSources', () => {
    it('should return 0 when the ticker has no sources', () => {
      expect(countAcceptedSources(db, TICKER)).toBe(0);
    });

    it('should count only accepted sources when draft and rejected rows exist', () => {
      // Arrange: draft and rejected must never count as accepted
      seedSource(TICKER, 'draft');
      seedSource(TICKER, 'rejected');
      seedSource(TICKER, 'accepted');

      // Act + Assert
      expect(countAcceptedSources(db, TICKER)).toBe(1);
    });

    it('should scope the count to the given ticker when other markets have accepted sources', () => {
      // Arrange
      seedSource(OTHER_TICKER, 'accepted');
      seedSource(OTHER_TICKER, 'accepted');
      seedSource(TICKER, 'accepted');

      // Act + Assert
      expect(countAcceptedSources(db, TICKER)).toBe(1);
    });
  });

  describe('getSourcesByIds', () => {
    it('should return only the records whose ids exist when some ids are unknown', () => {
      // Arrange
      const a = seedSource(TICKER, 'accepted');
      const b = seedSource(TICKER, 'draft');

      // Act
      const found = getSourcesByIds(db, [a.id, 'missing-id', b.id]);

      // Assert
      expect(found.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('should return an empty array when the id list is empty', () => {
      seedSource(TICKER, 'accepted');
      expect(getSourcesByIds(db, [])).toEqual([]);
    });
  });
});

describe('briefs', () => {
  describe('saveBrief', () => {
    it('should compute source count from current accepted sources and ignore client-provided counts', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      seedSource(TICKER, 'draft');
      seedSource(TICKER, 'rejected');

      // Act: client claims 99 sources; the server must ignore it
      const brief = saveBrief(
        db,
        TICKER,
        {
          state: 'draft',
          summary: 'A manual summary.',
          confidence: 'medium',
          basis: 'manual',
          sourceCount: 99,
        },
        NOW_ISO,
      );

      // Assert
      expect(brief.sourceCount).toBe(1);
      expect(brief.state).toBe('draft');
      expect(brief.confidence).toBe('medium');
      expect(brief.createdAt).toBe(NOW_ISO);
    });

    it('should coerce state to insufficient_sources when there are 0 accepted sources', () => {
      // Arrange: only a draft source exists, which never counts as accepted
      seedSource(TICKER, 'draft');

      // Act
      const brief = saveBrief(
        db,
        TICKER,
        { state: 'draft', confidence: 'low', basis: 'manual' },
        NOW_ISO,
      );

      // Assert
      expect(brief.state).toBe('insufficient_sources');
      expect(brief.sourceCount).toBe(0);
    });

    it('should keep state not_run when requested with 0 accepted sources', () => {
      // Act
      const brief = saveBrief(
        db,
        TICKER,
        { state: 'not_run', confidence: 'low', basis: 'manual' },
        NOW_ISO,
      );

      // Assert
      expect(brief.state).toBe('not_run');
    });

    it('should coerce confidence to low when there are 0 accepted sources', () => {
      // Act: no source = low confidence, regardless of what the client asks for
      const brief = saveBrief(
        db,
        TICKER,
        { state: 'draft', confidence: 'high', basis: 'manual' },
        NOW_ISO,
      );

      // Assert
      expect(brief.confidence).toBe('low');
    });

    it('should coerce confidence to low when basis is ai_draft_unreviewed even with accepted sources', () => {
      // Arrange
      seedSource(TICKER, 'accepted');

      // Act
      const brief = saveBrief(
        db,
        TICKER,
        { state: 'draft', confidence: 'high', basis: 'ai_draft_unreviewed' },
        NOW_ISO,
      );

      // Assert
      expect(brief.confidence).toBe('low');
    });

    it('should keep the requested state and confidence when at least one accepted source exists', () => {
      // Arrange
      seedSource(TICKER, 'accepted');

      // Act
      const brief = saveBrief(
        db,
        TICKER,
        { state: 'human_reviewed', confidence: 'medium', basis: 'assembled_from_sources' },
        NOW_ISO,
      );

      // Assert
      expect(brief.state).toBe('human_reviewed');
      expect(brief.confidence).toBe('medium');
    });
  });

  describe('getLatestBrief', () => {
    it('should return null when the ticker has no briefs', () => {
      expect(getLatestBrief(db, TICKER)).toBeNull();
    });

    it('should return the brief with the latest created_at when timestamps differ', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      saveBrief(db, TICKER, { state: 'draft', confidence: 'low', basis: 'manual' }, NOW_ISO);
      const newer = saveBrief(
        db,
        TICKER,
        { state: 'human_reviewed', confidence: 'medium', basis: 'manual' },
        LATER_ISO,
      );

      // Act + Assert
      expect(getLatestBrief(db, TICKER)?.id).toBe(newer.id);
    });

    it('should break created_at ties by rowid when two briefs share a timestamp', () => {
      // Arrange: identical injected timestamps; insertion order must win
      seedSource(TICKER, 'accepted');
      saveBrief(db, TICKER, { state: 'draft', confidence: 'low', basis: 'manual' }, NOW_ISO);
      const second = saveBrief(
        db,
        TICKER,
        { state: 'draft', confidence: 'medium', basis: 'manual' },
        NOW_ISO,
      );

      // Act + Assert
      expect(getLatestBrief(db, TICKER)?.id).toBe(second.id);
    });

    it('should not return briefs belonging to a different ticker', () => {
      // Arrange
      seedSource(OTHER_TICKER, 'accepted');
      saveBrief(db, OTHER_TICKER, { state: 'draft', confidence: 'low', basis: 'manual' }, NOW_ISO);

      // Act + Assert
      expect(getLatestBrief(db, TICKER)).toBeNull();
    });
  });
});

describe('probabilityEstimates', () => {
  describe('saveEstimate', () => {
    it('should persist the estimate with a server-computed source count when the range is valid', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      seedSource(TICKER, 'rejected');

      // Act: client claims 42 sources; the server must ignore it
      const result = saveEstimate(
        db,
        TICKER,
        {
          low: 0.25,
          mid: 0.3,
          high: 0.4,
          rationale: 'Source-backed estimate.',
          basis: 'human_entered',
          confidence: 'medium',
          sourceCount: 42,
        },
        NOW_ISO,
      );

      // Assert
      const estimate = unwrap(result);
      expect(estimate.low).toBe(0.25);
      expect(estimate.mid).toBe(0.3);
      expect(estimate.high).toBe(0.4);
      expect(estimate.sourceCount).toBe(1);
      expect(estimate.createdAt).toBe(NOW_ISO);
    });

    it('should reject the estimate when the range ordering is invalid', () => {
      // Arrange
      seedSource(TICKER, 'accepted');

      // Act
      const result = saveEstimate(
        db,
        TICKER,
        {
          low: 0.5,
          mid: 0.3,
          high: 0.6,
          rationale: 'Bad ordering.',
          basis: 'human_entered',
          confidence: 'low',
        },
        NOW_ISO,
      );

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(' ')).toContain('low <= mid <= high');
      }
      expect(getLatestEstimate(db, TICKER)).toBeNull();
    });

    it('should reject a non-fixture basis when the accepted source count is 0', () => {
      // Arrange: a draft source never counts as accepted
      seedSource(TICKER, 'draft');

      // Act
      const result = saveEstimate(
        db,
        TICKER,
        {
          low: 0.2,
          mid: 0.3,
          high: 0.4,
          rationale: 'No accepted sources yet.',
          basis: 'human_entered',
          confidence: 'low',
        },
        NOW_ISO,
      );

      // Assert
      expect(result.ok).toBe(false);
      expect(getLatestEstimate(db, TICKER)).toBeNull();
    });

    it('should allow a fixture basis when the accepted source count is 0', () => {
      // Act
      const result = saveEstimate(
        db,
        TICKER,
        {
          low: 0.2,
          mid: 0.3,
          high: 0.4,
          rationale: 'Fixture estimate for tests.',
          basis: 'fixture',
          confidence: 'low',
        },
        NOW_ISO,
      );

      // Assert
      const estimate = unwrap(result);
      expect(estimate.basis).toBe('fixture');
      expect(estimate.sourceCount).toBe(0);
    });

    it('should reject the estimate when the rationale is empty', () => {
      // Arrange
      seedSource(TICKER, 'accepted');

      // Act
      const result = saveEstimate(
        db,
        TICKER,
        {
          low: 0.2,
          mid: 0.3,
          high: 0.4,
          rationale: '   ',
          basis: 'human_entered',
          confidence: 'low',
        },
        NOW_ISO,
      );

      // Assert
      expect(result.ok).toBe(false);
    });
  });

  describe('getLatestEstimate', () => {
    it('should return null when the ticker has no estimates', () => {
      expect(getLatestEstimate(db, TICKER)).toBeNull();
    });

    it('should return the estimate with the latest created_at when timestamps differ', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      seedEstimate(TICKER, NOW_ISO);
      const newer = seedEstimate(TICKER, LATER_ISO);

      // Act + Assert
      expect(getLatestEstimate(db, TICKER)?.id).toBe(newer.id);
    });

    it('should break created_at ties by rowid when two estimates share a timestamp', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      seedEstimate(TICKER, NOW_ISO);
      const second = seedEstimate(TICKER, NOW_ISO);

      // Act + Assert
      expect(getLatestEstimate(db, TICKER)?.id).toBe(second.id);
    });
  });

  describe('getEstimateById', () => {
    it('should return the estimate when the id exists', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);

      // Act + Assert
      expect(getEstimateById(db, estimate.id)).toEqual(estimate);
    });

    it('should return null when the id does not exist', () => {
      expect(getEstimateById(db, 'missing-id')).toBeNull();
    });
  });
});

describe('theses', () => {
  describe('createThesis', () => {
    it('should create a draft thesis without readiness checks when status is draft', () => {
      // Act: drafts may be incomplete; readiness is gated separately
      const result = createThesis(
        db,
        TICKER,
        { status: 'draft', thesis: 'Working draft thesis.' },
        NOW_ISO,
      );

      // Assert
      const thesis = unwrap(result);
      expect(thesis.status).toBe('draft');
      expect(thesis.marketTicker).toBe(TICKER);
      expect(thesis.createdAt).toBe(NOW_ISO);
    });

    it('should create a ready thesis when all readiness checks pass against current rows', () => {
      // Arrange
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);

      // Act
      const result = createThesis(
        db,
        TICKER,
        {
          status: 'ready_for_risk',
          thesis: 'The market underprices the documented outcome.',
          whyMispriced: 'Recent data is not reflected in the price.',
          invalidationCriteria: 'Official data revision.',
          probabilityEstimateId: estimate.id,
          sourceIds: [source.id],
        },
        NOW_ISO,
      );

      // Assert
      const thesis = unwrap(result);
      expect(thesis.status).toBe('ready_for_risk');
      expect(thesis.probabilityEstimateId).toBe(estimate.id);
      expect(thesis.sourceIdsJson).toBe(JSON.stringify([source.id]));
    });

    it('should reject creation as ready when the thesis text is empty', () => {
      // Arrange
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);

      // Act
      const result = createThesis(
        db,
        TICKER,
        {
          status: 'ready_for_risk',
          thesis: '   ',
          probabilityEstimateId: estimate.id,
          sourceIds: [source.id],
        },
        NOW_ISO,
      );

      // Assert
      expect(result.ok).toBe(false);
      expect(getActiveThesis(db, TICKER)).toBeNull();
    });
  });

  describe('updateThesis', () => {
    it('should update text fields and updatedAt while preserving createdAt when the thesis exists', () => {
      // Arrange
      const created = unwrap(
        createThesis(db, TICKER, { status: 'draft', thesis: 'Original text.' }, NOW_ISO),
      );

      // Act
      const result = updateThesis(
        db,
        created.id,
        { thesis: 'Revised text.', whyMispriced: 'New reasoning.' },
        LATER_ISO,
      );

      // Assert
      expect(result).not.toBeNull();
      const updated = unwrap(result as StoreResult<typeof created>);
      expect(updated.thesis).toBe('Revised text.');
      expect(updated.whyMispriced).toBe('New reasoning.');
      expect(updated.createdAt).toBe(NOW_ISO);
      expect(updated.updatedAt).toBe(LATER_ISO);
    });

    it('should return null when the thesis id does not exist', () => {
      expect(updateThesis(db, 'missing-id', { thesis: 'Anything.' }, NOW_ISO)).toBeNull();
    });

    it('should reject the ready transition when the thesis text is empty', () => {
      // Arrange
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);
      const created = unwrap(
        createThesis(
          db,
          TICKER,
          {
            status: 'draft',
            thesis: '',
            probabilityEstimateId: estimate.id,
            sourceIds: [source.id],
          },
          NOW_ISO,
        ),
      );

      // Act
      const result = updateThesis(db, created.id, { status: 'ready_for_risk' }, LATER_ISO);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.ok).toBe(false);
      expect(getActiveThesis(db, TICKER)?.status).toBe('draft');
    });

    it('should reject the ready transition when no linked source is currently accepted', () => {
      // Arrange: the linked source exists but is still a draft
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);
      updateSource(db, source.id, { status: 'draft' }, NOW_ISO);
      const created = unwrap(
        createThesis(
          db,
          TICKER,
          {
            status: 'draft',
            thesis: 'A complete thesis.',
            probabilityEstimateId: estimate.id,
            sourceIds: [source.id],
          },
          NOW_ISO,
        ),
      );

      // Act
      const result = updateThesis(db, created.id, { status: 'ready_for_risk' }, LATER_ISO);

      // Assert
      expect(result?.ok).toBe(false);
    });

    it('should reject the ready transition when no sources are linked at all', () => {
      // Arrange
      seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);
      const created = unwrap(
        createThesis(
          db,
          TICKER,
          {
            status: 'draft',
            thesis: 'A complete thesis.',
            probabilityEstimateId: estimate.id,
            sourceIds: [],
          },
          NOW_ISO,
        ),
      );

      // Act
      const result = updateThesis(db, created.id, { status: 'ready_for_risk' }, LATER_ISO);

      // Assert
      expect(result?.ok).toBe(false);
    });

    it('should reject the ready transition when the linked probability estimate is missing', () => {
      // Arrange
      const source = seedSource(TICKER, 'accepted');
      const created = unwrap(
        createThesis(
          db,
          TICKER,
          { status: 'draft', thesis: 'A complete thesis.', sourceIds: [source.id] },
          NOW_ISO,
        ),
      );

      // Act
      const result = updateThesis(db, created.id, { status: 'ready_for_risk' }, LATER_ISO);

      // Assert
      expect(result?.ok).toBe(false);
    });

    it('should allow the ready transition when all readiness checks pass', () => {
      // Arrange
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);
      const created = unwrap(
        createThesis(
          db,
          TICKER,
          {
            status: 'draft',
            thesis: 'A complete thesis.',
            probabilityEstimateId: estimate.id,
            sourceIds: [source.id],
          },
          NOW_ISO,
        ),
      );

      // Act
      const result = updateThesis(db, created.id, { status: 'ready_for_risk' }, LATER_ISO);

      // Assert
      expect(result).not.toBeNull();
      const updated = unwrap(result as StoreResult<typeof created>);
      expect(updated.status).toBe('ready_for_risk');
    });
  });

  describe('getActiveThesis', () => {
    it('should return null when the ticker has no theses', () => {
      expect(getActiveThesis(db, TICKER)).toBeNull();
    });

    it('should return the latest non-archived thesis when timestamps differ', () => {
      // Arrange
      unwrap(createThesis(db, TICKER, { status: 'draft', thesis: 'First.' }, NOW_ISO));
      const newer = unwrap(
        createThesis(db, TICKER, { status: 'draft', thesis: 'Second.' }, LATER_ISO),
      );

      // Act + Assert
      expect(getActiveThesis(db, TICKER)?.id).toBe(newer.id);
    });

    it('should break created_at ties by rowid when two theses share a timestamp', () => {
      // Arrange
      unwrap(createThesis(db, TICKER, { status: 'draft', thesis: 'First.' }, NOW_ISO));
      const second = unwrap(
        createThesis(db, TICKER, { status: 'draft', thesis: 'Second.' }, NOW_ISO),
      );

      // Act + Assert
      expect(getActiveThesis(db, TICKER)?.id).toBe(second.id);
    });

    it('should skip archived theses when selecting the active thesis', () => {
      // Arrange
      const older = unwrap(createThesis(db, TICKER, { status: 'draft', thesis: 'Keep.' }, NOW_ISO));
      const newer = unwrap(
        createThesis(db, TICKER, { status: 'draft', thesis: 'Archive me.' }, LATER_ISO),
      );
      updateThesis(db, newer.id, { status: 'archived' }, LATER_ISO);

      // Act + Assert: the newer thesis is archived, so the older draft is active
      expect(getActiveThesis(db, TICKER)?.id).toBe(older.id);
    });

    it('should return null when every thesis for the ticker is archived', () => {
      // Arrange
      const only = unwrap(createThesis(db, TICKER, { status: 'draft', thesis: 'Done.' }, NOW_ISO));
      updateThesis(db, only.id, { status: 'archived' }, LATER_ISO);

      // Act + Assert
      expect(getActiveThesis(db, TICKER)).toBeNull();
    });
  });

  describe('readiness decay', () => {
    it('should fail validateThesisReady for a stored ready thesis when a linked source is later rejected', () => {
      // Arrange: a fully valid ready thesis
      const source = seedSource(TICKER, 'accepted');
      const estimate = seedEstimate(TICKER);
      const ready = unwrap(
        createThesis(
          db,
          TICKER,
          {
            status: 'ready_for_risk',
            thesis: 'A complete thesis.',
            probabilityEstimateId: estimate.id,
            sourceIds: [source.id],
          },
          NOW_ISO,
        ),
      );

      // Act: the linked source decays after the thesis was marked ready
      updateSource(db, source.id, { status: 'rejected' }, LATER_ISO);
      const stored = getActiveThesis(db, TICKER);
      const revalidation = validateThesisReady(
        stored as NonNullable<typeof stored>,
        listSources(db, TICKER),
        getEstimateById(db, estimate.id),
      );

      // Assert: the stored row still says ready, but read-time revalidation fails
      expect(stored?.id).toBe(ready.id);
      expect(stored?.status).toBe('ready_for_risk');
      expect(revalidation.ok).toBe(false);
      expect(revalidation.errors.join(' ')).toContain('not currently accepted');
    });
  });
});
