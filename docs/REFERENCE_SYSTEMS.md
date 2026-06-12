# Reference Systems

Status: Phase 0 constitution doc. No code in this phase.
Date: 2026-06-11

## What this document is

Analysis of viral Polymarket/AI trading dashboards the user saw in screenshots and video. These references inform UI and architecture patterns for Kalshi Project OS. They are NOT evidence of profitability and NOT a spec to copy.

## Source material (unverified)

Screenshots/video of dashboards claiming to show:

- Live Polymarket trading dashboard
- Claimed realized PnL
- Wallet/whale badges
- BTC 5-minute/hourly markets
- Win rate
- Trades per day
- Live spot feed
- Probability lattice / simulation
- Tail probability ridge / strike landscape
- Relationship-graph mispricing
- Edge vs book
- Confidence
- Latency
- 6-cycle execution pipeline: 01 Scan, 02 Predict, 03 Validate, 04 Size, 05 Fill, 06 Settle

## Evidence rules (binding)

1. Treat all of the above as unverified inspiration only.
2. Profit claims from screenshots are not evidence. A green PnL number in a video proves nothing without audited trade logs, fees, slippage, and full history.
3. Do not weaken any safety rule because a viral dashboard shows live execution.
4. Do not cite these systems as proof that any strategy works.
5. Survivorship applies: dashboards that lost money do not go viral.

## Patterns to ADOPT (as concepts, in their roadmap phases)

| Pattern | Why | Our placement |
|---|---|---|
| Simulation distributions | Show outcome ranges, not point predictions | docs/BACKTESTING_AND_SIMULATION.md, future phase |
| Tail-risk views (ridge/strike landscape) | Make low-probability loss scenarios visible | future simulation phase |
| Edge-vs-book display | Compare fair probability vs market-implied price explicitly | probability engine + UI later |
| Related-market consistency checks | Detect internally inconsistent prices across linked markets | docs/RELATIONSHIP_GRAPH.md, signal-only |
| Live telemetry (freshness, latency) | Know when data is stale before trusting it | docs/TELEMETRY.md |
| Pipeline-stage visibility | Every idea traceable through named stages | docs/TELEMETRY.md |
| Strategy scorecards | Measure each strategy module separately | docs/EVALS_AND_CALIBRATION.md |
| Wallet/whale monitoring | Smart-money activity as one signal among many | docs/WALLET_INTELLIGENCE.md, signal-only |

## Patterns to REJECT

- Degen mode. No high-frequency gambling presets, no "max risk" toggles.
- Dopamine-first UI. No confetti, streaks, urgency timers, or slot-machine framing.
- Green PnL hype without audit logs. Every displayed number must trace to logged records.
- Auto-execution in V1. No live order placement, no market orders, no trading API keys.
- Blind wallet copying. Wallet signals feed the risk engine; they never trigger trades.
- Treating AI as a money printer. LLM output is advisory, never an execution authority.

## Our safer V1 pipeline (paper-only)

```text
01 Scan            — pull active markets, filter junk
02 Understand      — parse contract wording, resolution criteria, settlement source
03 Research/Predict — gather sourced evidence, estimate fair probability range
04 Validate/Risk   — deterministic risk engine: SKIP / WATCH / PAPER_TRADE
05 Paper/Simulate  — log paper trade with thesis; no real orders
06 Settle/Learn    — record outcome, update calibration and scorecards
```

Differences from the viral pipeline: an explicit Understand stage (contract wording is a primary failure mode), risk validation before any sizing concept, and Paper/Simulate replacing Fill. Default verdict is SKIP.

## Future locked real-execution pipeline (NOT in V1)

```text
01 Scan
02 Understand
03 Research/Predict
04 Validate/Risk
05 Size
06 Execute
07 Settle/Learn
```

Constraints on the future pipeline:

- Execution remains locked until a future human-approved real-money phase.
- Stage 06 Execute is isolated from all other modules and requires explicit human approval per trade.
- LLM output and wallet signals never directly approve or execute real trades.
- Core principle applies verbatim: LLM recommends. Rules permit. Human approves. Execution obeys.

## Definition of done for using this doc

- Any future UI or pipeline work cites which adopted pattern it implements.
- Any proposal resembling a rejected pattern is refused and logged in docs/DECISION_LOG.md.
- No code, claims, or commit messages reference the viral dashboards as evidence of profit.
