/**
 * Raw Kalshi public API payload shapes, as observed in the Phase 1 fixtures.
 *
 * These types describe READ-ONLY public market data only. They stay isolated
 * in this module; the rest of the app consumes NormalizedMarket instead.
 * Fields the public payload may omit are optional.
 */

/** One price range step descriptor from the public market payload. */
export interface KalshiPriceRange {
  start?: string;
  end?: string;
  step?: string;
}

/** One selected leg of a multivariate (parlay-style) market. */
export interface KalshiMveSelectedLeg {
  event_ticker?: string;
  market_ticker?: string;
  side?: string;
  [key: string]: unknown;
}

/** A raw market object from GET /markets (public, unauthenticated). */
export interface KalshiRawMarket {
  ticker?: string;
  event_ticker?: string;
  title?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  market_type?: string;
  status?: string;
  result?: string;
  can_close_early?: boolean;
  early_close_condition?: string;
  created_time?: string;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
  expected_expiration_time?: string;
  latest_expiration_time?: string;
  expiration_value?: string;
  updated_time?: string;
  occurrence_datetime?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  previous_yes_bid_dollars?: string;
  previous_yes_ask_dollars?: string;
  notional_value_dollars?: string;
  liquidity_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  yes_bid_size_fp?: string;
  yes_ask_size_fp?: string;
  rules_primary?: string;
  rules_secondary?: string;
  settlement_timer_seconds?: number;
  price_level_structure?: string;
  price_ranges?: KalshiPriceRange[];
  response_price_units?: string;
  fractional_trading_enabled?: boolean;
  custom_strike?: unknown;
  strike_type?: string;
  is_provisional?: boolean;
  mve_collection_ticker?: string;
  mve_selected_legs?: KalshiMveSelectedLeg[];
  [key: string]: unknown;
}

/** A raw event object from GET /events (public, unauthenticated). */
export interface KalshiRawEvent {
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  sub_title?: string;
  category?: string;
  mutually_exclusive?: boolean;
  available_on_brokers?: boolean;
  collateral_return_type?: string;
  strike_period?: string;
  last_updated_ts?: string;
  markets?: KalshiRawMarket[];
  [key: string]: unknown;
}

/** Top-level response envelope for GET /markets. */
export interface KalshiMarketsResponse {
  markets: KalshiRawMarket[];
  cursor?: string;
}

/** Top-level response envelope for GET /events. */
export interface KalshiEventsResponse {
  events: KalshiRawEvent[];
  cursor?: string;
}
