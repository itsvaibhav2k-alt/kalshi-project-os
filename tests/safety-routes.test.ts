import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Route-aware safety tests (V1 Training Wheels).
 *
 * These tests walk the real route tree and import each route module, so any
 * future route file is checked automatically. Research/thesis CRUD and
 * paper-decision-journal mutations are the only allowed mutations and they
 * live under /api/research and /api/paper-journal only. Trading, order,
 * account, auth, and wallet routes are forbidden everywhere, as are PUT and
 * DELETE exports of any kind.
 */

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const apiDir = path.join(projectRoot, 'app', 'api');
const researchDir = path.join(apiDir, 'research');
const paperJournalDir = path.join(apiDir, 'paper-journal');
const researchStoreDir = path.join(projectRoot, 'lib', 'research-store');
const aiResearchDir = path.join(projectRoot, 'lib', 'ai-research');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const FORBIDDEN_SEGMENT_PATTERN =
  /(order|account|auth|wallet|buy|sell|trade|portfolio|position)/i;
const FORBIDDEN_STORAGE_FRAGMENTS = ['localStorage', 'sessionStorage', 'indexedDB'] as const;
/**
 * Phase 4 carve-out (human-approved, see docs/DECISION_LOG.md 2026-06-12):
 * the lookahead (?!orit) permits exactly the settlement-domain words
 * authority / authorities / authority_type / authoritative, while still
 * forbidding auth, authentication, authorization, authToken, authHeader,
 * and auth_key.
 */
const FORBIDDEN_CODE_TOKEN_PATTERN = /\b(order|buy|sell|auth(?!orit)|wallet|account)/i;

/** Recursively collects every file under a directory. */
function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

/** Every route.ts file under app/api, with paths relative to the project. */
function listRouteFiles(): string[] {
  return walkFiles(apiDir).filter((file) => path.basename(file) === 'route.ts');
}

/** Imports a route module and returns the HTTP methods it exports. */
async function exportedHttpMethods(file: string): Promise<string[]> {
  const routeModule = (await import(file)) as Record<string, unknown>;
  return HTTP_METHODS.filter((method) => routeModule[method] !== undefined);
}

/** Project-relative path with forward slashes, for stable assertions. */
function relativePath(file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join('/');
}

