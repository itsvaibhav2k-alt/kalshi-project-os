# Self-Improvement Protocol

Status: Phase 0 constitution document
Date: 2026-06-11

The project improves itself by reviewing Claude Code session transcripts and feeding
findings back into the project brain. This protocol defines what gets reviewed, where
findings go, and the hard boundary on what agents may change.

## Bounding Rule

> **Agents can improve workflow. Agents cannot weaken safety.**

This rule overrides everything else in this document. If an improvement idea conflicts
with it, the idea is discarded or escalated to the human — never applied.

## Transcript Review

Claude Code stores session transcripts as JSONL files. Transcripts are reviewed
(see `docs/AGENT_REVIEW_LOOP.md` for cadence and process) to check:

- [ ] Instruction adherence — did the agent do what was asked, nothing more?
- [ ] Tests actually run — not just written, not just claimed?
- [ ] Safety-rule violations — anything against `docs/SAFETY.md` or `.claude/rules/trading-safety.md`?
- [ ] Hallucinated APIs — invented endpoints, methods, fields, or library behavior?
- [ ] Hidden TODOs — unfinished work not surfaced in the final response?
- [ ] Improper risk-logic changes — any edit to risk thresholds, verdict logic, or
      execution gating without explicit human instruction?

## Where Findings Flow

Findings become concrete edits in these locations only:

| Finding type | Destination |
|---|---|
| Recurring instruction failures | `CLAUDE.md` |
| Rule gaps or ambiguity | `.claude/rules/*` |
| Missing or stale project knowledge | `docs/*` |
| Untested behavior, missed edge cases | `tests/*` |
| Weak agent instructions | Prompts and `.claude/commands/*` |

Every applied improvement that changes project direction is also recorded in
`docs/DECISION_LOG.md` (format: YYYY-MM-DD — Decision — Reason — Impact).

## Prohibited Self-Modifications

No agent may, under any framing ("cleanup", "refactor", "simplification", "unblocking"):

1. Remove safety rules.
2. Add real execution early.
3. Loosen risk thresholds.
4. Claim a strategy works without evidence.
5. Store API keys.
6. Create auto-trading without explicit human approval.

## Safety-Adjacent Changes

A change is safety-adjacent if it touches: `docs/SAFETY.md`, `docs/RISK_ENGINE.md`,
`.claude/rules/trading-safety.md`, risk thresholds, verdict logic, execution gating,
position/stake limits, or anything in a future execution module.

Procedure for safety-adjacent proposals:

1. Agent writes the proposal as a clearly labeled suggestion (what, why, exact diff).
2. Agent flags it to the human. The proposal is never self-applied.
3. Human decides. If approved, the human (or an explicitly instructed session) applies
   it and logs it in `docs/DECISION_LOG.md`.
4. If rejected, the rejection is also logged so future agents do not re-propose it blindly.

## Allowed Self-Improvements

Agents may apply without escalation (still subject to normal review):

- Clarifying ambiguous doc wording without changing meaning.
- Adding tests, checklists, and examples.
- Tightening rules (making safety stricter is always allowed).
- Improving prompts, commands, and workflow ergonomics.
- Fixing factual drift in docs against the source-of-truth brief.

## Definition of Done for a Protocol Cycle

- [ ] Transcript(s) reviewed against the checklist above.
- [ ] Findings written down with file/line references where possible.
- [ ] Workflow improvements applied to the correct destinations.
- [ ] Safety-adjacent items escalated to the human, not applied.
- [ ] DECISION_LOG updated for any directional change.
