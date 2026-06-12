import type { ReactElement } from 'react';

import type { ResearchBrief, ResearchStatus } from '@/lib/research/types';

export interface ResearchBriefPanelProps {
  /** Advisory research brief for the selected market. */
  brief: ResearchBrief;
}

/** Display labels for each research lifecycle state. */
const STATUS_LABELS: Record<ResearchStatus, string> = {
  not_run: 'research not run',
  sourced: 'sourced',
  fixture: 'fixture — synthetic test data',
  unavailable: 'research unavailable',
};

const NOT_RUN_COPY = 'Research not run yet. No source = low confidence = SKIP.';

/**
 * Stage 03 Research / Predict section of the dossier. Renders the advisory
 * research brief: status, confidence, evidence summary, cited sources (or
 * the honest no-source warning), and counterarguments. Research is advisory
 * only — it never carries verdict authority.
 */
export function ResearchBriefPanel({ brief }: ResearchBriefPanelProps): ReactElement {
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
    </div>
  );
}
