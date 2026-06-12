'use client';

/**
 * Phase 3 dashboard: Kalshi market scanner with research-to-thesis dossiers.
 *
 * Fetches /api/markets plus the bulk /api/research summary map on each
 * refresh, and the full /api/research/[ticker] state plus the paper journal
 * entries when a market is selected and after every mutation. Market data
 * stays read-only; research, thesis, settlement-verification, paper-only
 * decision-journal, and advisory AI-draft records are the ONLY mutations in
 * V1, and they are advisory inputs — the deterministic risk engine alone
 * issues verdicts. AI drafts sit entirely outside the risk path.
 * One evaluation timestamp per refresh (the fetch timestamp) keeps the
 * derivations pure. No trading controls exist anywhere on this page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Masthead } from '@/components/layout/Masthead';
import { PipelineRow } from '@/components/layout/PipelineRow';
import { SafetyFooter } from '@/components/layout/SafetyFooter';
import { StatusStrip } from '@/components/layout/StatusStrip';
import { DetailPanel } from '@/components/market-detail/DetailPanel';
import type {
  AiDraftActions,
  PaperJournalActions,
  ResearchActions,
} from '@/components/market-detail/researchActions';
import { FilterBar } from '@/components/scanner/FilterBar';
import { ScannerTable } from '@/components/scanner/ScannerTable';
import {
  buildMarketDossierWithResearch,
  summarizeEvaluations,
} from '@/lib/dossier/buildMarketDossier';
import type { PersistedResearchSnapshot } from '@/lib/dossier/types';
import { filterByCategory, filterByStatus, searchMarkets } from '@/lib/markets/filters';
import type { MarketsResult, MarketStatus } from '@/lib/markets/types';
import { toPersistedResearchSnapshot } from '@/lib/research-store/snapshot';
import type {
  AiResearchDraftRecord,
  PaperDecisionEntryRecord,
  ResearchStateResponse,
  ResearchSummary,
  ResearchSummaryMap,
} from '@/lib/research-store/types';
import { formatFreshness } from '@/lib/utils/format';

const FRESHNESS_TICK_MS = 30_000;

/** Derives the sorted list of distinct categories present in the data. */
function deriveCategories(result: MarketsResult | null): string[] {
  if (result === null) {
    return [];
  }
  const unique = new Set<string>();
  for (const market of result.markets) {
    if (market.category !== null) {
      unique.add(market.category);
    }
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}

/**
 * Converts one bulk research summary into the dossier snapshot DTO.
 *
 * Bulk summaries deliberately omit brief state and fair values, so this
 * mapping stays conservative: a human-reviewed flag maps to that state,
 * any other accepted-source research is treated as a draft brief (so the
 * pipeline counts markets with accepted-source research), and the fair range
 * stays null — a fair probability is never invented client-side, which means
 * non-selected markets evaluate without one. The selected market always uses
 * the full per-ticker snapshot (via the shared `toPersistedResearchSnapshot`)
 * instead. The active verified settlement record DOES flow through here so
 * bulk verdict counts match the selected-market dossier.
 */
function snapshotFromSummary(summary: ResearchSummary): PersistedResearchSnapshot {
  const verified = summary.verifiedSettlementSource;
  return {
    acceptedSourceCount: summary.acceptedSourceCount,
    briefState: summary.hasHumanReviewedBrief
      ? 'human_reviewed'
      : summary.acceptedSourceCount > 0
        ? 'draft'
        : 'not_run',
    confidence: summary.researchConfidence,
    fairLow: null,
    fairMid: null,
    fairHigh: null,
    hasReadyThesis: summary.hasReadyThesis,
    settlementVerification:
      verified === null
        ? null
        : {
            id: verified.id,
            title: verified.title,
            url: verified.url,
            publisher: verified.publisher,
            authorityType: verified.authorityType,
            status: 'human_verified',
            updatedAt: verified.updatedAt,
          },
  };
}

/** Extracts the calm error message from a research API failure response. */
async function readResearchError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const body = data as { error?: unknown; fieldErrors?: unknown };
      if (typeof body.error === 'string') {
        const fieldErrors = Array.isArray(body.fieldErrors)
          ? body.fieldErrors.filter((item): item is string => typeof item === 'string')
          : [];
        return fieldErrors.length > 0 ? `${body.error} — ${fieldErrors.join('; ')}` : body.error;
      }
    }
  } catch {
    // Fall through to the generic status message below.
  }
  return `research API responded with HTTP ${response.status}`;
}

