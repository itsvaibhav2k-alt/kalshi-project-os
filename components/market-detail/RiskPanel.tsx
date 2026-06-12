import type { ReactElement } from 'react';

import type { RiskEvaluation, RiskVerdict } from '@/lib/risk/types';
import { formatDateTime } from '@/lib/utils/format';

import { RiskCheckList } from './RiskCheckList';

export interface RiskPanelProps {
  /** Deterministic risk evaluation for the selected market. */
  evaluation: RiskEvaluation;
}

/** Verdict chip classes from the approved mockup palette (all muted). */
const VERDICT_CLASSES: Record<RiskVerdict, string> = {
  SKIP: 'chip verdict-badge skip',
  WATCH: 'chip verdict-badge watch',
  PAPER_TRADE: 'chip verdict-badge paper-trade',
};

const DETERMINISTIC_COPY = 'Rules permit; the LLM does not approve. Deterministic checks only.';
const ELIGIBILITY_COPY =
  'PAPER_TRADE is eligibility only — the paper journal arrives in a later phase.';

/**
 * Stage 04 Validate / Risk section of the dossier. Renders the deterministic
 * verdict as a large muted chip (SKIP calm slate, WATCH muted teal,
 * PAPER_TRADE restrained ochre — eligibility only, never reward-styled),
 * the reasons from failed or warned checks, the full check list, and the
 * Training Wheels mode/lock lines. Verdicts come only from the risk engine.
 */
export function RiskPanel({ evaluation }: RiskPanelProps): ReactElement {
  // realTradingLocked is typed as literal `true`; derive the line from the
  // value anyway so the UI never asserts more than the evaluation does.
  const lockLine: string = evaluation.realTradingLocked
    ? 'real trading locked'
    : 'real trading lock state unknown';

  return (
    <div className="dossier-section">
      <span className="label">04 Validate / Risk · verdict (deterministic)</span>
      <div className="verdict-row">
        <span className={VERDICT_CLASSES[evaluation.verdict]}>{evaluation.verdict}</span>
        {evaluation.verdict === 'PAPER_TRADE' ? (
          <span className="verdict-why">eligibility only — no trade is placed</span>
        ) : null}
      </div>

      {evaluation.reasons.length > 0 ? (
        <div>
          <span className="label">Reasons</span>
          <ol className="dossier-list">
            {evaluation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <RiskCheckList checks={evaluation.checks} />

      <p className="dossier-note">{DETERMINISTIC_COPY}</p>
      <p className="dossier-note">{ELIGIBILITY_COPY}</p>
      <p className="dossier-note">
        mode: {evaluation.mode} (paper only) · {lockLine} · evaluated{' '}
        {formatDateTime(evaluation.evaluatedAt)}
      </p>
    </div>
  );
}
