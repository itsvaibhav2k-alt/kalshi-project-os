import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KALSHI_BASE_URL,
  KalshiApiError,
  MAX_EVENT_PAGES,
  TARGET_NON_JUNK_MARKETS,
  fetchOpenEvents,
  fetchOpenMarkets,
} from '@/lib/platforms/kalshi/client';
import type { KalshiFetch } from '@/lib/platforms/kalshi/client';
import type { KalshiRawMarket } from '@/lib/platforms/kalshi/types';

function jsonResponse(body: unknown, status = 200): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

/** A multivariate parlay market with no activity — filtered as junk. */
function junkParlayMarket(index: number): KalshiRawMarket {
  return {
    ticker: `KXMVESPORTSMULTIGAMEEXTENDED-${index}`,
    title: 'Parlay combination',
    is_provisional: true,
    mve_collection_ticker: 'KXMVESPORTSMULTIGAMEEXTENDED',
    volume_fp: '0',
    open_interest_fp: '0',
  };
}

/** A regular single market with real activity — kept by the junk filter. */
function realMarket(index: number): KalshiRawMarket {
  return {
    ticker: `KXREAL-${index}`,
    title: `Real market ${index}`,
    volume_fp: '120.00',
    open_interest_fp: '2500.00',
  };
}

/** Wraps nested markets in a one-event events page envelope. */
function eventsPage(markets: KalshiRawMarket[], cursor?: string): Record<string, unknown> {
  return { events: [{ event_ticker: 'KXEVT', category: 'World', markets }], cursor };
}

describe('fetchOpenMarkets', () => {
  it('should return the nested event markets when the first page has real markets', async () => {
    // Arrange
    const payload = eventsPage([realMarket(1)]);
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(payload)));

    // Act
    const result = await fetchOpenMarkets(50, fetchMock as KalshiFetch);

    // Assert
    expect(result.markets).toHaveLength(1);
    expect(result.markets[0].ticker).toBe('KXREAL-1');
  });

  it('should call only the public nested-events GET endpoint when fetching', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(eventsPage([realMarket(1)]))));

    // Act
    await fetchOpenMarkets(25, fetchMock as KalshiFetch);

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method?: string } | undefined,
    ];
    expect(url.startsWith(`${KALSHI_BASE_URL}/events`)).toBe(true);
    expect(url).toContain('limit=25');
    expect(url).toContain('with_nested_markets=true');
    expect(url).not.toMatch(/orders|portfolio|account|auth/);
    const method = init && 'method' in init ? init.method : undefined;
    expect(method === undefined || method === 'GET').toBe(true);
  });

  it('should paginate with the cursor when the first page is 100% junk parlays', async () => {
    // Arrange: page one is all junk (the live KXMV case), page two has real markets.
    const pageOne = eventsPage([junkParlayMarket(1), junkParlayMarket(2)], 'cursor-two');
    const pageTwo = eventsPage([realMarket(1), realMarket(2)]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pageOne))
      .mockResolvedValueOnce(jsonResponse(pageTwo));

    // Act
    const result = await fetchOpenMarkets(100, fetchMock as KalshiFetch);

    // Assert: both pages were fetched and the real markets reached the result.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain('cursor=cursor-two');
    expect(result.markets).toHaveLength(4);
    const tickers = result.markets.map((market) => market.ticker);
    expect(tickers).toContain('KXREAL-1');
    expect(tickers).toContain('KXREAL-2');
  });

  it('should stop at the page cap when every page is junk with a cursor', async () => {
    // Arrange
    let call = 0;
    const fetchMock = vi.fn(() => {
      call += 1;
      return Promise.resolve(jsonResponse(eventsPage([junkParlayMarket(call)], `cursor-${call}`)));
    });

    // Act
    const result = await fetchOpenMarkets(100, fetchMock as KalshiFetch);

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(MAX_EVENT_PAGES);
    expect(result.markets).toHaveLength(MAX_EVENT_PAGES);
  });

  it('should stop fetching once the non-junk target is reached even with a cursor', async () => {
    // Arrange
    const markets = Array.from({ length: TARGET_NON_JUNK_MARKETS }, (_, index) =>
      realMarket(index),
    );
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(eventsPage(markets, 'cursor-unused'))),
    );

    // Act
    const result = await fetchOpenMarkets(100, fetchMock as KalshiFetch);

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.markets).toHaveLength(TARGET_NON_JUNK_MARKETS);
  });

  it('should throw KalshiApiError with status when the API returns HTTP 500', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ error: 'boom' }, 500)));

    // Act
    const promise = fetchOpenMarkets(10, fetchMock as KalshiFetch);

    // Assert
    await expect(promise).rejects.toBeInstanceOf(KalshiApiError);
    await promise.catch((error: unknown) => {
      expect((error as KalshiApiError).status).toBe(500);
    });
  });

  it('should throw KalshiApiError when the response body is malformed JSON', async () => {
    // Arrange
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      }),
    );

    // Act + Assert
    await expect(fetchOpenMarkets(10, fetchMock as KalshiFetch)).rejects.toBeInstanceOf(
      KalshiApiError,
    );
  });

  it('should throw KalshiApiError when the events key is missing from the payload', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ unexpected: true })));

    // Act + Assert
    await expect(fetchOpenMarkets(10, fetchMock as KalshiFetch)).rejects.toBeInstanceOf(
      KalshiApiError,
    );
  });

  it('should throw KalshiApiError when the request aborts on timeout', async () => {
    // Arrange
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );

    // Act
    const promise = fetchOpenMarkets(10, fetchMock as unknown as KalshiFetch);
    const assertion = expect(promise).rejects.toBeInstanceOf(KalshiApiError);
    await vi.advanceTimersByTimeAsync(10_000);

    // Assert
    await assertion;
  });

  it('should wrap network errors in KalshiApiError when fetch rejects', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')));

    // Act + Assert
    await expect(fetchOpenMarkets(10, fetchMock as KalshiFetch)).rejects.toBeInstanceOf(
      KalshiApiError,
    );
  });
});

describe('fetchOpenEvents', () => {
  it('should return the parsed payload when the API responds with events', async () => {
    // Arrange
    const payload = { events: [{ event_ticker: 'KXTEST', category: 'World' }] };
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(payload)));

    // Act
    const result = await fetchOpenEvents(50, fetchMock as KalshiFetch);

    // Assert
    expect(result.events).toHaveLength(1);
    expect(result.events[0].category).toBe('World');
  });

  it('should call only the public events GET endpoint when fetching', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ events: [] })));

    // Act
    await fetchOpenEvents(40, fetchMock as KalshiFetch);

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method?: string } | undefined,
    ];
    expect(url.startsWith(`${KALSHI_BASE_URL}/events`)).toBe(true);
    expect(url).toContain('limit=40');
    expect(url).not.toMatch(/orders|portfolio|account|auth/);
    const method = init && 'method' in init ? init.method : undefined;
    expect(method === undefined || method === 'GET').toBe(true);
  });

  it('should throw KalshiApiError when the events key is missing from the payload', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ markets: [] })));

    // Act + Assert
    await expect(fetchOpenEvents(10, fetchMock as KalshiFetch)).rejects.toBeInstanceOf(
      KalshiApiError,
    );
  });

  it('should throw KalshiApiError with status when the API returns HTTP 404', async () => {
    // Arrange
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, 404)));

    // Act
    const promise = fetchOpenEvents(10, fetchMock as KalshiFetch);

    // Assert
    await expect(promise).rejects.toBeInstanceOf(KalshiApiError);
    await promise.catch((error: unknown) => {
      expect((error as KalshiApiError).status).toBe(404);
    });
  });
});
