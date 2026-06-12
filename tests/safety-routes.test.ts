import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Route-aware safety tests (V1 Training Wheels).
 *
 * These tests walk the real route tree and import each route module, so any
 * future route file is checked automatically. Research/thesis CRUD mutations
 * are the only allowed mutations and they live under /api/research only.
 * Trading, order, account, auth, and wallet routes are forbidden everywhere,
 * as are PUT and DELETE exports of any kind.
 */

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const apiDir = path.join(projectRoot, 'app', 'api');
const researchDir = path.join(apiDir, 'research');
const researchStoreDir = path.join(projectRoot, 'lib', 'research-store');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const FORBIDDEN_SEGMENT_PATTERN =
  /(order|account|auth|wallet|buy|sell|trade|portfolio|position)/i;
const FORBIDDEN_STORAGE_FRAGMENTS = ['localStorage', 'sessionStorage', 'indexedDB'] as const;
const FORBIDDEN_CODE_TOKEN_PATTERN = /\b(order|buy|sell|auth|wallet|account)/i;

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

  it('should find the expected route tree (markets plus research routes)', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(9);
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
    expect(researchRoutes.length).toBeGreaterThanOrEqual(8);

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

  it('should export no mutation method outside app/api/research', async () => {
    const outsideResearch = routeFiles.filter(
      (file) => !file.startsWith(researchDir + path.sep),
    );
    expect(outsideResearch.length).toBeGreaterThan(0);

    for (const file of outsideResearch) {
      const methods = await exportedHttpMethods(file);
      for (const mutation of MUTATION_METHODS) {
        expect(
          methods,
          `${relativePath(file)} must not export mutation method ${mutation}`,
        ).not.toContain(mutation);
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

describe('content safety scans (app/api and lib/research-store)', () => {
  const scannedFiles = [...walkFiles(apiDir), ...walkFiles(researchStoreDir)].filter((file) =>
    file.endsWith('.ts'),
  );

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
