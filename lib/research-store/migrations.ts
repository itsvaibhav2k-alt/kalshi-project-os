import type Database from 'better-sqlite3';

import {
  MARKET_SETTLEMENT_SOURCES_DDL,
  MARKET_SETTLEMENT_SOURCES_TICKER_INDEX_DDL,
  MARKET_SOURCES_DDL,
  MARKET_SOURCES_TICKER_INDEX_DDL,
  PAPER_DECISION_ENTRIES_DDL,
  PAPER_DECISION_ENTRIES_TICKER_INDEX_DDL,
  PROBABILITY_ESTIMATES_DDL,
  PROBABILITY_ESTIMATES_TICKER_INDEX_DDL,
  RESEARCH_BRIEFS_DDL,
  RESEARCH_BRIEFS_TICKER_INDEX_DDL,
  SCHEMA_MIGRATIONS_DDL,
  THESES_DDL,
  THESES_TICKER_INDEX_DDL,
} from './schema';

/** A single ordered schema migration. Statements run inside one transaction. */
export interface Migration {
  /** Strictly increasing integer version, recorded in the schema_migrations ledger. */
  version: number;
  /** Human-readable label for audit/debugging; never executed. */
  description: string;
  /** DDL statements applied in order. */
  statements: readonly string[];
}

/** Ordered migration registry. Append-only: never edit or reorder applied versions. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Phase 3 research store: sources, briefs, probability estimates, theses',
    statements: [
      MARKET_SOURCES_DDL,
      MARKET_SOURCES_TICKER_INDEX_DDL,
      RESEARCH_BRIEFS_DDL,
      RESEARCH_BRIEFS_TICKER_INDEX_DDL,
      PROBABILITY_ESTIMATES_DDL,
      PROBABILITY_ESTIMATES_TICKER_INDEX_DDL,
      THESES_DDL,
      THESES_TICKER_INDEX_DDL,
    ],
  },
  {
    version: 2,
    description:
      'Phase 4: human-verified settlement sources and paper decision journal entries',
    statements: [
      MARKET_SETTLEMENT_SOURCES_DDL,
      MARKET_SETTLEMENT_SOURCES_TICKER_INDEX_DDL,
      PAPER_DECISION_ENTRIES_DDL,
      PAPER_DECISION_ENTRIES_TICKER_INDEX_DDL,
    ],
  },
];

/**
 * Applies every migration not yet recorded in the schema_migrations ledger.
 *
 * Idempotent: already-applied versions are skipped and their ledger rows are
 * left untouched. Each pending migration runs inside a transaction together
 * with its ledger insert.
 *
 * @param db - Open better-sqlite3 handle.
 * @param nowIso - Injected ISO timestamp recorded as applied_at for newly
 *   applied migrations. This module never reads a clock.
 */
export function applyMigrations(db: Database.Database, nowIso: string): void {
  db.exec(SCHEMA_MIGRATIONS_DDL);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((row) => row.version));

  const insertLedgerRow = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    const runMigration = db.transaction(() => {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      insertLedgerRow.run(migration.version, nowIso);
    });
    runMigration();
  }
}
