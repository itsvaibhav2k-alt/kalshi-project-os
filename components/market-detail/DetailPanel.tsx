import type { ReactElement } from 'react';

import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import { formatCents, formatCount, formatDateTime } from '@/lib/utils/format';

import { ContractUnderstandingPanel } from './ContractUnderstandingPanel';
import { ProbabilityPanel } from './ProbabilityPanel';
import { ResearchBriefPanel } from './ResearchBriefPanel';
import { RiskPanel } from './RiskPanel';

export interface DetailPanelProps {
  /** The derived dossier for the selected market, or null when nothing is selected. */
  dossier: MarketDossier | null;
  /** Pre-computed freshness display string (e.g. "41s ago"), or null. */
  freshnessText: string | null;
}

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
 * Read-only decision dossier for one selected market. Composes the Phase 2
 * pipeline sections in order — contract understanding, research brief,
 * probability estimate, deterministic risk verdict — followed by the raw
 * market numbers and data flags. Missing fields are labeled honestly, never
 * invented, and the static trading-status panel stays locked at the bottom.
 */
export function DetailPanel({ dossier, freshnessText }: DetailPanelProps): ReactElement {
  if (dossier === null) {
    return (
      <div className="detail-body">
        <p className="empty-state">Select a market from the scanner.</p>
      </div>
    );
  }

  const { market } = dossier;

  return (
    <div className="detail-body">
      <h3>{market.title}</h3>
      <p className="detail-meta">
        KALSHI · {market.category === null ? 'UNCATEGORIZED' : market.category.toUpperCase()}
        {' · '}
        {market.externalId}
        {market.eventTicker === null ? '' : ` · event ${market.eventTicker}`}
      </p>
      <div className="flag-row">
        <span className="chip neutral">read-only dossier</span>
        <span className="chip neutral">data freshness: {freshnessText ?? 'unknown'}</span>
      </div>

      <ContractUnderstandingPanel understanding={dossier.understanding} />
      <ResearchBriefPanel brief={dossier.researchBrief} />
      <ProbabilityPanel estimate={dossier.probabilityEstimate} />
      <RiskPanel evaluation={dossier.riskEvaluation} />

      <div className="dossier-section">
        <span className="label">Market numbers</span>
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
      </div>

      <div className="trading-status-panel" role="status">
        <div className="line-primary">
          REAL TRADING — DISABLED · locked until approved execution phase
        </div>
      </div>
    </div>
  );
}
