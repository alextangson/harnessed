# harnessed

**Skills for building LLM agents you can prove.** A skill for Claude Code and Codex, used when you build, debug, evaluate or ship a tool-calling agent. It is distilled from a production agent's incidents and 66 checked sources, and it was pressure-tested before release.

[中文说明](README.zh-CN.md)

**Scope.** "Harness" here means the runtime around an agent *you build*: tools, gates, budgets, traces, evals. It is not the repo setup that keeps a *coding* agent on track across sessions (AGENTS.md, feature lists, progress files, init scripts). For that, see [learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) and its `harness-creator` skill.

## Why

Claude is already a good agent engineer. In our baseline runs without this skill, it:
- pushed back on LangGraph + RAG + mem0 for a 20-page PDF;
- put refund rules in code;
- flagged prompt injection;
- diagnosed before patching prompts.

What it shipped was code that runs, not behavior that has been verified. A full build ended with 53 green tests and "model behavior unverified: run it and read the replies". That is also how production agents break: harness tests stay green while the live agent skips items, says "done" without doing it, and falls back silently.

So this skill doesn't re-teach judgment. It adds the part that's missing:

> **The model proposes; the harness decides.** Anything that must hold (money, outbound messages, irreversible writes, completeness, budgets) is enforced in code, and the agent's *behavior* is proven with evals, not vibes.

## What you get

**A spine of four artifacts**, started on day one and kept in sync:
1. **Design card.** One page: the job, tools with risk tiers, and invariants. Each invariant names the code that enforces it and the eval case that covers it. It becomes your acceptance list.
2. **Harness with a persisted trace.** Allowlist, validation, gated pending actions, idempotency, call/time/token budgets, bounded recovery, explicit end states. The UI shows *effects*, never the model's narration of them.
3. **Behavior evals.** Scenarios run N times through the real harness against a fresh fake world and a real model. They are graded on world state, and report pass rate and **pass^k**, with a prompt+tools+model fingerprint.
4. **Done gate.** No "it works" without a fresh eval run on the deployed model and prompt.

**Three gates**, the only hard rules:
- No spend, outbound or irreversible action runs inside the model loop. Routine actions auto-run within *cumulative* limits enforced in code; exceptions go to a human.
- Tests never touch production.
- No behavior claims without a fresh eval run.

**"Thoughts that mean stop"**: a table of rationalizations, each paired with the incident that disproved it. Examples: "tests are green", "strengthen the prompt", "the judge gave it 4.8/5", "put every action behind a human y/n".

**References, loaded only when the task touches them**:

| File | Covers |
|---|---|
| `shape.md` | Agent or not; multi-agent in 2026; RAG and memory; build vs. rent |
| `tools.md` | Tool contracts: schemas, identifiers, errors-as-steering, completeness checks, MCP |
| `loop-and-context.md` | Control flow, budgets, context rot, KV cache, reasoning across tool calls, long runs |
| `safety.md` | Risk tiers, approval fatigue, lethal trifecta / Rule of Two, framework guardrail gaps |
| `evals.md` | Error analysis, world-state grading, pass^k, judge calibration, prompt/model change protocol |
| `debugging.md` | A symptom → layer table built from real incidents |
| `operate.md` | Latency UX, retries, fallbacks, cost, observability, rollout, harnessing *coding* agents |
| `sources.md` | All 66 sources with dates, and where they disagree |

**A tested scaffold** (TypeScript, zero dependencies, Node ≥ 23.6, 14 tests, each guard mutation-checked):
- `harness.ts`: the loop with gates, budgets, idempotency and a trace;
- `openai-compat.ts`: an adapter for any OpenAI-compatible endpoint, with typed errors, validation inside retries, and `max_tokens` always set;
- `evals.ts`: scenarios × trials × invariants, pass^k, fingerprinting, and `claimsBacked`.

Port it into your project; don't import it as a framework.

**Footprint**: about 140 tokens per session for the skill listing, and about 1.9k when it fires. References load only on demand (measured with `claude plugin details`).

## Does it work?

We tested it like [superpowers](https://github.com/obra/superpowers) tests skills: failures without the skill first, then the skill, then fixes from review. Full details are in [`evidence/`](evidence/README.md).
- The skill triggered on its own in 5 of 6 agent scenarios and stayed silent on a non-agent batch script.
- In a blind review, behavior verifiability rose by about 2 points out of 5 in every pair where the skill triggered. Safety judgment held level. The reviewer preferred the with-skill output in 3 of those 4 pairs.
- The cost was proportionality, down 1 point in three pairs, mostly from over-gating. The fixes are in: cumulative limits, and no blanket human approval.
- **v0.2**: on 40 synthetic traces with 5 planted failure types, it found all 5 with exact counts. It also designed calibrated judges unprompted. So separate trace-review and judge skills were not added. See [evidence](evidence/README.md#v02-2026-09-24-do-trace-review-and-llm-judges-need-their-own-skills).
- Limits: one run per scenario, one reviewer. See [evidence](evidence/README.md#limits-of-this-evidence).

## Install

**Claude Code (plugin)**
```
/plugin marketplace add alextangson/harnessed
/plugin install harnessed@harnessed
```

**Claude Code (personal skill)**
```bash
git clone https://github.com/alextangson/harnessed ~/harnessed
```
```bash
ln -s ~/harnessed/skills/agent-craft ~/.claude/skills/agent-craft
```

**Codex**
```bash
ln -s ~/harnessed/skills/agent-craft ~/.codex/skills/agent-craft
```

## Use

It triggers on agent work. Examples:
- "build me an agent that…"
- "my agent keeps skipping items"
- "I changed the system prompt, deploy it"
- "should this be multi-agent?"

You can also ask for it by name (`agent-craft`). To run the scaffold's tests:
```bash
node --test skills/agent-craft/scaffold/*.test.ts
```

## Credits

- **Method** from [superpowers](https://github.com/obra/superpowers) by Jesse Vincent: pressure-test a skill RED → GREEN → REFACTOR. We kept the method and dropped the iron-law tone, because Claude 5-generation models over-trigger on shouted rules.
- **Guidance** from Anthropic's and OpenAI's engineering posts, and from practitioners: HumanLayer, Manus, Cognition, Hamel Husain and Shreya Shankar, Simon Willison, Sierra, Cursor, Vercel, Chroma, Meituan and others. The full list is in [`sources.md`](skills/agent-craft/references/sources.md).
- **Production incidents** (tagged [P]) come from the author's e-commerce image agent, 2026.

## License

MIT
