'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { ResearchBriefRecord } from '@/lib/research-store/types';
import type { ResearchBrief, ResearchStatus } from '@/lib/research/types';

import type { BriefFormPayload, ResearchActions } from './researchActions';

/** Editor wiring: the persisted brief plus the save callback. Null hides the editor. */
export interface BriefEditorProps {
  /** Latest persisted manual brief, or null when none exists yet. */
  persistedBrief: ResearchBriefRecord | null;
  /** Server-computed count of currently accepted sources. */
  acceptedSourceCount: number;
  /** Persists the manual brief (POST; every save adds an audit row). */
  onSaveBrief: ResearchActions['saveBrief'];
}

export interface ResearchBriefPanelProps {
  /** Derived engine brief for the selected market (read-only, advisory). */
  brief: ResearchBrief;
  /** Manual-brief editor wiring, or null while persisted research is unavailable. */
  editor: BriefEditorProps | null;
}

/** Display labels for each derived research lifecycle state. */
const STATUS_LABELS: Record<ResearchStatus, string> = {
  not_run: 'research not run',
  sourced: 'sourced',
  fixture: 'fixture — synthetic test data',
  unavailable: 'research unavailable',
};

/** Display labels for the persisted manual-brief states. Human-typed, never AI research. */
const PERSISTED_STATE_LABELS: Record<ResearchBriefRecord['state'], string> = {
  not_run: 'not run',
  insufficient_sources: 'insufficient sources',
  draft: 'manual draft',
  human_reviewed: 'human reviewed',
};

const NOT_RUN_COPY = 'Research not run yet. No source = low confidence = SKIP.';
const INSUFFICIENT_COPY =
  'Research is incomplete. Add and accept sources before assigning a fair probability.';

/** Editable manual-brief field descriptors (all human-typed free text). */
const BRIEF_FIELDS: ReadonlyArray<{
  key: keyof Omit<BriefFormPayload, 'state' | 'confidence'>;
  label: string;
}> = [
  { key: 'summary', label: 'summary' },
  { key: 'yesCase', label: 'YES case' },
  { key: 'noCase', label: 'NO case' },
  { key: 'keyEvidence', label: 'key evidence' },
  { key: 'uncertainties', label: 'uncertainties' },
  { key: 'missingInfo', label: 'missing info' },
];

/** Initial form values, prefilled from the latest persisted brief when present. */
function initialForm(persisted: ResearchBriefRecord | null): BriefFormPayload {
  return {
    state: persisted?.state === 'human_reviewed' ? 'human_reviewed' : 'draft',
    summary: persisted?.summary ?? '',
    yesCase: persisted?.yesCase ?? '',
    noCase: persisted?.noCase ?? '',
    keyEvidence: persisted?.keyEvidence ?? '',
    uncertainties: persisted?.uncertainties ?? '',
    missingInfo: persisted?.missingInfo ?? '',
    confidence: persisted?.confidence ?? 'low',
  };
}

/** Manual-brief editor form (human-typed research notes only). */
function BriefEditor({
  persistedBrief,
  acceptedSourceCount,
  onSaveBrief,
}: BriefEditorProps): ReactElement {
  const [form, setForm] = useState<BriefFormPayload>(() => initialForm(persistedBrief));
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const persistedState = persistedBrief?.state ?? 'not_run';

  const setField = <K extends keyof BriefFormPayload>(
    field: K,
    value: BriefFormPayload[K],
  ): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(await onSaveBrief(form));
    setBusy(false);
  };

  return (
    <form
      className="memo-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <span className="label">Manual brief (human-typed)</span>
      <div className="flag-row">
        <span className="chip neutral">brief state: {PERSISTED_STATE_LABELS[persistedState]}</span>
        <span className="chip neutral">accepted sources: {acceptedSourceCount}</span>
      </div>
      {persistedState === 'insufficient_sources' || acceptedSourceCount === 0 ? (
        <p className="dossier-warning">{INSUFFICIENT_COPY}</p>
      ) : null}

      {BRIEF_FIELDS.map((field) => (
        <div className="field-row" key={field.key}>
          <label className="label" htmlFor={`brief-${field.key}`}>
            {field.label}
          </label>
          <textarea
            id={`brief-${field.key}`}
            className="memo-textarea"
            rows={2}
            value={form[field.key]}
            onChange={(event) => setField(field.key, event.target.value)}
          />
        </div>
      ))}

      <div className="field-grid">
        <div className="field-row">
          <label className="label" htmlFor="brief-state">
            save as
          </label>
          <select
            id="brief-state"
            className="memo-select"
            value={form.state}
            onChange={(event) =>
              setField('state', event.target.value as BriefFormPayload['state'])
            }
          >
            <option value="draft">manual draft</option>
            <option value="human_reviewed">human reviewed</option>
          </select>
        </div>
        <div className="field-row">
          <label className="label" htmlFor="brief-confidence">
            confidence
          </label>
          <select
            id="brief-confidence"
            className="memo-select"
            value={form.confidence}
            onChange={(event) =>
              setField('confidence', event.target.value as BriefFormPayload['confidence'])
            }
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="refresh-btn" disabled={busy}>
          {busy ? 'saving…' : 'save manual brief'}
        </button>
      </div>
      {error === null ? null : <p className="form-error">could not save: {error}</p>}
      <p className="dossier-note">
        Human-typed notes only. The brief informs research; it never approves anything.
      </p>
    </form>
  );
}

/**
 * Stage 03 Research / Predict section of the dossier. Renders the advisory
 * derived brief — status, confidence, evidence summary, cited sources (or
 * the honest no-source warning), and counterarguments — followed by the
 * persisted manual-brief editor. Research is advisory only and human-typed
 * content is never labeled AI research; it never carries verdict authority.
 */
export function ResearchBriefPanel({ brief, editor }: ResearchBriefPanelProps): ReactElement {
  return (
    <div className="dossier-section">
      <span className="label">03 Research / Predict · research brief (advisory)</span>
      <div className="flag-row">
        <span className="chip neutral">{STATUS_LABELS[brief.status]}</span>
        <span className="chip neutral">confidence: {brief.confidence}</span>
      </div>

      <p className="dossier-summary">{brief.evidenceSummary}</p>

      {brief.sources.length === 0 ? (
        <p className="dossier-warning">
          no sources — {brief.noSourceReason ?? 'no usable evidence was gathered'}
        </p>
      ) : (
        <div>
          <span className="label">Sources</span>
          <ul className="dossier-list">
            {brief.sources.map((source) => (
              <li key={source.id}>
                {source.title}
                {source.publisher === undefined ? '' : ` (${source.publisher})`} —{' '}
                <span className="mono">{source.url}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.counterarguments.length > 0 ? (
        <div>
          <span className="label">Counterarguments</span>
          <ul className="dossier-list">
            {brief.counterarguments.map((argument) => (
              <li key={argument}>{argument}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.status === 'not_run' ? <p className="dossier-warning">{NOT_RUN_COPY}</p> : null}

      {editor === null ? null : <BriefEditor {...editor} />}
    </div>
  );
}