/**
 * Strips block and line comments so content scans check functional code, not
 * English prose. The line-comment pattern deliberately ignores '//' preceded
 * by ':' so URLs inside string literals are not treated as comments.
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

describe('route-aware safety (app/api)', () => {
  const routeFiles = listRouteFiles();

  it('should find the expected route tree (markets plus research and paper-journal routes)', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(17);
    expect(routeFiles.some((file) => relativePath(file) === 'app/api/markets/route.ts')).toBe(
      true,
    );
  });

  it('should export GET only from app/api/markets/route.ts', async () => {
    const marketsRoute = routeFiles.find(
      (file) => relativePath(file) === 'app/api/markets/route.ts',
    );
    expect(marketsRoute).toBeDefined();

    const methods = await exportedHttpMethods(marketsRoute as string);

    expect(methods).toEqual(['GET']);
  });

  it('should export only GET, POST, or PATCH from routes under app/api/research', async () => {
    const researchRoutes = routeFiles.filter((file) => file.startsWith(researchDir + path.sep));
    expect(researchRoutes.length).toBeGreaterThanOrEqual(12);

    for (const file of researchRoutes) {
      const methods = await exportedHttpMethods(file);
      expect(methods.length, `${relativePath(file)} must export at least one method`)
        .toBeGreaterThan(0);
      for (const method of methods) {
        expect(
          ['GET', 'POST', 'PATCH'],
          `${relativePath(file)} exports forbidden method ${method}`,
        ).toContain(method);
      }
    }
  });

  it('should export no PUT, DELETE, HEAD, or OPTIONS handler anywhere under app/api', async () => {
    for (const file of routeFiles) {
      const methods = await exportedHttpMethods(file);
      for (const forbidden of ['PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
        expect(
          methods,
          `${relativePath(file)} must not export ${forbidden}`,
        ).not.toContain(forbidden);
      }
    }
  });

  it('should export no mutation method outside app/api/research and app/api/paper-journal', async () => {
    const outsideMutationNamespaces = routeFiles.filter(
      (file) =>
        !file.startsWith(researchDir + path.sep) &&
        !file.startsWith(paperJournalDir + path.sep),
    );
    expect(outsideMutationNamespaces.length).toBeGreaterThan(0);

    for (const file of outsideMutationNamespaces) {
      const methods = await exportedHttpMethods(file);
      for (const mutation of MUTATION_METHODS) {
        expect(
          methods,
          `${relativePath(file)} must not export mutation method ${mutation}`,
        ).not.toContain(mutation);
      }
    }
  });

  it('should export only GET, POST, or PATCH from routes under app/api/paper-journal', async () => {
    const paperJournalRoutes = routeFiles.filter(
      (file) => file.startsWith(paperJournalDir + path.sep),
    );
    expect(paperJournalRoutes.length).toBeGreaterThanOrEqual(4);

    for (const file of paperJournalRoutes) {
      const methods = await exportedHttpMethods(file);
      expect(methods.length, `${relativePath(file)} must export at least one method`)
        .toBeGreaterThan(0);
      for (const method of methods) {
        expect(
          ['GET', 'POST', 'PATCH'],
          `${relativePath(file)} exports forbidden method ${method}`,
        ).toContain(method);
      }
    }
  });

  it('should contain no trading-shaped directory segment in any route path', () => {
    for (const file of routeFiles) {
      const segments = path
        .relative(apiDir, path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/[[\]]/g, ''));
      for (const segment of segments) {
        expect(
          FORBIDDEN_SEGMENT_PATTERN.test(segment),
          `route segment '${segment}' in ${relativePath(file)} matches a forbidden trading term`,
        ).toBe(false);
      }
    }
  });
});

describe('content safety scans (app/api, lib/research-store, and lib/ai-research)', () => {
  const scannedFiles = [
    ...walkFiles(apiDir),
    ...walkFiles(researchStoreDir),
    ...walkFiles(aiResearchDir),
  ].filter((file) => file.endsWith('.ts'));

  it('should scan a non-empty set of implementation files', () => {
    expect(scannedFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('should contain no browser storage usage anywhere', () => {
    for (const file of scannedFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const fragment of FORBIDDEN_STORAGE_FRAGMENTS) {
        expect(
          content,
          `${relativePath(file)} must not contain '${fragment}'`,
        ).not.toContain(fragment);
      }
    }
  });

  it('should contain no functional order, buy, sell, auth, wallet, or account code', () => {
    for (const file of scannedFiles) {
      const raw = fs.readFileSync(file, 'utf8');
      // SQL 'ORDER BY' is a sorting keyword, not an order-placement path.
      const code = stripComments(raw).replace(/ORDER BY/g, ' ');
      const match = code.match(FORBIDDEN_CODE_TOKEN_PATTERN);
      expect(
        match,
        `${relativePath(file)} contains forbidden token '${match?.[0] ?? ''}'`,
      ).toBeNull();
    }
  });

  it('should permit only the settlement-domain authority terms in the forbidden-token pattern', () => {
    // Carve-out contract: these are the ONLY auth-prefixed words allowed.
    const allowedStrings = [
      'authority',
      'authority_type',
      'authorities',
      'authoritative',
      'resolution authority',
      'server-authoritative',
    ] as const;

    for (const allowed of allowedStrings) {
      expect(
        FORBIDDEN_CODE_TOKEN_PATTERN.test(allowed),
        `'${allowed}' must NOT match the forbidden-token pattern`,
      ).toBe(false);
    }
  });

  it('should still match every forbidden trading and credential token', () => {
    const forbiddenStrings = [
      'auth',
      'authentication',
      'authorization',
      'authToken',
      'authHeader',
      'auth_key',
      'account',
      'wallet',
      'order',
      'buy',
      'sell',
    ] as const;

    for (const forbidden of forbiddenStrings) {
      expect(
        FORBIDDEN_CODE_TOKEN_PATTERN.test(forbidden),
        `'${forbidden}' MUST match the forbidden-token pattern`,
      ).toBe(true);
    }
  });

  it('should import better-sqlite3 only under lib/research-store', () => {
    const sourceDirs = [
      path.join(projectRoot, 'app'),
      path.join(projectRoot, 'components'),
      path.join(projectRoot, 'lib'),
    ].filter((dir) => fs.existsSync(dir));
    const sourceFiles = sourceDirs
      .flatMap((dir) => walkFiles(dir))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    expect(sourceFiles.length).toBeGreaterThan(0);

    for (const file of sourceFiles) {
      if (file.startsWith(researchStoreDir + path.sep)) {
        continue;
      }
      const content = fs.readFileSync(file, 'utf8');
      expect(
        content,
        `${relativePath(file)} must not reference better-sqlite3`,
      ).not.toContain('better-sqlite3');
    }
  });
});
