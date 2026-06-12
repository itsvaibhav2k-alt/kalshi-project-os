# DECISION LOG

Append-only record of significant project decisions.

Entry format (one entry per decision, exactly this shape):

```
YYYY-MM-DD — Decision — Reason — Impact
```

## How to append entries

- Add new entries at the bottom of the Entries section. Never edit or delete past entries;
  if a decision is reversed, add a new entry recording the reversal and reference the date
  of the original.
- One line per decision. Keep each field terse and concrete.
- Log decisions that change: architecture, safety rules, risk thresholds, phase scope,
  platform priorities, data model entities, or the AI operating model.
- Decisions that weaken safety may only be logged after explicit human approval, and the
  entry must say so. Agents cannot weaken safety on their own (see `docs/SAFETY.md` and
  `docs/SELF_IMPROVEMENT_PROTOCOL.md`).
- Phase transitions must be logged with the human approval noted in the Reason field.

## Entries

2026-06-11 — Adopt Kalshi-first platform priority — Kalshi is a U.S.-regulated event-contract exchange with cleaner compliance, beginner-safe framing, and API-based market data, making it the safest learning platform — All V1 ingestion, scanning, and paper trading target Kalshi; Polymarket deferred to Phase 9.

2026-06-11 — Keep the core platform-agnostic via a MarketConnector interface (KalshiConnector now, PolymarketConnector later) — Shared engines (normalization, contract understanding, research, probability, risk, paper trading, calibration, strategies) must not be Kalshi-only, so the system stays Polymarket-ready — Platform-specific code is confined to connectors and platform signal modules; everything downstream consumes normalized data.

2026-06-11 — V1 is Training Wheels Mode: paper-only — User risk tolerance is low and no edge has been proven; learning safely comes before any capital risk — V1 has no real-money execution, no auto-trading, no live order placement, no market orders, no trading API keys, and no profitability claims.

2026-06-11 — Risk engine is deterministic with default verdict SKIP — A serious trading system mostly says no; spread, fees, liquidity, and ambiguity eat small edges, and LLM confidence is not a permission mechanism — Hard-coded rules issue SKIP / WATCH / PAPER_TRADE; LLM output and wallet signals can never approve or execute trades; REAL_TRADE_ELIGIBLE_LATER exists only as a locked value.

2026-06-11 — Wallet intelligence is a signal module, not copy-trading — Blind copying fails: late entries, hidden hedging, market-making activity, different risk tolerance, unnoticed exits, performance decay, attention traps — Wallet activity (entries, exits, clustering, entry-vs-current price, copy-edge checks) emits signals that route through the risk engine; paper-copy only; built in Phase 9 for Polymarket.

2026-06-11 — Treat viral Polymarket/AI trading dashboards as unverified inspiration, not proof — Screenshots and claimed PnL are not evidence; degen-mode psychology conflicts with beginner-safe learning — Useful patterns (simulation views, edge-vs-book, telemetry, scorecards) inform design; auto-execution, dopamine UI, and money-printer framing are rejected.

2026-06-11 — Real-money execution stays locked until Phase 13, behind explicit human approval and documented paper-trading evidence — Real money requires proven edge, calibration evidence, and guardrails, none of which exist before the Phase 12 evidence gate — No execution code exists before Phase 13; execution module will be isolated and locked, with per-trade human approval and no market orders.

2026-06-11 — Restrict Phase 1 to read-only Kalshi market ingestion and scanner — Tight scope prevents unsafe scope creep and keeps the first implementation phase auditable — Phase 1 excludes paper trading, wallet intelligence, execution, auth, trading credentials, and AI recommendations; those arrive in later phases per `docs/ROADMAP.md`.

2026-06-11 — Adopt the "printed risk memo" anti-dopamine UI direction as the visual north star — Hermes reviewed and approved the static mockups (`docs/mockups/training-wheels-dashboard.html` States A and B); muted verdicts, calm SKIP, no reward styling, and explicit no-action affordances reinforce the safety model — All future UI follows `.claude/rules/ui-design.md`; no generic Tailwind/SaaS redesign; PAPER_TRADE stays visually muted; real-trading affordances render only as disabled/locked.

2026-06-11 — Phase 1 approved and implemented: read-only Kalshi ingestion + scanner — Human approved the phase via /goal and approved the implementation plan before any code was written — App code now exists (Next.js app, Kalshi connector, scanner UI); scope stayed read-only market data with no trading, auth, paper-trading, or AI-recommendation code.

