/**
 * Kalshi market connector — read-only ingestion of public market data.
 *
 * Fetches markets and events from the public API, builds the category
 * index, and normalizes everything into NormalizedMarket.
 */

import type { NormalizedMarket, PlatformId } from '@/lib/markets/types';

import type { KalshiFetch } from './client';
import { fetchOpenEvents, fetchOpenMarkets } from './client';
import { buildCategoryIndex, normalizeKalshiMarket } from './normalize';

/** What this connector can and cannot observe from public data. */
export interface ConnectorCapabilities {
  hasOrderbook: boolean;
  hasOpenInterest: boolean;
  hasWalletVisibility: boolean;
  hasPublicTraderActivity: boolean;
}

/** Read-only market connector contract. */
export interface MarketConnector {
  platform(): PlatformId;
  capabilities(): ConnectorCapabilities;
  fetchNormalizedMarkets(fetchImpl?: KalshiFetch): Promise<NormalizedMarket[]>;
}

/** The Kalshi implementation of MarketConnector. Read-only, no auth. */
export const KalshiConnector: MarketConnector = {
  platform(): PlatformId {
    return 'kalshi';
  },

  capabilities(): ConnectorCapabilities {
    return {
      hasOrderbook: false,
      hasOpenInterest: true,
      hasWalletVisibility: false,
      hasPublicTraderActivity: false,
    };
  },

  async fetchNormalizedMarkets(fetchImpl?: KalshiFetch): Promise<NormalizedMarket[]> {
    const [marketsResponse, eventsResponse] = await Promise.all([
      fetchOpenMarkets(undefined, fetchImpl),
      fetchOpenEvents(undefined, fetchImpl),
    ]);
    const categoryIndex = buildCategoryIndex(eventsResponse.events);
    return marketsResponse.markets.map((raw) => normalizeKalshiMarket(raw, categoryIndex));
  },
};
