import { describe, expect, it } from 'vitest';

import type {
  MarketSourceRecord,
  ProbabilityEstimateRecord,
  ThesisRecord,
} from '@/lib/research-store/types';
import {
  deriveBriefState,
  validateBriefPayload,
  validateFairRange,
  validatePaperEntryInput,
  validateSettlementSourceInput,
  validateSourcePayload,
  validateThesisReady,
  validateTicker,
} from '@/lib/research-store/validation';

const NOW_ISO = '2026-06-11T12:00:00.000Z';
const TICKER = 'KXEXAMPLE-26';

function makeSource(overrides: Partial<MarketSourceRecord> = {}): MarketSourceRecord {
  return {
    id: 'src-1',
    marketTicker: TICKER,
    marketId: `kalshi:${TICKER}`,
    kind: 'supporting_source',
    title: 'NOAA seasonal outlook',
    url: 'https://www.noaa.gov/outlook',
    publisher: 'NOAA',
    excerpt: null,
    notes: null,
    credibility: 'official',
    status: 'accepted',
    addedBy: 'human',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function makeEstimate(
  overrides: Partial<ProbabilityEstimateRecord> = {},
): ProbabilityEstimateRecord {
  return {
    id: 'est-1',
    marketTicker: TICKER,
    low: 0.2,
    mid: 0.3,
    high: 0.4,
    rationale: 'Based on the accepted NOAA outlook.',
    basis: 'human_entered',
    confidence: 'medium',
    sourceCount: 1,
    briefId: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function makeThesis(overrides: Partial<ThesisRecord> = {}): ThesisRecord {
  return {
    id: 'th-1',
    marketTicker: TICKER,
    status: 'ready_for_risk',
    thesis: 'Market underprices the NOAA-documented base rate.',
    whyMispriced: 'Recency bias after one warm week.',
    invalidationCriteria: 'NOAA revises the outlook materially.',
    probabilityEstimateId: 'est-1',
    sourceIdsJson: JSON.stringify(['src-1']),
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function validSourcePayload(): Record<string, unknown> {
  return {
    title: 'NOAA seasonal outlook',
    kind: 'supporting_source',
    credibility: 'official',
    status: 'draft',
    addedBy: 'human',
    url: 'https://www.noaa.gov/outlook',
  };
}

function validBriefPayload(): Record<string, unknown> {
  return {
    state: 'draft',
    confidence: 'low',
    basis: 'manual',
    summary: 'Short manual summary.',
  };
}

function validFairRangePayload(): Record<string, unknown> {
  return {
    low: 0.2,
    mid: 0.3,
    high: 0.4,
    rationale: 'Backed by the accepted NOAA outlook.',
    basis: 'human_entered',
  };
}

function draftSettlementPayload(): Record<string, unknown> {
  return {
    title: 'Kalshi rules document',
    status: 'draft',
  };
}

function verifiedSettlementPayload(): Record<string, unknown> {
  return {
    title: 'Kalshi rules document',
    url: 'https://kalshi.com/markets/example/rules',
    publisher: 'Kalshi',
    authorityType: 'kalshi_rules',
    status: 'human_verified',
    verificationRationale: 'URL matches the resolution text in the contract rules.',
    notes: 'Checked against the market page.',
  };
}

function validPaperEntryPayload(): Record<string, unknown> {
  return {
    side: 'YES',
    riskVerdict: 'PAPER_TRADE',
    paperPrice: 0.42,
    impliedProbability: 0.43,
    fairLow: 0.5,
    fairMid: 0.55,
    fairHigh: 0.6,
    expectedEdge: 0.13,
    thesisSnapshot: 'Market underprices the documented base rate.',
    settlementSourceSnapshotJson: JSON.stringify({ id: 'set-1', title: 'Kalshi rules document' }),
    riskChecklistJson: JSON.stringify([{ id: 'resolution_clarity', status: 'pass' }]),
  };
}

describe('validateTicker', () => {
  it('should pass when ticker contains allowed characters', () => {
    // Arrange / Act
    const result = validateTicker('KXHIGHNY-26.B-50_X');

    // Assert
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when ticker uses lowercase characters', () => {
    const result = validateTicker('kxhighny-26');

    expect(result.ok).toBe(true);
  });

  it('should pass when ticker is exactly 64 characters', () => {
    const result = validateTicker('A'.repeat(64));

    expect(result.ok).toBe(true);
  });

  it('should fail when ticker is 65 characters', () => {
    const result = validateTicker('A'.repeat(65));

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail when ticker is empty', () => {
    const result = validateTicker('');

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail when ticker contains disallowed characters', () => {
    const result = validateTicker('KX HIGH$NY');

    expect(result.ok).toBe(false);
  });
});

describe('validateSourcePayload', () => {
  it('should pass when payload has title, valid unions, and an https url', () => {
    const result = validateSourcePayload(validSourcePayload());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when url uses http', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), url: 'http://example.com' });

    expect(result.ok).toBe(true);
  });

  it('should pass when url is omitted', () => {
    const payload = validSourcePayload();
    delete payload.url;

    const result = validateSourcePayload(payload);

    expect(result.ok).toBe(true);
  });

  it('should pass when url is an empty string', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), url: '' });

    expect(result.ok).toBe(true);
  });

  it('should fail when title is missing', () => {
    const payload = validSourcePayload();
    delete payload.title;

    const result = validateSourcePayload(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('title'))).toBe(true);
  });

  it('should fail when title is whitespace only', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), title: '   ' });

    expect(result.ok).toBe(false);
  });

  it('should fail when kind is not in the union', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), kind: 'rumor' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('kind'))).toBe(true);
  });

  it('should fail when credibility is not in the union', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), credibility: 'amazing' });

    expect(result.ok).toBe(false);
  });

  it('should fail when status is not in the union', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), status: 'pending' });

    expect(result.ok).toBe(false);
  });

  it('should fail when addedBy is not in the union', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), addedBy: 'bot' });

    expect(result.ok).toBe(false);
  });

  it('should fail when url is not parseable', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), url: 'not a url' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('url'))).toBe(true);
  });

  it('should fail when url uses a non-http protocol', () => {
    const result = validateSourcePayload({ ...validSourcePayload(), url: 'ftp://example.com' });

    expect(result.ok).toBe(false);
  });

  it('should fail when payload is not an object', () => {
    const result = validateSourcePayload('nonsense');

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail when payload is null', () => {
    const result = validateSourcePayload(null);

    expect(result.ok).toBe(false);
  });
});

