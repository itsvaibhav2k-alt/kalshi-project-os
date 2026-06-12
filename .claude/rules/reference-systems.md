# Reference Systems Rules (Binding)

The user has shared screenshots/videos of viral Polymarket/AI trading dashboards (claimed
realized PnL, whale badges, win rates, live execution pipelines). Treat all of it as
unverified inspiration only.

## Hard rules

- NEVER cite viral dashboards, screenshots, or videos as evidence that a strategy or system
  is profitable. Screenshot PnL is not data. Claimed win rates are not calibration.
- NEVER copy degen-mode or dopamine-first UX patterns: green PnL hype without audit logs,
  streak celebrations, urgency framing, gambling-style reinforcement.
- NEVER justify weakening a safety rule by pointing to what viral systems do ("they have
  live auto-execution, so we should too" is an automatic refusal).
- NEVER import their auto-execution or blind wallet-copying behavior in any form.

## What may be adopted

- Adopt ONLY the patterns listed in `docs/REFERENCE_SYSTEMS.md` under "patterns to adopt".
  If a pattern is not on that list, propose adding it there (with reasoning) before building it.
- For orientation, the adoptable category covers things like: simulation distributions,
  tail-risk views, edge-vs-book display, related-market consistency checks, live telemetry,
  pipeline-stage visibility, strategy scorecards, and wallet/whale monitoring as signals.
  `docs/REFERENCE_SYSTEMS.md` is the authoritative list.

## Pipeline boundary

- Our V1 pipeline is: Scan → Understand → Research/Predict → Validate/Risk →
  Paper/Simulate → Settle/Learn.
- Reference systems show Size/Fill/Execute stages. Those stages stay locked until a future
  human-approved real-money phase. Do not build them because a reference system has them.

## Conflict resolution

- Viral "degen mode" inspiration vs. beginner-safe learning → choose beginner-safe learning.
- Hype vs. auditability → choose auditability.
