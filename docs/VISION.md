# VISION

Source of truth: `/Users/vaibhav/Documents/Obsidian Vault/Kalshi Project OS - Phase 0 Master Brief.md`
Status: Phase 0 constitution document. Dated 2026-06-11.

## What this project is

Kalshi Project OS is an AI-assisted event-market research, paper-trading, risk-control,
wallet-intelligence, and calibration operating system. It is Kalshi-first,
event-market-native, and Polymarket-ready.

It is a one-person AI event-market research desk. Not "ask an LLM what to buy" — a full
system that scans markets, understands contract wording, gathers source-grounded evidence,
estimates probability, compares estimate to market price, rejects bad trades, paper trades
ideas, measures calibration, and protects the user from oversized or ambiguous trades.

Core principle, non-negotiable:

> LLM recommends. Rules permit. Human approves. Execution obeys.

V1 is **Training Wheels Mode**:

- Paper-only. No real-money execution.
- No auto-trading, no live order placement, no market orders.
- No trading API keys anywhere in the repo or runtime.
- No claims of profitability.
- Default recommendation is SKIP unless strict deterministic checks pass.

## Why it exists

Build the machine first. Prove edge in paper trading. Use real money only later, tiny,
manually, with hard risk limits. The first goal is "learn without getting hurt." The second
goal is "collect enough paper-trading evidence to see if there is real edge." Only after
that: "test tiny real money." The system is built like an institutional research/risk desk,
not a gambling app, because the user's stated risk tolerance is low (losing $50 of $100
would feel devastating) and the design must make that loss nearly impossible early on.

## Why the system mostly says SKIP

A serious trading system mostly says no. The question is never "will the event happen?" —
it is "is the current market price wrong, by enough, after costs?" Small apparent edges
are routinely eaten by spread, fees, thin liquidity, slippage, and ambiguous contract
wording.

Worked example from the brief:

- A contract's YES price is 80¢.
- Research says the event is 85% likely. Apparent edge: ~5 percentage points before costs.
- But the ask is 84¢ and the bid is 76¢. Buying at the 84¢ ask leaves ~1 point of edge
  before fees. The trade is probably not attractive at all.

So the rules are hard-coded:

- Ambiguous resolution criteria → SKIP.
- No citable source → low confidence → usually SKIP.
- Spread too wide → SKIP.
- Edge too small after spread/fees → SKIP.
- No written thesis → SKIP.
- Default → SKIP.

The system thinks in probabilities, not vibes. Most people lose by buying "this seems
likely" markets where the likelihood is already priced in.

## Why $2k–$3k/day is not a software toggle

That outcome is not a feature you ship. It would require, simultaneously:

- Real, measured edge (not a confident-sounding AI brief).
- Sufficient bankroll and sufficient market liquidity to deploy it.
- Strong execution with low slippage.
- Risk management, emotional discipline, repeatable strategies.
- The ability to survive losing streaks without blowing up or revenge trading.

The chain that breaks naive plans: if average edge is small you need large size; large size
needs liquidity; if liquidity is thin you cannot scale; if you force trades, you lose.
The serious path is: build infrastructure → paper trade → measure → find one niche that
works → scale slowly → add real execution only after evidence. No step is skippable.

## Why Kalshi starts first

- U.S.-regulated prediction/event-contract exchange; cleanest compliance starting point.
- Clear platform and account structure; beginner-safe framing for learning.
- Broad contract coverage: weather, economics, politics, financial/event contracts.
- API-based market data: prices, bid/ask spread, orderbook, volume, open interest,
  price movement, contract rules, settlement source.

Limitation: Kalshi probably does not expose public trader wallets the way Polymarket does,
so "this exact whale wallet bought this market" signals are not available there. That is
acceptable for V1, which is about market data, research, risk, and paper trading.

## Why Polymarket and wallet intelligence matter later

Polymarket adds two things Kalshi likely cannot:

- Huge event-market liquidity across global markets (sports, politics, culture, crypto,
  geopolitics, news).
- Public wallet/trader activity, enabling smart-money tracking: historically strong
  wallets entering a market, clustered wallet activity, entry price vs. current price,
  exits, category-specific skill.

Caveat: Polymarket was penalized by the CFTC in 2022; current public information suggests
Americans can now trade and that it is CFTC-regulated, but U.S. terms, KYC/account flow,
state eligibility, and regulatory status must be verified inside the actual product before
any real-money consideration.

Wallet intelligence is a **signal module, not copy-trading**. Blind copying fails because
you may be late, you cannot see the wallet's hedges or market-making activity, their risk
tolerance differs, they may exit unnoticed, performance decays, and watched wallets create
attention traps. Wallet signals feed the deterministic risk engine, which still decides
SKIP / WATCH / PAPER_TRADE. Wallet signals never approve or execute real trades.

## Why viral dashboards are inspiration, not proof

The viral Polymarket AI trading dashboards (claimed realized PnL, whale badges, win rates,
probability lattices, edge-vs-book, 6-stage execution pipelines) are unverified.
Screenshots and videos are not evidence. Profit claims from them are not trusted.

Patterns worth learning from: simulation distributions, tail-risk views, edge-vs-book
display, related-market consistency checks, live telemetry, pipeline-stage visibility,
strategy scorecards, wallet monitoring.

Patterns rejected outright: degen mode, dopamine-first UI, green PnL hype without audit
logs, auto-execution in V1, blind wallet copying, treating AI as a money printer.

Our V1 pipeline: Scan → Understand → Research/Predict → Validate/Risk → Paper/Simulate →
Settle/Learn. Real execution stays out of the pipeline until a future, locked,
human-approved phase. See `docs/ROADMAP.md` and `docs/DECISION_LOG.md`.