describe('validateBriefPayload', () => {
  it('should pass when draft brief with low confidence has zero accepted sources', () => {
    const result = validateBriefPayload(validBriefPayload(), 0);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when human_reviewed brief has exactly one accepted source', () => {
    const payload = { ...validBriefPayload(), state: 'human_reviewed', confidence: 'medium' };

    const result = validateBriefPayload(payload, 1);

    expect(result.ok).toBe(true);
  });

  it('should fail when human_reviewed brief has zero accepted sources', () => {
    const payload = { ...validBriefPayload(), state: 'human_reviewed' };

    const result = validateBriefPayload(payload, 0);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('human_reviewed'))).toBe(true);
  });

  it('should fail when confidence is medium with zero accepted sources', () => {
    const payload = { ...validBriefPayload(), confidence: 'medium' };

    const result = validateBriefPayload(payload, 0);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('confidence'))).toBe(true);
  });

  it('should fail when confidence is high with zero accepted sources', () => {
    const payload = { ...validBriefPayload(), confidence: 'high' };

    const result = validateBriefPayload(payload, 0);

    expect(result.ok).toBe(false);
  });

  it('should pass when confidence is medium with exactly one accepted source', () => {
    const payload = { ...validBriefPayload(), confidence: 'medium' };

    const result = validateBriefPayload(payload, 1);

    expect(result.ok).toBe(true);
  });

  it('should pass when basis ai_draft_unreviewed has low confidence', () => {
    const payload = { ...validBriefPayload(), basis: 'ai_draft_unreviewed', confidence: 'low' };

    const result = validateBriefPayload(payload, 2);

    expect(result.ok).toBe(true);
  });

  it('should fail when basis ai_draft_unreviewed has medium confidence', () => {
    const payload = { ...validBriefPayload(), basis: 'ai_draft_unreviewed', confidence: 'medium' };

    const result = validateBriefPayload(payload, 2);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('ai_draft_unreviewed'))).toBe(true);
  });

  it('should fail when basis ai_draft_unreviewed has high confidence', () => {
    const payload = { ...validBriefPayload(), basis: 'ai_draft_unreviewed', confidence: 'high' };

    const result = validateBriefPayload(payload, 5);

    expect(result.ok).toBe(false);
  });

  it('should fail when state is not in the union', () => {
    const payload = { ...validBriefPayload(), state: 'complete' };

    const result = validateBriefPayload(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when confidence is not in the union', () => {
    const payload = { ...validBriefPayload(), confidence: 'certain' };

    const result = validateBriefPayload(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when basis is not in the union', () => {
    const payload = { ...validBriefPayload(), basis: 'ai_research' };

    const result = validateBriefPayload(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when payload is not an object', () => {
    const result = validateBriefPayload(42, 1);

    expect(result.ok).toBe(false);
  });
});

describe('deriveBriefState', () => {
  it('should return not_run when requested not_run with zero accepted sources', () => {
    expect(deriveBriefState('not_run', 0)).toBe('not_run');
  });

  it('should force insufficient_sources when requested draft with zero accepted sources', () => {
    expect(deriveBriefState('draft', 0)).toBe('insufficient_sources');
  });

  it('should force insufficient_sources when requested human_reviewed with zero accepted sources', () => {
    expect(deriveBriefState('human_reviewed', 0)).toBe('insufficient_sources');
  });

  it('should keep insufficient_sources when requested with zero accepted sources', () => {
    expect(deriveBriefState('insufficient_sources', 0)).toBe('insufficient_sources');
  });

  it('should keep draft when exactly one accepted source exists', () => {
    expect(deriveBriefState('draft', 1)).toBe('draft');
  });

  it('should keep human_reviewed when exactly one accepted source exists', () => {
    expect(deriveBriefState('human_reviewed', 1)).toBe('human_reviewed');
  });
});

describe('validateFairRange', () => {
  it('should pass when 0 <= low <= mid <= high <= 1 with rationale and accepted sources', () => {
    const result = validateFairRange(validFairRangePayload(), 1);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when low, mid, and high are all equal', () => {
    const payload = { ...validFairRangePayload(), low: 0.3, mid: 0.3, high: 0.3 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(true);
  });

  it('should pass when low is exactly 0 and high is exactly 1', () => {
    const payload = { ...validFairRangePayload(), low: 0, mid: 0.5, high: 1 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(true);
  });

  it('should fail when low is below 0', () => {
    const payload = { ...validFairRangePayload(), low: -0.0001 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when high is above 1', () => {
    const payload = { ...validFairRangePayload(), high: 1.0001 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when mid is below low', () => {
    const payload = { ...validFairRangePayload(), low: 0.4, mid: 0.3, high: 0.5 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when high is below mid', () => {
    const payload = { ...validFairRangePayload(), low: 0.2, mid: 0.5, high: 0.4 };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when a bound is not a number', () => {
    const payload = { ...validFairRangePayload(), mid: '0.3' };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when a bound is NaN', () => {
    const payload = { ...validFairRangePayload(), mid: Number.NaN };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when rationale is missing', () => {
    const payload = validFairRangePayload();
    delete payload.rationale;

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('rationale'))).toBe(true);
  });

  it('should fail when rationale is whitespace only', () => {
    const payload = { ...validFairRangePayload(), rationale: '  ' };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when basis is not in the union', () => {
    const payload = { ...validFairRangePayload(), basis: 'market_price' };

    const result = validateFairRange(payload, 1);

    expect(result.ok).toBe(false);
  });

  it('should fail when non-fixture basis has zero accepted sources', () => {
    const result = validateFairRange(validFairRangePayload(), 0);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('accepted'))).toBe(true);
  });

  it('should pass when non-fixture basis has exactly one accepted source', () => {
    const result = validateFairRange(validFairRangePayload(), 1);

    expect(result.ok).toBe(true);
  });

  it('should pass when fixture basis has zero accepted sources', () => {
    const payload = { ...validFairRangePayload(), basis: 'fixture' };

    const result = validateFairRange(payload, 0);

    expect(result.ok).toBe(true);
  });

  it('should fail when payload is not an object', () => {
    const result = validateFairRange(null, 1);

    expect(result.ok).toBe(false);
  });
});

describe('validateThesisReady', () => {
  it('should pass when thesis text, one accepted linked source, and a linked estimate exist', () => {
    const result = validateThesisReady(makeThesis(), [makeSource()], makeEstimate());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should fail when thesis text is empty after trim', () => {
    const result = validateThesisReady(makeThesis({ thesis: '   ' }), [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('thesis'))).toBe(true);
  });

  it('should fail when no source ids are linked', () => {
    const thesis = makeThesis({ sourceIdsJson: JSON.stringify([]) });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('source'))).toBe(true);
  });

  it('should fail when sourceIdsJson is null', () => {
    const thesis = makeThesis({ sourceIdsJson: null });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when sourceIdsJson is not valid JSON', () => {
    const thesis = makeThesis({ sourceIdsJson: 'not-json' });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when sourceIdsJson is not an array of strings', () => {
    const thesis = makeThesis({ sourceIdsJson: JSON.stringify({ id: 'src-1' }) });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when a linked source id does not exist', () => {
    const thesis = makeThesis({ sourceIdsJson: JSON.stringify(['missing-src']) });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when a linked source belongs to a different ticker', () => {
    const foreignSource = makeSource({ marketTicker: 'OTHER-TICKER' });

    const result = validateThesisReady(makeThesis(), [foreignSource], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when a linked source is currently rejected', () => {
    const rejectedSource = makeSource({ status: 'rejected' });

    const result = validateThesisReady(makeThesis(), [rejectedSource], makeEstimate());

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('accepted'))).toBe(true);
  });

  it('should fail when a linked source is still in draft status', () => {
    const draftSource = makeSource({ status: 'draft' });

    const result = validateThesisReady(makeThesis(), [draftSource], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when any one of several linked sources is no longer accepted', () => {
    const accepted = makeSource({ id: 'src-1' });
    const rejected = makeSource({ id: 'src-2', status: 'rejected' });
    const thesis = makeThesis({ sourceIdsJson: JSON.stringify(['src-1', 'src-2']) });

    const result = validateThesisReady(thesis, [accepted, rejected], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when the probability estimate is missing', () => {
    const result = validateThesisReady(makeThesis(), [makeSource()], null);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('probability'))).toBe(true);
  });

  it('should fail when the thesis has no linked probability estimate id', () => {
    const thesis = makeThesis({ probabilityEstimateId: null });

    const result = validateThesisReady(thesis, [makeSource()], makeEstimate());

    expect(result.ok).toBe(false);
  });

  it('should fail when the estimate id does not match the linked id', () => {
    const result = validateThesisReady(
      makeThesis({ probabilityEstimateId: 'est-other' }),
      [makeSource()],
      makeEstimate(),
    );

    expect(result.ok).toBe(false);
  });

  it('should fail when the estimate belongs to a different ticker', () => {
    const foreignEstimate = makeEstimate({ marketTicker: 'OTHER-TICKER' });

    const result = validateThesisReady(makeThesis(), [makeSource()], foreignEstimate);

    expect(result.ok).toBe(false);
  });

  it('should collect multiple errors when several rules fail at once', () => {
    const thesis = makeThesis({ thesis: '', sourceIdsJson: JSON.stringify([]) });

    const result = validateThesisReady(thesis, [], null);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateSettlementSourceInput', () => {
  it('should pass when a draft has only a non-empty title', () => {
    const result = validateSettlementSourceInput(draftSettlementPayload());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when a human_verified record has title, url, authorityType, and rationale', () => {
    const result = validateSettlementSourceInput(verifiedSettlementPayload());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when status is rejected with only a title', () => {
    const result = validateSettlementSourceInput({ ...draftSettlementPayload(), status: 'rejected' });

    expect(result.ok).toBe(true);
  });

  it('should pass when a draft has a valid optional url and authorityType', () => {
    const payload = {
      ...draftSettlementPayload(),
      url: 'https://www.noaa.gov/outlook',
      authorityType: 'official_government_source',
    };

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(true);
  });

  it('should fail when title is missing', () => {
    const payload = draftSettlementPayload();
    delete payload.title;

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('title'))).toBe(true);
  });

  it('should fail when title is whitespace only', () => {
    const result = validateSettlementSourceInput({ ...draftSettlementPayload(), title: '   ' });

    expect(result.ok).toBe(false);
  });

  it('should fail when status is not in the union', () => {
    const result = validateSettlementSourceInput({ ...draftSettlementPayload(), status: 'verified' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('status'))).toBe(true);
  });

  it('should fail when a draft url is not a valid http(s) URL', () => {
    const result = validateSettlementSourceInput({ ...draftSettlementPayload(), url: 'not a url' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('url'))).toBe(true);
  });

  it('should fail when a draft authorityType is not in the union', () => {
    const payload = { ...draftSettlementPayload(), authorityType: 'blog_post' };

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('authorityType'))).toBe(true);
  });

  it('should fail when human_verified is missing the url', () => {
    const payload = verifiedSettlementPayload();
    delete payload.url;

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('url'))).toBe(true);
  });

  it('should fail when human_verified has a non-http url', () => {
    const payload = { ...verifiedSettlementPayload(), url: 'ftp://example.com' };

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when human_verified is missing the authorityType', () => {
    const payload = verifiedSettlementPayload();
    delete payload.authorityType;

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('authorityType'))).toBe(true);
  });

  it('should fail when human_verified has an invalid authorityType', () => {
    const payload = { ...verifiedSettlementPayload(), authorityType: 'blog_post' };

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when human_verified is missing the verificationRationale', () => {
    const payload = verifiedSettlementPayload();
    delete payload.verificationRationale;

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('verificationRationale'))).toBe(true);
  });

  it('should fail when human_verified has a whitespace-only verificationRationale', () => {
    const payload = { ...verifiedSettlementPayload(), verificationRationale: '  ' };

    const result = validateSettlementSourceInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when payload is not an object', () => {
    const result = validateSettlementSourceInput('nonsense');

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should fail when payload is null', () => {
    const result = validateSettlementSourceInput(null);

    expect(result.ok).toBe(false);
  });
});