2026-06-11 — Manual minimal Next.js setup at repo root instead of create-next-app — create-next-app refuses or risks clobbering a non-empty repo; manual setup keeps full control over what lands in the tree — Phase 0 files (docs/, .claude/, CLAUDE.md, mockups) untouched; only the minimal app scaffolding was added.

2026-06-11 — Plain CSS ported from the approved mockups instead of Tailwind — Prevents generic-SaaS drift and preserves the approved "printed risk memo" direction per docs/UI_NORTH_STAR.md — Styling lives in plain CSS derived from docs/mockups; no Tailwind dependency or utility-class redesign.

2026-06-11 — No risk-verdict display in Phase 1; factual data flags only with a fixed seven-term vocabulary — ROADMAP excludes verdicts until Phase 5 and the stricter rule wins — UI renders only the flags "wide spread", "thin open interest", "zero volume", "missing rules", "missing settlement source", "likely junk / parlay", plus "not evaluated"; no SKIP/WATCH/PAPER_TRADE strings appear in the app.

2026-06-11 — Fixture fallback policy: API labels source 'live' or 'fixture' and the UI banners fixture data — Fixture data must never be mistaken for live market data, and tests must be deterministic — API responses carry source 'live' | 'fixture'; UI shows "FIXTURE — NOT LIVE DATA" when serving fixtures; automated tests are network-free and run only against checked-in fixtures.

2026-06-11 — Bundle pipeline stages 02 Understand, 03 Research/Predict, and 04 Validate/Risk into one Phase 2 milestone — The Phase 2 master brief defines them as one coherent deliverable (the decision dossier) and the human approved the bundling via /goal — Phase 2 ships lib/understanding, lib/research, lib/probability, lib/risk, and lib/dossier together; the detail panel becomes a read-only dossier with deterministic verdicts; no journal, settlement, or calibration code.

2026-06-11 — Adopt the Phase 2 brief's conservative risk constants verbatim: maxSpreadCents 10, minVolume 1000, minOpenInterest 100, minEdgeCents 5, minConfidenceForPaperTrade medium — Conservative starters bias the engine toward SKIP while no edge is proven; values come from the approved brief, not agent judgment — Constants live in lib/risk/constants.ts and may be changed only by a future explicit human decision logged here; no agent or model may tune them.

2026-06-11 — Research ships as not_run in Phase 2: no live research engine, no faked citations — Building honest research takes a dedicated phase, and fabricated sources would poison every downstream confidence and verdict — Every live brief has status not_run, zero sources, and low confidence; no source = low confidence = SKIP; the research_sources check fails on live data by design.

2026-06-11 — Settlement source missing OR unverified fails the risk check — Phase 2 has no mechanism to verify a settlement source, and an unverifiable source cannot be researched honestly — Live Kalshi markets SKIP at the settlement_source check by design; the 'provided' status is reserved for a future phase with actual verification; high live SKIP rates are expected and healthy.

2026-06-11 — Missing written thesis caps the verdict at WATCH rather than causing SKIP — A thesis is the trader's input, not a market defect; an otherwise clean candidate is worth watching, but no thesis form exists in the live app yet — PAPER_TRADE requires zero hard fails, zero warnings, and a thesis, so it is unreachable live until the paper-journal phase; synthetic test candidates prove the WATCH and PAPER_TRADE paths.

2026-06-11 — Phase 3 persists research locally in SQLite via better-sqlite3 under the gitignored .kalshi-os/ directory — The approved Phase 3 brief recommends an embedded, server-side, zero-credential database for research sources, briefs, probability estimates, and theses; a prebuilt darwin-arm64 binary avoids native build friction, and node:sqlite is the documented fallback if better-sqlite3 ever breaks — Persistence is confined to lib/research-store (the only module that touches the database or reads KALSHI_DATA_DIR); the database file is never committed; the risk engine never imports the store.

