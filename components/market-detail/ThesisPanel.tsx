'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { ProbabilityEstimateRecord, ThesisRecord } from '@/lib/research-store/types';

import type { ResearchActions, ThesisFormPayload } from './researchActions';

export interface ThesisPanelProps {
  /** Active persisted thesis for the selected market, or null when none. */
  thesis: ThesisRecord | null;
  /** Server-computed count of currently accepted sources. */
  acceptedSourceCount: number;
  /** Latest persisted fair-probability estimate, or null when none. */
  probabilityEstimate: ProbabilityEstimateRecord | null;
  /** Saves the thesis (create or patch). The server gates readiness. */
  onSaveThesis: ResearchActions['saveThesis'];
}

const READY_COPY =
  'A ready thesis is required before PAPER_TRADE eligibility. It does not approve real trades.';

/** Display labels for the thesis lifecycle states. */
const STATUS_LABELS: Record<ThesisRecord['status'], string> = {
  draft: 'draft',
  ready_for_risk: 'ready for risk',
  archived: 'archived',
};

/** Counts ids in the stored linked-source JSON array, or 0. */
function linkedSourceCount(thesis: ThesisRecord | null): number {
  if (thesis === null || thesis.sourceIdsJson === null) {
    return 0;
  }
  try {
    const parsed: unknown = JSON.parse(thesis.sourceIdsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/** Initial form values, prefilled from the active thesis when present. */
function initialForm(thesis: ThesisRecord | null): Omit<ThesisFormPayload, 'status'> {
  return {
    thesis: thesis?.thesis ?? '',
    whyMispriced: thesis?.whyMispriced ?? '',
    invalidationCriteria: thesis?.invalidationCriteria ?? '',
  };
}

/**
 * Written-thesis section of the dossier. A thesis is the human's written
 * argument — required before any paper trade is eligible. The form saves
 * drafts and can ask for ready-for-risk status; the disabled state of the
 * ready button is cosmetic only, because the server-side readiness checks
 * (linked accepted sources and a matching estimate, validated against
 * current rows) are the real gate. Nothing here approves real trades.
 */
export function ThesisPanel({
  thesis,
  acceptedSourceCount,
  probabilityEstimate,
  onSaveThesis,
}: ThesisPanelProps): ReactElement {
  const [form, setForm] = useState<Omit<ThesisFormPayload, 'status'>>(() => initialForm(thesis));
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const linkedSources = linkedSourceCount(thesis);
  const hasLinkedEstimate = thesis !== null && thesis.probabilityEstimateId !== null;
  const thesisText = form.thesis.trim();

  // Cosmetic precondition hints only — the server re-checks everything.
  const readyBlockedHints: string[] = [];
  if (thesisText === '') {
    readyBlockedHints.push('thesis text is empty');
  }
  if (acceptedSourceCount === 0) {
    readyBlockedHints.push('no accepted sources to link');
  }
  if (probabilityEstimate === null) {
    readyBlockedHints.push('no fair-probability estimate to link');
  }

  const setField = <K extends keyof Omit<ThesisFormPayload, 'status'>>(
    field: K,
    value: string,
  ): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const save = async (status: ThesisFormPayload['status']): Promise<void> => {
    setBusy(true);
    setError(await onSaveThesis({ ...form, status }, thesis?.id ?? null));
    setBusy(false);
  };

  return (
    <div className="dossier-section">
      <span className="label">03 Research / Predict · written thesis (human)</span>
      <div className="flag-row">
        <span className="chip neutral">
          thesis: {thesis === null ? 'none written' : STATUS_LABELS[thesis.status]}
        </span>
        <span className="chip neutral">
          linked sources: {linkedSources} · accepted available: {acceptedSourceCount}
        </span>
        <span className="chip neutral">
          linked estimate: {hasLinkedEstimate ? 'yes' : 'none'}
        </span>
      </div>

      <form
        className="memo-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save('draft');
        }}
      >
        <div className="field-row">
          <label className="label" htmlFor="thesis-text">
            thesis (required)
          </label>
          <textarea
            id="thesis-text"
            className="memo-textarea"
            rows={3}
            value={form.thesis}
            onChange={(event) => setField('thesis', event.target.value)}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="thesis-why-mispriced">
            why mispriced
          </label>
          <textarea
            id="thesis-why-mispriced"
            className="memo-textarea"
            rows={2}
            value={form.whyMispriced}
            onChange={(event) => setField('whyMispriced', event.target.value)}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="thesis-invalidation">
            invalidation criteria
          </label>
          <textarea
            id="thesis-invalidation"
            className="memo-textarea"
            rows={2}
            value={form.invalidationCriteria}
            onChange={(event) => setField('invalidationCriteria', event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="refresh-btn" disabled={busy || thesisText === ''}>
            {busy ? 'saving…' : 'save draft'}
          </button>
          <button
            type="button"
            className="refresh-btn"
            disabled={busy || readyBlockedHints.length > 0}
            onClick={() => void save('ready_for_risk')}
          >
            mark ready for risk
          </button>
        </div>
        {readyBlockedHints.length > 0 ? (
          <p className="dossier-note">ready blocked: {readyBlockedHints.join(' · ')}</p>
        ) : null}
        {error === null ? null : <p className="form-error">could not save: {error}</p>}
      </form>

      <p className="dossier-note">{READY_COPY}</p>
    </div>
  );
}
