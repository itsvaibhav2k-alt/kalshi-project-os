# UI Design Rules

Binding for all future UI work in this repo.

## Visual north star

The approved design direction is the static mockups:

- `docs/mockups/training-wheels-dashboard.html` (State A — default SKIP path)
- `docs/mockups/training-wheels-dashboard-paper-trade.html` (State B — positive paper-trade path)

Reviewed and approved by Hermes on 2026-06-11. Preserve this exact style in Phase 1 and beyond.

## Hard rules

- Do NOT redesign this into a generic Tailwind/SaaS dashboard aesthetic. No dark neon terminal, no purple gradients, no default component-library look.
- Keep the "printed risk memo" direction: warm paper background, ink-navy text, serif display (Charter/Iowan/Georgia stack), monospace tabular data, hairline rules.
- Anti-dopamine UX is mandatory (see docs/TELEMETRY.md):
  - SKIP renders in calm slate — never alarming red. A high SKIP rate is displayed as a health metric.
  - WATCH and PAPER_TRADE must be visually muted — never bright green, never reward-styled. PAPER_TRADE stays restrained ochre.
  - Reserve warning color for LIVE TRADING LOCKED and failed risk checks only.
  - No confetti, streaks, urgency timers, or celebratory animations. Red/green only for data clarity.
- Every screen that shows a market must show: verdict, reasons (skip reasons or eligibility conditions), and the decision memo (human thesis status, AI brief marked advisory, eligibility).
- No buy/sell buttons in V1. Real-trading affordances render only as visibly disabled/locked. The only enabled actions are paper-journal and watchlist actions, and paper-trade logging always requires human confirmation.
- The masthead always shows: core principle, TRAINING WHEELS — PAPER ONLY badge, LIVE TRADING LOCKED badge.
- Every page footer carries the no-profitability-claims disclaimer while in V1.

## Process

- Material changes to this direction require human approval and a DECISION_LOG.md entry.
- New screens should be mocked in `docs/mockups/` (self-contained HTML, fake data) before implementation when practical.
