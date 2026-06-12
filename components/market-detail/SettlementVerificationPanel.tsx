'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type {
  SettlementAuthorityType,
  SettlementSourceRecord,
  VerifiedSettlementSummary,
} from '@/lib/research-store/types';
import { SETTLEMENT_AUTHORITY_TYPES } from '@/lib/research-store/types';
import type { SettlementSourceStatus } from '@/lib/understanding/types';

import type {
  ResearchActions,
  SettlementSourcePayload,
} from './researchActions';

export interface SettlementVerificationPanelProps {
  /** Settlement-source status derived from the public market payload + overlay. */
  payloadStatus: SettlementSourceStatus;
  /** All persisted settlement-source records for the selected market. */
  settlementSources: readonly SettlementSourceRecord[];
  /** Active human-verified record (latest verified row), or null when none. */
  verifiedSettlementSource: VerifiedSettlementSummary | null;
  /** Adds a new settlement-source record (POST). */
  onSaveSettlementSource: ResearchActions['saveSettlementSource'];
  /** Reviews/edits one settlement-source record (PATCH). */
  onUpdateSettlementSource: ResearchActions['updateSettlementSource'];
}

const ROLE_COPY =
  'Research sources do not verify settlement. This record is the human-verified resolution authority used by the deterministic risk check.';

const EMPTY_VERIFIED_COPY =
  'No verified settlement source yet. Without a verified resolution authority, the deterministic risk verdict remains SKIP.';

/** Form values; authorityType '' means "not selected" and maps to null. */
interface SettlementFormState {
  title: string;
  url: string;
  publisher: string;
  authorityType: SettlementAuthorityType | '';
  notes: string;
  verificationRationale: string;
}

const EMPTY_FORM: SettlementFormState = {
  title: '',
  url: '',
  publisher: '',
  authorityType: '',
  notes: '',
  verificationRationale: '',
};

/** Trims one optional text field; empty becomes null for the PATCH body. */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Builds the POST payload from the form (authorityType '' → null). */
function payloadFromForm(
  form: SettlementFormState,
  status: SettlementSourcePayload['status'],
): SettlementSourcePayload {
  return {
    status,
    title: form.title,
    url: form.url,
    publisher: form.publisher,
    authorityType: form.authorityType === '' ? null : form.authorityType,
    notes: form.notes,
    verificationRationale: form.verificationRationale,
  };
}

/** Prefills the form from an existing record for editing. */
function formFromRecord(record: SettlementSourceRecord): SettlementFormState {
  return {
    title: record.title,
    url: record.url ?? '',
    publisher: record.publisher ?? '',
    authorityType: record.authorityType ?? '',
    notes: record.notes ?? '',
    verificationRationale: record.verificationRationale ?? '',
  };
}

/** One persisted settlement-source record with its human review controls. */
function SettlementRecordItem({
  record,
  isActiveVerified,
  busy,
  onReview,
  onEdit,
}: {
  record: SettlementSourceRecord;
  isActiveVerified: boolean;
  busy: boolean;
  onReview: (settlementSourceId: string, status: SettlementSourceRecord['status']) => void;
  onEdit: (record: SettlementSourceRecord) => void;
}): ReactElement {
  return (
    <li className="source-item">
      <div className="flag-row">
        <span className="chip neutral">status: {record.status.replaceAll('_', ' ')}</span>
        <span className="chip neutral">
          authority: {record.authorityType === null ? 'none' : record.authorityType.replaceAll('_', ' ')}
        </span>
        {isActiveVerified ? <span className="chip neutral">active verified record</span> : null}
      </div>
      <p className="source-title">
        {record.title}
        {record.url === null ? null : (
          <>
            {' — '}
            <span className="mono">{record.url}</span>
          </>
        )}
      </p>
      {record.publisher === null ? null : (
        <p className="source-text">publisher: {record.publisher}</p>
      )}
      {record.verificationRationale === null ? null : (
        <p className="source-text">verification rationale: {record.verificationRationale}</p>
      )}
      {record.notes === null ? null : <p className="source-text">notes: {record.notes}</p>}
      <div className="record-actions">
        <button
          type="button"
          className="refresh-btn"
          disabled={busy}
          onClick={() => onEdit(record)}
        >
          edit
        </button>
        <button
          type="button"
          className="refresh-btn"
          disabled={busy || record.status === 'human_verified'}
          onClick={() => onReview(record.id, 'human_verified')}
        >
          mark human verified
        </button>
        <button
          type="button"
          className="refresh-btn"
          disabled={busy || record.status === 'rejected'}
          onClick={() => onReview(record.id, 'rejected')}
        >
          reject
        </button>
      </div>
    </li>
  );
}

/**
 * Stage 02 Understand — settlement verification record for the selected
 * market. Shows the settlement-source status the risk check sees, the full
 * audit trail of local verification records, and the add/edit form. The
 * record is plain data: marking one human-verified only feeds the
 * deterministic settlement-source check, and the risk engine alone issues
 * verdicts. Drafts and rejected records never count; nothing is deleted.
 */
