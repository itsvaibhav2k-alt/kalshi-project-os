import type { ReactElement } from 'react';

/**
 * Project masthead: title, core principle, and the two static mode badges.
 *
 * Both badges are plain spans — they are statements of system posture,
 * not controls.
 */
export function Masthead(): ReactElement {
  return (
    <header className="masthead">
      <div>
        <h1>
          Kalshi Project <span className="os">OS</span>
        </h1>
        <p className="principle">
          LLM recommends. Rules permit. Human approves. Execution obeys.
        </p>
      </div>
      <div className="badge-row">
        <span className="mode-badge">TRAINING WHEELS — PAPER ONLY</span>
        <span className="lock-badge">LIVE TRADING LOCKED</span>
      </div>
    </header>
  );
}
