import type { ReactElement } from 'react';

import { formatCount } from '@/lib/utils/format';

export interface PipelineRowProps {
  /** Scan pipeline counts from the markets result. */
  counts: {
    scanned: number;
    junkFiltered: number;
    shown: number;
  };
}

/** Stages beyond 01 Scan that are not built in Phase 1. */
const FUTURE_STAGES: readonly string[] = [
  '02 Understand',
  '03 Research / Predict',
  '04 Validate / Risk',
  '05 Paper / Simulate',
  '06 Settle / Learn',
];

/**
 * The V1 pipeline row. Only stage 01 Scan is real in Phase 1; the rest are
 * labeled future phases, and Execute stays cross-hatched and locked.
 */
export function PipelineRow({ counts }: PipelineRowProps): ReactElement {
  return (
    <section className="pipeline" aria-label="V1 pipeline">
      <div className="stage">
        <span className="label">01 Scan</span>
        <span className="count">{formatCount(counts.scanned)}</span>{' '}
        <span className="sub">
          scanned · {formatCount(counts.junkFiltered)} junk filtered ·{' '}
          {formatCount(counts.shown)} shown
        </span>
      </div>
      {FUTURE_STAGES.map((stage) => (
        <div className="stage" key={stage}>
          <span className="label">{stage}</span>
          <span className="count">—</span> <span className="sub">future phase</span>
        </div>
      ))}
      <div className="stage locked-stage">
        <span className="label">Execute</span>
        <span className="count" style={{ color: 'var(--locked)' }}>
          —
        </span>{' '}
        <span className="sub">locked until approved phase</span>
      </div>
    </section>
  );
}
