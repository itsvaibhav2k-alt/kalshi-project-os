# Architecture Rules (Binding)

Kalshi Project OS is Kalshi-first, event-market-native, Polymarket-ready. The architecture
must keep that true.

## Platform-agnostic core

- Keep the core platform-agnostic. Shared engines (normalization, research, probability, risk,
  paper trading, calibration, strategies) must not import platform-specific code.
- ALL platform specifics (Kalshi API shapes, Polymarket wallet data, endpoint quirks,
  rate limits, auth) live behind the `MarketConnector` interface under `lib/platforms/`.
- Never branch on platform name inside core engines. If core code needs a platform behavior,
  extend the connector interface instead.

## Risk engine isolation

- `lib/risk/` is deterministic. It contains NO LLM calls, no network calls to AI providers,
  and no nondeterministic inputs beyond its declared parameters.
- LLM briefs and wallet signals enter the risk engine as plain data inputs only. They never
  decide the verdict; the rules do.

## Strategies emit signals only

- Strategy modules (`lib/strategies/`) emit `StrategySignal` objects and nothing else.
- Strategies NEVER call execution paths, NEVER create paper trades directly, and NEVER
  write verdicts. Signals flow to the risk engine, which decides SKIP / WATCH / PAPER_TRADE.

## Documentation discipline

- Update `docs/ARCHITECTURE.md` AND `docs/DECISION_LOG.md` whenever module boundaries change
  (new module, moved responsibility, changed interface between layers).
- Do NOT create new top-level directories without first updating `docs/ARCHITECTURE.md` to
  define the directory's purpose and boundaries.
- Planned directories: `lib/platforms`, `lib/risk`, `lib/paper`, `lib/research`,
  `lib/strategies`, `lib/wallet-intelligence`, `lib/backtesting`, `lib/simulation`,
  `lib/relationship-graph`, `lib/telemetry`, `lib/calibration`, `lib/db`, `scripts`, `tests`.
  Stay inside this layout unless ARCHITECTURE.md is updated first.

## Conflict resolution

- Platform-specific shortcut vs. clean architecture → choose clean architecture.
- AI autonomy vs. deterministic risk controls → choose deterministic risk controls.
