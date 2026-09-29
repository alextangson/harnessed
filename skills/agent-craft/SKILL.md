---
name: agent-craft
description: "Use when building, changing, debugging, evaluating or shipping an LLM agent or the harness around it (tool-calling loops, tool/function definitions, MCP servers, agent system prompts, context and memory handling, confirmation gates, multi-agent setups, agent evals and LLM judges). Also use when about to deploy an edited agent prompt, tool set or model, and when an agent misbehaves: it skips items, picks wrong tools, claims done without doing it, loops, stalls, or regresses. 开发/调试/评估 agent、智能体、function calling、harness，或改了 agent 的提示词/工具/模型准备上线时使用。"
---

# Agent Craft

Why this exists (evidence, 2026-09). Without this skill, Claude already makes good calls on agent design. In baseline runs it:
- pushed back on a LangGraph + RAG + mem0 stack;
- put refund rules in code;
- flagged prompt injection;
- diagnosed before patching a prompt;
- built an idempotent, fail-visible harness with 53 tests.

What it did not do was make the agent's behavior verifiable from the start:
- The build ended with model behavior "unverified: run it and read the replies".
- Evals only appeared when a user pushed to ship, and then as a throwaway script.
- In the author's production agent (2026-09), harness tests on scripted model replies stayed green while the live agent skipped batch items, narrated instead of acting, and fell back silently.

So this skill does not re-teach judgment. It carries invariants from design into code, evals and traces, and it records lessons that only show up against real models. Incidents tagged [P] come from the author's production e-commerce agent. When you cite one, say where it comes from rather than presenting it as your own experience.

Not for setting up a repo so a coding agent stays on track across sessions (AGENTS.md, feature lists, progress and handoff files). That is a different harness; `operate.md` has the one rule this skill keeps about it.

## Stance

The model proposes; the harness decides.
- Anything that must hold is enforced in code, with an error message that tells the model how to recover. That covers money, outbound messages, irreversible writes, batch completeness and budgets.
- The prompt only steers quality.
- Every harness component encodes an assumption about what the model can't do. Re-test those assumptions whenever the model changes.

## The spine

Four artifacts, started early and kept in sync:

1. **Design card** (`templates/design-card.md`): the job, the success signal as it appears in a trace, the tools with risk tiers, the invariants (each naming where code enforces it and which eval case covers it), budgets, failure states, and deliberate exclusions. Write it before the loop, one page, not a document. At the end it becomes the acceptance list.
2. **Harness with a persisted trace**: port `scaffold/harness.ts` (allowlist, validation, gated pending actions, idempotency, call/time/token budgets, bounded recovery, explicit end states). The UI reports *effects* from tool results, never the model's narration of them.
3. **Behavior evals**: port `scaffold/evals.ts`. Each scenario runs N trials through the real harness, against a fresh fake world, with the real model. Invariants are graded on world state and the trace. Report pass rate and pass^k, and fingerprint the prompt + tools + model. Seed the suite from the card's invariants, then add every incident.
4. **Done gate**: see below.

`scaffold/` is tested reference code (Node ≥ 23.6, no deps): `node --test scaffold/*.test.ts`. Port it into the project's language and style; don't vendor it as a framework.

## Size it by blast radius

| The agent… | Needs |
|---|---|
| is a throwaway, used only by you, with no side effects | budgets + visible failure. Skip the rest |
| is an internal tool that writes | + design card, invariants in code, 5–10 eval scenarios |
| faces users or reads untrusted content | + persisted traces, pass^k gate, latency/failure UX, trifecta review |
| moves money, sends outbound, or does anything irreversible | + gated pending actions re-validated at execution, idempotency keys, an adversarial eval case per gate, staged rollout |

## Go deeper when the task touches it

- Is this even an agent? Single or multi-agent, RAG, memory, framework choice: `references/shape.md`
- Tool definitions, schemas, errors, MCP: `references/tools.md`
- Loop control, context window, caching, memory mechanics, long runs: `references/loop-and-context.md`
- Risk tiers, confirmation, prompt injection, sandboxing: `references/safety.md`
- Eval suites, error analysis, LLM judges, prompt/model change protocol: `references/evals.md`
- An agent is misbehaving or regressed: `references/debugging.md`
- Latency, timeouts, retries, fallbacks, cost, observability, rollout: `references/operate.md`
- Where every claim comes from: `references/sources.md`

## Gates

These are the only hard rules here. They guard money, data and trust. The user can waive one explicitly; you can't waive one for yourself.

- **No gated action runs inside the loop.** Spend, outbound and irreversible actions never execute from the model loop. They become pending actions, re-validated at execution time. A policy enforced in code settles the routine ones within cumulative limits; a human settles the exceptions. Give the user the autonomy they asked for, inside those limits.
- **Tests never touch production.** Evals, smoke tests and demos never cause production side effects: separate credentials, sandbox accounts, and a guard that refuses prod. One smoke script once placed 24 real orders on production [P].
- **No behavior claims without a fresh run.** Don't claim the agent's behavior works, improved, or didn't regress without a fresh eval run: at least 3 trials per scenario, against the model and prompt actually deployed, with the report and fingerprint shown. Without that, say plainly: "harness verified, model behavior not evaluated".

## Thoughts that mean stop

| Thought | What actually happened |
|---|---|
| "Tried it a few times, it works" | 75% single-run success is about 42% for three in a row. Run the suite with trials. |
| "Tests are green" | Scripted-model tests verify the harness, not the agent. A production shot-planner passed its fixtures [P]. Then, across 13 real garments, 5 runs errored and 8 fell back silently to rule-based plans. None produced an LLM plan. |
| "Strengthen the prompt" | First read the actual outbound request. Code-injected defaults survived two prompt rewrites. Then ask which layer owns the rule. |
| "The fixture matches the spec" | Fixtures must be real raw model outputs. Spec-shaped fixtures hide exactly the failures you'll ship. |
| "Fall back to the rule-based / mock path" | A fallback that isn't visible and counted is a silent failure. Track fallback rate as a metric. |
| "The judge gave it 4.8/5" | Uncalibrated judges saturate: one gave 4.8 to an image with a studio reflector in frame. Use a binary pass/fail per defect, checked against human labels. |
| "Add a double-check step" | Current Claude models already self-verify, and Anthropic's Opus 5 guide warns that extra checking prompts over-verify. A checker in a clean context can pay off; keep it only if an eval shows it catches something. |
| "Let the test script nudge it with 继续" | Then the eval hides the exact regression it exists to catch. |
| "Backup model on the same relay" | That's the same failure domain. They go down together. |
| "Put every action behind a human y/n" | Users approve about 93% of prompts, so blanket approval is a rubber stamp, and it takes away the autonomy the user asked for. Auto-run within cumulative limits enforced in code; send only the exceptions to a human. |
| "The limit is per refund" | Then one action gets split into many small ones. A blind review of a build made with this skill found five emails fully refunding a ¥899 order under a ¥200 per-refund cap. Limits are per order, per customer and per day. |

## Done

An agent change is done when all four hold:
- Every invariant on the design card points at code and at an eval case.
- The suite ran fresh on the deployed model and prompt, and the summary shows the report and fingerprint. User-facing gates use pass^k.
- A sample of real traces was read, not just the scores.
- Anything unhandled is listed.
