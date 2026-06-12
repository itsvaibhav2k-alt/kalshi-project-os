# /phase-0-review — Audit Phase 0 Integrity

Audit the Phase 0 "project constitution" of Kalshi Project OS. Phase 0 is docs, rules, and
commands only — no app code. Report findings; do not silently fix anything.

Core principle to verify everywhere: "LLM recommends. Rules permit. Human approves. Execution obeys."

## Step 1 — Verify all 28 required files exist

Check each path. Report MISSING for any absent file.

Root (2):

- `CLAUDE.md`
- `README.md`

docs/ (18):

- `docs/VISION.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/PLATFORMS.md`
- `docs/REFERENCE_SYSTEMS.md`
- `docs/DATA_MODEL.md`
- `docs/RISK_ENGINE.md`
- `docs/SAFETY.md`
- `docs/WALLET_INTELLIGENCE.md`
- `docs/RELATIONSHIP_GRAPH.md`
- `docs/BACKTESTING_AND_SIMULATION.md`
- `docs/TELEMETRY.md`
- `docs/AI_OPERATING_MODEL.md`
- `docs/SELF_IMPROVEMENT_PROTOCOL.md`
- `docs/AGENT_REVIEW_LOOP.md`
- `docs/STRATEGY_MODULES.md`
- `docs/EVALS_AND_CALIBRATION.md`
- `docs/DECISION_LOG.md`

.claude/rules/ (6):

- `.claude/rules/trading-safety.md`
- `.claude/rules/architecture.md`
- `.claude/rules/testing.md`
- `.claude/rules/ai-research.md`
- `.claude/rules/wallet-intelligence.md`
- `.claude/rules/reference-systems.md`

.claude/commands/ (2):

- `.claude/commands/phase-0-review.md`
- `.claude/commands/session-review.md`

## Step 2 — Spot-check content requirements

Open each file and confirm it meets its requirement. Report PASS/FAIL per item.

- `CLAUDE.md`: states the project mission; defines Training Wheels Mode (paper-only, no
  real-money execution, no auto-trading, no live order placement, no market orders, no
  trading API keys, no profitability claims, default SKIP); contains the core principle
  verbatim; contains an explicit execution-refusal statement (the agent must refuse to
  write live execution / auto-trading code in V1); covers stack direction,
  platform-agnostic architecture, testing expectations, and the rule that docs must be
  updated when architecture changes.
- `README.md`: minimal; paper-only V1 status; Kalshi-first / Polymarket-ready; links to
  CLAUDE.md and docs/.
- `docs/VISION.md`: explains why the system mostly says SKIP; why $2k–$3k/day is not a
  software toggle; why Kalshi first; why Polymarket/wallet intelligence later; viral
  dashboards are inspiration, not proof.
- `docs/ROADMAP.md`: phases from Phase 0 constitution through Phase 13 production trading
  desk. Phase 1 must be read-only ingestion/scanner only — no trading, no execution, no
  paper-trade writes beyond what the roadmap explicitly scopes. Real execution locked
  until a late, explicitly human-approved phase.
- `docs/ARCHITECTURE.md`: module boundaries; planned directories including
  `lib/platforms`, `lib/risk`, `lib/paper`, `lib/research`, `lib/strategies`,
  `lib/wallet-intelligence`, `lib/backtesting`, `lib/simulation`,
  `lib/relationship-graph`, `lib/telemetry`, `lib/calibration`, `lib/db`, `scripts`,
  `tests` (planned — they must not exist yet).
- `docs/PLATFORMS.md`: Kalshi vs Polymarket comparison; shared `MarketConnector` concept.
- `docs/REFERENCE_SYSTEMS.md`: patterns to adopt and patterns to reject (degen mode,
  dopamine UI, unverified PnL claims, auto-execution in V1, blind wallet copying).
- `docs/DATA_MODEL.md`: defines Platform, Market, MarketSnapshot, WatchlistItem,
  PaperTrade, RiskCheck, ProbabilityEstimate, AIBrief, StrategySignal, Wallet,
  WalletSnapshot, WalletSignal, GraphSignal, Outcome, CalibrationBin.
