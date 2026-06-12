import type { ReactElement } from 'react';

import { formatDateTime } from '@/lib/utils/format';

export interface StatusStripProps {
  /** Where the current snapshot came from, or 'error' when the fetch failed. */
  source: 'live' | 'fixture' | 'error';
  /** ISO 8601 timestamp of the snapshot, or null when nothing was fetched. */
  fetchedAt: string | null;
  /** Human-readable error message, or null when there is no error. */
  error: string | null;
  /** Pre-computed freshness display string (e.g. "41s ago"), or null. */
  freshnessText: string | null;
}

interface KalshiStatus {
  dotClass: string;
  text: string;
}

const KALSHI_STATUS: Record<StatusStripProps['source'], KalshiStatus> = {
  live: { dotClass: 'dot ok', text: 'read-only · connected' },
  fixture: { dotClass: 'dot planned', text: 'read-only · fixture data' },
  error: { dotClass: 'dot err', text: 'read-only · fetch error' },
};

/**
 * One-line connection and freshness strip under the masthead.
 *
 * Fixture data is never presented as live: when `source` is 'fixture' a
 * prominent banner chip reads "FIXTURE — NOT LIVE DATA".
 */
export function StatusStrip({
  source,
  fetchedAt,
  error,
  freshnessText,
}: StatusStripProps): ReactElement {
  const kalshi = KALSHI_STATUS[source];

  return (
    <div className="status-strip">
      <span>
        <span className={kalshi.dotClass} /> <b>KALSHI</b> {kalshi.text}
      </span>
      <span>
        <span className="dot planned" /> <b>POLYMARKET</b> planned · not connected
      </span>
      <span>
        data as of <b>{fetchedAt === null ? '—' : formatDateTime(fetchedAt)}</b>
        {freshnessText === null ? null : <> · {freshnessText}</>}
      </span>
      <span>
        session <b>read-only</b> · no order paths exist
      </span>
      {source === 'fixture' ? (
        <span className="fixture-banner" role="status">
          FIXTURE — NOT LIVE DATA
        </span>
      ) : null}
      {source === 'error' && error !== null ? (
        <span className="error-note" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
