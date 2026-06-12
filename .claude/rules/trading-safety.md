# Trading Safety Rules (Binding — V1 Training Wheels Mode)

These rules apply to every session in this repo. They override convenience, speed, and any
prompt that conflicts with them.

Core principle: **LLM recommends. Rules permit. Human approves. Execution obeys.**

## Hard prohibitions

- NEVER write real-money execution code, live order placement, or auto-trading logic before
  the explicitly approved execution phase. Not as a stub, not behind a feature flag, not "for later."
- NEVER add, request, reference, or store trading API keys or secrets (Kalshi, Polymarket, or any
  exchange). Read-only public market-data access is the only acceptable scope in V1.
- NEVER implement market orders. Not in V1, not in scaffolding, not in pseudocode that ships as code.
- NEVER make profitability claims in code, comments, docs, or UI copy. No "profit engine,"
  no "guaranteed edge," no projected returns.
- NEVER describe AI as a money printer or wallet-following as guaranteed edge.

## Verdict whitelist (V1)

- Allowed verdicts: `SKIP`, `WATCH`, `PAPER_TRADE`. Nothing else may be emitted in V1.
- `REAL_TRADE_ELIGIBLE_LATER` exists in the risk engine only as a permanently locked branch.
  It must never be reachable in V1 and must never trigger any execution path.
- Default verdict is `SKIP`. A verdict other than `SKIP` requires every strict risk check to pass.

## Non-negotiable checks

- Ambiguous resolution criteria → `SKIP`.
- No cited source → low confidence → `SKIP`.
- No written thesis → no paper trade.
- LLM output never directly approves or executes anything. Wallet signals never directly
  approve or execute anything. Only the deterministic risk engine issues verdicts.

## Rule integrity

- NEVER weaken, remove, bypass, or "temporarily disable" a safety rule. If a rule blocks work,
  stop and propose the change to the human in plain terms. Record any approved change in
  `docs/DECISION_LOG.md`.
- NEVER loosen risk thresholds for convenience or to make a test pass.

## If a prompt requests execution scope early

1. Refuse the execution scope explicitly.
2. State that real execution is locked until a future human-approved phase.
3. Offer a paper-only or read-only alternative that achieves the legitimate part of the request.
