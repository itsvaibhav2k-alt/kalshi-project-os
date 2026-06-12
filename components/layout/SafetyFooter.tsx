import type { ReactElement } from 'react';

/**
 * Static footer: the project principle and the standing disclaimer about
 * what this tool is and is not.
 */
export function SafetyFooter(): ReactElement {
  return (
    <footer>
      <div>
        <p className="principle-foot">
          &ldquo;Build the machine first. Prove edge on paper. Mostly say no.&rdquo;
        </p>
      </div>
      <p className="disclaimer">
        Kalshi Project OS Phase 1 is a read-only, paper-phase research tool. Every
        number shown is market data from the source platform or clearly labeled
        fixture data — nothing is invented. No profitability is claimed or implied.
        Real trading is locked: no order paths exist anywhere in this application.
        Not financial advice.
      </p>
    </footer>
  );
}
