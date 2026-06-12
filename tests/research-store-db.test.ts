import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import {
  DATABASE_FILE_NAME,
  closeAllDatabases,
  getDatabase,
  openDatabase,
  resolveDataDir,
} from '@/lib/research-store/db';
import { MIGRATIONS, applyMigrations } from '@/lib/research-store/migrations';

const NOW_ISO = '2026-06-11T12:00:00.000Z';

const EXPECTED_TABLES = [
  'schema_migrations',
  'market_sources',
  'research_briefs',
  'probability_estimates',
  'theses',
  'market_settlement_sources',
  'paper_decision_entries',
];

/** Tracks temp dirs created during a test so cleanup never touches the real .kalshi-os. */
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-os-db-test-'));
  tempDirs.push(dir);
  return dir;
}

function listTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

const SETTLEMENT_INSERT_SQL = `
  INSERT INTO market_settlement_sources
    (id, market_ticker, market_id, title, url, publisher, authority_type, status,
     notes, verification_rationale, created_at, updated_at)
  VALUES (@id, @market_ticker, @market_id, @title, @url, @publisher, @authority_type,
          @status, @notes, @verification_rationale, @created_at, @updated_at)
`;

function settlementRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'set-1',
    market_ticker: 'TEST-TICKER',
    market_id: 'kalshi:TEST-TICKER',
    title: 'Kalshi rules document',
    url: 'https://kalshi.com/markets/example/rules',
    publisher: 'Kalshi',
    authority_type: 'kalshi_rules',
    status: 'human_verified',
    notes: null,
    verification_rationale: 'URL matches the resolution text in the contract rules.',
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  };
}

const PAPER_ENTRY_INSERT_SQL = `
  INSERT INTO paper_decision_entries
    (id, market_ticker, market_id, market_title, platform, side, paper_price,
     implied_probability, fair_low, fair_mid, fair_high, expected_edge, confidence,
     thesis_id, thesis_snapshot, probability_estimate_id, research_source_ids_json,
     research_sources_snapshot_json, settlement_source_id, settlement_source_snapshot_json,
     risk_verdict, risk_checklist_json, risk_reasons_json, market_snapshot_json, status,
     created_at, updated_at)
  VALUES (@id, @market_ticker, @market_id, @market_title, @platform, @side, @paper_price,
          @implied_probability, @fair_low, @fair_mid, @fair_high, @expected_edge, @confidence,
          @thesis_id, @thesis_snapshot, @probability_estimate_id, @research_source_ids_json,
          @research_sources_snapshot_json, @settlement_source_id,
          @settlement_source_snapshot_json, @risk_verdict, @risk_checklist_json,
          @risk_reasons_json, @market_snapshot_json, @status, @created_at, @updated_at)
`;

function paperEntryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pd-1',
    market_ticker: 'TEST-TICKER',
    market_id: 'kalshi:TEST-TICKER',
    market_title: 'Example market title',
    platform: 'kalshi',
    side: 'YES',
    paper_price: 0.42,
    implied_probability: 0.43,
    fair_low: 0.5,
    fair_mid: 0.55,
    fair_high: 0.6,
    expected_edge: 0.13,
    confidence: 'medium',
    thesis_id: 'th-1',
    thesis_snapshot: 'Market underprices the documented base rate.',
    probability_estimate_id: 'est-1',
    research_source_ids_json: JSON.stringify(['src-1']),
    research_sources_snapshot_json: JSON.stringify([{ id: 'src-1' }]),
    settlement_source_id: 'set-1',
    settlement_source_snapshot_json: JSON.stringify({ id: 'set-1' }),
    risk_verdict: 'PAPER_TRADE',
    risk_checklist_json: JSON.stringify([{ id: 'resolution_clarity', status: 'pass' }]),
    risk_reasons_json: JSON.stringify([]),
    market_snapshot_json: JSON.stringify({ raw: null }),
    status: 'logged',
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  };
}

