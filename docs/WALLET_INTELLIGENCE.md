# Wallet Intelligence

Status: FUTURE module. Design-only in Phase 0. No code until its roadmap phase.
Platform: Polymarket-oriented (Kalshi likely does not expose public trader wallets).
Type: SIGNAL module. Explicitly NOT copy-trading.

## Definition

Wallet intelligence monitors public wallets/trader profiles of large or historically
strong traders and converts their activity into structured signals for research and
paper trading.

The most important line, verbatim:

> Wallet intelligence should emit signals, not trades.

A wallet signal is one input among many. The deterministic risk engine decides
whether any signal becomes SKIP, WATCH, or PAPER_TRADE. In V1, never a real trade.
Wallet signals must never directly approve or execute real trades, in any phase.

## What this module is NOT

- NOT auto-copy-trading.
- NOT "big wallet bought YES, so we buy YES."
- NOT a guaranteed edge. Wallet following is unproven until scorecards say otherwise.
- NOT live in V1. No wallet tracking code exists in Phase 0.

## What to track

### Wallet identity
- Wallet address or trader profile ID
- Nickname (if available)
- Platform
- Categories traded

### Wallet performance
- Historical realized PnL
- ROI
- Win rate
- Average trade size
- Category strengths (e.g. strong in geopolitics, weak in sports)
- Consistency
- Recent performance (recency-weighted)
- Drawdowns
- Lucky vs skilled: did profits come from one lucky trade or many repeatable trades?

### Wallet behavior
- New positions
- Position increases
- Position reductions
- Exits
- Large trades
- Clustered activity (multiple strong wallets aligned on the same side)
- Repeated trades in the same category

### Trade context (the part blind copiers skip)
- Wallet entry price vs current market price
- Price movement since wallet entry
- Whether copy edge remains
- Market liquidity
- Bid/ask spread
- Time to expiry
- Contract ambiguity

## Example signal outputs

- "Wallet X entered YES at 42c"
- "Current ask is 55c, copy edge may be gone"
- "Wallet historically strong in geopolitics, weak in sports"
- "Multiple strong wallets aligned"
- "Wallet is exiting, do not chase"
- "Interesting watchlist candidate"
- "Paper-copy only"
- "Skip due to poor liquidity/spread/ambiguous resolution"

## Why blind copying is dangerous (seven reasons)

1. **Late entry.** The wallet may have entered YES at 38c; by the time we see it,
   the price is 52c. Copying at 52c is not the same trade. Their edge may be gone.
2. **Unknown portfolio/hedging.** A big trader may be hedging another position.
   Buying YES here may offset a short elsewhere. It looks like confidence; it may
   be risk management.
3. **Market-making, not directional bets.** Some large traders capture spread and
   trade both sides repeatedly. Copying one side of their flow is misleading.
4. **Different risk tolerance.** A $20,000 drawdown may be nothing to them. Losing
   $50 from a $100 account is devastating to this user.
5. **Unseen exits.** Following entries is not enough. If the wallet exits and we
   do not notice, we are stuck holding.
6. **Performance decay.** Past category or period performance may not persist.
   Measure category-specific skill, recency, consistency, ROI, realized PnL, risk
   taken, and lucky-vs-skilled.
7. **Attention traps.** A watched wallet attracts copy traders; its moves can move
   price and erase the edge.

## Signal flow and risk engine

```text
Polymarket public activity
        |
  WalletSnapshot ingestion (future phase)
        |
  WalletSignal records (standard signal schema, see docs/STRATEGY_MODULES.md)
        |
  Deterministic risk engine (docs/RISK_ENGINE.md)
        |
  Verdict: SKIP | WATCH | PAPER_TRADE   (never real trades in V1)
```

The risk engine still applies all standard checks to wallet-derived candidates:
resolution clarity, spread, liquidity, edge threshold, confidence, written thesis,
stake limits. A strong wallet signal does not bypass any check.

## Wallet scorecards

Every tracked wallet gets a scorecard so we can measure whether following it
actually works in paper trading:

- Paper PnL of wallet-derived signals
- Hit rate by category
- Edge remaining at our observation time vs wallet entry
- Decay over time

Scorecards feed docs/EVALS_AND_CALIBRATION.md. Wallets whose signals underperform
get demoted or removed from the watch set. No wallet earns a real-money pathway
through scorecards alone; real execution stays locked until a future
human-approved phase.

## Phase 0 definition of done

- [x] This document exists and defines the module as signal-only.
- [ ] No wallet tracking code, ingestion, or schema written (deferred to roadmap phase).
- [ ] Entities Wallet, WalletSnapshot, WalletSignal defined in docs/DATA_MODEL.md.
- [ ] Rules in .claude/rules/wallet-intelligence.md enforced in all future sessions.
