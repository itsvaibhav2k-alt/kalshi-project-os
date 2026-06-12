import type { ReactElement } from 'react';

import type { ImpliedProbabilityBasis, ProbabilityEstimate } from '@/lib/probability/types';
import { formatProbability } from '@/lib/utils/format';

export interface ProbabilityPanelProps {
  /** Advisory probability estimate for the selected market. */
  estimate: ProbabilityEstimate;
}

/** Display labels for how the market-implied probability was derived. */
const BASIS_LABELS: Record<ImpliedProbabilityBasis, string> = {
  bid_ask_midpoint: 'bid/ask midpoint',
  last_price: 'last price — weaker',
  none: 'not derivable',
};

const ADVISORY_COPY = 'Advisory only — probabilities never approve trades.';

/**
 * Probability section of the dossier. Renders the market-implied probability
 * with its labeled basis, the advisory fair range (em dashes when null —
 * never invented from price), the expected edge, confidence, and uncertainty
 * notes. Probabilities are advisory inputs; verdicts come only from the
 * deterministic risk engine.
 */
export function ProbabilityPanel({ estimate }: ProbabilityPanelProps): ReactElement {
  const fairRange = [
    formatProbability(estimate.fairProbabilityLow),
    formatProbability(estimate.fairProbabilityMid),
    formatProbability(estimate.fairProbabilityHigh),
  ].join(' · ');

  return (
    <div className="dossier-section">
      <span className="label">03 Research / Predict · probability (advisory)</span>
      <div className="kv-grid">
        <div className="kv">
          <span className="label">Market-implied</span>
          <span className="v">{formatProbability(estimate.marketImpliedProbability)}</span>
        </div>
        <div className="kv">
          <span className="label">Implied basis</span>
          <span className="v">{BASIS_LABELS[estimate.impliedProbabilityBasis]}</span>
        </div>
        <div className="kv">
          <span className="label">Fair range (low · mid · high)</span>
          <span className="v">{fairRange}</span>
        </div>
        <div className="kv">
          <span className="label">Expected edge</span>
          <span className="v">{formatProbability(estimate.expectedEdge)}</span>
        </div>
        <div className="kv">
          <span className="label">Confidence</span>
          <span className="v">{estimate.confidence}</span>
        </div>
      </div>

      {estimate.uncertaintyNotes.length > 0 ? (
        <div>
          <span className="label">Uncertainty notes</span>
          <ul className="dossier-list">
            {estimate.uncertaintyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="dossier-note">{ADVISORY_COPY}</p>
    </div>
  );
}
