'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type { MarketSourceRecord } from '@/lib/research-store/types';
import {
  SOURCE_CREDIBILITIES,
  SOURCE_KINDS,
  SOURCE_STATUSES,
} from '@/lib/research-store/types';
import type {
  AddSourcePayload,
  ResearchActions,
  SourceReviewPatch,
} from './researchActions';

export interface SourcesPanelProps {
  /** All persisted source records for the selected market. */
  sources: readonly MarketSourceRecord[];
  /** Adds a new source record (POST). */
  onAddSource: ResearchActions['addSource'];
  /** Updates the review status/credibility of one source (PATCH). */
  onUpdateSource: ResearchActions['updateSource'];
}

const EMPTY_ACCEPTED_COPY = 'No accepted sources yet. No source = low confidence = SKIP.';

const EMPTY_FORM: AddSourcePayload = {
  kind: 'supporting_source',
  title: '',
  url: '',
  publisher: '',
  excerpt: '',
  notes: '',
  credibility: 'unknown',
};

/** Extracts a display domain from a recorded URL, or null. */
function domainOf(url: string | null): string | null {
  if (url === null || url.trim() === '') {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** One persisted source row with its human review controls. */
function SourceItem({
  source,
  busy,
  onUpdateSource,
  onError,
}: {
  source: MarketSourceRecord;
  busy: boolean;
  onUpdateSource: SourcesPanelProps['onUpdateSource'];
  onError: (message: string | null) => void;
}): ReactElement {
  const domain = domainOf(source.url);

  const review = async (patch: SourceReviewPatch): Promise<void> => {
    onError(await onUpdateSource(source.id, patch));
  };

  return (
    <li className="source-item">
      <div className="flag-row">
        <span className="chip neutral">{source.kind.replaceAll('_', ' ')}</span>
        <span className="chip neutral">credibility: {source.credibility}</span>
        <span className="chip neutral">status: {source.status}</span>
        <span className="chip neutral">added by: {source.addedBy}</span>
      </div>
      <p className="source-title">
        {source.title}
        {domain === null ? '' : ' — '}
        {domain === null ? null : <span className="mono">{domain}</span>}
      </p>
      {source.excerpt === null ? null : <p className="source-text">excerpt: {source.excerpt}</p>}
      {source.notes === null ? null : <p className="source-text">notes: {source.notes}</p>}
      <div className="source-controls">
        <label className="label" htmlFor={`source-status-${source.id}`}>
          review status
        </label>
        <select
          id={`source-status-${source.id}`}
          className="memo-select"
          value={source.status}
          disabled={busy}
          onChange={(event) =>
            void review({ status: event.target.value as MarketSourceRecord['status'] })
          }
        >
          {SOURCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <label className="label" htmlFor={`source-credibility-${source.id}`}>
          credibility
        </label>
        <select
          id={`source-credibility-${source.id}`}
          className="memo-select"
          value={source.credibility}
          disabled={busy}
          onChange={(event) =>
            void review({ credibility: event.target.value as MarketSourceRecord['credibility'] })
          }
        >
          {SOURCE_CREDIBILITIES.map((credibility) => (
            <option key={credibility} value={credibility}>
              {credibility}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

/**
 * Stage 03 Research / Predict — persisted source records for the selected
 * market. Shows the accepted/draft/rejected counts, the full source list
 * with human review controls, and the add-source form. Sources are research
 * input only: acceptance feeds the deterministic risk engine as data and
 * never approves anything by itself.
 */
export function SourcesPanel({
  sources,
  onAddSource,
  onUpdateSource,
}: SourcesPanelProps): ReactElement {
  const [form, setForm] = useState<AddSourcePayload>(EMPTY_FORM);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedCount = sources.filter((source) => source.status === 'accepted').length;
  const draftCount = sources.filter((source) => source.status === 'draft').length;
  const rejectedCount = sources.filter((source) => source.status === 'rejected').length;

  const setField = <K extends keyof AddSourcePayload>(
    field: K,
    value: AddSourcePayload[K],
  ): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    const outcome = await onAddSource(form);
    setError(outcome);
    if (outcome === null) {
      setForm(EMPTY_FORM);
    }
    setBusy(false);
  };

  const updateWithBusy = async (sourceId: string, patch: SourceReviewPatch): Promise<string | null> => {
    setBusy(true);
    const outcome = await onUpdateSource(sourceId, patch);
    setBusy(false);
    return outcome;
  };

  return (
    <div className="dossier-section">
      <span className="label">03 Research / Predict · sources (research input)</span>
      <div className="flag-row">
        <span className="chip neutral">accepted: {acceptedCount}</span>
        <span className="chip neutral">draft: {draftCount}</span>
        <span className="chip neutral">rejected: {rejectedCount}</span>
      </div>

      {acceptedCount === 0 ? <p className="dossier-warning">{EMPTY_ACCEPTED_COPY}</p> : null}

      {sources.length > 0 ? (
        <ul className="source-list">
          {sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              busy={busy}
              onUpdateSource={updateWithBusy}
              onError={setError}
            />
          ))}
        </ul>
      ) : null}

      <form
        className="memo-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="label">Add source (human-entered)</span>
        <div className="field-grid">
          <div className="field-row">
            <label className="label" htmlFor="source-title">
              title (required)
            </label>
            <input
              id="source-title"
              className="memo-input"
              type="text"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="source-url">
              url (http/https, optional)
            </label>
            <input
              id="source-url"
              className="memo-input"
              type="text"
              value={form.url}
              onChange={(event) => setField('url', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="source-publisher">
              publisher (optional)
            </label>
            <input
              id="source-publisher"
              className="memo-input"
              type="text"
              value={form.publisher}
              onChange={(event) => setField('publisher', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="source-kind">
              kind
            </label>
            <select
              id="source-kind"
              className="memo-select"
              value={form.kind}
              onChange={(event) => setField('kind', event.target.value as AddSourcePayload['kind'])}
            >
              {SOURCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label className="label" htmlFor="source-credibility-new">
              credibility
            </label>
            <select
              id="source-credibility-new"
              className="memo-select"
              value={form.credibility}
              onChange={(event) =>
                setField('credibility', event.target.value as AddSourcePayload['credibility'])
              }
            >
              {SOURCE_CREDIBILITIES.map((credibility) => (
                <option key={credibility} value={credibility}>
                  {credibility}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <label className="label" htmlFor="source-excerpt">
            excerpt (optional)
          </label>
          <textarea
            id="source-excerpt"
            className="memo-textarea"
            rows={2}
            value={form.excerpt}
            onChange={(event) => setField('excerpt', event.target.value)}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="source-notes">
            notes (optional)
          </label>
          <textarea
            id="source-notes"
            className="memo-textarea"
            rows={2}
            value={form.notes}
            onChange={(event) => setField('notes', event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="refresh-btn" disabled={busy || form.title.trim() === ''}>
            {busy ? 'saving…' : 'add source'}
          </button>
        </div>
        {error === null ? null : <p className="form-error">could not save: {error}</p>}
      </form>

      <p className="dossier-note">
        New sources start as drafts; only accepted sources count toward research.
      </p>
    </div>
  );
}
