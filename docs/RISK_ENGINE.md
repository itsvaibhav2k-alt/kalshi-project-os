# Risk Engine

Status: Phase 0 specification, plus the Phase 2 implementation-status, Phase 3
input-status, Phase 4 settlement-overlay, and Phase 5 AI-draft-isolation
records below.
Last updated: 2026-06-12

The risk engine is the spine of Kalshi Project OS. It is deterministic: hard-coded rules decide
what is allowed. No LLM output, no wallet signal, and no strategy signal ever sits in the verdict
path. LLMs and signals may produce inputs (probability estimates, confidence, evidence); only the
deterministic rules produce verdicts.

Core principle: LLM recommends. Rules permit. Human approves. Execution obeys.

## Implementation status (Phase 2, 2026-06-11)

An initial implementation exists in `lib/risk/` (`types.ts`, `constants.ts`,
`evaluateTradeCandidate.ts`), exhaustively unit-tested in `tests/risk.test.ts`,
including a static source scan asserting the module contains no network, LLM,
environment, or clock code. The engine is a pure function: `evaluatedAt` is always
supplied by the caller; the same candidate always yields the same evaluation.

The spec sections below remain the long-term target. Phase 2 implements the subset
that has inputs today: stake/exposure limits and cooldown/daily-loss checks (spec
checks 10–11) require a paper journal that does not exist yet, and fees/slippage
are not modeled. The implemented edge check compares the gross expected edge
against the minimum and against the spread.

### Actual constants (`lib/risk/constants.ts`, `RISK_CONSTANTS`)

| Constant | Value | Meaning |
|---|---|---|
| `paperOnlyMode` | `true` | Hard-coded; real-money paths are closed in Training Wheels mode |
| `maxSpreadCents` | `10` | Maximum acceptable bid/ask spread, in binary-contract cents |
| `minVolume` | `1000` | Minimum lifetime volume before liquidity stops warning |
| `minOpenInterest` | `100` | Minimum open interest before liquidity stops warning |
| `minEdgeCents` | `5` | Minimum expected edge, in binary-contract cents (= probability points) |
| `minConfidenceForPaperTrade` | `'medium'` | Minimum advisory confidence for paper-trade eligibility |

Units: `expectedEdge` arrives as a fraction in [0, 1]; the engine compares
`expectedEdge * 100` against `minEdgeCents` (1 cent = 1 probability point). These
values are conservative starters taken verbatim from the approved Phase 2 brief.
They may be changed only by an explicit human decision recorded in
`docs/DECISION_LOG.md` — never tuned by an agent or model, at runtime or in code.

### The twelve implemented checks (in order)

| # | Check id | Outcome |
|---|---|---|
| 1 | `paper_only_mode` | Informational pass: Training Wheels mode is active |
| 2 | `resolution_clarity` | Clarity ≠ `clear` ⇒ fail |
| 3 | `settlement_source` | Source missing OR unverified ⇒ fail (neither Phase 2 nor Phase 3 verifies settlement sources; since Phase 4, a human-verified settlement record can make this check pass via the pure dossier overlay — see the Phase 3 policy and the Phase 4 status section below) |
| 4 | `max_spread` | Spread null or > 10 cents ⇒ fail |
| 5 | `volume` | Volume null or zero ⇒ fail |
| 6 | `liquidity` | Volume < 1000 or open interest < 100 ⇒ warn (caps verdict at WATCH) |
| 7 | `research_sources` | No cited sources ⇒ fail (no source = low confidence = SKIP) |
| 8 | `confidence` | Confidence below `medium` ⇒ fail |
| 9 | `fair_probability` | Fair probability null ⇒ fail (never invented from price) |
| 10 | `min_edge` | Edge null, below 5 cents, or not exceeding the spread ⇒ fail |
| 11 | `written_thesis` | Missing thesis ⇒ fail, but handled specially by the verdict algorithm below |
| 12 | `real_trading_locked` | Informational pass: real trading stays locked |

### Exact verdict algorithm (implemented)

1. Any hard-fail check except `written_thesis` ⇒ **SKIP**.
2. No hard fails, but the thesis is missing ⇒ **WATCH** (a missing thesis never
   turns an otherwise clean candidate into SKIP).
3. No hard fails, but any warning check (e.g. thin liquidity) ⇒ **WATCH**.
4. No hard fails, no warnings, thesis present ⇒ **PAPER_TRADE** (eligibility only;
   no paper journal exists yet, so nothing is ever entered).

`REAL_TRADE_ELIGIBLE_LATER` is deliberately NOT representable in the runtime
verdict type: `RiskVerdict` in `lib/risk/types.ts` is exactly
`'SKIP' | 'WATCH' | 'PAPER_TRADE'`, and every `RiskEvaluation` carries the literal
fields `mode: 'training_wheels'` and `realTradingLocked: true`. Unlocking real
trading requires a future human-approved phase and a `DECISION_LOG.md` entry, not
a type change in passing.

On live Phase 2 data the verdict is essentially always SKIP (unverified settlement
source + research not run + no fair probability), and the live app passes
`hasWrittenThesis: false`, so PAPER_TRADE is unreachable live; WATCH and
PAPER_TRADE paths are proven by synthetic test candidates.

## Phase 3 status (2026-06-11): engine unchanged, inputs now real

