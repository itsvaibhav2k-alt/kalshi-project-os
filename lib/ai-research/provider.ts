/**
 * Provider selection for advisory AI research drafts (Phase 5).
 *
 * Phase 5 is fallback-first: the deterministic local provider is the only
 * implementation, and nothing here reads the environment. This function is
 * the single extension point where a future, explicitly human-approved
 * provider would slot in behind the same interface — with no key required
 * for tests or build, and the fallback always available. Whatever provider
 * runs, its output stays advisory and outside the deterministic risk path.
 */

import { createFallbackProvider } from './fallbackProvider';
import type { AiResearchProvider } from './types';

/**
 * Returns the active advisory draft provider.
 *
 * @returns The deterministic local fallback provider (Phase 5 only option).
 */
export function getAiResearchProvider(): AiResearchProvider {
  return createFallbackProvider();
}
