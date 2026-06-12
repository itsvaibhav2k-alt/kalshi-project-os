# Safety Model

Status: Phase 0 constitution document. Binding on all future sessions and agents.
Last updated: 2026-06-11

Core principle: LLM recommends. Rules permit. Human approves. Execution obeys.

V1 is Training Wheels Mode. The system is a research, paper-trading, and learning desk —
not a gambling app. If speed and safety conflict, choose safety. If hype and auditability
conflict, choose auditability.

## (a) Non-negotiable safety rules

These rules are hard constraints. No agent may remove, weaken, or work around them.

- [ ] V1 is paper-only. No real-money execution.
- [ ] No auto-trading in V1.
- [ ] No live order placement code in V1.
- [ ] No market orders.
- [ ] No trading API keys or secrets in the repo, ever.
- [ ] No claims of profitability. No profit promises.
- [ ] Default recommendation is SKIP unless strict checks pass.
- [ ] The risk engine is deterministic (see `docs/RISK_ENGINE.md`). No LLM in the verdict path.
- [ ] LLM output never directly approves or executes real trades.
- [ ] Wallet/smart-money signals never directly approve or execute real trades.
- [ ] Future real execution must be isolated, locked, and require explicit human approval. Never in V1.
- [ ] No ambiguous markets: ambiguous resolution criteria = SKIP.
- [ ] No paper trade without a written thesis.
- [ ] No source = low confidence.
- [ ] No blind copy-trading, paper or real.
- [ ] Never weaken safety rules for convenience.
- [ ] Do not describe AI as a money printer or wallet-following as guaranteed edge.

Agents can improve workflow. Agents cannot weaken safety. No agent may remove safety rules,
add real execution early, loosen risk thresholds, claim a strategy works without evidence,
store API keys, or create auto-trading without explicit human approval.

## (b) Human behavior guardrails

These protect the user from the user. The system enforces what it can; the rest are written
commitments.

- Written thesis before any paper trade. No thesis = SKIP.
- No revenge trading. After a loss, no immediate re-entry to "win it back."
- No all-ins, paper or real.
- Stop after 2 losses in a day. The risk engine enforces this as a cooldown check.

Suggested future real-money structure (a later phase, never V1):

- Unlimited paper trading first. Real money only after paper evidence.
- Optional $20 learning sub-account, with $80 held in reserve.
- $1-$2 maximum per trade.
- $5 maximum total exposure initially.
- Stop entirely if the $20 sub-account drops to $15.

Risk-tolerance fact the system must design around: losing $50 of $100 would feel devastating
to the user. Therefore the system must make that loss nearly impossible in the early phases —
through paper-only V1, tiny future stakes, hard exposure caps, and stop rules. The first goal
is "learn without getting hurt," not "turn $100 into $200."

## (c) Market guardrails

Each of these is a deterministic SKIP in the risk engine:

- Ambiguous resolution criteria or contract wording = SKIP.
- Spread too wide = SKIP. A fair-value gap is meaningless if crossing the spread eats it.
- Illiquid market (low volume/open interest/depth) = SKIP. No realistic entry or exit.
- Edge too small after spread, fees, and slippage = SKIP. "Seems likely" is not an edge.
- Too-late copy = SKIP. If a tracked wallet entered at 38 cents and the ask is now 52 cents,
  that is not the same trade. Entry-vs-current price must be checked before any paper copy.

## (d) AI guardrails

- Source-grounded research only. Every probability estimate must cite its sources.
- No source = low confidence, and low confidence = SKIP at the risk engine.
- AI is advisory. It researches, summarizes, flags, and suggests. It does not decide.
- AI output never auto-approves anything — not paper trades, not watchlist promotions to
  trades, and never anything real.
- No claims of profitability. RAG and source grounding reduce hallucination; they do not
  create edge. Calibration data (see `docs/EVALS_AND_CALIBRATION.md`) is the only evidence
  the system is allowed to cite about its own performance.

## (e) Wallet guardrails

- Wallet intelligence emits signals, not trades (see `docs/WALLET_INTELLIGENCE.md`).
- No blind copying. A strong wallet's entry is one input to research, never an order.
- Entry-vs-current price check is mandatory before acting on any wallet signal. If the price
  has moved materially since the wallet entered, the copy edge may be gone.
- Track exits, not just entries. A wallet that exits while we hold is a signal we must see.
- Remember the failure modes: late copies, hidden hedges, market-making activity mistaken for
  conviction, different risk tolerance, performance decay, and attention traps. Wallet
  scorecards must distinguish skill from luck before any signal is trusted.

## (f) Reference-system guardrails

- Screenshots and videos of viral Polymarket/AI trading dashboards are unverified inspiration,
  never evidence. Do not trust their PnL claims.
- No "degen mode." No feature exists to bypass risk checks.
- No dopamine-first UI: no green-PnL hype without audit logs, no streak celebrations, no
  urgency mechanics. Telemetry favors calibration, audit trails, and SKIP statistics
  (see `docs/TELEMETRY.md` and `docs/REFERENCE_SYSTEMS.md`).
- Do not weaken safety rules because a viral dashboard shows live auto-execution.

## (g) Local research mutations vs trading mutations (Phase 3, human-approved)

Phase 3 introduced the first writes in the app. The distinction is sharp and
binding:

**Allowed local mutations (research and thesis records only):**

- Saving evidence sources for a market (and accepting/rejecting them).
- Saving a manual research brief.
- Saving a human-entered fair-probability range with its rationale.
- Saving a written thesis (draft, ready-for-risk, archived).

These exist only under `/api/research/**` (GET/POST/PATCH; no PUT, no DELETE —
rejected and archived records remain as an audit trail), write only to the
local gitignored SQLite file, and are enforced by route-aware safety tests.

**Forbidden trading mutations (do not exist anywhere, in any form):**

- Placing orders, paper or real.
- Creating real positions.
- Connecting accounts of any kind.
- Sending orders to any exchange.
- Storing API keys or trading credentials.

A research mutation records what a human thinks; a trading mutation would act
on it. V1 permits only the former. No route, store function, or UI affordance
may cross that line without the explicitly approved future execution phase.

**Settlement-source policy (Phase 3):** persisted sources never automatically
verify the settlement source, even when a human labels an accepted source
`official_resolution_source` — that label is human-entered text, not
verification of the resolution authority. The risk engine's `settlement_source`
check is unchanged, so live markets may remain SKIP even with accepted sources,
a human-reviewed brief, a fair-probability range, and a ready thesis. That is
correct behavior. Settlement-source verification is a separate future module
requiring explicit human approval.

This section was added under the human-approved Phase 3 plan and is recorded in
`docs/DECISION_LOG.md`.

---

Any change to this file requires explicit human approval and a `DECISION_LOG.md` entry.
