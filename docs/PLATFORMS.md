# PLATFORMS.md

Status: Phase 0 planning document.
Date: 2026-06-11

Kalshi Project OS is Kalshi-first, event-market-native, and Polymarket-ready. This doc
compares the two platforms and defines what the shared `MarketConnector` abstraction
covers versus what stays platform-specific.

## Comparison table

| Dimension | Kalshi | Polymarket |
|---|---|---|
| Regulation | U.S.-regulated prediction/event contract exchange. Clean U.S. compliance posture | 2022 CFTC penalty for offering event-based binary options without proper registration/designation; wound down noncompliant markets. Current public claims: Americans can trade and Polymarket is CFTC-regulated/legal in the U.S. — must be verified before any real-money use |
| Market coverage | Weather, economics, politics, financial/event contracts | Large global coverage: sports, politics, culture, crypto, geopolitics, news |
| Liquidity | Adequate for learning | Generally larger event-market liquidity |
| Data access | Prices, bid/ask, orderbook, volume, open interest, price movement, contract rules, settlement source (API-based market data) | Market/price/volume data plus public trader/wallet activity |
| Wallet visibility | Likely none — no public per-trader wallet attribution assumed | Yes — public wallet/trader activity enables smart-money tracking |
| Role in this project | First platform: clean regulated learning environment and API-based market data | Later platform: liquidity plus wallet-intelligence signals |
| V1 usage | Market data only, paper trading against live prices | Not integrated in V1; planned connector + wallet intelligence in later phases |

## Kalshi (first)

- U.S.-regulated exchange; the safer initial platform for learning event markets.
- Provides what the V1 pipeline needs: prices, bid/ask spread, orderbook, volume, open
  interest, price movement, contract rules, settlement source.
- No assumed public wallet visibility. The system cannot say "this exact whale wallet
  bought this market" on Kalshi. Wallet intelligence is therefore not a Kalshi feature.
- V1 connector is read-only market data. No trading API keys, no order endpoints.

## Kalshi API findings (Phase 1, 2026-06-11)

Observed while building the Phase 1 connector:

- Public market data requires no API key. All Phase 1 ingestion is unauthenticated
  read-only access; no credentials exist anywhere in the repo.
- Prices come back as dollar strings (e.g. `yes_bid_dollars`) and volume/open interest
  as fixed-point strings (`volume_fp`, `open_interest_fp`). The connector parses these
  into normalized numeric fields.
- Market payloads do not include a category. Category comes from
  `/events?with_nested_markets=true`, so the connector joins events to markets.
- Market payloads do not include an explicit settlement-source field. Such markets are
  flagged "missing settlement source" in the UI.
- The orderbook endpoint is not used in Phase 1. Its auth requirement is unverified —
  TODO: verify before Phase 2 planning.
- Multivariate parlay markets (markets carrying `mve_` fields, provisional status,
  zero volume) are filtered out as junk by the scanner.

## Polymarket (later)

- History: in 2022 the CFTC penalized Polymarket for offering event-based binary
  options without proper registration/designation, and Polymarket had to wind down
  noncompliant markets. That was the old reason U.S. users were considered excluded.
- Current public Polymarket/app information claims Americans can trade and that
  Polymarket is CFTC-regulated/legal in the U.S. Treat this as a claim to verify, not
  an established fact inside this project.
- Value to this project: large liquidity, broad market coverage, and public
  wallet/trader activity that enables the wallet-intelligence signal module
  (see docs/WALLET_INTELLIGENCE.md). Wallet signals are signals only — never
  approvals, never auto-copying.

## Shared MarketConnector concept

Defined in docs/ARCHITECTURE.md. Summary:

- One `MarketConnector` interface; `KalshiConnector` and `PolymarketConnector`
  implementations.
- Connector responsibilities: fetch markets, fetch market detail (rules, resolution
  criteria, settlement source), fetch orderbook/prices, fetch snapshots — all
  normalized to shared entities (see docs/DATA_MODEL.md).
- Capability flags expose platform differences, e.g. `hasWalletVisibility` is true for
  Polymarket only. Shared engines check flags; they never hardcode platform behavior.

Stays platform-specific:

- Kalshi: orderbook/volume/open-interest signal details and Kalshi contract-rule
  parsing quirks.
- Polymarket: wallet/trader activity ingestion and the wallet-intelligence module.
- Authentication/account mechanics (none needed for V1 read-only data; never trading
  credentials in V1 regardless).

Stays shared:

- Normalization, contract understanding, research, probability estimation, risk engine,
  paper trading, calibration, strategy framework.

## TODO — required before any Polymarket real-money use

Inside the actual product (not from screenshots, marketing, or third-party summaries),
verify:

- [ ] Current terms of service
- [ ] KYC/account onboarding flow
- [ ] State-level eligibility for the user
- [ ] Current regulatory status (CFTC registration/designation claims)

This TODO blocks any real-money Polymarket phase. It does not block the future
read-only Polymarket data connector or paper-only wallet-intelligence work, which
remain subject to the V1 safety rules: paper-only, no trading keys, no execution.
