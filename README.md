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

**Phase 2 complete (2026-06-11): decision dossier + deterministic risk verdicts.**
Phase 2 bundles pipeline stages 02 Understand, 03 Research/Predict, and 04
Validate/Risk into one milestone. The detail panel is now a read-only decision
dossier per market:

- **Contract understanding** — deterministic parse of the listed rules: resolution
  clarity, settlement source status, important dates, ambiguity flags. Nothing is
  guessed; missing fields are reported as missing.
- **Research status** — Phase 2 ships NO live research engine. Every brief is
  `not_run` with zero sources and low confidence. The UI says it plainly:
  "Research not run yet. No source = low confidence = SKIP." No citations are
  ever fabricated.
- **Advisory probability** — market-implied probability from the bid/ask midpoint
  (or last price, labeled as weaker). Fair probability stays null without sourced
  research; an edge is never invented from price data alone.
- **Deterministic risk verdict** — `SKIP` / `WATCH` / `PAPER_TRADE` from the
  LLM-free rules engine in `lib/risk`, with every check and reason shown.

Verdict semantics: the default is **SKIP** — a candidate must affirmatively pass
strict checks to earn anything else. **PAPER_TRADE means eligibility only**; there
is no paper journal yet, so no paper trade is recorded in any phase shipped so far.
On live data the verdict is essentially always SKIP (settlement sources unverified,
research not run, no written thesis) — a high SKIP rate is expected and healthy,
not a bug. A serious system mostly says no.

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
