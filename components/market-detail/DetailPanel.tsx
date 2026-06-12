import type { ReactElement } from 'react';

import type { NormalizedMarket } from '@/lib/markets/types';
import { formatCents, formatCount, formatDateTime } from '@/lib/utils/format';

export interface DetailPanelProps {
  /** The selected market, or null when nothing is selected. */
  market: NormalizedMarket | null;
  /** Pre-computed freshness display string (e.g. "41s ago"), or null. */
  freshnessText: string | null;
}

const NOT_PROVIDED = 'not provided';
const SETTLEMENT_NOT_PROVIDED =
  'not provided — public market payload does not include settlement source';

interface KvItem {
  label: string;
  value: string;
}

function buildKvItems(market: NormalizedMarket): KvItem[] {
  return [
    {
      label: 'Yes bid / ask',
      value: `${formatCents(market.yesBidCents)} / ${formatCents(market.yesAskCents)}`,
    },
    { label: 'Spread', value: formatCents(market.spreadCents) },
    { label: 'Last price', value: formatCents(market.lastPriceCents) },
    { label: 'Volume', value: formatCount(market.volume) },
    { label: 'Volume 24h', value: formatCount(market.volume24h) },
    { label: 'Open interest', value: formatCount(market.openInterest) },
    { label: 'Close time', value: formatDateTime(market.closeTime) },
    { label: 'Expiration', value: formatDateTime(market.expirationTime) },
    { label: 'Raw status', value: market.rawStatus },
  ];
}

/**
 * Read-only detail view of one selected market. Shows the market's own
 * rules, resolution criteria, settlement source, and order-book numbers;
 * missing fields are labeled as not provided, never invented. Ends with a
 * static (non-interactive) trading-status panel.
 */
export function DetailPanel({ market, freshnessText }: DetailPanelProps): ReactElement {
  if (market === null) {
    return (
      <div className="detail-body">
        <p className="empty-state">Select a market from the scanner.</p>
      </div>
    );
  }

  return (
    <div className="detail-body">
      <h3>{market.title}</h3>
      <p className="detail-meta">
        KALSHI · {market.category === null ? 'UNCATEGORIZED' : market.category.toUpperCase()}
        {' · '}
        {market.externalId}
        {market.eventTicker === null ? '' : ` · event ${market.eventTicker}`}
      </p>

      <div className="rule-block">
        <span className="label">Rules (as listed)</span>
        {market.rulesText ?? NOT_PROVIDED}
      </div>
      <div className="rule-block">
        <span className="label">Resolution criteria</span>
        {market.resolutionCriteria ?? NOT_PROVIDED}
      </div>
      <div className="rule-block">
        <span className="label">Settlement source</span>
        {market.settlementSource ?? SETTLEMENT_NOT_PROVIDED}
      </div>

      <div className="kv-grid">
        {buildKvItems(market).map((item) => (
          <div className="kv" key={item.label}>
            <span className="label">{item.label}</span>
            <span className="v">{item.value}</span>
          </div>
        ))}
      </div>

      <div>
        <span className="label">Data flags</span>
        <div className="flag-row">
          {market.flags.length === 0 ? (
            <span className="chip neutral">none</span>
          ) : (
            market.flags.map((flag) => (
              <span className="chip neutral" key={flag}>
                {flag}
              </span>
            ))
          )}
        </div>
      </div>

      <p className="detail-freshness">
        data freshness: {freshnessText ?? 'unknown'}
      </p>

      <div className="trading-status-panel" role="status">
        <div className="line-primary">
          REAL TRADING — DISABLED · locked until approved execution phase
        </div>
      </div>
    </div>
  );
}
