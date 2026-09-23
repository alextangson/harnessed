# Tools: the agent's user interface

Most function-calling failures come from the contract, not the code: descriptions, parameter shapes, identifiers, errors, return size. Tune these with the eval suite, not by eyeballing.

## Shape the set

- **Design tools around the user's workflow, not around your API endpoints.** Merge calls that always happen together and prefix names by service [A2, O2]. Start with fewer than about 20 visible tools (a soft guideline) [O2]. Vercel replaced 15+ specialist tools with one bash tool over a well-documented semantic layer, and every metric improved (small sample) [S19].
- **Keep the tool set stable within a conversation.** Adding or removing tools mid-task invalidates the prompt cache and leaves earlier calls pointing at tools that no longer exist [S2, O5]. Two ways out:
  - keep a fixed set and have the harness reject out-of-stage calls with a steering error;
  - append deferred tools (tool search) without rewriting the prefix [A7, A24].
- **A tool the model can't see gets faked.** One production agent exposed tools by conversation stage [P]. When the next turn needed `propose_plan`, the tool wasn't in the list, so the model narrated "submitted" instead of calling it. Gate by persisted state, and prefer rejecting with guidance over hiding.
- **MCP decides how tools are discovered and shared across clients.** Function calling is how the model invokes them. MCP tool descriptions sit in context permanently: Playwright's 21 tools take about 13.7k tokens [S23]. Having the model write code that calls tools cut one flow from 150k to 2k tokens [A8]. Reach for MCP when reuse across clients is real.

## Parameters

- **Use plain types and enums, and make illegal states unrepresentable** [O2]. Keep regexes and `format` out of the JSON Schema the model sees. A production schema carried a datetime regex [P], and the model told users "only auto is supported" in 2 of 3 runs. Validate in code instead.
- **Don't make the model fill in what the code knows** [O2]. Have the model pass a reference and let the harness fill the rest. In production, echoing full plan objects through the model cost 52,874 input tokens in one turn [P]. Passing `skuId` and re-hydrating from the engine fixed it, and it guarantees the card the user confirms is exactly what runs.
- **Accept identifiers the model can actually see.** It will pass the human-facing code (款号) where you expected an internal id. Resolve both, or show only one.
- **Writes and renders accept only server-issued ids** [A23]. The model can't invent a valid one.
- **Do deterministic work in code and attach the result to the current message.** That covers dates, money, counts and averages. "Next Tuesday" was right in only 1 of 3 probes until code computed it; then 3/3 [P].
- **Guard parameters too, not just tools**: only this turn's attachment URLs, no `force` flag exposed, amounts capped by what was paid.

## Results

- **Write one response for the model and another for the UI.** Return semantic fields, not UUIDs, and offer a concise/detailed switch [A2].
- **When truncating, say how much exists, where you cut, and how to get more.** Otherwise the model treats the first page as everything [C4]. The scaffold's `maxResultChars` truncates loudly. A tool that trips it has a design bug.
- **An error is a steering instruction**: code, a one-line fix, and whether retrying can help [A2, C4]. Dumping dozens of zod issue lines back to the model wastes a turn; one line naming the field and the valid shape gets fixed on the next call.
- **Verification output should be silent on success and specific on failure** [S16].
- **Check completeness at the commit point.** When a batch must be fully covered, the harness checks coverage and rejects with the missing items listed. A production agent got 3 photos in and a proposal for 1 out [P]. `PLAN_INCOMPLETE: missing A, B` made the model repair it in one step, where prompt wording hadn't.

## Descriptions and examples

- **Write descriptions for a smart new hire, 3–4+ sentences** [D1]: what it does, when to use it, when not to, and what comes back.
- **Tune them on transcripts.** Having Claude rewrite descriptions from failed transcripts cut task time 40% [A4]. Keep held-out cases so you don't overfit [A2].
- **Examples cut both ways.** Adding tool-use examples raised accuracy from 72% to 90% on 2025 models [A7]. Anthropic's 2026 guidance for Claude 5-generation models says to drop them [A22]. Decide per model with evals.
- **If you want variety, don't hand the model candidates.** It copies them, even when they're labeled "examples". In production, pose candidates produced identical sets [P]. Constrain with a validator and let it create.
