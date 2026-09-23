# Evals: making agent behavior verifiable

This is the gap Claude leaves open by default, so this file is the longest. Practitioners still describe behavioral-correctness harnesses and agent evals as unsolved [S18, S20]. Expect to iterate on the suite itself, not just on the agent.

## Four layers, each testing something different

1. **Harness tests with a scripted model** are deterministic, so exact asserts are fine. They prove gates, budgets and recovery work, and they say nothing about the agent's behavior.
2. **Behavior evals with the real model**: scenario → trials → invariants on the outcome, the trace and the world state. This is `scaffold/evals.ts`.
3. **Quality judgments** for subjective output: an LLM judge calibrated against human labels, or humans.
4. **Production trace review**: reading real traces on a cadence.

Skipping layer 2 is how a production agent shipped with harness tests green while live turns skipped items and narrated instead of acting [P].

## Build the suite

- **Start with 20–50 cases taken from real failures** [A11]. Add the design card's invariants, the tricky behaviors (a partial refund of one broken item, not the whole order), and one adversarial case per gate. Every incident becomes a case, with `origin` saying which one.
- **Error analysis before metrics** [S6]. Read and label at least 30 traces, write notes as you go (open coding), then group the notes into failure types. Keep reading until no new failure types appear, which takes about 100 traces. Practitioners spend 60–80% of development time here [S6]. Build a small trace viewer early [S8].
- **Grade the outcome, not the path** [A11]. Prefer world-state snapshots ("exactly one refund of 1400 cents on 1001") over "called tool X at step 2". LLM-simulated users measured commerce agents poorly compared with state snapshots [A23]. Use simulated users only when multi-turn dialogue is itself under test.
- **Evaluate agents at two levels** [S6]. First, did the end-to-end task succeed, and what was the first step that failed? Then per step: tool choice, arguments, error handling, efficiency. Test tool preconditions such as auth too.
- **Keep two suites** [A11]. A capability suite is hard and allowed to fail. A regression suite must stay near 100%.
- **Use real fixtures.** Capture raw model outputs, including the weird ones (`春/夏` where one value was expected, a string where an array was expected, extra fields, `null`), and replay them through parsers and normalizers. In production, spec-shaped fixtures passed while none of 13 real runs produced an LLM plan: 5 errored and 8 fell back silently [P].
- **Assert the outbound payload**: what is actually sent to the model or provider, not just the prompt template. Code-injected defaults and dropped references only show up there [P].

## Run it honestly

- **Run trials and report pass^k.** A 75% single-run success rate is about 42% for three in a row [A11]. GPT-4o's retail pass^8 was under 25% [S14]. User-facing gates use pass^k, not the average.
- **Isolate every trial**: fresh world, no shared memory, cache or files [A11]. Infrastructure alone swings scores by up to 6 points, so treat differences under 3 points as noise [A13].
- **Check the ruler first.** Fixing eval bugs moved CORE-Bench from 42% to 95% [A11]. A verifier has to be near-perfect or the agent optimizes against its errors [A12]. Before trusting a grader, confirm it fails a known-bad trace and passes a known-good one.
- **Check what the agent said against what happened.** A reply that claims "refunded" or "sent" when the world shows no such effect is a failure, even if every action was correct (`inv.claimsBacked`). Injection scenarios need this check most.
- **Derive expectations from the config the run uses**, never from hardcoded thresholds. Otherwise changing a limit makes a correct agent fail, or a wrong one pass.
- **The eval must not help the agent.** One acceptance script sent "continue" (继续) whenever no plan card appeared, which masks exactly the narrate-instead-of-act regression [P].
- **Fingerprint every run**: prompt + tool contracts + served model (`fingerprint()`). Relays can serve a different model than the one requested, so assert on `usage.model`.
- **Run evals against the real provider, with a named owner and a budget.** Offline or sandboxed implementers can't see model behavior. In one project the implementer had no network access, and nearly 60 fixes landed at architect acceptance across 9 work packages [P].

## LLM judges

- **One pass/fail per defect, plus a written critique.** Not a 1–5 score [S6, S7]. Hard defects become separate yes/no checks.
- **One domain expert sets the standard** [S6]. Split the human labels into dev and test sets, and report the judge's true-positive and true-negative rates [S6].
- **Watch the "can't judge" rate.** Meituan measures how often a rubric item comes back "can't judge" to find vague definitions. They trust an item at 85–90% agreement with humans [C1].
- **Criteria drift as you read outputs** [S9]. Re-label after the rubric changes.
- **Judge failures seen in production [P]**:
  - A cheap judge gave about 5/5 to nearly everything, including 4.8 with a studio reflector in frame.
  - The board prompt said "blur passers-by" while the judge required "no people", so every scene board was rejected twice. Judge and generator must read the same spec.
  - A shared garment and background biased "same person?" judgments, so design comparisons where the judge can't take shortcuts.
  - What worked: critique before score, anchored rubrics, a strong judge only on high-risk steps with a second judge re-checking its rejections, and feeding the defect list back into regeneration (2/2 corrected).

## Prompt and model changes

- **One line can regress an agent.** A single system-prompt line limiting text between tool calls to 25 words cost 3% and passed tests and review. Anthropic now runs evals per model, ablates prompt lines, and adds a soak period and gradual rollout for prompt changes [A18].
- **For every change**: run the old and new fingerprints on the same suite and compare pass^k, cost and latency; read failing traces. Ablate: delete a line, re-run, and if nothing drops, keep it deleted.
- **On a model upgrade**, re-run the suite and try removing harness patches one at a time [A15, A22].
- **Cadence**: read 10–20 production traces weekly, and do a 100+ trace error analysis every 2–4 weeks [S6].
- **Golden or snapshot changes are reviewed by a human.** A broken golden is a finding.
