import type { ReactElement } from 'react';

import type { ContractUnderstanding } from '@/lib/understanding/types';
import { formatDateTime } from '@/lib/utils/format';

export interface ContractUnderstandingPanelProps {
  /** Deterministic contract reading for the selected market. */
  understanding: ContractUnderstanding;
}

const NOT_PROVIDED = 'not provided';
const SETTLEMENT_NOT_PROVIDED =
  'not provided — public market payload does not include settlement source';

/**
 * Stage 02 Understand section of the dossier. Renders the deterministic
 * contract reading: summary, YES/NO conditions, listed rules, resolution
 * criteria, settlement source with its status, important dates, and the
 * honest ambiguity/missing-field record. Nothing here is invented — missing
 * inputs are labeled as not provided.
 */
export function ContractUnderstandingPanel({
  understanding,
}: ContractUnderstandingPanelProps): ReactElement {
  return (
    <div className="dossier-section">
      <span className="label">02 Understand · contract reading (deterministic)</span>
      <p className="dossier-summary">{understanding.summary}</p>

      <div className="rule-block">
        <span className="label">Yes condition</span>
        {understanding.yesCondition}
      </div>
      <div className="rule-block">
        <span className="label">No condition</span>
        {understanding.noCondition}
      </div>
      <div className="rule-block">
        <span className="label">Rules (as listed)</span>
        {understanding.rulesText ?? NOT_PROVIDED}
      </div>
      <div className="rule-block">
        <span className="label">Resolution criteria</span>
        {understanding.resolutionCriteria ?? NOT_PROVIDED}
      </div>
      <div className="rule-block">
        <span className="label">Settlement source</span>
        {understanding.settlementSource ?? SETTLEMENT_NOT_PROVIDED}{' '}
        <span className="chip neutral">status: {understanding.settlementSourceStatus}</span>
      </div>

      {understanding.importantDates.length > 0 ? (
        <div>
          <span className="label">Important dates</span>
          <ul className="dossier-list">
            {understanding.importantDates.map((date) => (
              <li key={date.label}>
                <span className="mono">{formatDateTime(date.value)}</span> — {date.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flag-row">
        <span className="chip neutral">clarity: {understanding.resolutionClarity}</span>
        {understanding.ambiguityFlags.map((flag) => (
          <span className="chip neutral" key={`ambiguity-${flag}`}>
            ambiguity: {flag}
          </span>
        ))}
        {understanding.missingFields.map((field) => (
          <span className="chip neutral" key={`missing-${field}`}>
            missing: {field}
          </span>
        ))}
      </div>

      {understanding.interpretationNotes.length > 0 ? (
        <ul className="dossier-list">
          {understanding.interpretationNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
