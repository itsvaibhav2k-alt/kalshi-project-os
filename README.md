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

**Phase 3 complete (2026-06-11, pending human approval to advance): the
research-to-thesis loop with local SQLite persistence.** The dossier is no longer
read-only research: a human can now work a market from evidence to a risk-ready
thesis, and the work persists across refreshes.

- **The loop:** add sources → accept them → write a manual research brief →
  enter a fair-probability range (with rationale, backed by accepted sources) →
  write a thesis → mark it ready for risk. Each step feeds the next; the
  deterministic risk engine in `lib/risk` remains the only verdict authority and
  is byte-for-byte unchanged from Phase 2.
- **Local persistence:** a SQLite database (via `better-sqlite3`) under the
  gitignored `.kalshi-os/` directory. Local-only, never committed, no
  credentials, no cloud. Delete the directory and the app starts clean.
- **Research-only mutations:** the only write routes in the app live under
  `/api/research/**` (GET/POST/PATCH only — no PUT, no DELETE; rejected and
  archived records remain as an audit trail). Trading, order, account, auth,
  wallet, and key mutations do not exist anywhere, enforced by route-aware
  safety tests.
- **Manual research, labeled honestly:** briefs and fair probabilities are
  human-typed. The UI says "manual draft" / "human reviewed" — never
  "AI research" — and a fair probability is never inferred from market price.
- **Settlement-source policy:** persisted sources never auto-verify the
  settlement source, even when a source is labeled `official_resolution_source`
  — that label is human-entered text, not verification of the resolution
  authority. As a result, a live market can carry accepted sources, a
  human-reviewed brief, a fair-probability range, and a ready thesis and
  **still be SKIP** because the settlement source remains unverified. That is
  correct behavior, not a bug. Settlement-source verification is a separate
  future module requiring explicit approval.

No paper journal, no PnL, no calibration, and no execution code exist. This
project makes no claims of profitability; nothing in it is evidence of edge.

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

## Local Persistence (Phase 3)

- Research notes (sources, manual briefs, fair-probability estimates, theses)
  persist to a local SQLite file at `.kalshi-os/kalshi-os.sqlite`. The directory
  is gitignored and never committed.
- The data directory can be overridden with the `KALSHI_DATA_DIR` environment
  variable (used by tests; read only inside `lib/research-store/db.ts`).
- The store holds research and thesis records only — no orders, no positions,
  no account data, no keys.

## Start Here

- [CLAUDE.md](./CLAUDE.md) — project constitution and safety rules (read first)
- [docs/VISION.md](./docs/VISION.md) — what this is and why it mostly says SKIP
- [docs/ROADMAP.md](./docs/ROADMAP.md) — phases; execution locked until much later
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — platform-agnostic module design
- [docs/RISK_ENGINE.md](./docs/RISK_ENGINE.md) — deterministic SKIP / WATCH / PAPER_TRADE verdicts
- [docs/SAFETY.md](./docs/SAFETY.md) — non-negotiable guardrails
- [docs/WALLET_INTELLIGENCE.md](./docs/WALLET_INTELLIGENCE.md) — wallet signals, not copy-trading
- [docs/DECISION_LOG.md](./docs/DECISION_LOG.md) — dated decision records
