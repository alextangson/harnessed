# Shape: is this an agent, and what kind

Claude already pushes back on over-built stacks by default. This file adds the evidence behind the rungs and the 2026 state of the multi-agent debate. Tags like [A4] point to `sources.md`.

## The ladder

Climb one rung at a time, and only on evidence from evals:
1. A single call with good context and examples.
2. A workflow in code: chain, branch and loop written by you, with the LLM as a step.
3. A single agent with tools.
4. A single agent plus skills or subagents, used to isolate context.
5. Multiple agents.

Each rung trades latency and tokens for flexibility. A single agent uses about 4× the tokens of chat, multi-agent about 15× [A4].

## Where an agent fits

- Success is checkable, trial and error is cheap, and results can be tested automatically [S13].
- Or the task needs judgment, has rules too tangled to maintain as code, or runs on heavy unstructured data [O1].
- Many products called "agents" are deterministic code with a few LLM steps, and are better for it [S1].

## Multi-agent in 2026

- **One writer, many advisors.** Parallel writers make implicit, conflicting decisions [S4]. Cognition's 2026 revision keeps one agent that changes things and uses others as advisors: a clean-context reviewer, a stronger model on call for hard problems, a manager that dispatches and merges [S5].
- **Subagents isolate context; they don't mirror an org chart** [S3, S16]. Researcher → Writer → Editor as chatting agents is usually a pipeline in disguise.
- **Breadth-first parallel research is where multi-agent clearly wins**: +90.2% on Anthropic's research eval, at about 15× the tokens [A4].
- **At scale, hierarchy beat peers.** Cursor's peer agents coordinating through locks failed; a planner / worker / judge hierarchy scaled to hundreds of agents [S22].
- **Newer models over-delegate.** Say when to spawn a subagent, and cap depth, concurrency and budget [D2, D3].
- **In commerce deployments**, a single agent with skills beat both one giant prompt and subagents, usually at lower cost [A23].
- In a production e-commerce image agent [P], the shot planner and QA judge are specialist model calls that the agent reaches as tools, not conversational peers. The judge is independent of the generator, which is the viewpoint separation that justifies splitting.

## Knowledge and memory

- **If the knowledge fits the window, put it there.** Retrieval tends to miss rules that are scattered across a document.
- **For agents, prefer retrieval they drive themselves** (tools, file paths, grep) over a vector store bolted on in front [A3, S21]. A filesystem-and-grep agent beat specialized memory libraries on a memory benchmark, with the caveat that cross-framework comparisons aren't rigorous [S27].
- **Climb the memory ladder only when evals show a miss**: conversation window → summary → persisted records.
- **Persisted memory should be small, categorized records** that the user can see, edit and delete, extracted asynchronously after the turn (+13% fact recall) [A23].
- **Key memory by a stable semantic id, not free text.** A production agent keyed preferences by the model's own phrasing of an action, so the records almost never aggregated [P].

## Framework or not

- The agent loop itself is under 400 lines. The hard part is everything around it [S29].
- Practitioners report frameworks plateauing at 70–80% quality and teams rewriting them out [S1].
- Unified multi-vendor SDKs break on real tool calling, so use the vendor SDK or your own loop [S20].
- **Managed harnesses** (Anthropic Managed Agents, OpenAI Agents API, 2026) absorb model-upgrade churn but take away control of gates and traces [A17, O9]. Build your own when gates, traces and cost are the product; rent when they aren't.

## The harness shrinks as models improve

- Every component encodes an assumption about what the model can't do. A context reset that Sonnet 4.5 needed was dead weight on Opus 4.5 [A15].
- Removing 80%+ of a system prompt cost nothing on coding evals for Claude 5-generation models [A22].
- Manus rebuilt its harness five times in about seven months, and tests it with models of different strength to catch a harness that holds the model back [S3].
- On every model change, re-run the evals and try deleting harness patches one at a time.
