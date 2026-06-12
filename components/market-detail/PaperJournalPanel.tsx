'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { MarketDossier } from '@/lib/dossier/types';
import { evaluatePaperEligibility } from '@/lib/paper/eligibility';
import type { PaperDecisionEntryRecord } from '@/lib/research-store/types';
import type { RiskVerdict } from '@/lib/risk/types';
import { formatCents, formatDateTime } from '@/lib/utils/format';

import type { PaperJournalActions } from './researchActions';

export interface PaperJournalPanelProps {
  /** The composed dossier for the selected market (verdict source of truth). */
  dossier: MarketDossier;
  /** Persisted paper journal entries for this market, or null while loading/unavailable. */
  paperEntries: readonly PaperDecisionEntryRecord[] | null;
  /** Plain-English paper-journal API error, or null when none. */
  paperJournalError: string | null;
  /** Logs one paper decision record (POST; the server re-validates the verdict). */
  onLogPaperDecision: PaperJournalActions['logPaperDecision'];
  /** Archives one journal entry (PATCH; archived rows persist as an audit trail). */
  onArchiveEntry: PaperJournalActions['archiveEntry'];
}

const SIMULATED_COPY =
  'Paper journal entries are simulated decision records only. They do not use real money and do not interact with any marketplace.';

const LOCKED_COPY =
  'Paper decision logging is locked until the deterministic verdict is PAPER_TRADE.';

const ELIGIBLE_COPY =
  'Rules permit a paper-only decision record. This still does not interact with any marketplace.';

/** Small muted verdict chips from the approved palette (never reward-styled). */
const VERDICT_CHIP_CLASSES: Record<RiskVerdict, string> = {
  SKIP: 'chip skip',
  WATCH: 'chip watch',
  PAPER_TRADE: 'chip paper-trade',
};

/** First line of the thesis snapshot, for the compact entry display. */
function thesisFirstLine(thesisSnapshot: string): string {
  const firstLine = thesisSnapshot.split('\n', 1)[0] ?? '';
  return firstLine.trim();
}

/** Renders a stored probability fraction as display cents (display-time only). */
function fractionAsCents(fraction: number): string {
  return formatCents(fraction * 100);
}

/** One persisted paper decision entry with its archive control. */
function PaperEntryItem({
  entry,
  busy,
  onArchive,
}: {
  entry: PaperDecisionEntryRecord;
  busy: boolean;
  onArchive: (entryId: string) => void;
}): ReactElement {
  return (
    <li className="source-item">
      <div className="flag-row">
        <span className={VERDICT_CHIP_CLASSES[entry.riskVerdict]}>
          verdict snapshot: {entry.riskVerdict}
        </span>
        <span className="chip neutral">side: {entry.side}</span>
        <span className="chip neutral">status: {entry.status}</span>
      </div>
      <p className="paper-entry-line">
        logged {formatDateTime(entry.createdAt)} · paper price {fractionAsCents(entry.paperPrice)}
        {' · '}fair mid {fractionAsCents(entry.fairMid)} · expected edge{' '}
        {fractionAsCents(entry.expectedEdge)} · confidence {entry.confidence}
      </p>
      <p className="source-text">thesis: {thesisFirstLine(entry.thesisSnapshot)}</p>
      {entry.status === 'logged' ? (
        <div className="record-actions">
          <button
            type="button"
            className="refresh-btn"
            disabled={busy}
            onClick={() => onArchive(entry.id)}
          >
            archive entry
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Stage 05 Paper / Simulate — paper decision journal for the selected market.
 * Shows the current deterministic verdict, the paper-only eligibility state
 * with its blockers, the persisted journal entries, and the log control. The
 * log button is enabled ONLY when the deterministic verdict is PAPER_TRADE —
 * it renders disabled (never hidden) otherwise — and the server re-validates
 * everything before any entry is written. Entries are simulated decision
 * snapshots: no money, no marketplace interaction, no outcome tracking.
 */
export function PaperJournalPanel({
  dossier,
  paperEntries,
  paperJournalError,
  onLogPaperDecision,
  onArchiveEntry,
}: PaperJournalPanelProps): ReactElement {
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const eligibility = evaluatePaperEligibility(dossier);
  const verdict = dossier.riskEvaluation.verdict;
  const logEnabled = verdict === 'PAPER_TRADE';

  const logDecision = async (): Promise<void> => {
    setBusy(true);
    setError(await onLogPaperDecision());
    setBusy(false);
  };

  const archiveEntry = async (entryId: string): Promise<void> => {
    setBusy(true);
    setError(await onArchiveEntry(entryId));
    setBusy(false);
  };

  return (
    <div className="dossier-section">
      <span className="label">05 Paper / Simulate · paper decision journal (simulated)</span>
      <div className="flag-row">
        <span className={VERDICT_CHIP_CLASSES[verdict]}>verdict: {verdict}</span>
        <span className="chip neutral">
          {eligibility.eligible ? 'eligibility: rules permit (paper only)' : 'eligibility: locked'}
        </span>
      </div>

      {logEnabled ? (
        <p className="dossier-note">{ELIGIBLE_COPY}</p>
      ) : (
        <p className="dossier-note">{LOCKED_COPY}</p>
      )}

      {!eligibility.eligible && eligibility.blockers.length > 0 ? (
        <div>
          <span className="label">Blockers</span>
          <ol className="dossier-list">
            {eligibility.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="form-actions">
        <button
          type="button"
          className="refresh-btn"
          disabled={busy || !logEnabled}
          onClick={() => void logDecision()}
        >
          {busy ? 'working…' : 'Log paper decision'}
        </button>
      </div>
      {error === null ? null : <p className="form-error">could not save: {error}</p>}

      {paperEntries === null ? (
        paperJournalError === null ? (
          <p className="loading-line">loading paper journal entries…</p>
        ) : (
          <p className="dossier-warning">paper journal unavailable: {paperJournalError}</p>
        )
      ) : paperEntries.length === 0 ? (
        <p className="dossier-note">no paper decisions recorded for this market.</p>
      ) : (
        <ul className="source-list">
          {paperEntries.map((entry) => (
            <PaperEntryItem
              key={entry.id}
              entry={entry}
              busy={busy}
              onArchive={(entryId) => void archiveEntry(entryId)}
            />
          ))}
        </ul>
      )}

      <p className="dossier-note">{SIMULATED_COPY}</p>
    </div>
  );
}
