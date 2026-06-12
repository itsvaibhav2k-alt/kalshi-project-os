# Safety Model

Status: Phase 0 constitution document. Binding on all future sessions and agents.
Last updated: 2026-06-12

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

## (h) Phase 4 additions: settlement verification + paper decision journal (human-approved)

Phase 4 added two narrowly scoped capabilities under the human-approved Phase 4
plan. Both are recorded in `docs/DECISION_LOG.md`. The (g) boundary between
research-shaped mutations and forbidden trading mutations is unchanged in kind.

**Settlement verification (still a research-namespace mutation):**

- A dedicated settlement-source record per market (`draft` / `human_verified` /
  `rejected`; no deletes) lives under
  `/api/research/[ticker]/settlement-source/**`. Research sources still never
  verify settlement; only a record a human explicitly marks `human_verified`
  (with URL, authority type, and a written verification rationale) counts.
- A verified record satisfies the risk engine's `settlement_source` check via a
  pure overlay in `lib/dossier` — **`lib/risk` is byte-unchanged**, the
  overlay never touches resolution clarity or ambiguity flags, and the
  deterministic engine remains the sole verdict authority. Rejecting the
  record immediately withdraws verification everywhere.

**Paper decision journal (`/api/paper-journal/**` — the second and last
permitted mutation namespace in V1):**

- Entries are simulated decision snapshots only: price, fair range, edge,
  confidence, thesis, settlement record, risk checklist, market snapshot.
  There are **no stake, contract-count, PnL, open/closed-lifecycle, settlement
  outcome, or portfolio fields** — the schema cannot represent them, and a test
  audits the columns. Nothing in the journal touches any marketplace.
- An entry can be created only when the server re-derives the full dossier and
  the deterministic verdict is `PAPER_TRADE` (anything else → 409, with the
  failing risk reasons). Client state never bypasses the rules; a human still
  triggers every entry. The only post-creation mutation is archiving; archived
  rows persist as an audit trail.
- The namespace exports GET/POST/PATCH only (no PUT/DELETE), enforced by the
  same route-aware safety tests; trading, account, credential, and execution
  surfaces remain forbidden everywhere.

**`KALSHI_MARKETS_SOURCE` (read-only data-sourcing toggle):**

- Setting `KALSHI_MARKETS_SOURCE=fixture` makes the server market loader serve
  the checked-in fixtures (always labeled `source: 'fixture'`, with the UI
  banner) instead of fetching live data. It is read per call, only inside
  `app/api/markets/loadMarkets.ts`, and changes nothing but where market data
  comes from — it is not a mutation surface and cannot weaken any check. Its
  purpose is deterministic testing and end-to-end smoke of the paper-only
  pipeline via the clearly synthetic `SYNTH-PAPER-DEMO` fixture market, which
  passes through the same understanding/overlay/risk path as every other
  market with no special-casing.

**Safety-scan carve-out for settlement-domain terms (human-approved):**

- Settlement verification needs the domain word "authority" (e.g. the
  `authority_type` column naming the resolution authority), which collided
  with the safety scan's `auth` token ban. The approved forbidden-token
  pattern is now `/\b(order|buy|sell|auth(?!orit)|wallet|account)/i`: it
  permits exactly `authority`, `authorities`, `authority_type`, and
  `authoritative`, while still forbidding `auth`, `authentication`,
  `authorization`, `authToken`, `authHeader`, auth keys, and every trading
  token. Unit tests pin both the allowed and forbidden word lists so the
  carve-out cannot silently widen.

## (i) Phase 5 addition: AI Research Copilot — drafts are advisory only (human-approved)

Phase 5 added the first AI layer under the human-approved Phase 5 plan,
recorded in `docs/DECISION_LOG.md`. It is a draft-only analyst layer that sits
entirely outside the risk path.

**AI drafts are advisory artifacts, nothing more:**

- A draft (research questions, source checklist, brief draft, thesis critique,
  missing-info analysis, skeptical countercase) never satisfies any risk
  check, never promotes any record (source, brief, thesis, settlement), and
  never creates a paper entry. The draft ledger has no verdict, stake, or PnL
  columns, and drafts are invisible to research summaries and dossier
  snapshots. `lib/risk` is byte-unchanged; the deterministic engine remains
  the sole verdict authority, and human-reviewed research remains the only
  research that counts toward it.

**No provider keys exist or are required:**

- Phase 5 ships only a deterministic local fallback provider
  (`local_deterministic / phase5_fallback`). No LLM API keys, no network calls
  to AI providers, no AI-related environment variables — nothing secret-shaped
  anywhere. Fallback output synthesizes only what the dossier and persisted
  research state actually contain; every missing input is labeled missing,
  never invented. Future real providers must slot in behind the same
  interface without changing any of the above.

**Routes confined to the existing research namespace:**

- The only AI-draft routes are `GET`/`POST`
  `/api/research/[ticker]/ai-drafts` and an archive-only `PATCH`
  `/api/research/[ticker]/ai-drafts/[draftId]` (body exactly
  `{status: 'archived'}`). No new mutation namespace was added, no deletes
  exist, and archived drafts persist as an audit trail.

**Safety scan strengthened, never weakened:**

- The forbidden-token content scan now also covers `lib/ai-research/**` (in
  addition to `app/api/**` and `lib/research-store/**`), so AI prompt and
  template text obeys the same token ban as route and store code. The
  carve-out word lists are unchanged.

---

Any change to this file requires explicit human approval and a `DECISION_LOG.md` entry.
