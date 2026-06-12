# UI NORTH STAR

Status: Approved 2026-06-11 (Hermes review, human-relayed). Binding for all future UI work.
Companion rule file: `.claude/rules/ui-design.md`.

## The north star artifacts

Two static mockups are the visual and product north star for Kalshi Project OS. Both are
self-contained HTML with fake sample data — visual reference artifacts, not app code.

| State | File | Meaning |
|-------|------|---------|
| A | `docs/mockups/training-wheels-dashboard.html` | Default SKIP path — ambiguous market, failed checks, reasons to skip, no eligible action |
| B | `docs/mockups/training-wheels-dashboard-paper-trade.html` | Safe PAPER_TRADE path — all checks pass, written thesis present, $2 capped paper entry, human still confirms |

Do not lose, overwrite, or "modernize" either file. New screens get new mockups in
`docs/mockups/`; these two stay as the reference.

## What State A defines

The system's default posture. Most markets fail deterministic checks. The UI presents
SKIP calmly (slate, never alarming red), lists the failed checks and numbered reasons,
shows the decision memo with `HUMAN THESIS: MISSING — REQUIRED`, and offers no eligible
trade action — only a watchlist note.

## What State B defines

The positive path, deliberately unexciting. All 11 checks pass, the thesis is written
and referenced, the verdict renders in muted ochre (never bright green), eligibility is
framed as conditions ("paper only", "stake capped", "human approves"), and the only
enabled actions are `LOG PAPER TRADE` (with human confirmation) and a watchlist note.
Real trading remains visibly disabled.

## Preserve — non-negotiable

- **Paper-console aesthetic.** Warm paper background, ink-navy text, hairline borders,
  panel cards with minimal shadow. A printed risk memo, not a trading terminal.
- **Serif + mono typography.** Serif display (Charter / Iowan Old Style / Georgia stack)
  for headings and prose; monospace with tabular numerals for all data, labels, and chips.
- **Thin borders, muted colors, calm institutional feel.** Low-saturation palette:
  calm slate SKIP, muted teal WATCH, restrained ochre PAPER_TRADE, sage passes,
  dried-ink red reserved for LIVE TRADING LOCKED and failed checks only.
- **Training Wheels / Paper Only and Live Trading Locked at top level.** Both badges in
  the masthead on every screen, alongside the core principle:
  "LLM recommends. Rules permit. Human approves. Execution obeys."
- **The V1 pipeline row.** 01 Scan → 02 Understand → 03 Research/Predict →
  04 Validate/Risk → 05 Paper/Simulate → 06 Settle/Learn, with the Execute stage
  rendered cross-hatched and locked.
- **Risk-first hierarchy.** Risk verdicts and reasons sit above any trade-related
  affordance, always.
- **The layout.** Scanner + market detail + risk verdict + paper journal + calibration,
  in that arrangement (scanner left, detail/verdict stacked right, journal + calibration
  below).
- **Disabled real trading area.** The cross-hatched `REAL TRADING — DISABLED` affordance
  stays visible — the lock is shown, not hidden.
- **`LOG PAPER TRADE` is paper-only.** It creates a journal entry after human
  confirmation. It is not an order action and must never be wired to an order path in V1.

## Reject — never introduce

- No buy/sell/place-order buttons in V1.
- No degen mode.
- No dopamine-first PnL (no bright green profit styling, confetti, streaks, urgency
  timers, or celebratory animation).
- No generic SaaS redesign (no default Tailwind/component-library look).
- No flashy crypto dashboard redesign (no dark neon terminal, no purple gradients).

## Product principles the UI must express

- **SKIP is a successful outcome.** The SKIP rate is displayed as a health metric
  ("the system working as designed"), never as failure.
- **Calibration before PnL.** Calibration bins and scorecards get equal-or-greater
  visual weight than paper P&L; P&L copy carries the small-sample disclaimer.
- **Risk verdicts above trade actions.** The verdict, checks, reasons, and decision memo
  always precede any action affordance.
- **Every number is traceable.** Verdict panels reference their logged RiskCheck;
  journal rows reference their thesis.

## Application

Future Phase 1 implementation (and every later phase) must use these mockups as the
visual north star. Implementation that cannot match a detail must flag the gap for human
review rather than substituting a generic alternative. Material changes to this direction
require explicit human approval and a `docs/DECISION_LOG.md` entry.
