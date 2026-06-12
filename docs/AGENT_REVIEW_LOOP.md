# Agent Review Loop

Status: Phase 0 constitution document
Date: 2026-06-11

Operational process for reviewing Claude Code sessions. This is the enforcement
mechanism for `docs/SELF_IMPROVEMENT_PROTOCOL.md`. The review command lives at
`.claude/commands/session-review.md` and is invoked as `/session-review`.

## When Reviews Happen

| Trigger | Required? |
|---|---|
| After a significant session (multi-file changes, new module, risk-engine work) | Yes |
| Before any phase transition (e.g., Phase 0 → Phase 1) | Yes |
| After any safety-relevant incident (rule violation, improper risk-logic edit, hallucinated API in shipped work) | Yes, immediately |
| Routine small sessions (doc typo fixes, single-file tweaks) | Optional |

## Review Checklist

For each reviewed session, answer explicitly:

- [ ] Did the agent follow instructions — scope, constraints, and stop conditions?
- [ ] Did the agent run tests (actually executed, output captured), not just write or claim them?
- [ ] Did the agent respect safety rules (`docs/SAFETY.md`, `.claude/rules/trading-safety.md`)?
- [ ] Did the agent avoid hallucinated APIs (endpoints, methods, fields, library behavior)?
- [ ] Did the agent avoid hidden TODOs — unfinished work not surfaced in its final response?
- [ ] Did the agent avoid unauthorized risk-logic changes (thresholds, verdicts, execution gating)?
- [ ] Did the agent update docs and `docs/DECISION_LOG.md` when architecture or direction changed?

Any "no" answer becomes a finding with a severity:

- **SAFETY** — violated or weakened a safety constraint. Escalate to human immediately.
- **CORRECTNESS** — wrong or hallucinated work shipped. Fix and add a test or rule.
- **WORKFLOW** — process gap. Improve CLAUDE.md, rules, docs, or prompts.

## Who Reviews

1. **Human (Vaibhav)** — final authority on all findings; sole authority on safety items.
2. **Hermes** — gatekeeper review; receives session summary, file list, and diff summary;
   checks design, safety, and vision alignment per the AI operating model.
3. **ChatGPT Pro (optional)** — adversarial pass on high-stakes sessions: attack the
   diff, generate failure cases, challenge risk assumptions.

No agent reviews and approves its own safety-adjacent work.

## Review Inputs

- Session transcript (JSONL) or session summary.
- List of files created/modified.
- Test commands run and their output.
- Any DECISION_LOG entries from the session.

## Outputs

- **Workflow improvements**: applied directly to `CLAUDE.md`, `.claude/rules/*`,
  `docs/*`, `tests/*`, or prompts per the destinations table in
  `docs/SELF_IMPROVEMENT_PROTOCOL.md`.
- **Safety concerns**: escalated to the human only. Never self-applied, never resolved
  agent-to-agent. The bounding rule applies: agents can improve workflow; agents cannot
  weaken safety.
- **Log entry**: directional changes recorded in `docs/DECISION_LOG.md`.

## Definition of Done for One Review

- [ ] Checklist completed with explicit yes/no per item.
- [ ] Findings classified (SAFETY / CORRECTNESS / WORKFLOW).
- [ ] SAFETY findings escalated to human; nothing safety-adjacent self-applied.
- [ ] WORKFLOW improvements applied or queued with owners.
- [ ] DECISION_LOG updated if direction changed.
