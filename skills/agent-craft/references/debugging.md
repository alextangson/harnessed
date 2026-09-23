# Debugging a misbehaving agent

## Start from the trace, not the prompt

1. Reproduce it and pull the full trace: the prompt as actually assembled, the outbound request, tool arguments and results, compaction summaries, and the model that actually answered.
2. Classify the failure (table below) and fix it at the lowest layer that makes it reliable: code, then tool contract, then prompt.
3. Add the case to the eval suite before the fix, watch it fail, then re-run the whole suite with trials.

If three rounds of rewording haven't fixed it, the rule lives in the wrong layer. Stop editing the prompt.

## Symptom → layer

| Symptom | Usual cause and layer | Seen in |
|---|---|---|
| Ignores a rule the prompt states clearly | Code sends conflicting input (injected defaults, a "default" treated as explicit, references dropped), or the rule belongs in the harness | [P] a default scene image survived two prompt rewrites; the face reference never shipped until the payload was read (sending it, plus a hairstyle constraint, took likeness from 1/6 to 5/6) |
| Handles only part of a batch | No completeness check at the commit point; add a steering error that lists what's missing | 3 photos in, a proposal for 1 out → `PLAN_INCOMPLETE` |
| Says "done" or "submitted" without acting | The tool isn't in the list this turn, or the UI trusts narration; show effects and gate by state | `propose_plan` hidden across turns |
| Wrong tool or wrong arguments | Description or schema: regex in the schema, internal ids, missing enums | datetime regex → "only auto supported"; 款号 passed as an id |
| Wrong dates or arithmetic | Move the computation to code and attach the result | "next Tuesday" 1/3 → 3/3 |
| Every output looks the same | Candidates or examples are being copied; remove them and validate instead | identical poses |
| Loops, or repeats a failing call | Missing budget or loop detection; the error message gives no fix | [S15] |
| Gets worse over a long session | Context bloat or rot: compact, trim tool results, add a token budget | 52,874-token turn |
| "Thinking…" forever, or a batch crawls | Missing per-call and per-output time budgets; a shared pool is starved | the QA judge held generation slots, so 26 images took 40 min; after splitting pools, 13 took about 9 |
| Intermittent "network errors" | Response validation sits outside the retry, or `max_tokens` is unset or too small; type the errors | about 10% were non-JSON bodies; no max_tokens → judge refusals; max_tokens 900 → truncated JSON |
| Retry charged twice or lost a paid result | The retry re-ordered instead of resuming the same remote job | [P] |
| Quality ceiling no wording moves | Model capability or missing inputs; change the pipeline, the model or the inputs | identity likeness |
| Worse after a prompt or model change | Diff fingerprints on the suite and ablate | [A18] |
| Behaves unlike the model you chose | The relay served another model; check `usage.model` | |

## Tools that speed it up

- **A transition-failure matrix**: rows are the last successful state, columns the first failed state. It shows where failures cluster [S6].
- **Let an agent read traces in bulk and propose fixes**, with a human reviewing so a fix doesn't only help one case [S15]. Only possible if the trace is complete: failed calls, nudges and engine fallbacks included [C1].
- **Build a custom trace viewer** that shows exactly what you read when judging [S8].
- **Opaque subagents make debugging much harder.** If you can't see inside a step, you can't debug it [S23].
