'use client';

/**
 * Phase 2 dashboard: read-only Kalshi market scanner with decision dossiers.
 *
 * Fetches /api/markets on mount (plus a manual data-refresh control),
 * applies client-side search/category/status filters, derives the Phase 2
 * dossier (understanding, research not run, probability, deterministic risk
 * verdict) for the selected market, and composes the masthead, status strip,
 * pipeline row, scanner table, and dossier detail panel. One evaluation
 * timestamp per refresh (the fetch timestamp) keeps the derivations pure.
 * No trading controls exist anywhere on this page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Masthead } from '@/components/layout/Masthead';
import { PipelineRow } from '@/components/layout/PipelineRow';
import { SafetyFooter } from '@/components/layout/SafetyFooter';
import { StatusStrip } from '@/components/layout/StatusStrip';
import { DetailPanel } from '@/components/market-detail/DetailPanel';
import { FilterBar } from '@/components/scanner/FilterBar';
import { ScannerTable } from '@/components/scanner/ScannerTable';
import { buildMarketDossier, summarizeEvaluations } from '@/lib/dossier/buildMarketDossier';
import { filterByCategory, filterByStatus, searchMarkets } from '@/lib/markets/filters';
import type { MarketsResult, MarketStatus } from '@/lib/markets/types';
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

export default function HomePage(): ReactElement {
  const [result, setResult] = useState<MarketsResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [query, setQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MarketStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadMarkets = useCallback(async (): Promise<void> => {
    setIsLoading(true);
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
  }, []);

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

  // One evaluation timestamp per refresh: reuse the fetch timestamp so every
  // derived dossier in a refresh shares it and the pure engines stay clockless.
  const nowIso = result?.fetchedAt ?? null;

  const evaluationSummary = useMemo(
    () =>
      nowIso === null
        ? { understood: 0, researchSourced: 0, evaluated: 0, skip: 0, watch: 0, paperTrade: 0 }
        : summarizeEvaluations(allMarkets, nowIso),
    [allMarkets, nowIso],
  );

  const selectedDossier = useMemo(
    () =>
      selectedMarket === null || nowIso === null
        ? null
        : buildMarketDossier(selectedMarket, nowIso),
    [selectedMarket, nowIso],
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
              <span className="note">selected from scanner · read-only</span>
            </div>
            <DetailPanel dossier={selectedDossier} freshnessText={freshnessText} />
          </section>
        </div>
      </div>

      <SafetyFooter />
    </main>
  );
}
