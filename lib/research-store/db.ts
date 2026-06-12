import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';

import { applyMigrations } from './migrations';

/**
 * Database connection lifecycle for the Phase 3 research store.
 *
 * Rules enforced here:
 * - This file is the ONLY place in the repo that reads the KALSHI_DATA_DIR
 *   environment variable.
 * - Databases are opened lazily inside functions only — never at module top
 *   level, so importing this module (for example during `next build`) creates
 *   nothing on disk.
 * - Timestamps are injected (nowIso); this module never reads a clock.
 * - Connections are cached on globalThis keyed by resolved data dir, so dev
 *   hot reloads reuse handles and tests get per-temp-dir isolation.
 */

/** File name of the SQLite database inside the data directory. */
export const DATABASE_FILE_NAME = 'kalshi-os.sqlite';

/** Default data directory name under the project root. Gitignored. */
const DEFAULT_DATA_DIR_NAME = '.kalshi-os';

/** Busy timeout in milliseconds applied to every connection. */
const BUSY_TIMEOUT_MS = 5000;

/** globalThis key for the connection cache; Symbol.for survives module re-instantiation. */
const CONNECTION_CACHE_KEY = Symbol.for('kalshi-os.research-store.connections');

type ConnectionCache = Map<string, Database.Database>;

function getConnectionCache(): ConnectionCache {
  const holder = globalThis as typeof globalThis & {
    [CONNECTION_CACHE_KEY]?: ConnectionCache;
  };
  const existing = holder[CONNECTION_CACHE_KEY];
  if (existing) {
    return existing;
  }
  const created: ConnectionCache = new Map();
  holder[CONNECTION_CACHE_KEY] = created;
  return created;
}

/**
 * Resolves the data directory without touching the filesystem.
 *
 * Reads process.env.KALSHI_DATA_DIR on every call (no caching of the env
 * value), falling back to <cwd>/.kalshi-os. Side-effect free.
 *
 * @returns Absolute path of the data directory.
 */
export function resolveDataDir(): string {
  const override = process.env.KALSHI_DATA_DIR;
  if (override !== undefined && override.trim() !== '') {
    return path.resolve(override);
  }
  return path.resolve(path.join(process.cwd(), DEFAULT_DATA_DIR_NAME));
}

/**
 * Opens (or creates) the research-store database under the given directory.
 *
 * Creates the directory if needed, opens <dataDir>/kalshi-os.sqlite, sets the
 * WAL journal mode and busy_timeout pragmas, and applies pending migrations.
 *
 * @param dataDir - Directory holding the SQLite file; created if missing.
 * @param nowIso - Injected ISO timestamp recorded for newly applied migrations.
 * @returns The open better-sqlite3 handle.
 */
export function openDatabase(dataDir: string, nowIso: string): Database.Database {
  const resolvedDir = path.resolve(dataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const db = new Database(path.join(resolvedDir, DATABASE_FILE_NAME));
  db.pragma('journal_mode = WAL');
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  applyMigrations(db, nowIso);
  return db;
}

/**
 * Returns a cached connection for the current data directory, opening one if
 * needed.
 *
 * Re-reads process.env.KALSHI_DATA_DIR on every call, so changing the env var
 * (for example per-test temp dirs) yields an independent database. Connections
 * are cached on globalThis keyed by the resolved directory path.
 *
 * @param nowIso - Injected ISO timestamp used only if migrations must run.
 * @returns The open better-sqlite3 handle for the resolved data directory.
 */
export function getDatabase(nowIso: string): Database.Database {
  const resolvedDir = resolveDataDir();
  const cache = getConnectionCache();

  const cached = cache.get(resolvedDir);
  if (cached !== undefined && cached.open) {
    return cached;
  }

  const db = openDatabase(resolvedDir, nowIso);
  cache.set(resolvedDir, db);
  return db;
}

/**
 * Closes and evicts every cached connection. Intended for tests so temp
 * directories can be removed safely, and for graceful shutdown.
 */
export function closeAllDatabases(): void {
  const cache = getConnectionCache();
  for (const db of cache.values()) {
    if (db.open) {
      db.close();
    }
  }
  cache.clear();
}
