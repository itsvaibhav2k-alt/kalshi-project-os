# Risk Engine

Status: Phase 0 specification. No implementation exists yet. Future code must conform to this doc.
Last updated: 2026-06-11

The risk engine is the spine of Kalshi Project OS. It is deterministic: hard-coded rules decide
what is allowed. No LLM output, no wallet signal, and no strategy signal ever sits in the verdict
path. LLMs and signals may produce inputs (probability estimates, confidence, evidence); only the
deterministic rules produce verdicts.

Core principle: LLM recommends. Rules permit. Human approves. Execution obeys.

## Verdicts

| Verdict | Meaning | Available in V1 |
|---|---|---|
| `SKIP` | Do nothing. The default. | Yes |
| `WATCH` | Add to watchlist. No paper trade. | Yes |
| `PAPER_TRADE` | Eligible for a logged paper trade only. | Yes |
| `REAL_TRADE_ELIGIBLE_LATER` | Defined for a future phase. LOCKED. Unreachable in V1. | No |

Rules:

- Default verdict is `SKIP`. A candidate must affirmatively pass checks to earn anything else.
- In V1 the engine can only emit `SKIP`, `WATCH`, or `PAPER_TRADE`.
- `REAL_TRADE_ELIGIBLE_LATER` exists in the type system so the future phase has a defined slot,
  but the branch that could emit it is hard-coded closed in V1. Unlocking it requires explicit
  human approval, a `DECISION_LOG.md` entry, and a future phase per `docs/ROADMAP.md`.
- A serious trading system mostly says no. High SKIP rates are expected, not a bug.

## Checks

All checks run on every candidate. Each check has a rationale; future agents must not remove a
check without human approval and a `DECISION_LOG.md` entry.

| # | Check | Rule | Rationale |
|---|---|---|---|
| 1 | Paper-only mode flag | If system is in V1 / Training Wheels Mode, real-money paths are closed; best possible verdict is `PAPER_TRADE`. | V1 is paper-only by constitution. |
| 2 | Platform restrictions | Platform must be supported and enabled (Kalshi first; Polymarket only when verified and enabled). Otherwise `SKIP`. | Do not act on platforms whose terms, eligibility, or data we have not verified. |
| 3 | Resolution clarity | Ambiguous contract wording or unclear resolution criteria = `SKIP`. | Ambiguous contracts cannot be priced honestly; wording risk dominates any edge. |
| 4 | Settlement source clarity | No identifiable, trustworthy settlement source = `SKIP`. | If we cannot verify what settles the contract, we cannot research it. |
| 5 | Bid/ask spread threshold | Spread above `MAX_SPREAD` = `SKIP`. | Wide spreads consume the edge; a fair-value gap is meaningless if crossing the spread eats it. |
| 6 | Liquidity threshold | Volume/open interest/orderbook depth below `MIN_LIQUIDITY` = `SKIP`. | Illiquid markets mean bad fills, slippage, and no realistic exit. |
| 7 | Minimum edge after spread/fees | (fair probability minus market-implied probability), net of spread, fees, and assumed slippage, below `MIN_EDGE` = `SKIP`. | "Seems likely" is not an edge if the market already priced it in. |
| 8 | Confidence minimum | Probability estimate confidence below `MIN_CONFIDENCE` = `SKIP`. No cited source = low confidence = `SKIP`. | AI can sound confident and be wrong; ungrounded estimates are not actionable. |
| 9 | Written thesis required | No written thesis attached to the candidate = `SKIP`. | Forces deliberate reasoning; enables post-mortems and calibration. |
| 10 | Stake/exposure limits | Proposed stake above `MAX_STAKE_PER_TRADE`, or total open exposure would exceed `MAX_TOTAL_EXPOSURE` = `SKIP`. | Caps damage from any single idea or cluster of ideas; applies to paper stakes too so habits form correctly. |
| 11 | Cooldown and daily-loss limits | Two losses already recorded today, or daily loss limit hit, or cooldown active = `SKIP`. | Blocks revenge trading and tilt; losses cluster when discipline breaks. |

Notes:

- Checks 3-9 are hard checks: any failure short-circuits to `SKIP`.
- A candidate that passes the hard market checks but is not yet a complete trade idea (for
  example, edge present but confidence marginal, or thesis pending) may earn `WATCH` per
  explicit rules, never by judgment calls inside the engine.
- Wallet signals and strategy signals are inputs to research; they never bypass any check.
  "Strong wallet entered" does not relax spread, edge, or thesis requirements.

## Thresholds are config-as-constants

- All thresholds (`MAX_SPREAD`, `MIN_LIQUIDITY`, `MIN_EDGE`, `MIN_CONFIDENCE`,
  `MAX_STAKE_PER_TRADE`, `MAX_TOTAL_EXPOSURE`, daily-loss and cooldown values) live in a single
  human-reviewed constants module.
