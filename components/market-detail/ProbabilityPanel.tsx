'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { ImpliedProbabilityBasis, ProbabilityEstimate } from '@/lib/probability/types';
import type { ProbabilityEstimateRecord } from '@/lib/research-store/types';
import { formatProbability } from '@/lib/utils/format';

import type { FairRangeFormPayload, ResearchActions } from './researchActions';

/** Fair-range editor wiring. Null hides the form. */
export interface FairRangeEditorProps {
  /** Latest persisted fair-range estimate, or null when none exists yet. */
  persistedEstimate: ProbabilityEstimateRecord | null;
  /** Persists the human-entered fair range (POST). */
  onSaveFairRange: ResearchActions['saveFairRange'];
}

export interface ProbabilityPanelProps {
  /** Advisory probability estimate for the selected market. */
  estimate: ProbabilityEstimate;
  /** Fair-range editor wiring, or null while persisted research is unavailable. */
  editor: FairRangeEditorProps | null;
}

/** Display labels for how the market-implied probability was derived. */
const BASIS_LABELS: Record<ImpliedProbabilityBasis, string> = {
  bid_ask_midpoint: 'bid/ask midpoint',
  last_price: 'last price — weaker',
  none: 'not derivable',
};

const ADVISORY_COPY = 'Advisory only — probabilities never approve trades.';
const SOURCED_FAIR_COPY =
  'Fair probability must be backed by accepted sources. Market price is not a fair estimate.';

/** Formats a signed probability edge (fraction) in cents, e.g. "6.0¢". */
function formatEdgeCents(edge: number | null): string {
  if (edge === null || !Number.isFinite(edge)) {
    return '—';
  }
  return `${(edge * 100).toFixed(1)}¢`;
}

/** Form state holds percent strings; fractions are derived only on submit. */
interface FairRangeFormState {
  lowPercent: string;
  midPercent: string;
  highPercent: string;
  rationale: string;
  confidence: FairRangeFormPayload['confidence'];
}

/** Prefills the form (in percent) from the latest persisted estimate. */
function initialForm(persisted: ProbabilityEstimateRecord | null): FairRangeFormState {
  return {
    lowPercent: persisted === null ? '' : String(persisted.low * 100),
    midPercent: persisted === null ? '' : String(persisted.mid * 100),
    highPercent: persisted === null ? '' : String(persisted.high * 100),
    rationale: persisted?.rationale ?? '',
    confidence: persisted?.confidence ?? 'low',
  };
}

/** Parses a percent input into a fraction, or null when not a number. */
function fractionFromPercent(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

/** Human fair-range entry form. Percent inputs convert to fractions on submit. */
function FairRangeEditor({ persistedEstimate, onSaveFairRange }: FairRangeEditorProps): ReactElement {
  const [form, setForm] = useState<FairRangeFormState>(() => initialForm(persistedEstimate));
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof FairRangeFormState>(
    field: K,
    value: FairRangeFormState[K],
  ): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submit = async (): Promise<void> => {
    const low = fractionFromPercent(form.lowPercent);
    const mid = fractionFromPercent(form.midPercent);
    const high = fractionFromPercent(form.highPercent);
    if (low === null || mid === null || high === null) {
      setError('low, mid, and high must all be numbers in percent (0-100)');
      return;
    }
    setBusy(true);
    setError(
      await onSaveFairRange({
        low,
        mid,
        high,
        rationale: form.rationale,
        confidence: form.confidence,
      }),
    );
    setBusy(false);
  };

  const percentFields: ReadonlyArray<{
    key: 'lowPercent' | 'midPercent' | 'highPercent';
    label: string;
  }> = [
    { key: 'lowPercent', label: 'fair low (%)' },
    { key: 'midPercent', label: 'fair mid (%)' },
    { key: 'highPercent', label: 'fair high (%)' },
  ];

  return (
    <form
      className="memo-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <span className="label">Fair probability range (human-entered)</span>
      <div className="field-grid">
        {percentFields.map((field) => (
          <div className="field-row" key={field.key}>
            <label className="label" htmlFor={`fair-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`fair-${field.key}`}
              className="memo-input"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
            />
          </div>
        ))}
        <div className="field-row">
          <label className="label" htmlFor="fair-confidence">
            confidence
          </label>
          <select
            id="fair-confidence"
            className="memo-select"
            value={form.confidence}
            onChange={(event) =>
              setField('confidence', event.target.value as FairRangeFormState['confidence'])
            }
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>
      <div className="field-row">
        <label className="label" htmlFor="fair-rationale">
          rationale (required)
        </label>
        <textarea
          id="fair-rationale"
          className="memo-textarea"
          rows={2}
          value={form.rationale}
          onChange={(event) => setField('rationale', event.target.value)}
        />
      </div>
      <div className="form-actions">
        <button
          type="submit"
          className="refresh-btn"
          disabled={busy || form.rationale.trim() === ''}
        >
          {busy ? 'saving…' : 'save fair range'}
        </button>
      </div>
      {error === null ? null : <p className="form-error">could not save: {error}</p>}
      <p className="dossier-note">{SOURCED_FAIR_COPY}</p>
    </form>
  );
}

/**
 * Probability section of the dossier. Renders the market-implied probability
 * with its labeled basis, the advisory fair range (em dashes when null —
 * never invented from price), the expected edge in cents (YES side),
 * confidence, uncertainty notes, and the human fair-range entry form.
 * Probabilities are advisory inputs; verdicts come only from the
 * deterministic risk engine.
 */
export function ProbabilityPanel({ estimate, editor }: ProbabilityPanelProps): ReactElement {
  const fairRange = [
    formatProbability(estimate.fairProbabilityLow),
    formatProbability(estimate.fairProbabilityMid),
    formatProbability(estimate.fairProbabilityHigh),
  ].join(' · ');

  return (
    <div className="dossier-section">
      <span className="label">03 Research / Predict · probability (advisory)</span>
      <div className="kv-grid">
        <div className="kv">
          <span className="label">Market-implied</span>
          <span className="v">{formatProbability(estimate.marketImpliedProbability)}</span>
        </div>
        <div className="kv">
          <span className="label">Implied basis</span>
          <span className="v">{BASIS_LABELS[estimate.impliedProbabilityBasis]}</span>
        </div>
        <div className="kv">
          <span className="label">Fair range (low · mid · high)</span>
          <span className="v">{fairRange}</span>
        </div>
        <div className="kv">
          <span className="label">Expected edge (YES side)</span>
          <span className="v">{formatEdgeCents(estimate.expectedEdge)}</span>
        </div>
        <div className="kv">
          <span className="label">Confidence</span>
          <span className="v">{estimate.confidence}</span>
        </div>
      </div>

      {estimate.uncertaintyNotes.length > 0 ? (
        <div>
          <span className="label">Uncertainty notes</span>
          <ul className="dossier-list">
            {estimate.uncertaintyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="dossier-note">{ADVISORY_COPY}</p>

      {editor === null ? null : <FairRangeEditor {...editor} />}
    </div>
  );
}
