# Operate: latency, failure, cost, rollout

## Waiting is UX

- **Stream what the agent is doing** (tool names, progress, partial results), not a spinner. In one production walkthrough, the first turn showed only a "thinking…" (正在想…) spinner for 2 min 20 s [P].
- **Keep the bill down**: aim for a 90–99% cache hit rate, run independent tool calls in parallel with the slowest first, and stream the results [A23].
- **Give every wait an end.** Set a per-call timeout, a per-turn budget, and a per-output budget for slow jobs. When a budget runs out, the item becomes `needs_review` with the reason ("QA timed out after 150 s"). It never waits forever.

## Retries and concurrency

- **Cap attempts across runs too.** A poller that retries a failing item every cycle, forever, is a silent failure. After N attempts, hand it to a human with the last error.
- **Retry transient failures only**: timeouts, network errors, 429, 5xx, and a 200 with a broken or empty body. Keep response validation inside the retry closure. Don't retry auth errors or truncation.
- **Always send `max_tokens`.** Without it, one relay's judge answered with refusals. At 900, JSON came back truncated. Detect `finish_reason: length` as its own error.
- **A retry on a paid remote job polls or extends that same job.** It never places a new order. Pass idempotency keys through to the provider.
- **Give each external dependency its own concurrency pool.** A production agent's slow QA judge held generation slots, and 26 main images took 40 minutes. With separate pools and a per-output QA budget, 13 images took about 9 minutes [P].

## Fallbacks

- **Fall back only when the primary is actually unavailable, and always visibly.** Put a warning on the result, count it, and alert on the rate. A timeout that fell back to mock marked a stock photo "done" and charged 12 credits [P].
- **A backup must sit in a different failure domain**: another provider or route. When one production agent's single relay went down, all three image models timed out in sequence [P].
- **Check which model actually served the request** (`usage.model`). Relays can substitute.

## Cost

- **Keep the prompt prefix byte-identical**, and don't flip effort or thinking settings mid-conversation [A24].
- **A stronger model at low effort can cost less than a weaker model at high effort** [A24]. Measure cost per successful task on the eval suite, not cost per token.
- **Watch tokens per turn** in traces, and assert a ceiling in tests.

## Observability

- **Persist everything the agent and the engine did**: every model call (usage, served model, text), every tool call including failures, nudges, gates, engine fallbacks, and the stop reason. Tag who acted: model or engine. One production agent stored only successful calls, so fallbacks were indistinguishable from model actions [P].
- **In production, trace the full chain without reading user content** where privacy requires it [A4].

## Rollout

- **Every deploy carries a fingerprint**, and the eval report for it is attached.
- **Roll out gradually, with a soak period and a rollback path** [A18]. Rainbow deploys (old and new versions running side by side) keep long-running agents from being cut off mid-task [A4].
- **Evals as infrastructure**: full replay, sandbox tiers (read-only / write / high-risk), automatic regression on version bumps, and gates for both launching and retiring a version [C1].

## When implementation is delegated

This covers setups where an architect writes specs and Codex or subagents implement.
- **The spec carries the design card's invariants and eval cases as acceptance.**
- **Name who runs the real-provider evals, when, and with what budget.** An offline implementer can't see model behavior.
- **Implementer reports keep fixture results apart from real-provider results**, and justify every test they changed.
- **Snapshot and golden updates get human review.**
- **The coding agent has a harness too.** Keep AGENTS.md/CLAUDE.md to a map of about 100 lines that points into docs, and have CI check that the docs are current [O6]. Each instruction line should trace to a bad behavior you actually saw, and ideally be backed by a script or check rather than prose [S17]. Make custom lint and test errors state the fix, because an agent reads them [O6, A12]. Give the implementer its own UI, logs and metrics per worktree so it can verify its own work [O6].
- **Agree team standards first, then encode them as rules or skills**, and review with a different model than the one that wrote the code [C2].
