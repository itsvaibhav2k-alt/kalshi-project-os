import type { ReactElement } from 'react';

import type { EvaluationSummary } from '@/lib/dossier/types';
import { formatCount } from '@/lib/utils/format';

export interface PipelineRowProps {
  /** Scan pipeline counts from the markets result. */
  counts: {
    scanned: number;
    junkFiltered: number;
    shown: number;
  };
  /** Aggregate Phase 2 evaluation counts across the scanned markets. */
  summary: EvaluationSummary;
}

/** Stages beyond 04 that are not built yet. */
const FUTURE_STAGES: readonly string[] = ['05 Paper / Simulate', '06 Settle / Learn'];

/**
 * The V1 pipeline row. Stages 01-04 carry real counts: scan, deterministic
 * understanding, manual research backed by accepted persisted sources
 * (implied probability is price math and never counts as research), and risk
 * evaluation with the verdict breakdown. Stages 05-06 stay future phases,
 * and Execute stays cross-hatched and locked.
 */
export function PipelineRow({ counts, summary }: PipelineRowProps): ReactElement {
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
      <div className="stage">
        <span className="label">02 Understand</span>
        <span className="count">{formatCount(summary.understood)}</span>{' '}
        <span className="sub">understood · deterministic</span>
      </div>
      <div className="stage">
        <span className="label">03 Research / Predict</span>
        <span className="count">{formatCount(summary.researchSourced)}</span>{' '}
        <span className="sub">with accepted sources · manual research</span>
      </div>
      <div className="stage">
        <span className="label">04 Validate / Risk</span>
        <span className="count">{formatCount(summary.evaluated)}</span>{' '}
        <span className="sub">
          evaluated · skip {formatCount(summary.skip)} · watch {formatCount(summary.watch)} ·
          paper {formatCount(summary.paperTrade)}
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