export function SettlementVerificationPanel({
  payloadStatus,
  settlementSources,
  verifiedSettlementSource,
  onSaveSettlementSource,
  onUpdateSettlementSource,
}: SettlementVerificationPanelProps): ReactElement {
  const [form, setForm] = useState<SettlementFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cosmetic precondition hints only — the server re-checks everything.
  const verifyBlockedHints: string[] = [];
  if (form.title.trim() === '') {
    verifyBlockedHints.push('title is empty');
  }
  if (form.url.trim() === '') {
    verifyBlockedHints.push('url is empty');
  }
  if (form.authorityType === '') {
    verifyBlockedHints.push('no authority type selected');
  }
  if (form.verificationRationale.trim() === '') {
    verifyBlockedHints.push('verification rationale is empty');
  }

  const setField = <K extends keyof SettlementFormState>(
    field: K,
    value: SettlementFormState[K],
  ): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const resetForm = (): void => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  };

  const save = async (status: 'draft' | 'human_verified'): Promise<void> => {
    setBusy(true);
    const outcome =
      editingId === null
        ? await onSaveSettlementSource(payloadFromForm(form, status))
        : await onUpdateSettlementSource(editingId, {
            status,
            title: form.title.trim(),
            url: textOrNull(form.url),
            publisher: textOrNull(form.publisher),
            authorityType: form.authorityType === '' ? null : form.authorityType,
            notes: textOrNull(form.notes),
            verificationRationale: textOrNull(form.verificationRationale),
          });
    setError(outcome);
    if (outcome === null) {
      setForm(EMPTY_FORM);
      setEditingId(null);
    }
    setBusy(false);
  };

  const review = async (
    settlementSourceId: string,
    status: SettlementSourceRecord['status'],
  ): Promise<void> => {
    setBusy(true);
    setError(await onUpdateSettlementSource(settlementSourceId, { status }));
    setBusy(false);
  };

  const beginEdit = (record: SettlementSourceRecord): void => {
    setEditingId(record.id);
    setForm(formFromRecord(record));
    setError(null);
  };

  return (
    <div className="dossier-section">
      <span className="label">02 Understand · settlement verification (human record)</span>
      <div className="flag-row">
        <span className="chip neutral">settlement-source status: {payloadStatus}</span>
        <span className="chip neutral">
          verified record:{' '}
          {verifiedSettlementSource === null ? 'none' : verifiedSettlementSource.title}
        </span>
      </div>

      {verifiedSettlementSource === null ? (
        <p className="dossier-warning">{EMPTY_VERIFIED_COPY}</p>
      ) : null}

      {settlementSources.length > 0 ? (
        <ul className="source-list">
          {settlementSources.map((record) => (
            <SettlementRecordItem
              key={record.id}
              record={record}
              isActiveVerified={verifiedSettlementSource?.id === record.id}
              busy={busy}
              onReview={(settlementSourceId, status) => void review(settlementSourceId, status)}
              onEdit={beginEdit}
            />
          ))}
        </ul>
      ) : null}

      <form
        className="memo-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save('draft');
        }}
      >
        <span className="label">
          {editingId === null
            ? 'Add settlement-source record (human-entered)'
            : 'Edit settlement-source record (human-entered)'}
        </span>
        <div className="field-grid">
          <div className="field-row">
            <label className="label" htmlFor="settlement-title">
              title (required)
            </label>
            <input
              id="settlement-title"
              className="memo-input"
              type="text"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="settlement-url">
              url (http/https, required to verify)
            </label>
            <input
              id="settlement-url"
              className="memo-input"
              type="text"
              value={form.url}
              onChange={(event) => setField('url', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="settlement-publisher">
              publisher (optional)
            </label>
            <input
              id="settlement-publisher"
              className="memo-input"
              type="text"
              value={form.publisher}
              onChange={(event) => setField('publisher', event.target.value)}
            />
          </div>
          <div className="field-row">
            <label className="label" htmlFor="settlement-authority-type">
              authority type (required to verify)
            </label>
            <select
              id="settlement-authority-type"
              className="memo-select"
              value={form.authorityType}
              onChange={(event) =>
                setField(
                  'authorityType',
                  event.target.value as SettlementFormState['authorityType'],
                )
              }
            >
              <option value="">not selected</option>
              {SETTLEMENT_AUTHORITY_TYPES.map((authorityType) => (
                <option key={authorityType} value={authorityType}>
                  {authorityType.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <label className="label" htmlFor="settlement-rationale">
            verification rationale (required to verify)
          </label>
          <textarea
            id="settlement-rationale"
            className="memo-textarea"
            rows={2}
            value={form.verificationRationale}
            onChange={(event) => setField('verificationRationale', event.target.value)}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="settlement-notes">
            notes (optional)
          </label>
          <textarea
            id="settlement-notes"
            className="memo-textarea"
            rows={2}
            value={form.notes}
            onChange={(event) => setField('notes', event.target.value)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="refresh-btn" disabled={busy || form.title.trim() === ''}>
            {busy ? 'saving…' : 'save draft'}
          </button>
          <button
            type="button"
            className="refresh-btn"
            disabled={busy || verifyBlockedHints.length > 0}
            onClick={() => void save('human_verified')}
          >
            mark human verified
          </button>
          {editingId === null ? null : (
            <button type="button" className="refresh-btn" disabled={busy} onClick={resetForm}>
              cancel edit
            </button>
          )}
        </div>
        {verifyBlockedHints.length > 0 ? (
          <p className="dossier-note">verification blocked: {verifyBlockedHints.join(' · ')}</p>
        ) : null}
        {error === null ? null : <p className="form-error">could not save: {error}</p>}
      </form>

      <p className="dossier-note">{ROLE_COPY}</p>
    </div>
  );
}
