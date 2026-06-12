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