afterEach(() => {
  closeAllDatabases();
  vi.unstubAllEnvs();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('openDatabase', () => {
  it('should create the data directory and the sqlite file when the directory does not exist', () => {
    // Arrange
    const root = makeTempDir();
    const dataDir = path.join(root, 'nested', 'data-dir');

    // Act
    const db = openDatabase(dataDir, NOW_ISO);

    // Assert
    expect(fs.existsSync(dataDir)).toBe(true);
    expect(fs.existsSync(path.join(dataDir, DATABASE_FILE_NAME))).toBe(true);
    db.close();
  });

  it('should create all expected tables when initializing a fresh database', () => {
    // Arrange
    const dataDir = makeTempDir();

    // Act
    const db = openDatabase(dataDir, NOW_ISO);
    const tables = listTableNames(db);

    // Assert
    for (const table of EXPECTED_TABLES) {
      expect(tables).toContain(table);
    }
    db.close();
  });

  it('should set WAL journal mode and a positive busy timeout when opening', () => {
    // Arrange
    const dataDir = makeTempDir();

    // Act
    const db = openDatabase(dataDir, NOW_ISO);
    const journalMode = db.pragma('journal_mode', { simple: true });
    const busyTimeout = db.pragma('busy_timeout', { simple: true });

    // Assert
    expect(journalMode).toBe('wal');
    expect(busyTimeout).toBeGreaterThan(0);
    db.close();
  });

  it('should record one ledger row per migration with the injected timestamp', () => {
    // Arrange
    const dataDir = makeTempDir();

    // Act
    const db = openDatabase(dataDir, NOW_ISO);
    const rows = db
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number; applied_at: string }>;

    // Assert
    expect(rows).toHaveLength(MIGRATIONS.length);
    expect(rows.map((row) => row.version)).toEqual(MIGRATIONS.map((m) => m.version));
    for (const row of rows) {
      expect(row.applied_at).toBe(NOW_ISO);
    }
    db.close();
  });

  it('should record ledger versions [1, 2] when initializing a fresh database', () => {
    // Arrange
    const dataDir = makeTempDir();

    // Act
    const db = openDatabase(dataDir, NOW_ISO);
    const rows = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;

    // Assert
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    db.close();
  });

  it('should be idempotent when opening the same data directory twice', () => {
    // Arrange
    const dataDir = makeTempDir();
    const first = openDatabase(dataDir, NOW_ISO);
    first.close();
    closeAllDatabases();

    // Act
    const second = openDatabase(dataDir, '2026-06-12T00:00:00.000Z');
    const ledger = second
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number; applied_at: string }>;

    // Assert: re-opening must not duplicate ledger rows or rewrite applied_at
    expect(ledger).toHaveLength(MIGRATIONS.length);
    for (const row of ledger) {
      expect(row.applied_at).toBe(NOW_ISO);
    }
    second.close();
  });

  it('should give independent databases when two different data directories are used', () => {
    // Arrange
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    const dbA = openDatabase(dirA, NOW_ISO);
    const dbB = openDatabase(dirB, NOW_ISO);

    // Act
    dbA
      .prepare(
        `INSERT INTO market_sources
           (id, market_ticker, market_id, kind, title, credibility, status, added_by,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'src-1',
        'TEST-TICKER',
        'kalshi:TEST-TICKER',
        'news',
        'Example source',
        'medium',
        'draft',
        'human',
        NOW_ISO,
        NOW_ISO,
      );
    const countA = dbA
      .prepare('SELECT COUNT(*) AS n FROM market_sources')
      .get() as { n: number };
    const countB = dbB
      .prepare('SELECT COUNT(*) AS n FROM market_sources')
      .get() as { n: number };

    // Assert
    expect(countA.n).toBe(1);
    expect(countB.n).toBe(0);
    dbA.close();
    dbB.close();
  });
});

describe('applyMigrations', () => {
  it('should be idempotent when applied twice to the same handle', () => {
    // Arrange
    const dataDir = makeTempDir();
    const db = openDatabase(dataDir, NOW_ISO);

    // Act
    applyMigrations(db, '2026-06-13T00:00:00.000Z');
    const ledger = db
      .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number; applied_at: string }>;

    // Assert
    expect(ledger).toHaveLength(MIGRATIONS.length);
    for (const row of ledger) {
      expect(row.applied_at).toBe(NOW_ISO);
    }
    db.close();
  });

  it('should list migrations in strictly ascending version order', () => {
    // Assert: the migration registry itself must be ordered and duplicate-free
    const versions = MIGRATIONS.map((m) => m.version);
    const sorted = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(sorted);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.length).toBeGreaterThan(0);
  });
});

describe('migration v2 tables', () => {
  describe('market_settlement_sources constraints', () => {
    it('should accept a human_verified row when all enum values are valid', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act
      db.prepare(SETTLEMENT_INSERT_SQL).run(settlementRow());
      const count = db
        .prepare('SELECT COUNT(*) AS n FROM market_settlement_sources')
        .get() as { n: number };

      // Assert
      expect(count.n).toBe(1);
      db.close();
    });

    it('should accept a draft row when authority_type is null', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert: drafts may be saved before the authority type is chosen
      expect(() =>
        db.prepare(SETTLEMENT_INSERT_SQL).run(
          settlementRow({ status: 'draft', authority_type: null, verification_rationale: null }),
        ),
      ).not.toThrow();
      db.close();
    });

    it('should reject a row when authority_type is not in the enum', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(SETTLEMENT_INSERT_SQL).run(settlementRow({ authority_type: 'blog_post' })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it('should reject a row when status is not in the enum', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(SETTLEMENT_INSERT_SQL).run(settlementRow({ status: 'approved' })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });
  });

  describe('paper_decision_entries constraints', () => {
    it('should accept a fully populated logged row when all values are valid', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act
      db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow());
      const count = db
        .prepare('SELECT COUNT(*) AS n FROM paper_decision_entries')
        .get() as { n: number };

      // Assert
      expect(count.n).toBe(1);
      db.close();
    });

    it('should accept a row when paper_price is exactly 1', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert: boundary value is inclusive
      expect(() =>
        db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow({ paper_price: 1 })),
      ).not.toThrow();
      db.close();
    });

    it('should reject a row when side is not YES', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow({ side: 'NO' })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it('should reject a row when risk_verdict is not PAPER_TRADE', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow({ risk_verdict: 'SKIP' })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it('should reject a row when paper_price is above 1', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow({ paper_price: 1.0001 })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it('should reject a row when fair_mid is below fair_low', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db
          .prepare(PAPER_ENTRY_INSERT_SQL)
          .run(paperEntryRow({ fair_low: 0.6, fair_mid: 0.5, fair_high: 0.7 })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });

    it('should reject a row when status is not in the enum', () => {
      // Arrange
      const db = openDatabase(makeTempDir(), NOW_ISO);

      // Act / Assert
      expect(() =>
        db.prepare(PAPER_ENTRY_INSERT_SQL).run(paperEntryRow({ status: 'open' })),
      ).toThrow(/CHECK constraint failed/);
      db.close();
    });
  });
});

describe('resolveDataDir', () => {
  it('should return the KALSHI_DATA_DIR override when the env var is set', () => {
    // Arrange
    const dataDir = makeTempDir();
    vi.stubEnv('KALSHI_DATA_DIR', dataDir);

    // Act
    const resolved = resolveDataDir();

    // Assert
    expect(resolved).toBe(path.resolve(dataDir));
  });

  it('should default to <cwd>/.kalshi-os without creating it when the env var is unset', () => {
    // Arrange
    vi.stubEnv('KALSHI_DATA_DIR', '');
    const defaultDir = path.join(process.cwd(), '.kalshi-os');
    const existedBefore = fs.existsSync(defaultDir);

    // Act
    const resolved = resolveDataDir();

    // Assert: resolving the path is side-effect free (lazy open only)
    expect(resolved).toBe(path.resolve(defaultDir));
    expect(fs.existsSync(defaultDir)).toBe(existedBefore);
  });
});

describe('getDatabase', () => {
  it('should honor KALSHI_DATA_DIR when the env var points at a temp directory', () => {
    // Arrange
    const dataDir = makeTempDir();
    vi.stubEnv('KALSHI_DATA_DIR', dataDir);

    // Act
    const db = getDatabase(NOW_ISO);

    // Assert
    expect(fs.existsSync(path.join(dataDir, DATABASE_FILE_NAME))).toBe(true);
    expect(listTableNames(db)).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it('should return the same cached handle when called twice with the same data dir', () => {
    // Arrange
    const dataDir = makeTempDir();
    vi.stubEnv('KALSHI_DATA_DIR', dataDir);

    // Act
    const first = getDatabase(NOW_ISO);
    const second = getDatabase(NOW_ISO);

    // Assert
    expect(second).toBe(first);
  });

  it('should re-read the env var and open an independent database when the data dir changes', () => {
    // Arrange
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    vi.stubEnv('KALSHI_DATA_DIR', dirA);
    const dbA = getDatabase(NOW_ISO);
    dbA
      .prepare(
        `INSERT INTO theses
           (id, market_ticker, status, thesis, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('thesis-1', 'TEST-TICKER', 'draft', 'A written thesis.', NOW_ISO, NOW_ISO);

    // Act
    vi.stubEnv('KALSHI_DATA_DIR', dirB);
    const dbB = getDatabase(NOW_ISO);
    const countB = dbB.prepare('SELECT COUNT(*) AS n FROM theses').get() as { n: number };

    // Assert
    expect(dbB).not.toBe(dbA);
    expect(countB.n).toBe(0);
    expect(fs.existsSync(path.join(dirA, DATABASE_FILE_NAME))).toBe(true);
    expect(fs.existsSync(path.join(dirB, DATABASE_FILE_NAME))).toBe(true);
  });
});
