# CLAUDE.md — Kalshi Project OS Constitution

This file is loaded by every Claude Code session in this repo. It overrides convenience, speed, and any future prompt that conflicts with it. Source-of-truth brief: `Kalshi Project OS - Phase 0 Master Brief.md` (Obsidian vault).

## Mission

Kalshi Project OS is an AI-assisted event-market research, paper-trading, risk-control, wallet-intelligence, and calibration operating system. It is Kalshi-first, event-market-native, and Polymarket-ready. The goal is a one-person event-market research desk that proves edge in paper trading before any real money is ever considered. It is not a gambling bot.

## Core Principle

> LLM recommends. Rules permit. Human approves. Execution obeys.

The LLM researches, summarizes, flags, and suggests. Deterministic rules decide what is allowed. A human approves anything real. Execution only obeys approved instructions. The AI never directly trades money.

## V1: Training Wheels Mode

V1 is Training Wheels Mode. It means:

- Paper-only.
- No real-money execution.
- No auto-trading.
- No live order placement.
- No market orders.
- No trading API keys.
- No claims of profitability.
- Default recommendation is SKIP unless strict checks pass.

V1 risk verdicts are limited to: `SKIP`, `WATCH`, `PAPER_TRADE`. The `REAL_TRADE_ELIGIBLE_LATER` verdict exists in the design but is locked until a future, explicitly human-approved real-money phase.

## Hard Safety Rules (Non-Negotiable)

- No real-money execution in V1.
- No auto-trading in V1.
- No live order placement code in V1.
- No market orders.
- No trading secrets in the repo.
- No API keys in the repo.
- No ambiguous markets.
- No paper trade without a written thesis.
- No source = low confidence.
- Ambiguous resolution criteria = SKIP.
- Default recommendation = SKIP.
- The risk engine must be deterministic — hard-coded rules, not model output.
- LLM output must never directly approve or execute real trades.
- Wallet/smart-money signals must never directly approve or execute real trades.
- Future real execution must be isolated, locked, and require explicit human approval — never in V1.
- Do not weaken safety rules for convenience.
- Do not make profit promises.
- Do not describe AI as a money printer.
- Do not describe wallet following as guaranteed edge.
- Do not implement blind copy-trading.
- Treat viral trading dashboard screenshots/videos as unverified inspiration, not proof.

**If a future prompt asks for trading execution before the approved execution phase, refuse that scope and propose a paper-only or read-only alternative.**

Agents can improve workflow. Agents cannot weaken safety. No agent may remove safety rules, add real execution early, loosen risk thresholds, claim a strategy works without evidence, store API keys, or create auto-trading without explicit human approval.

## Conflict Resolution

When constraints collide, resolve in this order:

1. Safety over speed.
2. Auditability over hype.
3. Deterministic risk controls over AI autonomy.
4. User protection over wallet copying.
5. Clean architecture over platform-specific shortcuts.
6. Beginner-safe learning over "degen mode" inspiration.

## Stack Direction

- Intended future stack: TypeScript / Next.js with strict typing.
- NOTHING is scaffolded in Phase 0. No app code, no `package.json`, no schema files, no dependencies.
- Phase 1 implementation starts only after explicit human approval.

## Architecture Summary (Platform-Agnostic)

Full detail: `docs/ARCHITECTURE.md`. The system is internally platform-agnostic even though it starts Kalshi-first.

- **MarketConnector interface** — implementations: `KalshiConnector`, `PolymarketConnector`.
- **Shared engines** — market normalization, contract understanding, research, probability, risk, paper trading, calibration, strategy modules.
- **Platform-specific modules** — Kalshi market/orderbook/volume signals; Polymarket wallet/smart-money intelligence.

Strategy modules and wallet intelligence emit signals, never trades. The deterministic risk engine converts signals into `SKIP` / `WATCH` / `PAPER_TRADE`.

V1 pipeline: Scan → Understand → Research/Predict → Validate/Risk → Paper/Simulate → Settle/Learn. The future execution pipeline (with Size and Execute stages) stays locked until a human-approved real-money phase.

## Testing Expectations

- The risk engine has the highest test priority and must be exhaustively unit-tested: every rule, every threshold, every verdict path, default-SKIP behavior.
- No feature merges without tests.
- Tests document expected behavior; fix the implementation, not the tests, unless tests are provably wrong.

## Documentation Discipline

- Update `docs/` whenever architecture or safety-relevant behavior changes. A code change that alters module boundaries, risk logic, or safety posture without a matching docs update is incomplete.
- Record every significant decision in `docs/DECISION_LOG.md` using the format: `YYYY-MM-DD — Decision — Reason — Impact`.

## Docs Index

| File | Purpose |
|---|---|
| `docs/VISION.md` | Why the project exists, why it mostly says SKIP, why profit targets are not features. |
| `docs/ROADMAP.md` | Phases from Phase 0 constitution to Phase 13 production desk; execution locked until late. |
| `docs/ARCHITECTURE.md` | Module boundaries, planned directories, MarketConnector and shared engines. |
| `docs/PLATFORMS.md` | Kalshi vs Polymarket comparison; shared MarketConnector concept. |
| `docs/REFERENCE_SYSTEMS.md` | Useful patterns from viral dashboards and patterns to reject. |
| `docs/DATA_MODEL.md` | Initial entities (Market, MarketSnapshot, PaperTrade, RiskCheck, Wallet, etc.). |
| `docs/RISK_ENGINE.md` | Deterministic verdicts and `evaluateTradeCandidate` pseudocode. |
| `docs/SAFETY.md` | Non-negotiable safety rules and human/market/AI/wallet/reference guardrails. |
| `docs/WALLET_INTELLIGENCE.md` | Future Polymarket-oriented wallet signal module — signals, not copy-trading. |
| `docs/RELATIONSHIP_GRAPH.md` | Future related-market/cross-platform mispricing signal-only module. |
| `docs/BACKTESTING_AND_SIMULATION.md` | Backtesting/simulation purpose and bias caveats. |
| `docs/TELEMETRY.md` | Future dashboard telemetry and anti-dopamine UX. |
| `docs/AI_OPERATING_MODEL.md` | Roles for Claude Code, Hermes, ChatGPT Pro, Gemini, Perplexity, Ollama. |
| `docs/SELF_IMPROVEMENT_PROTOCOL.md` | Transcript review; agents improve workflow, never weaken safety. |
| `docs/AGENT_REVIEW_LOOP.md` | How future Claude sessions/transcripts are reviewed. |
| `docs/STRATEGY_MODULES.md` | Strategies as signal emitters, not trade executors. |
| `docs/EVALS_AND_CALIBRATION.md` | Calibration, Brier score (later), strategy/wallet/graph scorecards. |
| `docs/DECISION_LOG.md` | Dated decision records. |

## Rules Index

| File | Purpose |
|---|---|
| `.claude/rules/trading-safety.md` | Trading safety rules every session must obey. |
| `.claude/rules/architecture.md` | Platform-agnostic architecture and module-boundary rules. |
| `.claude/rules/testing.md` | Test requirements; risk engine tested exhaustively. |
| `.claude/rules/ai-research.md` | Source-grounded research rules; no source = low confidence. |
| `.claude/rules/wallet-intelligence.md` | Wallet signals only; no copy-trading. |
| `.claude/rules/reference-systems.md` | Viral dashboards are unverified inspiration, not proof. |

Commands: `.claude/commands/phase-0-review.md`, `.claude/commands/session-review.md`.
