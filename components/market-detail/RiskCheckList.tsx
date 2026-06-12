import type { ReactElement } from 'react';

import type { RiskCheckResult, RiskCheckStatus } from '@/lib/risk/types';

export interface RiskCheckListProps {
  /** Every deterministic check that ran, in engine order. */
  checks: RiskCheckResult[];
}

interface StatusMark {
  text: string;
  className: string;
}

/** Display marks for each check outcome (colors come from existing tokens). */
const STATUS_MARKS: Record<RiskCheckStatus, StatusMark> = {
  pass: { text: 'PASS ✓', className: 'check-mark pass' },
  fail: { text: 'FAIL ✗', className: 'check-mark fail' },
  warn: { text: 'WARN', className: 'check-mark warn' },
  not_applicable: { text: 'N/A', className: 'check-mark na' },
};

/**
 * Read-only list of deterministic risk check results: mono check id,
 * plain-English reason, and a status mark (PASS sage, FAIL dried-ink red,
 * WARN restrained ochre, N/A muted). Purely informational — no actions.
 */
export function RiskCheckList({ checks }: RiskCheckListProps): ReactElement {
  return (
    <ul className="check-list">
      {checks.map((check) => {
        const mark = STATUS_MARKS[check.status];
        return (
          <li className="check-row" key={check.id}>
            <span className="check-id">{check.id}</span>
            <span className="check-reason">{check.reason}</span>
            <span className={mark.className}>{mark.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
