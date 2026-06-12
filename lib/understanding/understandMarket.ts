/**
 * Deterministic contract understanding (pipeline stage 02 Understand).
 *
 * Converts a NormalizedMarket into a ContractUnderstanding using only the
 * fields the platform provided. No network, no LLM, no randomness. Rules:
 * never invent a settlement source, never claim clarity the payload does
 * not support, and surface every missing field explicitly.
 */

import type { NormalizedMarket } from '@/lib/markets/types';

import type {
  ContractUnderstanding,
  ImportantDate,
  ResolutionClarity,
  SettlementSourceStatus,
} from './types';

/** Words that suggest the rules name a measurement/reporting source. */
const SOURCE_KEYWORDS: readonly string[] = [
  'according to',
  'as reported',
  'as published',
  'reported by',
  'published by',
  'data from',
  'per the',
  'official',
  'source',
  'agency',
  'bureau',
  'department',
  'exchange',
  'index',
];

/** Title shapes that ask a predictive question needing a measurement source. */
const PREDICTIVE_TITLE_PATTERN = /\bwill\b|\bbefore\b|\bby\s+\d{4}\b/i;

/** Returns true when text is null, empty, or whitespace-only. */
function isBlank(text: string | null): boolean {
  return text === null || text.trim().length === 0;
}

/** Returns true when the rules text appears to name a measurement source. */
function rulesNameASource(rulesText: string): boolean {
  const lowered = rulesText.toLowerCase();
  return SOURCE_KEYWORDS.some((keyword) => lowered.includes(keyword));
}

/** First sentence of a text block, trimmed for display. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const period = trimmed.indexOf('. ');
  return period === -1 ? trimmed : trimmed.slice(0, period + 1);
}

/** Collects the contract-relevant dates the platform provided. */
function collectImportantDates(market: NormalizedMarket): ImportantDate[] {
  const dates: ImportantDate[] = [];
  if (market.closeTime !== null) {
    dates.push({ label: 'Close time', value: market.closeTime });
  }
  if (market.expirationTime !== null) {
    dates.push({ label: 'Expiration time', value: market.expirationTime });
  }
  return dates;
}

/**
 * Builds a deterministic ContractUnderstanding from a normalized market.
 *
 * @param market - The normalized market to interpret
 * @returns The contract understanding, with missing inputs flagged honestly
 */
export function understandMarket(market: NormalizedMarket): ContractUnderstanding {
  const missingFields: string[] = [];
  const ambiguityFlags: string[] = [];
  const interpretationNotes: string[] = [];

  const hasRules = !isBlank(market.rulesText);
  const hasCriteria = !isBlank(market.resolutionCriteria);
  const hasSettlementSource = !isBlank(market.settlementSource);

  if (!hasRules) {
    missingFields.push('rulesText');
    ambiguityFlags.push('rules text not provided in the public payload');
  }
  if (!hasCriteria) {
    missingFields.push('resolutionCriteria');
    ambiguityFlags.push('no explicit resolution criteria provided');
  }
  if (!hasSettlementSource) {
    missingFields.push('settlementSource');
    interpretationNotes.push(
      'Settlement source is not in the public payload; the resolution authority cannot be confirmed from this data alone.',
    );
  }
  if (market.closeTime === null && market.expirationTime === null) {
    missingFields.push('closeTime/expirationTime');
    ambiguityFlags.push('no close or expiration time provided');
  }

  if (hasRules && PREDICTIVE_TITLE_PATTERN.test(market.title)) {
    const rules = market.rulesText as string;
    if (!rulesNameASource(rules)) {
      ambiguityFlags.push(
        'predictive question but listed rules do not name a measurement source',
      );
    }
  }
  if (market.isProvisional) {
    interpretationNotes.push('Market is marked provisional by the platform; terms may change.');
  }
  if (market.isMultivariate) {
    interpretationNotes.push(
      'Multivariate / combination market: resolution depends on multiple legs, compounding interpretation risk.',
    );
  }

  const resolutionClarity = deriveClarity(hasRules, ambiguityFlags);
  const settlementSourceStatus: SettlementSourceStatus = hasSettlementSource
    ? 'unverified'
    : 'missing';
  if (hasSettlementSource) {
    interpretationNotes.push(
      'Settlement source text is listed but has not been independently verified.',
    );
  }

  return {
    marketId: market.id,
    title: market.title,
    summary: buildSummary(market, hasRules),
    yesCondition: buildYesCondition(market, hasRules),
    noCondition: buildNoCondition(market),
    rulesText: hasRules ? market.rulesText : null,
    resolutionCriteria: hasCriteria ? market.resolutionCriteria : null,
    settlementSource: hasSettlementSource ? market.settlementSource : null,
    settlementSourceStatus,
    resolutionClarity,
    importantDates: collectImportantDates(market),
    ambiguityFlags,
    missingFields,
    interpretationNotes,
  };
}

/** Clarity is missing without rules, ambiguous with any flag, else clear. */
function deriveClarity(hasRules: boolean, ambiguityFlags: string[]): ResolutionClarity {
  if (!hasRules) {
    return 'missing';
  }
  return ambiguityFlags.length > 0 ? 'ambiguous' : 'clear';
}

/** Plain-English summary derived only from listed fields. */
function buildSummary(market: NormalizedMarket, hasRules: boolean): string {
  const base = `Binary market asking: "${market.title}".`;
  if (!hasRules) {
    return `${base} The public payload does not include rules text, so the exact resolution terms are unknown from this data.`;
  }
  return `${base} Resolution is governed by the listed rules: ${firstSentence(market.rulesText as string)}`;
}

/** YES condition strictly from listed rules; honest when rules are absent. */
function buildYesCondition(market: NormalizedMarket, hasRules: boolean): string {
  if (!hasRules) {
    return 'Not derivable — rules text was not provided in the public payload.';
  }
  return `Resolves YES when the listed rules are satisfied: ${firstSentence(market.rulesText as string)}`;
}

/** NO condition phrased relative to the YES condition and listed dates. */
function buildNoCondition(market: NormalizedMarket): string {
  const deadline = market.expirationTime ?? market.closeTime;
  if (deadline === null) {
    return 'Resolves NO if the YES condition is not met (no deadline provided in the public payload).';
  }
  return `Resolves NO if the YES condition is not met by the listed deadline (${deadline}).`;
}