Phase 3 made **zero changes** to `lib/risk` — no new files, no edited lines, no
new imports. The purity scan (no network, no LLM, no env, no clock) and every
Phase 2 risk test pass byte-for-byte against the same engine. What changed is
that several checks now receive real, persisted inputs instead of permanent
empty defaults, mapped through `lib/dossier` composition:

| Check | Phase 2 live input | Phase 3 live input |
|---|---|---|
| 7 `research_sources` | always empty (research `not_run`) | currently-accepted persisted sources for the market |
| 8 `confidence` | always `low` | the human-reviewed brief's confidence (still `low` with zero accepted sources) |
| 9 `fair_probability` / 10 `min_edge` | always null | the human-entered fair range, when backed by accepted sources |
| 11 `written_thesis` | always `false` | `true` only for a currently-valid active `ready_for_risk` thesis |

The engine remains the sole verdict authority: persisted rows are research
inputs, never verdicts, and the store cannot reach the engine directly —
`lib/risk` does not import `lib/research-store`, and `lib/dossier` passes only
plain mapped data through the unchanged `RiskCandidate` shape.

**Settlement-source policy (Phase 3, explicit).** Persisted sources never
automatically verify the settlement source — not even an accepted source of kind
`official_resolution_source`. That label is human-entered text about a source,
not verification of the resolution authority. The `settlement_source` check
(check 3) continues to read `understanding.settlementSourceStatus`, which
Phase 3 does not change, so live markets may remain SKIP even with accepted
sources, a human-reviewed brief, a fair-probability range, and a ready thesis.
That outcome is correct behavior and is asserted by a dedicated integration
test. Settlement-source verification is a separate future module requiring
explicit human approval.

## Phase 4 status (2026-06-12): engine still byte-unchanged; settlement check satisfiable by composition

Phase 4 again made **zero changes** to `lib/risk` — byte-for-byte identical, with
the purity scan and every existing risk test passing against the same engine.
What changed is the *input* to check 3 (`settlement_source`):

- `checkSettlementSource` has always passed when
  `understanding.settlementSourceStatus === 'provided'`, a value
  `understandMarket` never emits from market payloads (listed settlement text
  derives `'unverified'`).
- Phase 4 added a pure overlay, `lib/dossier/applySettlementVerification.ts`,
  that returns a NEW understanding object with `settlementSourceStatus:
  'provided'` **only when a local settlement-source record with current status
  `human_verified` exists** for the market. Draft, rejected, and absent records
  return the input unchanged. The overlay is the only path to `'provided'`.
- Research sources still never verify settlement — the Phase 3 policy above is
  unchanged. An accepted `official_resolution_source` research row has no
  effect on this check.
- The overlay never touches `resolutionClarity` or `ambiguityFlags`: an
  ambiguous market with a verified settlement source still SKIPs at the
  independent `resolution_clarity` check.

This is composition, not a rule change: the deterministic engine remains the
sole verdict authority, and a human verification record is an input it judges,
never an approval. With a verified settlement source, accepted sources, a
human-reviewed brief, a sufficient fair-probability edge, and a ready thesis, a
clean market can now genuinely reach `PAPER_TRADE` through the real pipeline
(first proven end-to-end by `tests/settlement-overlay.test.ts`).

**PAPER_TRADE is now actionable — paper-only.** Phase 4 added the paper
decision journal: a human may log a simulated decision snapshot for a market
whose verdict is `PAPER_TRADE`. The journal POST re-derives the dossier
server-side and returns 409 for anything else, so the engine gates every entry.
Entries record context only (price, fair range, edge, confidence, thesis,
settlement record, risk checklist) — no stake, no PnL, no lifecycle, no
execution — and are YES-side only in V1, so NO-side framing remains deferred.
The default verdict remains SKIP, and live markets without human verification
work still SKIP exactly as before.

**Edge convention (YES side).** Expected edge is YES-side signed:
`fairMid − marketImpliedProbability`, a fraction in [0, 1] compared as cents
(`edge × 100`) against `minEdgeCents`. A fair value below the market price
yields a negative edge and therefore SKIP — it is not treated as a NO-side buy
signal. The UI labels the value "Expected edge (YES side)". NO-side framing is
deliberately deferred to the paper-trading phase, where side selection becomes a
journaled decision rather than a display convention.

## Phase 5 status (2026-06-12): engine byte-unchanged; AI drafts are explicitly OUTSIDE risk input

Phase 5 added the AI Research Copilot — an advisory draft layer
(`lib/ai-research` + the `ai_research_drafts` ledger) — with **zero changes**
to `lib/risk`. AI drafts are not risk inputs and never become risk inputs by
existing:

- The engine still reads only its deterministic inputs: contract understanding
  (with the Phase 4 settlement-verification overlay applied), currently
  accepted research sources, the human-reviewed brief's confidence, the
  human-entered fair probability range, a ready written thesis, and market
  microstructure (spread, volume, open interest, prices). Nothing in that list
  changed.
- AI drafts never enter the `RiskCandidate`, the research summary, or the
  persisted research snapshot that `lib/dossier` composes from. Creating
  drafts — all six kinds, on any market — changes neither the verdict nor the
  reasons, asserted by dedicated isolation tests
  (`tests/ai-research-risk-isolation.test.ts`).
- Human-reviewed research remains the only research that counts. A draft
  satisfies nothing on its own: a market still reaches anything beyond SKIP
  only after a human does the actual work (accepting sources, reviewing the
  brief, entering a fair range, readying a thesis, verifying settlement)
  through the existing human loop. The draft layer can at most help the human
  think; it cannot speak to the engine.

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