- Threshold values are set and changed only by a human, with a `DECISION_LOG.md` entry.
- No LLM may tune, relax, or rewrite thresholds at runtime or in code without explicit human
  approval. An agent proposing a threshold change must surface it as a proposal, not an edit.
- Loosening any threshold is a safety-relevant change and follows `docs/SAFETY.md`.

## evaluateTradeCandidate (pseudocode)

The following is pseudocode for specification purposes only. It is NOT an implementation and
must not be copied into source files as-is.

```text
PSEUDOCODE — specification only, not implementation

function evaluateTradeCandidate(candidate):
    reasons = []

    # Ordered, deterministic checks. Hard-check failures short-circuit to SKIP.

    if not platformEnabled(candidate.platform):
        return record(candidate, SKIP, ["platform_restricted"])

    if candidate.resolutionClarity != CLEAR:
        return record(candidate, SKIP, ["ambiguous_resolution"])

    if candidate.settlementSource is missing or unverified:
        return record(candidate, SKIP, ["unclear_settlement_source"])

    if candidate.spread > MAX_SPREAD:
        return record(candidate, SKIP, ["spread_too_wide"])

    if candidate.liquidity < MIN_LIQUIDITY:
        return record(candidate, SKIP, ["insufficient_liquidity"])

    netEdge = candidate.fairProbability - candidate.marketImpliedProbability
              - spreadCost(candidate) - feeCost(candidate) - slippageAssumption(candidate)
    if netEdge < MIN_EDGE:
        return record(candidate, SKIP, ["edge_too_small_after_costs"])

    if candidate.sources is empty:
        candidate.confidence = LOW           # no source = low confidence
    if candidate.confidence < MIN_CONFIDENCE:
        return record(candidate, SKIP, ["confidence_below_minimum"])

    if candidate.thesis is missing or empty:
        return record(candidate, SKIP, ["no_written_thesis"])

    if candidate.stake > MAX_STAKE_PER_TRADE
       or projectedExposure(candidate) > MAX_TOTAL_EXPOSURE:
        return record(candidate, SKIP, ["stake_or_exposure_limit"])

    if lossesToday() >= 2 or dailyLossLimitHit() or cooldownActive():
        return record(candidate, SKIP, ["cooldown_or_daily_loss_limit"])

    # All checks passed.

    if PAPER_ONLY_MODE:                      # hard-coded true in V1
        return record(candidate, PAPER_TRADE, [])

    # REAL_TRADE_ELIGIBLE_LATER branch: LOCKED.
    # In V1 this branch is hard-coded unreachable. PAPER_ONLY_MODE is a constant,
    # not a runtime setting. Unlocking requires a future phase, explicit human
    # approval, and a DECISION_LOG.md entry. Until then:
    return record(candidate, PAPER_TRADE, ["real_trade_path_locked"])


function record(candidate, verdict, failedCheckReasons):
    # Every evaluation — pass or fail — is persisted as a RiskCheck record
    # (see docs/DATA_MODEL.md): candidate id, market, platform, all check
    # inputs, all check outcomes, verdict, reasons, timestamp.
    persistRiskCheck(candidate, verdict, failedCheckReasons)
    return { verdict: verdict, reasons: failedCheckReasons }
```

A `WATCH` verdict, where supported, is produced by explicit deterministic rules layered on the
same checks (for example: all market-quality checks pass but no thesis yet). It is never produced
by LLM judgment.

## Audit requirements

- Every evaluation writes a `RiskCheck` record: inputs, per-check outcomes, verdict, reasons,
  timestamp. No silent evaluations.
- Verdicts must be reproducible: same inputs + same constants = same verdict.
- The engine must be fully unit-testable with no network, no LLM calls, and no randomness.

## Definition of done (for the future implementation)

- [ ] Pure deterministic function; no LLM, network, or clock-dependent behavior in the verdict path (cooldown state passed in as input).
- [ ] All checks above implemented, in order, with short-circuit `SKIP` on hard failures.
- [ ] `REAL_TRADE_ELIGIBLE_LATER` defined in types but unreachable; a test asserts it can never be emitted in V1.
- [ ] Thresholds in one constants module; a test asserts the engine reads only from it.
- [ ] Every evaluation persists a `RiskCheck` record; a test asserts no evaluation skips logging.
- [ ] Unit tests cover every check's pass and fail paths, plus the default-SKIP behavior.

## Related docs

- `docs/SAFETY.md` — non-negotiable rules this engine enforces.
- `docs/DATA_MODEL.md` — `RiskCheck`, `PaperTrade`, `ProbabilityEstimate` entities.
- `docs/STRATEGY_MODULES.md` — signals as engine inputs, never verdicts.
- `docs/WALLET_INTELLIGENCE.md` — wallet signals as engine inputs, never verdicts.
- `docs/DECISION_LOG.md` — required entry for any threshold or check change.