export default function HomePage(): ReactElement {
  const [result, setResult] = useState<MarketsResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [query, setQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MarketStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [researchSummaries, setResearchSummaries] = useState<ResearchSummaryMap>({});
  const [researchBulkError, setResearchBulkError] = useState<string | null>(null);
  const [selectedResearch, setSelectedResearch] = useState<ResearchStateResponse | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [paperEntries, setPaperEntries] = useState<PaperDecisionEntryRecord[] | null>(null);
  const [paperJournalError, setPaperJournalError] = useState<string | null>(null);
  const [aiDrafts, setAiDrafts] = useState<AiResearchDraftRecord[] | null>(null);
  const [aiDraftsError, setAiDraftsError] = useState<string | null>(null);

  const loadResearchSummaries = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/research');
      if (!response.ok) {
        throw new Error(await readResearchError(response));
      }
      const data = (await response.json()) as ResearchSummaryMap;
      setResearchSummaries(data);
      setResearchBulkError(null);
    } catch (error: unknown) {
      setResearchBulkError(
        error instanceof Error ? error.message : 'Unexpected failure loading research summaries',
      );
    }
  }, []);

  const loadMarkets = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    void loadResearchSummaries();
    try {
      const response = await fetch('/api/markets');
      if (!response.ok) {
        throw new Error(`markets API responded with HTTP ${response.status}`);
      }
      const data = (await response.json()) as MarketsResult;
      setResult(data);
      setFetchError(null);
    } catch (error: unknown) {
      setFetchError(
        error instanceof Error ? error.message : 'Unexpected failure loading market data',
      );
    } finally {
      setIsLoading(false);
      setNowMs(Date.now());
    }
  }, [loadResearchSummaries]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const allMarkets = useMemo(() => result?.markets ?? [], [result]);

  const visibleMarkets = useMemo(() => {
    const searched = searchMarkets(allMarkets, query);
    const byCategory = filterByCategory(searched, activeCategory);
    return filterByStatus(byCategory, statusFilter);
  }, [allMarkets, query, activeCategory, statusFilter]);

  const categories = useMemo(() => deriveCategories(result), [result]);

  const selectedMarket = useMemo(
    () => allMarkets.find((market) => market.id === selectedId) ?? null,
    [allMarkets, selectedId],
  );
  const selectedTicker = selectedMarket?.externalId ?? null;

  // Guards against a slow response for a previously selected market landing
  // after the user has already moved on to another one.
  const selectedTickerRef = useRef<string | null>(null);
  selectedTickerRef.current = selectedTicker;

  const loadSelectedResearch = useCallback(async (ticker: string): Promise<void> => {
    try {
      const response = await fetch(`/api/research/${encodeURIComponent(ticker)}`);
      if (!response.ok) {
        throw new Error(await readResearchError(response));
      }
      const data = (await response.json()) as ResearchStateResponse;
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setSelectedResearch(data);
      setResearchError(null);
    } catch (error: unknown) {
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setSelectedResearch(null);
      setResearchError(
        error instanceof Error ? error.message : 'Unexpected failure loading research state',
      );
    }
  }, []);

  const loadPaperEntries = useCallback(async (ticker: string): Promise<void> => {
    try {
      const response = await fetch(`/api/paper-journal/${encodeURIComponent(ticker)}`);
      if (!response.ok) {
        throw new Error(await readResearchError(response));
      }
      const data = (await response.json()) as { paperEntries: PaperDecisionEntryRecord[] };
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setPaperEntries(data.paperEntries);
      setPaperJournalError(null);
    } catch (error: unknown) {
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setPaperEntries(null);
      setPaperJournalError(
        error instanceof Error ? error.message : 'Unexpected failure loading paper journal entries',
      );
    }
  }, []);

  // Advisory AI drafts for the selected market. Drafts live entirely outside
  // the risk path; this loader only feeds the copilot panel's display.
  const loadAiDrafts = useCallback(async (ticker: string): Promise<void> => {
    try {
      const response = await fetch(`/api/research/${encodeURIComponent(ticker)}/ai-drafts`);
      if (!response.ok) {
        throw new Error(await readResearchError(response));
      }
      const data = (await response.json()) as { aiDrafts: AiResearchDraftRecord[] };
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setAiDrafts(data.aiDrafts);
      setAiDraftsError(null);
    } catch (error: unknown) {
      if (selectedTickerRef.current !== ticker) {
        return;
      }
      setAiDrafts(null);
      setAiDraftsError(
        error instanceof Error ? error.message : 'Unexpected failure loading AI drafts',
      );
    }
  }, []);

  useEffect(() => {
    setSelectedResearch(null);
    setResearchError(null);
    setPaperEntries(null);
    setPaperJournalError(null);
    setAiDrafts(null);
    setAiDraftsError(null);
    if (selectedTicker !== null) {
      void loadSelectedResearch(selectedTicker);
      void loadPaperEntries(selectedTicker);
      void loadAiDrafts(selectedTicker);
    }
  }, [selectedTicker, loadSelectedResearch, loadPaperEntries, loadAiDrafts]);

  const mutateResearch = useCallback(
    async (
      ticker: string,
      path: string,
      method: 'POST' | 'PATCH',
      body: unknown,
    ): Promise<string | null> => {
      try {
        const response = await fetch(`/api/research/${encodeURIComponent(ticker)}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          return await readResearchError(response);
        }
        await loadSelectedResearch(ticker);
        void loadResearchSummaries();
        return null;
      } catch (error: unknown) {
        return error instanceof Error ? error.message : 'Unexpected research API failure';
      }
    },
    [loadSelectedResearch, loadResearchSummaries],
  );

  const researchActions = useMemo<ResearchActions>(() => {
    const requireTicker = (): string | null => selectedTickerRef.current;
    return {
      addSource: async (payload) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(ticker, '/sources', 'POST', payload);
      },
      updateSource: async (sourceId, patch) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(ticker, `/sources/${encodeURIComponent(sourceId)}`, 'PATCH', patch);
      },
      saveBrief: async (payload) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(ticker, '/brief', 'POST', { ...payload, basis: 'manual' });
      },
      saveFairRange: async (payload) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(ticker, '/probability', 'POST', {
              ...payload,
              basis: 'human_entered',
              briefId: selectedResearch?.brief?.id ?? null,
            });
      },
      saveSettlementSource: async (payload) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(ticker, '/settlement-source', 'POST', payload);
      },
      updateSettlementSource: async (settlementSourceId, patch) => {
        const ticker = requireTicker();
        return ticker === null
          ? 'no market is selected'
          : mutateResearch(
              ticker,
              `/settlement-source/${encodeURIComponent(settlementSourceId)}`,
              'PATCH',
              patch,
            );
      },
      saveThesis: async (payload, thesisId) => {
        const ticker = requireTicker();
        if (ticker === null) {
          return 'no market is selected';
        }
        // Saving always re-links the currently accepted sources and the
        // latest estimate; the server re-validates readiness against rows.
        const acceptedIds = (selectedResearch?.sources ?? [])
          .filter((source) => source.status === 'accepted')
          .map((source) => source.id);
        const body = {
          ...payload,
          sourceIds: acceptedIds,
          probabilityEstimateId: selectedResearch?.probabilityEstimate?.id ?? null,
        };
        return thesisId === null
          ? mutateResearch(ticker, '/thesis', 'POST', body)
          : mutateResearch(ticker, `/thesis/${encodeURIComponent(thesisId)}`, 'PATCH', body);
      },
    };
  }, [mutateResearch, selectedResearch]);

  // Mirrors mutateResearch for the paper-only journal namespace. After a
  // successful mutation the journal entries AND the research state are
  // re-fetched so the displayed verdict and the journal stay consistent.
  const mutatePaperJournal = useCallback(
    async (path: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> => {
      try {
        const response = await fetch(`/api/paper-journal${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          return await readResearchError(response);
        }
        const ticker = selectedTickerRef.current;
        if (ticker !== null) {
          await loadPaperEntries(ticker);
          await loadSelectedResearch(ticker);
        }
        void loadResearchSummaries();
        return null;
      } catch (error: unknown) {
        return error instanceof Error ? error.message : 'Unexpected paper journal API failure';
      }
    },
    [loadPaperEntries, loadSelectedResearch, loadResearchSummaries],
  );

  const paperJournalActions = useMemo<PaperJournalActions>(
    () => ({
      logPaperDecision: async () => {
        const ticker = selectedTickerRef.current;
        return ticker === null
          ? 'no market is selected'
          : mutatePaperJournal(`/${encodeURIComponent(ticker)}/entries`, 'POST', { side: 'YES' });
      },
      archiveEntry: async (entryId) => {
        const ticker = selectedTickerRef.current;
        return ticker === null
          ? 'no market is selected'
          : mutatePaperJournal(`/entries/${encodeURIComponent(entryId)}`, 'PATCH', {
              status: 'archived',
            });
      },
    }),
    [mutatePaperJournal],
  );

  // Advisory AI-draft mutations reuse the research mutation helper (same
  // /api/research namespace) and then refresh the drafts list, mirroring how
  // paper actions refresh the journal. Drafts never alter research state or
  // the deterministic verdict.
  const aiDraftActions = useMemo<AiDraftActions>(
    () => ({
      generateDraft: async (draftType, userFocus) => {
        const ticker = selectedTickerRef.current;
        if (ticker === null) {
          return 'no market is selected';
        }
        const outcome = await mutateResearch(ticker, '/ai-drafts', 'POST', {
          draftType,
          userFocus,
        });
        if (outcome === null) {
          await loadAiDrafts(ticker);
        }
        return outcome;
      },
      archiveDraft: async (draftId) => {
        const ticker = selectedTickerRef.current;
        if (ticker === null) {
          return 'no market is selected';
        }
        const outcome = await mutateResearch(
          ticker,
          `/ai-drafts/${encodeURIComponent(draftId)}`,
          'PATCH',
          { status: 'archived' },
        );
        if (outcome === null) {
          await loadAiDrafts(ticker);
        }
        return outcome;
      },
    }),
    [mutateResearch, loadAiDrafts],
  );

  // One evaluation timestamp per refresh: reuse the fetch timestamp so every
  // derived dossier in a refresh shares it and the pure engines stay clockless.
  const nowIso = result?.fetchedAt ?? null;

  // Bulk summaries map conservatively (no fair values); the selected market's
  // full per-ticker snapshot overrides its bulk entry.
  const researchByTicker = useMemo(() => {
    const map: Record<string, PersistedResearchSnapshot> = {};
    for (const [ticker, summary] of Object.entries(researchSummaries)) {
      map[ticker] = snapshotFromSummary(summary);
    }
    if (selectedResearch !== null) {
      map[selectedResearch.ticker] = toPersistedResearchSnapshot(selectedResearch);
    }
    return map;
  }, [researchSummaries, selectedResearch]);

  const evaluationSummary = useMemo(
    () =>
      nowIso === null
        ? { understood: 0, researchSourced: 0, evaluated: 0, skip: 0, watch: 0, paperTrade: 0 }
        : summarizeEvaluations(allMarkets, nowIso, researchByTicker),
    [allMarkets, nowIso, researchByTicker],
  );

  const selectedSnapshot = useMemo(
    () =>
      selectedResearch !== null &&
      selectedTicker !== null &&
      selectedResearch.ticker === selectedTicker
        ? toPersistedResearchSnapshot(selectedResearch)
        : null,
    [selectedResearch, selectedTicker],
  );

  const selectedDossier = useMemo(
    () =>
      selectedMarket === null || nowIso === null
        ? null
        : buildMarketDossierWithResearch(selectedMarket, selectedSnapshot, nowIso),
    [selectedMarket, selectedSnapshot, nowIso],
  );

  const freshnessText = result === null ? null : formatFreshness(result.fetchedAt, nowMs);
  const stripSource: 'live' | 'fixture' | 'error' =
    fetchError !== null ? 'error' : result?.source ?? 'error';
  const counts = {
    scanned: result?.counts.scanned ?? 0,
    junkFiltered: result?.counts.junkFiltered ?? 0,
    shown: visibleMarkets.length,
  };

  return (
    <main>
      <Masthead />
      {result === null && fetchError === null ? (
        <p className="loading-line">loading market data…</p>
      ) : (
        <StatusStrip
          source={stripSource}
          fetchedAt={result?.fetchedAt ?? null}
          error={fetchError ?? result?.error ?? null}
          freshnessText={freshnessText}
        />
      )}
      <PipelineRow counts={counts} summary={evaluationSummary} />
      {researchBulkError === null ? null : (
        <p className="loading-line">research summaries unavailable: {researchBulkError}</p>
      )}

      <div className="grid-top">
        <section className="panel" aria-label="Market scanner">
          <div className="panel-head">
            <h2>Market Scanner</h2>
            <span className="head-tools">
              <span className="note">
                read-only · {counts.scanned} scanned · {counts.shown} shown
              </span>
              <button
                type="button"
                className="refresh-btn"
                onClick={() => void loadMarkets()}
                disabled={isLoading}
              >
                {isLoading ? 'refreshing…' : 'refresh data'}
              </button>
            </span>
          </div>
          <FilterBar
            query={query}
            onQueryChange={setQuery}
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
          {isLoading && result === null ? (
            <p className="loading-line">loading market data…</p>
          ) : fetchError !== null && result === null ? (
            <p className="loading-line">market data unavailable: {fetchError}</p>
          ) : (
            <ScannerTable
              markets={visibleMarkets}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          <div className="scanner-foot">
            <span>
              source: {result?.source ?? 'none'} · flags are factual data quality notes, not
              recommendations
            </span>
            <span>
              {result?.error === null || result === null
                ? `data freshness: ${freshnessText ?? 'unknown'}`
                : `fallback reason: ${result.error}`}
            </span>
          </div>
        </section>

        <div className="detail-stack">
          <section className="panel" aria-label="Market detail">
            <div className="panel-head">
              <h2>Market Detail</h2>
              <span className="note">market data read-only · research notes editable</span>
            </div>
            <DetailPanel
              dossier={selectedDossier}
              freshnessText={freshnessText}
              research={selectedSnapshot === null ? null : selectedResearch}
              researchError={researchError}
              actions={researchActions}
              paperEntries={paperEntries}
              paperJournalError={paperJournalError}
              paperActions={paperJournalActions}
              aiDrafts={aiDrafts}
              aiDraftsError={aiDraftsError}
              aiDraftActions={aiDraftActions}
            />
          </section>
        </div>
      </div>

      <SafetyFooter />
    </main>
  );
}
