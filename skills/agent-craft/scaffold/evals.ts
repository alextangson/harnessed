// Behavior evals check whether the agent does the right thing, not just whether the code runs.
// Each scenario runs N trials through the real harness against a fresh fake world, then checks
// invariants on the outcome, the trace, and the world's final state. Grade the outcome, not the path:
// prefer world-state checks over "called tool X in step 2".
// A scripted model only tests the harness. These scenarios earn their keep against a real model.
import { createHash } from 'node:crypto';
import type { Outcome, Tool, TraceEvent } from './harness.ts';

export interface Run<W> { outcome: Outcome; trace: TraceEvent[]; world: W }
export interface Invariant<W> { name: string; check(run: Run<W>): string | null } // null = holds; string = what broke
export interface Scenario<W> {
  id: string;
  origin: string;  // the incident, spec clause or user story this case guards. No orphan cases
  input: string;
  world(): W;      // fresh state per trial. Trials must not share memory, caches, files or accounts
  invariants: Invariant<W>[];
}
export interface Failure { trial: number; invariant: string; why: string; tail: TraceEvent[] }
export interface Report { id: string; trials: number; passed: number; passAll: boolean; failures: Failure[] }
export type Exec<W> = (s: Scenario<W>, world: W) => Promise<{ outcome: Outcome; trace: TraceEvent[] }>;

export async function runEvals<W>(scenarios: Scenario<W>[], exec: Exec<W>, trials = 5): Promise<Report[]> {
  const reports: Report[] = [];
  for (const s of scenarios) {
    const r: Report = { id: s.id, trials, passed: 0, passAll: true, failures: [] };
    for (let n = 0; n < trials; n++) {
      const world = s.world();
      let run: Run<W>;
      try { run = { ...(await exec(s, world)), world }; }
      catch (e) { r.failures.push({ trial: n, invariant: 'harness', why: String(e), tail: [] }); r.passAll = false; continue; }
      const broken = s.invariants.flatMap(i => { const why = i.check(run); return why === null ? [] : [{ invariant: i.name, why }]; });
      if (!broken.length) { r.passed++; continue; }
      r.passAll = false;
      for (const b of broken) r.failures.push({ trial: n, ...b, tail: run.trace.slice(-6) });
    }
    reports.push(r);
  }
  return reports;
}

// Checks you will want in most suites. Write domain ones as world-state predicates.
export const inv = {
  ends: <W>(status: Outcome['status']): Invariant<W> => ({
    name: `ends ${status}`,
    check: r => r.outcome.status === status ? null : `ended ${r.outcome.status}${r.outcome.status === 'failed' ? ` (${r.outcome.code}: ${r.outcome.detail})` : ''}`,
  }),
  called: <W>(tool: string): Invariant<W> => ({
    name: `${tool} succeeded`,
    check: r => r.trace.some(e => e.kind === 'tool' && e.tool === tool && e.ok) ? null : `${tool} never succeeded`,
  }),
  // Completeness: every expected id shows up in some successful call's args[field] (string or array).
  covers: <W>(tool: string, field: string, ids: string[]): Invariant<W> => ({
    name: `${tool} covers ${ids.length} items`,
    check: r => {
      const got = new Set(r.trace.flatMap(e => e.kind === 'tool' && e.tool === tool && e.ok ? [(e.args as any)?.[field]].flat() : []));
      const missing = ids.filter(id => !got.has(id));
      return missing.length ? `missing ${missing.join(', ')}` : null;
    },
  }),
  withinCalls: <W>(n: number): Invariant<W> => ({
    name: `≤ ${n} tool calls`,
    check: r => { const c = r.trace.filter(e => e.kind === 'tool').length; return c <= n ? null : `${c} tool calls`; },
  }),
  world: <W>(name: string, pred: (w: W) => string | null): Invariant<W> => ({ name, check: r => pred(r.world) }),
  // What the agent said must match what happened. If the final text claims an action, some effect must back it.
  // This is a pattern check for evals, where a false alarm costs a look. In production, show effects instead.
  claimsBacked: <W>(claim: RegExp, effect: RegExp): Invariant<W> => ({
    name: `claims matching ${claim} are backed by an effect`,
    check: r => r.outcome.status !== 'done' || !claim.test(r.outcome.text) || r.outcome.effects.some(e => effect.test(e))
      ? null : `said "${r.outcome.text.slice(0, 80)}" with no matching effect`,
  }),
};

// Store this next to each report. Without it you can't tell which prompt, tools and model a result belongs to.
export const fingerprint = (system: string, tools: Tool[], model: string) =>
  createHash('sha256').update(JSON.stringify([system, tools.map(t => [t.name, t.description, t.parameters]), model])).digest('hex').slice(0, 12);

// Prints one line per scenario and returns false if any pass rate is below the threshold.
// For user-facing agents, gate on passAll (pass^k), not on the average.
export function summarize(reports: Report[], threshold = 1): boolean {
  let ok = true;
  for (const r of reports) {
    const rate = r.passed / r.trials;
    if (rate < threshold) ok = false;
    console.log(`${rate >= threshold ? 'PASS' : 'FAIL'} ${r.id}  ${r.passed}/${r.trials}${r.passAll ? '' : '  (pass^k broken)'}`);
    for (const f of r.failures.slice(0, 3)) console.log(`   trial ${f.trial} · ${f.invariant}: ${f.why}`);
  }
  return ok;
}
