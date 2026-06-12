/**
 * Pure market filtering and search functions.
 *
 * Factual filtering only: junk detection is based on observable data
 * (parlay structure with no activity, missing titles), never on verdicts.
 */

import type { MarketsResult, MarketStatus, NormalizedMarket } from './types';

/**
 * Returns true when a market is likely junk: a multivariate / provisional
 * parlay with zero volume AND zero open interest, or a missing/empty title.
 */
export function isJunk(market: NormalizedMarket): boolean {
  if (market.title.trim().length === 0) {
    return true;
  }
  const isParlayStyle = market.isMultivariate || market.isProvisional;
  return isParlayStyle && market.volume === 0 && market.openInterest === 0;
}

/**
 * Splits markets into kept markets and a count of filtered junk.
 *
 * @returns A new object; the input array is never mutated
 */
export function applyJunkFilter(markets: NormalizedMarket[]): {
  kept: NormalizedMarket[];
  junkFiltered: number;
} {
  const kept = markets.filter((market) => !isJunk(market));
  return { kept, junkFiltered: markets.length - kept.length };
}

/**
 * Case-insensitive search over title, ticker (external id), and category.
 *
 * @returns All markets when the query is empty or whitespace
 */
export function searchMarkets(markets: NormalizedMarket[], query: string): NormalizedMarket[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return markets;
  }
  return markets.filter((market) => {
    const haystacks = [market.title, market.externalId, market.category ?? ''];
    return haystacks.some((value) => value.toLowerCase().includes(needle));
  });
}

/**
 * Filters markets by exact category.
 *
 * @returns All markets when category is null
 */
export function filterByCategory(
  markets: NormalizedMarket[],
  category: string | null,
): NormalizedMarket[] {
  if (category === null) {
    return markets;
  }
  return markets.filter((market) => market.category === category);
}

/**
 * Filters markets by normalized status.
 *
 * @returns All markets when status is null
 */
export function filterByStatus(
  markets: NormalizedMarket[],
  status: MarketStatus | null,
): NormalizedMarket[] {
  if (status === null) {
    return markets;
  }
  return markets.filter((market) => market.status === status);
}

/**
 * Builds the counts envelope for a MarketsResult.
 */
export function computeCounts(
  scanned: number,
  junkFiltered: number,
  shown: number,
): MarketsResult['counts'] {
  return { scanned, junkFiltered, shown };
}
