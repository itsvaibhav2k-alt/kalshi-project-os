# Wallet Intelligence Rules (Binding)

Wallet intelligence (smart-money / whale tracking, primarily Polymarket-oriented) emits
signals, not trades. This is a research module, never an execution module.

## Hard prohibitions

- Wallet signals are research inputs, NEVER trades. No code path may turn a wallet signal
  directly into a paper trade, an order, or a verdict.
- NO blind copy-trading logic, ever. Not in V1, not in any future phase. "Wallet X bought,
  so we buy" is forbidden as code, as a strategy, and as a default.
- Wallet signals never approve or execute anything. They flow into the deterministic risk
  engine like any other signal.

## Required signal context

Any consumer of wallet signals MUST:

- [ ] Compare the wallet's entry price to the current market price.
- [ ] Flag explicitly when the copy edge is gone (e.g., wallet entered YES at 42 cents,
      current ask is 55 cents → "copy edge may be gone").
- [ ] Track EXITS, not just entries. A wallet exiting while we hold is a first-class signal.
- [ ] Include liquidity, spread, time to expiry, and contract-ambiguity context.

## Trust is earned, not assumed

- Wallets earn trust ONLY through scorecards in the calibration system: realized PnL, ROI,
  win rate, category-specific skill, recency, consistency, drawdowns, and whether results
  came from one lucky trade or many repeatable ones.
- Past performance decays. Never hardcode a wallet as "trusted." Never describe wallet
  following as guaranteed edge.
- Remember the failure modes: late entry, hidden hedging, market-making activity that looks
  directional, different risk tolerance, unseen exits, attention traps.

## V1 ceiling

- In V1, wallet signals can at most suggest `WATCH` or `PAPER_TRADE`, and only via the risk
  engine. They can always suggest `SKIP`. They can never suggest or trigger real trades.
