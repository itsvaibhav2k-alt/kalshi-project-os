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
