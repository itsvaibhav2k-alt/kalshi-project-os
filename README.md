# Kalshi Project OS

An AI-assisted event-market research, paper-trading, risk-control, wallet-intelligence, and calibration operating system. Kalshi-first, event-market-native, Polymarket-ready.

## Status: V1 — Training Wheels Mode

- Paper-only. No real money. No auto-trading. No live order placement. No trading API keys.
- No claims of profitability. Default recommendation is SKIP unless strict checks pass.
- Core principle: **LLM recommends. Rules permit. Human approves. Execution obeys.**

**Phase 1 complete (2026-06-11): read-only Kalshi scanner.** The app ingests public
Kalshi market data and renders a scanner with factual data flags. No paper trading,
no risk verdicts, no AI recommendations yet — those are later phases per
[docs/ROADMAP.md](./docs/ROADMAP.md). Real trading remains locked; the UI shows a
static "REAL TRADING — DISABLED" status panel only.

## Local Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## Test

```bash
npm test
```

Automated tests never call the network; they run against checked-in fixtures in
`tests/fixtures/`.

## Data Source Behavior

- The app reads the public Kalshi market-data API. No API key, no authentication,
  no credentials anywhere in the repo.
- If the live API call fails, the API route serves checked-in fixture data instead.
  Fixture responses are labeled `source: 'fixture'` and the UI shows a
  "FIXTURE — NOT LIVE DATA" banner. Fixture data is never presented as live.

## Start Here

- [CLAUDE.md](./CLAUDE.md) — project constitution and safety rules (read first)
- [docs/VISION.md](./docs/VISION.md) — what this is and why it mostly says SKIP
- [docs/ROADMAP.md](./docs/ROADMAP.md) — phases; execution locked until much later
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — platform-agnostic module design
- [docs/RISK_ENGINE.md](./docs/RISK_ENGINE.md) — deterministic SKIP / WATCH / PAPER_TRADE verdicts
- [docs/SAFETY.md](./docs/SAFETY.md) — non-negotiable guardrails
- [docs/WALLET_INTELLIGENCE.md](./docs/WALLET_INTELLIGENCE.md) — wallet signals, not copy-trading
- [docs/DECISION_LOG.md](./docs/DECISION_LOG.md) — dated decision records
