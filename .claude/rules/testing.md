# Testing Rules (Binding)

Follow the user's global TDD and coverage rules: tests first (RED → GREEN → REFACTOR),
80%+ overall coverage, 90%+ for service-level logic.

## Risk engine tests are the highest priority

The risk engine (`lib/risk/`) is the spine of the system. Its tests gate everything else.

For EVERY deterministic rule (resolution clarity, spread, liquidity, edge threshold,
confidence, written thesis, stake/exposure limits, cooldown/loss limits, platform restrictions):

- [ ] Unit test for the PASS case
- [ ] Unit test for the FAIL case
- [ ] Unit test for the BOUNDARY case (exactly at the threshold)

Additionally required, always:

- [ ] Test the default-SKIP path: when inputs are missing, ambiguous, or no rule grants
      more, the verdict is `SKIP`.
- [ ] Test the locked `REAL_TRADE_ELIGIBLE_LATER` branch: it is unreachable in V1 and
      never produces an executable outcome. A test must fail loudly if anyone unlocks it.
- [ ] Test that only `SKIP`, `WATCH`, `PAPER_TRADE` can be emitted in V1.

## Merge gate

- NO feature merges without tests. No exceptions for "docs-adjacent" code, scripts, or
  "temporary" modules.
- Never fix a failing test by loosening a risk threshold or weakening an assertion on a
  safety behavior. Fix the implementation, or escalate to the human.

## Calibration math

- Calibration logic (bins, predicted-vs-actual, paper PnL, win rate, realized edge,
  Brier score when added) requires unit tests with known hand-computed expected values.

## Conventions

- Arrange-Act-Assert structure; `should [behavior] when [condition]` naming.
- Unit tests mock external dependencies; deterministic risk tests must use no network,
  no clock dependence beyond injected timestamps, no randomness without a seed.
