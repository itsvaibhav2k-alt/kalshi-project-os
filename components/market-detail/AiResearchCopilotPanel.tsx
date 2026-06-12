'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import type {
  AiResearchDraftRecord,
  AiResearchDraftType,
} from '@/lib/research-store/types';
import { formatDateTime } from '@/lib/utils/format';

export interface AiResearchCopilotPanelProps {
  /** Persisted AI drafts for this market (newest first), or null while loading. */
  aiDrafts: readonly AiResearchDraftRecord[] | null;
  /** Plain-English ai-drafts API error, or null when none. */
  aiDraftsError: string | null;
  /** Generates one advisory draft (POST; the server composes the inputs). */
  onGenerateDraft: (
    draftType: AiResearchDraftType,
    userFocus: string | null,
  ) => Promise<string | null>;
  /** Archives one draft (PATCH; archived rows persist as an audit trail). */
  onArchiveDraft: (draftId: string) => Promise<string | null>;
}

const ADVISORY_COPY =
  'AI drafts are advisory only. They do not count toward risk until a human reviews and enters research through the normal source, brief, probability, thesis, or settlement panels.';

const EMPTY_STATE_COPY =
  'Generate draft research support for this market. The AI can critique, organize, and suggest what to verify, but it cannot approve a paper decision.';

const CARD_WARNING_COPY =
  'This draft does not satisfy any risk check. Review it manually before using it in research.';

const FOCUS_MAX_LENGTH = 500;

/** The six generate controls, each mapped to one advisory draft kind. */
const GENERATE_BUTTONS: ReadonlyArray<{
  draftType: AiResearchDraftType;
  label: string;
}> = [
  { draftType: 'research_questions', label: 'Generate research questions' },
  { draftType: 'source_checklist', label: 'Generate source checklist' },
  { draftType: 'brief_draft', label: 'Draft research brief' },
  { draftType: 'thesis_critique', label: 'Critique thesis' },
  { draftType: 'missing_info', label: 'Find missing info' },
  { draftType: 'skeptical_countercase', label: 'Generate skeptical countercase' },
];

/** Human-readable kind label, e.g. 'thesis_critique' → 'thesis critique'. */
function humanReadableKind(draftType: AiResearchDraftType): string {
  return draftType.replaceAll('_', ' ');
}

/** One persisted AI draft card; archived cards stay listed but render muted. */
function AiDraftCard({
  draft,
  busy,
  onArchive,
}: {
  draft: AiResearchDraftRecord;
  busy: boolean;
  onArchive: (draftId: string) => void;
}): ReactElement {
  const archived = draft.status === 'archived';
  return (
    <li className="source-item">
      <div className="flag-row">
        <span className="chip neutral">AI draft · advisory only · outside risk path</span>
        <span className={archived ? 'chip skip' : 'chip neutral'}>status: {draft.status}</span>
      </div>
      <p className="source-text">
        ai draft · {humanReadableKind(draft.draftType)} · {draft.provider} / {draft.model}
        {' · '}
        {formatDateTime(draft.createdAt)}
      </p>
      {draft.userFocus === null ? null : (
        <p className="source-text">focus: {draft.userFocus}</p>
      )}
      <p className="dossier-warning">{CARD_WARNING_COPY}</p>
      <div
        className={archived ? 'source-text' : undefined}
        style={{ whiteSpace: 'pre-wrap' }}
      >
        {draft.outputMarkdown}
      </div>
      {draft.status === 'draft' ? (
        <div className="record-actions">
          <button
            type="button"
            className="refresh-btn"
            disabled={busy}
            onClick={() => onArchive(draft.id)}
          >
            archive draft
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * AI Research Copilot — draft-only advisory panel for the selected market.
 * Generates draft artifacts (questions, checklists, critiques) that sit
 * entirely outside the deterministic risk path: drafts never satisfy a risk
 * check, never promote sources, briefs, theses, or settlement records, and
 * never create paper entries. The draft body renders as plain text only —
 * never parsed as markdown or HTML. The only controls are generate and
 * archive; there is no approve, promote, or copy-to-research action.
 */
export function AiResearchCopilotPanel({
  aiDrafts,
  aiDraftsError,
  onGenerateDraft,
  onArchiveDraft,
}: AiResearchCopilotPanelProps): ReactElement {
  const [focus, setFocus] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (draftType: AiResearchDraftType): Promise<void> => {
    setBusy(true);
    const trimmedFocus = focus.trim();
    setError(await onGenerateDraft(draftType, trimmedFocus === '' ? null : trimmedFocus));
    setBusy(false);
  };

  const archive = async (draftId: string): Promise<void> => {
    setBusy(true);
    setError(await onArchiveDraft(draftId));
    setBusy(false);
  };

  return (
    <div className="dossier-section">
      <span className="label">AI Research Copilot — Draft Only</span>
      <p className="dossier-note">{ADVISORY_COPY}</p>

      <div className="memo-form">
        <div className="field-row">
          <label className="label" htmlFor="ai-draft-focus">
            Optional focus (what should the analyst concentrate on?)
          </label>
          <input
            id="ai-draft-focus"
            className="memo-input"
            type="text"
            maxLength={FOCUS_MAX_LENGTH}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          />
        </div>
        <div className="form-actions">
          {GENERATE_BUTTONS.map(({ draftType, label }) => (
            <button
              key={draftType}
              type="button"
              className="refresh-btn"
              disabled={busy}
              onClick={() => void generate(draftType)}
            >
              {label}
            </button>
          ))}
        </div>
        {error === null ? null : <p className="form-error">could not save: {error}</p>}
      </div>

      {aiDrafts === null ? (
        aiDraftsError === null ? (
          <p className="loading-line">loading AI drafts…</p>
        ) : (
          <p className="dossier-warning">AI drafts unavailable: {aiDraftsError}</p>
        )
      ) : aiDrafts.length === 0 ? (
        <p className="dossier-note">{EMPTY_STATE_COPY}</p>
      ) : (
        <ul className="source-list">
          {aiDrafts.map((draft) => (
            <AiDraftCard
              key={draft.id}
              draft={draft}
              busy={busy}
              onArchive={(draftId) => void archive(draftId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