describe('validatePaperEntryInput', () => {
  it('should pass when side is YES, verdict is PAPER_TRADE, and all snapshots are present', () => {
    const result = validatePaperEntryInput(validPaperEntryPayload());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when probability fields sit exactly on the 0 and 1 boundaries', () => {
    const payload = {
      ...validPaperEntryPayload(),
      paperPrice: 0,
      impliedProbability: 1,
      fairLow: 0,
      fairMid: 0.5,
      fairHigh: 1,
    };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(true);
  });

  it('should pass when the fair range values are all equal', () => {
    const payload = { ...validPaperEntryPayload(), fairLow: 0.3, fairMid: 0.3, fairHigh: 0.3 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(true);
  });

  it('should pass when expectedEdge is negative within bounds', () => {
    // Shape-level check only: the deterministic risk engine alone gates eligibility
    const payload = { ...validPaperEntryPayload(), expectedEdge: -0.2 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(true);
  });

  it('should fail when side is NO', () => {
    const result = validatePaperEntryInput({ ...validPaperEntryPayload(), side: 'NO' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('side'))).toBe(true);
  });

  it('should fail when side is missing', () => {
    const payload = validPaperEntryPayload();
    delete payload.side;

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when riskVerdict is SKIP', () => {
    const result = validatePaperEntryInput({ ...validPaperEntryPayload(), riskVerdict: 'SKIP' });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('riskVerdict'))).toBe(true);
  });

  it('should fail when riskVerdict is WATCH', () => {
    const result = validatePaperEntryInput({ ...validPaperEntryPayload(), riskVerdict: 'WATCH' });

    expect(result.ok).toBe(false);
  });

  it('should fail when riskVerdict is missing', () => {
    const payload = validPaperEntryPayload();
    delete payload.riskVerdict;

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when paperPrice is below 0', () => {
    const payload = { ...validPaperEntryPayload(), paperPrice: -0.0001 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('paperPrice'))).toBe(true);
  });

  it('should fail when paperPrice is above 1', () => {
    const payload = { ...validPaperEntryPayload(), paperPrice: 1.0001 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when impliedProbability is not a number', () => {
    const payload = { ...validPaperEntryPayload(), impliedProbability: '0.43' };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('impliedProbability'))).toBe(true);
  });

  it('should fail when fairMid is NaN', () => {
    const payload = { ...validPaperEntryPayload(), fairMid: Number.NaN };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when fairMid is below fairLow', () => {
    const payload = { ...validPaperEntryPayload(), fairLow: 0.6, fairMid: 0.5, fairHigh: 0.7 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('fair'))).toBe(true);
  });

  it('should fail when fairHigh is below fairMid', () => {
    const payload = { ...validPaperEntryPayload(), fairLow: 0.4, fairMid: 0.6, fairHigh: 0.5 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when expectedEdge is not finite', () => {
    const payload = { ...validPaperEntryPayload(), expectedEdge: Number.POSITIVE_INFINITY };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('expectedEdge'))).toBe(true);
  });

  it('should fail when expectedEdge is above 1', () => {
    const payload = { ...validPaperEntryPayload(), expectedEdge: 1.5 };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when thesisSnapshot is missing', () => {
    const payload = validPaperEntryPayload();
    delete payload.thesisSnapshot;

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('thesisSnapshot'))).toBe(true);
  });

  it('should fail when thesisSnapshot is whitespace only', () => {
    const payload = { ...validPaperEntryPayload(), thesisSnapshot: '   ' };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
  });

  it('should fail when settlementSourceSnapshotJson is missing', () => {
    const payload = validPaperEntryPayload();
    delete payload.settlementSourceSnapshotJson;

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('settlementSourceSnapshotJson'))).toBe(true);
  });

  it('should fail when riskChecklistJson is missing', () => {
    const payload = validPaperEntryPayload();
    delete payload.riskChecklistJson;

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('riskChecklistJson'))).toBe(true);
  });

  it('should fail when payload is not an object', () => {
    const result = validatePaperEntryInput(42);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should collect multiple errors when several rules fail at once', () => {
    const payload = {
      side: 'NO',
      riskVerdict: 'SKIP',
      paperPrice: 1.5,
      thesisSnapshot: '',
    };

    const result = validatePaperEntryInput(payload);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
