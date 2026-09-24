# Changelog

## 0.2.0 · 2026-09-24
- **Scaffold**: the turn deadline now aborts in-flight model and tool calls (`Model.complete` gets the signal, as do `ToolContext.signal` and the OpenAI-compatible adapter), and nothing retries after an abort. There are 3 new tests (14 in total), and each guard is mutation-checked.
- **Design card**: size wall-clock budgets from measured per-item time and scale them with input size. Keep internal-only capabilities out of the tool registry.
- **Evidence**: six probes on trace error analysis, LLM judges, timeouts and injection planning led to the decision not to add separate skills. See [evidence](evidence/README.md#v02-2026-09-24-do-trace-review-and-llm-judges-need-their-own-skills) and the reproducible trace fixture in `evidence/v0.2/`.

## 0.1.0 · 2026-09-23
- Initial release.
