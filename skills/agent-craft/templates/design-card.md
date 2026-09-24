# <Agent name> · design card

Keep this next to the code (for example `docs/agent-design.md`) and update it when behavior changes. Each section is a few lines. What matters is that it's written down, so it survives from design into build and becomes the acceptance list.

## Job
- The user's goal, in one sentence.
- Success as it appears in a trace or in world state. Not "the answer is good".
- Where this sits on the ladder (call → workflow → agent → multi-agent), and why the rung below isn't enough.

## Inputs and trust
| Input | Who controls it | Trusted? |
|---|---|---|
| user message | signed-in user | partly |
| emails, web pages, reviews, stored memories | anyone | no: wrap with `untrusted()` and treat as report-only |

Trifecta check (private data + untrusted content + outbound or state change): which two does this agent have? If it has all three, name the human checkpoint.

## Tools
| Tool | Purpose | Tier (read/write/spend/outbound/irreversible) | Gate | Idempotency key | Errors (code → fix hint) |
|---|---|---|---|---|---|

Identifiers the model sees must be ones it can quote back. Anything the code already knows, the code fills in.
Internal-only capabilities (admin reads, exports) stay plain functions behind an existing admin surface. Anything registered as a tool gets listed to every client of the registry (REST, MCP, the agent itself).

## Invariants
| Must hold regardless of model output | Enforced at (file/function) | Eval case |
|---|---|---|
| e.g. every uploaded item is covered by the plan | propose(): rejects with the missing ids | `batch-covers-all` |
| e.g. no refund above the amount paid | refund.parse + re-check at resolvePending | `refund-over-paid` |
| e.g. auto-refunds per order, customer and day stay under the limits | policy check at resolvePending | `split-refund-bypass` |

## Budgets
- Tool calls: `<base> + <per item> × items`, capped at `<max>`.
- Wall clock per turn, and per slow output. Derive each from measured per-item time and scale it with input size, like the call budget: a flat cap cuts off legitimate large batches. The deadline aborts in-flight calls; tools honor the signal.
- Tokens per turn: assert it in a test.
- Retries per external call, transient errors only.
- Attempts per item across runs or polls before it goes to a human with the reason. Never an infinite retry.

## State and context
- Turn states: queued / running / awaiting_confirmation / done / failed. What persists, and what happens on crash or resume. Side effects are never replayed automatically.
- What goes into the prompt each turn: a stable prefix; per-turn values such as dates and computed numbers go in the latest message.
- Memory rung: window → summary → user-visible records. Why this rung.

## Failure UX
What the user sees while waiting, on partial success, on timeout, on a provider outage, and when a fallback was used. Every fallback is labeled and counted.

## Evals
- Scenarios: the invariants above, plus tricky behavior (for example: partial refund of one broken item, not the whole order), plus adversarial inputs per gate.
- Trials per scenario, and the pass bar (pass^k for user-facing gates).
- Judges, if any: binary per defect, and the human-labeled set that calibrates them.
- Who runs it against the real provider, when, and with what budget.

## Traces
Every model call (usage, served model), tool call (args, ok/code, ms), gate, nudge, engine fallback and stop reason, labeled by who acted: model or engine.

## Deliberately not handled
One line each.
