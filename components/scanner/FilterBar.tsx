'use client';

import type { ReactElement } from 'react';

import type { MarketStatus } from '@/lib/markets/types';

export interface FilterBarProps {
  /** Current free-text search query. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Category chips, derived from the loaded data by the parent. */
  categories: string[];
  /** Selected category, or null for all categories. */
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  /** Selected status, or null for all statuses. */
  statusFilter: MarketStatus | null;
  onStatusChange: (status: MarketStatus | null) => void;
}

const STATUS_OPTIONS: readonly MarketStatus[] = [
  'active',
  'closed',
  'settled',
  'unknown',
];

/**
 * Controlled filter row for the scanner: text search, category chips
 * derived from data, and market-status chips. Purely presentational —
 * all filtering happens in the parent.
 */
export function FilterBar({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  statusFilter,
  onStatusChange,
}: FilterBarProps): ReactElement {
  return (
    <div className="filter-row">
      <input
        type="search"
        className="search-input"
        placeholder="search markets…"
        aria-label="Search markets"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <span className="fchip sep">|</span>
      <button
        type="button"
        className={activeCategory === null ? 'fchip active' : 'fchip'}
        aria-pressed={activeCategory === null}
        onClick={() => onCategoryChange(null)}
      >
        ALL
      </button>
      {categories.map((category) => (
        <button
          type="button"
          key={category}
          className={activeCategory === category ? 'fchip active' : 'fchip'}
          aria-pressed={activeCategory === category}
          onClick={() => onCategoryChange(category)}
        >
          {category.toUpperCase()}
        </button>
      ))}
      <span className="fchip sep">|</span>
      <button
        type="button"
        className={statusFilter === null ? 'fchip active' : 'fchip'}
        aria-pressed={statusFilter === null}
        onClick={() => onStatusChange(null)}
      >
        ANY STATUS
      </button>
      {STATUS_OPTIONS.map((status) => (
        <button
          type="button"
          key={status}
          className={statusFilter === status ? 'fchip active' : 'fchip'}
          aria-pressed={statusFilter === status}
          onClick={() => onStatusChange(status)}
        >
          {status.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