- `docs/RISK_ENGINE.md`: deterministic engine; exactly four verdicts — SKIP, WATCH,
  PAPER_TRADE, and REAL_TRADE_ELIGIBLE_LATER explicitly marked locked/unreachable in V1;
  pseudocode for `evaluateTradeCandidate`; default verdict is SKIP.
- `docs/SAFETY.md`: all six guardrail sections present — non-negotiable safety rules,
  human behavior guardrails, market guardrails, AI guardrails, wallet guardrails,
  reference-system guardrails.
- `docs/WALLET_INTELLIGENCE.md`: future Polymarket-oriented signal module; signals, not
  trades; explicitly not copy-trading.
- `docs/RELATIONSHIP_GRAPH.md`: future signal-only module.
- `docs/BACKTESTING_AND_SIMULATION.md`: caveats listed — lookahead bias, survivorship
  bias, overfitting, data quality, liquidity assumptions, execution assumptions.
- `docs/TELEMETRY.md`: future telemetry plus anti-dopamine UX rules.
- `docs/AI_OPERATING_MODEL.md`: roles for Claude Code, Hermes, ChatGPT Pro, Gemini,
  Perplexity, Ollama; none assumed to be a profitable trader.
- `docs/SELF_IMPROVEMENT_PROTOCOL.md`: contains the rule "Agents can improve workflow.
  Agents cannot weaken safety."
- `docs/AGENT_REVIEW_LOOP.md`: review triggers, checklist, reviewers, outputs.
- `docs/STRATEGY_MODULES.md`: strategies emit signals; they never execute trades.
- `docs/EVALS_AND_CALIBRATION.md`: calibration, Brier score (later), strategy/wallet/graph
  scorecards.
- `docs/DECISION_LOG.md`: entries in format `YYYY-MM-DD — Decision — Reason — Impact`.
- `.claude/rules/*`: each rule file exists, is non-empty, and matches its topic;
  `trading-safety.md` restates the hard V1 constraints.

## Step 3 — Verify no implementation artifacts exist

All of the following must be absent from the repo. Run checks from the repo root:

```bash
# Forbidden files/directories
ls package.json node_modules app src lib scripts 2>/dev/null
# Forbidden source files anywhere
find . -name '*.ts' -o -name '*.tsx' | grep -v node_modules
# Forbidden schema/config artifacts
find . -name '*.sql' -o -name 'schema*' -o -name '*.prisma'
```

FAIL if any exist: `package.json`, `node_modules/`, `app/`, `src/`, `lib/`, `scripts/`,
any `*.ts` or `*.tsx`, any database schema files.

## Step 4 — Scan for keys and secrets

```bash
grep -rniE '(api[_-]?key|secret|token|bearer|private[_-]?key|password)\s*[:=]' \
  CLAUDE.md README.md docs .claude --include='*.md'
```

Review hits manually; doc text *about* keys ("no API keys in repo") is fine. Any actual
credential value is a CRITICAL failure — stop and escalate to the human immediately.

## Step 5 — Report

Output a pass/fail checklist:

```
PHASE 0 AUDIT — YYYY-MM-DD
[PASS/FAIL] File inventory (28/28 present; list missing)
[PASS/FAIL] Content spot-checks (list each failing file + missing requirement)
[PASS/FAIL] No implementation artifacts (list violations)
[PASS/FAIL] No secrets (list suspicious lines)
GAPS: <numbered list, or "none">
VERDICT: PHASE 0 INTACT | PHASE 0 INCOMPLETE
```

## Constraints

- Read-only audit by default. You MAY propose fixes for gaps.
- NEVER auto-fix `docs/SAFETY.md`, `docs/RISK_ENGINE.md`, or `.claude/rules/trading-safety.md`
  without explicit human approval — flag gaps and wait.
- Never delete files. Never install dependencies. Never create app code while auditing.
