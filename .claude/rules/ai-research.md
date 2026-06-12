# AI Research Rules (Binding)

AI output in this system is advisory research input. It is never a verdict and never an
authorization. The deterministic risk engine alone issues SKIP / WATCH / PAPER_TRADE.

## Sourcing

- ALL AI research output (AI briefs, evidence summaries, probability reasoning) must cite
  sources. Every factual claim traces to a named source (e.g., NOAA, BLS, FRED, official
  statements, the market's own resolution source).
- No source = low confidence. Low confidence = `SKIP`. Do not dress up unsourced reasoning
  as medium or high confidence.
- Never invent citations. If a source cannot be found, say so and lower confidence.

## Probability estimates

- NEVER present an LLM probability estimate as fact. It is an estimate with uncertainty.
- Record fair probability as a RANGE (low / mid / high) with an explicit confidence level,
  never a single bare number.
- Always record the reasons the estimate could be wrong alongside the estimate.
- Compare against market-implied probability; an estimate without that comparison is
  incomplete research, not a signal.

## Boundaries

- AI briefs are inputs to the deterministic risk engine, never verdicts. Code must not map
  AI output directly to a verdict, a paper trade, or any execution path.
- Ambiguous contract wording or resolution criteria in the AI's analysis → recommend `SKIP`
  and flag the ambiguity; do not "interpret around" it.
- No profit claims in AI-generated copy, briefs, summaries, or UI text. No "high-conviction
  winner," no expected-return promises.
- RAG/source grounding reduces hallucination; it does not create edge. Never imply otherwise.