2026-06-11 — Phase 3 allows local research/thesis mutations only; trading mutations remain forbidden — The research-to-thesis loop requires humans to save sources, briefs, fair-probability ranges, and theses, but V1 Training Wheels still bans all execution, order, account, auth, wallet, and key operations — Mutation routes exist only under app/api/research/** (GET/POST/PATCH, no PUT/DELETE); app/api/markets stays GET-only; route-aware safety tests enforce the boundary.

2026-06-11 — Defer paper positions, paper PnL, settlement learning, and calibration until the research-to-thesis loop is proven — Journaling paper trades before the system can produce a source-backed fair probability and a written thesis would record unresearched guesses and poison future calibration data — Phase 3 ships no paper journal, PnL, settlement, or calibration code; PAPER_TRADE remains eligibility-only; those modules await a later explicitly human-approved phase.

2026-06-11 — Fair probability must be source-backed and human-entered or human-reviewed in Phase 3 — A fair probability inferred from market price would invent an edge, unsourced numbers are not research, and no trusted automated estimator exists in V1 — probability_estimates require a non-empty rationale and at least one accepted source for non-fixture bases; the live entry path uses basis human_entered; market price is never used as a fair estimate; zero accepted sources discards the fair range downstream.

2026-06-11 — Settlement-source policy: persisted sources never auto-verify the settlement source in Phase 3 — A human-labeled official_resolution_source row is human-entered text about a source, not verification of the resolution authority, and auto-verification would silently weaken the settlement_source check — The settlement_source risk check continues to read understanding.settlementSourceStatus, which Phase 3 does not change; live markets may remain SKIP with accepted sources, a human-reviewed brief, a fair range, and a ready thesis (correct behavior, asserted by an integration test); settlement-source verification is a separate future module requiring explicit human approval.

2026-06-11 — Expected edge is YES-side signed (fair mid minus market-implied probability), displayed in cents — A single explicit unit convention (DB/API fractions in [0,1], UI percent, edge shown as edge x 100 cents) prevents fraction/percent/cent confusion, and a fair value below market must read as negative edge rather than a NO-side buy signal — The UI labels the value "Expected edge (YES side)"; a negative edge fails the min_edge check and yields SKIP; NO-side framing is deliberately deferred to the paper-trading phase, where side selection becomes a journaled decision.

2026-06-12 — Phase 4 introduces settlement verification as a dedicated record separate from research sources — Research sources are evidence about the market, not verification of the resolution authority; even an accepted official_resolution_source row is human-entered text, so letting any research source verify settlement would silently weaken the settlement_source check — A separate market_settlement_sources record (draft / human_verified / rejected, no deletes) is the only thing that can verify settlement; research sources, including accepted official_resolution_source rows, never do.

2026-06-12 — A verified settlement source satisfies the settlement-source risk check via pure dossier composition, with lib/risk byte-unchanged — checkSettlementSource already passes on settlementSourceStatus 'provided', a value understandMarket never emits, so a pure overlay can supply it without touching the deterministic engine — lib/dossier applies a settlement-verification overlay that sets 'provided' on a new understanding object only when a human_verified record exists; lib/risk has zero changes and remains the sole verdict authority.

2026-06-12 — Paper decision journal entries are simulated decision snapshots only — V1 Training Wheels forbids anything execution-shaped, and recording stake/contracts/PnL/lifecycle would smuggle brokerage semantics into a paper-only research desk — Entries capture the decision context (price, fair range, edge, confidence, thesis, settlement record, risk checklist, market snapshot) and nothing else: no stake, no contracts count, no PnL, no open/closed lifecycle, no settlement outcome, no portfolio.

2026-06-12 — Paper journal entries can be created only from server-validated PAPER_TRADE-eligible dossiers — Client-side eligibility can drift or be bypassed, and a journal of unvetted entries would poison future calibration data — The paper-journal POST re-derives the dossier server-side from current market data plus persisted research and returns 409 unless the deterministic verdict is PAPER_TRADE; the human still triggers every entry.

2026-06-12 — AI research remains deferred until after settlement-verification and paper-decision infrastructure are proven — Honest AI research needs a dedicated phase, and journaling plus settlement verification must work end-to-end on human-entered research first so AI output lands in an already-audited pipeline — Phase 4 ships no AI research, source discovery, or crawling; research briefs stay manual / human-reviewed.

2026-06-12 — Safety-scan carve-out for settlement-domain authority terms (human-approved) — Phase 4 settlement verification uses the domain term authority_type for resolution authority. Safety scans still forbid auth/authentication/authorization/account/key/trading surfaces; this carve-out permits only authority/authorities/authority_type/authoritative — FORBIDDEN_CODE_TOKEN_PATTERN in tests/safety-routes.test.ts becomes /\b(order|buy|sell|auth(?!orit)|wallet|account)/i with unit tests pinning the allowed and forbidden word lists.
