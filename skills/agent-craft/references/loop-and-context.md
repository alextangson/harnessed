# Loop and context

## Own the control flow

- **The loop can pause between choosing a tool and running it.** That is where human approval, policy checks and resume-later live [S1]. In the scaffold this is a `PendingAction` plus `resolvePending`.
- **Exit conditions are explicit**: final answer, awaiting confirmation, budget hit, repeated errors, model error [A6, O1]. "Thinking…" with no end is a bug.
- **Budgets scale with the task and are always capped.** A production agent found a fixed cap of 12 calls ran out on the first multi-photo turn, and moved to 12 + 4 × attachments, capped at 200 [P]. Aim for small agents of 3–10 steps, 20 at most, and compose them [S1]. Add wall-clock and token budgets, and a separate time budget per slow output.
- **Loop detection.** Identical calls within a turn replay instead of re-running; the scaffold does this. Watch for the same error, or the same target edited, N times: typical failures are declaring done without testing, and repeating a wrong path 10+ times. Harness-only fixes of this kind took one agent from 52.8 to 66.5 on Terminal-Bench 2.0 [S15].
- **Narrating instead of acting.** The structural fix is that the UI shows effects from tool results. If a turn ends with no call on a request that clearly needs one, the harness may nudge once or twice. One production agent detected claims with a regex over its Chinese replies, which is brittle and whose trigger rate was never measured [P]; measure it if you rely on it.
- **When the user's words already decide a gated step, run the transition in code** instead of hoping the model calls the tool ("use this one" / 就用这张 → approve the main image) [P].
- **Reminders.** Re-state the goal or todo near the end of context on long tasks [S2, S20], and tell the model how much of its time budget is left [S15].
- **Pass reasoning back across tool calls.** Preserving interleaved thinking measured 87 vs 64 on τ² [C3]. Anthropic Messages carries thinking blocks back. Chat Completions can't, so an OpenAI-compatible relay in front of a reasoning model is probably dropping them.

## Context is an attention budget

- **Send the smallest high-signal set** [A3]. Long inputs degrade even simple tasks: about 300 focused tokens beat about 113k of full context across 18 models [S24].
- **Keep context usage around 40–60%.** Before it fills, compact into files and continue fresh [S25].
- **Compact what you can restore first.** Replace old tool results with file paths or ids and keep recent ones verbatim. Then write a structured summary [S3]. Track "what was modified" separately; every compressor tested lost it [S26].
- **Collapse failed turns to one line.** Assert a token budget per turn in tests: One production agent pins it in a round-trip test after a 52,874-token turn [P].
- **Errors can stay in context so the model doesn't repeat them** [S2], or trial-and-error can be isolated in a subagent [S20]. Short tasks keep them; long ones isolate.
- **Retrieve just in time.** Keep pointers (paths, ids) in context and let the agent fetch [A3, S21]. A stored artifact is referenced by handle, not pasted [G1].

## KV cache is a cost and latency feature

- **Keep a byte-identical stable prefix, append only, and serialize deterministically** (sorted keys) [S2, O5].
- **Don't change the tool list, model, effort or thinking settings mid-conversation** [O5, A24].
- **Put per-turn variables in the latest message, not the system prompt**: dates, computed values, retrieved snippets.
- **The numbers**: cached input costs about $0.30/M against $3/M uncached, and input:output runs about 100:1 for agents [S2]. Design for a 90–99% hit rate [A23].

## Memory mechanics

- **The filesystem is memory**: notes, todo, progress and artifacts live on disk and are read on demand [S2, S27].
- **Cross-session memory is small categorized records** the user can see and edit [A23], keyed by stable ids (see shape.md).

## Long-running and resumable

- **Split the brain (loop) from the hands (sandbox/tools).** Keep an append-only event log outside a stateless harness, and recover from a crash by replaying the log. A container failure is just a tool error [A17].
- **Never auto-replay side effects after a crash.** Resume to a state where a human or an idempotency key decides [P].
- **Multi-window tasks**: a JSON feature list, a progress file, git, and an init script. Do one item at a time and run a smoke test before new work [A5].
- **Periodic fresh starts** keep very long runs from drifting [S22].
