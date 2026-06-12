'use client';

import type { KeyboardEvent, ReactElement } from 'react';

import type { NormalizedMarket } from '@/lib/markets/types';
import { formatCents, formatCount, formatDateTime } from '@/lib/utils/format';

export interface ScannerTableProps {
  /** Markets to display, already filtered/sorted by the parent. */
  markets: NormalizedMarket[];
  /** Id of the currently selected market, or null when none. */
  selectedId: string | null;
  /** Called with the market id when a row is selected. */
  onSelect: (id: string) => void;
}

const COLUMN_COUNT = 7;

/**
 * Read-only scanner table. Rows are selectable (click or Enter/Space) and
 * show only factual market data plus the approved data-quality flags.
 * No verdicts, no actions.
 */
export function ScannerTable({
  markets,
  selectedId,
  onSelect,
}: ScannerTableProps): ReactElement {
  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    id: string,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <table className="scanner">
      <thead>
        <tr>
          <th>Market</th>
          <th className="num">Yes bid / ask</th>
          <th className="num">Spread</th>
          <th className="num">Vol</th>
          <th className="num">OI</th>
          <th>Close</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {markets.length === 0 ? (
          <tr>
            <td className="empty-state" colSpan={COLUMN_COUNT}>
              No markets match the current filters.
            </td>
          </tr>
        ) : (
          markets.map((market) => (
            <tr
              key={market.id}
              className={market.id === selectedId ? 'selected' : undefined}
              aria-selected={market.id === selectedId}
              tabIndex={0}
              onClick={() => onSelect(market.id)}
              onKeyDown={(event) => handleRowKeyDown(event, market.id)}
            >
              <td className="title-cell">
                {market.title}
                <span className="cat">
                  {market.category === null ? 'UNCATEGORIZED' : market.category.toUpperCase()}
                  {' · '}
                  {market.externalId}
                  {market.flags.length > 0 ? (
                    <span className="flag-note"> · {market.flags.join(' · ')}</span>
                  ) : null}
                </span>
              </td>
              <td className="num">
                {formatCents(market.yesBidCents)} / {formatCents(market.yesAskCents)}
              </td>
              <td className="num">{formatCents(market.spreadCents)}</td>
              <td className="num">{formatCount(market.volume)}</td>
              <td className="num">{formatCount(market.openInterest)}</td>
              <td className="mono">
                {market.closeTime === null ? '—' : formatDateTime(market.closeTime)}
              </td>
              <td className="mono">{market.status}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
