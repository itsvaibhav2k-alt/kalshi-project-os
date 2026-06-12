import type { ReactElement } from 'react';

import type { MarketDossier } from '@/lib/dossier/types';
import type { NormalizedMarket } from '@/lib/markets/types';
import type {
  PaperDecisionEntryRecord,
  ResearchStateResponse,
} from '@/lib/research-store/types';
import { formatCents, formatCount, formatDateTime } from '@/lib/utils/format';

import { ContractUnderstandingPanel } from './ContractUnderstandingPanel';
import { PaperJournalPanel } from './PaperJournalPanel';
import { ProbabilityPanel } from './ProbabilityPanel';
import type { PaperJournalActions, ResearchActions } from './researchActions';
import { ResearchBriefPanel } from './ResearchBriefPanel';
import { RiskPanel } from './RiskPanel';
import { SettlementVerificationPanel } from './SettlementVerificationPanel';
import { SourcesPanel } from './SourcesPanel';
import { ThesisPanel } from './ThesisPanel';

export interface DetailPanelProps {
  /** The derived dossier for the selected market, or null when nothing is selected. */
  dossier: MarketDossier | null;
  /** Pre-computed freshness display string (e.g. "41s ago"), or null. */
  freshnessText: string | null;
  /** Persisted research state for the selected market, or null while loading/unavailable. */
  research: ResearchStateResponse | null;
  /** Plain-English research API error, or null when none. */
  researchError: string | null;
  /** Research mutation callbacks (research/thesis/settlement records). */
  actions: ResearchActions;
  /** Paper journal entries for the selected market, or null while loading/unavailable. */
  paperEntries: readonly PaperDecisionEntryRecord[] | null;
  /** Plain-English paper-journal API error, or null when none. */
  paperJournalError: string | null;
  /** Paper-journal mutation callbacks (simulated decision records only). */
  paperActions: PaperJournalActions;
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

/** Placeholder shown while persisted research is loading or unavailable. */
function ResearchUnavailableSection({
  label,
  researchError,
}: {
  label: string;
  researchError: string | null;
}): ReactElement {
  return (
    <div className="dossier-section">
      <span className="label">{label}</span>
      {researchError === null ? (
        <p className="loading-line">loading research records…</p>
      ) : (
        <p className="dossier-warning">research records unavailable: {researchError}</p>
      )}
    </div>
  );
}

/**
 * Decision dossier for one selected market. Composes the pipeline sections
 * in sequence — contract understanding, settlement verification (human record),
 * persisted research sources, research brief (derived plus the manual
 * editor), probability (derived plus the fair-range form), written thesis,
 * deterministic risk verdict, the paper decision journal (simulated records
 * only) — followed by
 * the raw market numbers and data flags. Missing fields are labeled
 * honestly, never invented; the only mutations are research/thesis/settlement
 * and paper-journal records,
 * and the static trading-status panel stays locked at the bottom.
 */
export function DetailPanel({
  dossier,
  freshnessText,
  research,
  researchError,
  actions,
  paperEntries,
  paperJournalError,
  paperActions,
}: DetailPanelProps): ReactElement {
  if (dossier === null) {
    return (
      <div className="detail-body">
        <p className="empty-state">Select a market from the scanner.</p>
      </div>
    );
  }

  const { market } = dossier;
  const editorKey = market.externalId;

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
        <span className="chip neutral">read-only market data</span>
        <span className="chip neutral">data freshness: {freshnessText ?? 'unknown'}</span>
      </div>

      <ContractUnderstandingPanel understanding={dossier.understanding} />

      {research === null ? (
        <ResearchUnavailableSection
          label="02 Understand · settlement verification (human record)"
          researchError={researchError}
        />
      ) : (
        <SettlementVerificationPanel
          key={`settlement-${editorKey}`}
          payloadStatus={dossier.understanding.settlementSourceStatus}
          settlementSources={research.settlementSources}
          verifiedSettlementSource={research.summary.verifiedSettlementSource}
          onSaveSettlementSource={actions.saveSettlementSource}
          onUpdateSettlementSource={actions.updateSettlementSource}
        />
      )}

      {research === null ? (
        <ResearchUnavailableSection
          label="03 Research / Predict · sources (research input)"
          researchError={researchError}
        />
      ) : (
        <SourcesPanel
          key={`sources-${editorKey}`}
          sources={research.sources}
          onAddSource={actions.addSource}
          onUpdateSource={actions.updateSource}
        />
      )}

      <ResearchBriefPanel
        key={`brief-${editorKey}`}
        brief={dossier.researchBrief}
        editor={
          research === null
            ? null
            : {
                persistedBrief: research.brief,
                acceptedSourceCount: research.summary.acceptedSourceCount,
                onSaveBrief: actions.saveBrief,
              }
        }
      />

      <ProbabilityPanel
        key={`probability-${editorKey}`}
        estimate={dossier.probabilityEstimate}
        editor={
          research === null
            ? null
            : {
                persistedEstimate: research.probabilityEstimate,
                onSaveFairRange: actions.saveFairRange,
              }
        }
      />

      {research === null ? (
        <ResearchUnavailableSection
          label="03 Research / Predict · written thesis (human)"
          researchError={researchError}
        />
      ) : (
        <ThesisPanel
          key={`thesis-${editorKey}`}
          thesis={research.thesis}
          acceptedSourceCount={research.summary.acceptedSourceCount}
          probabilityEstimate={research.probabilityEstimate}
          onSaveThesis={actions.saveThesis}
        />
      )}

      <RiskPanel evaluation={dossier.riskEvaluation} />

      <PaperJournalPanel
        key={`paper-${editorKey}`}
        dossier={dossier}
        paperEntries={paperEntries}
        paperJournalError={paperJournalError}
        onLogPaperDecision={paperActions.logPaperDecision}
        onArchiveEntry={paperActions.archiveEntry}
      />

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
