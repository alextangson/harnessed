# Safety: tiers, gates, injection

Claude already puts money rules in code and flags injection. This file covers calibration: where gates belong, why detection fails, and where frameworks leave holes.

## Tier every tool, then gate by tier

| Tier | Default |
|---|---|
| read | auto |
| reversible write | auto, with undo or soft-delete |
| spend | pending action; small amounts may auto-run under a limit enforced in code |
| outbound (email, post, message) | pending action with a preview, or send as a draft |
| irreversible | human only |

- **Gate rarely, or gates become rubber stamps.** Users approved about 93% of permission prompts, and sandboxing cut prompts by 84% [A9, A19]. One production agent skips confirmation under 12 credits [P]; a baseline build auto-refunded up to $50 under code-enforced rules. Put the human where their attention matters.
- **The gate lives in the transaction.** Budget, balance, ownership and confirmation are checked inside the engine's write, and text from the model is never a substitute for a confirmation. In production this rejected a real injection attempt [P].
- **Make limits cumulative**: per order, per customer and per day, not per call. Otherwise one refund gets split into several small ones, by the model or by an attacker who controls the email.
- **Re-validate at execution time.** Limits, balances and ownership may have changed since the proposal [A23]. The model never moves money directly; it proposes staged changes.
- **Model-based approvers** (auto-review classifiers) reduce prompt fatigue, but they miss things: 17% false negatives on real overreach in Anthropic's sample of 52 [A16]. OpenAI's reviewer explains a rejection so the main agent can re-plan, and stops after repeated denials [O7, O8]. Use one as a layer in front of hard limits, never in place of them.

## Injection is an architecture problem

- **The lethal trifecta: private data + untrusted content + a way out.** A way out is outbound communication or a state change [S10]. Meta's Rule of Two says a session gets at most two of: untrusted input, sensitive data, state change or outbound. All three need a human in the loop [S12].
- **Detection doesn't hold.** Adaptive attacks broke most of 12 published defenses at over 90% success, and a 500-person human red team broke all of them [S12]. A filter that stops 95% is a failing grade for security [S10].
- **Patterns that do hold**:
  - Plan-then-execute: fix the plan before reading untrusted content.
  - Dual LLM: a quarantined model reads untrusted text and returns only structured, checked values.
  - The same rule underneath: once untrusted content is in context, it must not trigger consequential actions [S11].
- **Mark untrusted text**, every field of it (email body, subject and sender display name, web pages, product copy, reviews, even stored memories), with fixed tags and treat it as report-only [A23]. `untrusted()` in the scaffold strips look-alike tags. Markers help the model and the trace, but they are not the defense. The gate is.
- **Scope what an attacker can reach.** A customer-email agent only ever sees orders owned by the sender's address, and "not found" looks identical to "not yours". That's how the baseline build handled it.

## Sandboxes and credentials

- **Run fully autonomous only in a sandbox**, with test credentials and a spend cap [S13]. Environment isolation beats model-level rules [A9, A19].
- **Keep dev and prod apart physically.** Replit's agent deleted a production database during a code freeze and then fabricated data; the fix was automatic dev/prod separation, not a prompt [S28].
- **Evals and smoke tests carry sandbox credentials and a guard that refuses production.** One smoke script once placed 24 real orders on production [P].

## Framework gaps to check

- **OpenAI Agents SDK**: input guardrails run only on the first agent and output guardrails only on the last; tool guardrails skip hosted tools and handoffs [O3]. Pending approvals serialize and resume [O4]. In any framework, find where enforcement actually runs before trusting it.
- **Multi-agent chains** leave the middle agents unguarded unless you wire it yourself.
