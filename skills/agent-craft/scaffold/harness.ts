// Reference agent harness. Port it into your project; it is not a framework to import.
// The model proposes and this file decides. Allowlist, argument validation, risk-tier gates,
// idempotency, budgets, bounded error recovery and explicit end states are enforced here, and
// every step lands in a structured trace that evals and debugging read.
// Nothing below depends on the model obeying its system prompt.
// Runs on Node >= 23.6 with no build step (type stripping), so it uses erasable TS syntax only.

export type Tier = 'read' | 'write' | 'spend' | 'outbound' | 'irreversible';
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export type ToolResult =
  | { ok: true; forModel: unknown; effect?: string } // effect: one line saying what changed in the world
  | { ok: false; code: string; fix: string };        // fix: one line the model can act on, not a stack trace

export interface ToolContext { turnId: string; idempotencyKey: string }
export interface Tool<I = any> {
  name: string;
  description: string;                 // the contract the model reads. Write it for a smart new hire
  parameters: Record<string, unknown>; // JSON Schema the model sees: plain types and enums. Keep regexes in parse()
  tier: Tier;
  parse(raw: unknown): Parsed<I>;      // the real validation (zod safeParse etc.). Runs again at confirmation time
  run(input: I, ctx: ToolContext): Promise<ToolResult>;
}

export interface ModelCall { id: string; name: string; args: string } // OpenAI wire format: args is a JSON string
export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; calls: ModelCall[] }
  | { role: 'tool'; callId: string; content: string };
export interface Usage { input: number; output: number; model: string } // model = what actually answered
export interface ModelReply { text: string; calls: ModelCall[]; usage: Usage }
export interface Model { complete(req: { system: string; messages: Message[]; tools: Tool[] }): Promise<ModelReply> }

export interface Policy {
  maxCalls: number;       // scale with the task (e.g. 12 + 4 × attachments). Never unbounded
  deadlineMs: number;     // wall clock for the whole turn
  maxTokens: number;      // input + output, summed over the turn
  maxResultChars: number; // a tool result larger than this is a tool-design bug, so it gets truncated where the model can see it
  maxToolErrors: number;  // consecutive tool failures the model may repair before the turn fails
  gated: Tier[];          // tiers that never run inside the loop. They become pending actions for a human
}

export interface PendingAction { id: string; turnId: string; tool: string; input: unknown }
export type Outcome =
  | { status: 'done'; text: string; effects: string[] } // show the effects, not the model's narration of them
  | { status: 'awaiting_confirmation'; pending: PendingAction; effects: string[] }
  | { status: 'failed'; code: string; detail: string; effects: string[] };
export type TraceEvent =
  | { at: number; kind: 'model'; usage: Usage; text: string; calls: string[] }
  | { at: number; kind: 'tool'; tool: string; tier?: Tier; args: unknown; ok: boolean; code?: string; ms: number; replayed?: boolean }
  | { at: number; kind: 'gate'; tool: string; pendingId: string }
  | { at: number; kind: 'stop'; status: Outcome['status']; code?: string };

interface Turn {
  id: string; policy: Policy; tools: Map<string, Tool>; messages: Message[];
  trace: TraceEvent[]; effects: string[]; seen: Map<string, string>; now: () => number;
}
type Step = { kind: 'answered'; ok: boolean; code?: string } | { kind: 'gated'; pending: PendingAction };

export async function runTurn(a: {
  turnId: string; model: Model; system: string; tools: Tool[]; policy: Policy;
  messages: Message[]; // prior history plus the new user message. Appended in place so the caller can persist it
  now?: () => number;
}): Promise<{ outcome: Outcome; trace: TraceEvent[] }> {
  const t: Turn = { id: a.turnId, policy: a.policy, tools: new Map(a.tools.map(x => [x.name, x])),
    messages: a.messages, trace: [], effects: [], seen: new Map(), now: a.now ?? Date.now };
  const start = t.now();
  let calls = 0, tokens = 0, errors = 0;
  const stop = (outcome: Outcome) => {
    t.trace.push({ at: t.now(), kind: 'stop', status: outcome.status, code: outcome.status === 'failed' ? outcome.code : undefined });
    return { outcome, trace: t.trace };
  };
  const fail = (code: string, detail: string) => stop({ status: 'failed', code, detail, effects: t.effects });

  for (;;) {
    if (t.now() - start > a.policy.deadlineMs) return fail('TIME_BUDGET', `turn ran past ${a.policy.deadlineMs} ms`);
    if (tokens > a.policy.maxTokens) return fail('TOKEN_BUDGET', `turn used ${tokens} tokens`);
    let reply: ModelReply;
    try { reply = await a.model.complete({ system: a.system, messages: a.messages, tools: a.tools }); }
    catch (e) { return fail('MODEL_ERROR', e instanceof Error ? e.message : String(e)); }
    tokens += reply.usage.input + reply.usage.output;
    t.trace.push({ at: t.now(), kind: 'model', usage: reply.usage, text: reply.text, calls: reply.calls.map(c => c.name) });
    a.messages.push({ role: 'assistant', content: reply.text, calls: reply.calls });
    if (!reply.calls.length) return stop({ status: 'done', text: reply.text, effects: t.effects });

    for (const [i, call] of reply.calls.entries()) {
      if (++calls > a.policy.maxCalls) {
        closeBatch(t, reply.calls.slice(i), 'tool-call budget exhausted');
        return fail('CALL_BUDGET', `more than ${a.policy.maxCalls} tool calls`);
      }
      const step = await handleCall(t, call);
      if (step.kind === 'gated') {
        closeBatch(t, reply.calls.slice(i + 1), 'paused for human confirmation; re-issue after it resolves');
        return stop({ status: 'awaiting_confirmation', pending: step.pending, effects: t.effects });
      }
      errors = step.ok ? 0 : errors + 1;
      if (errors > a.policy.maxToolErrors) {
        closeBatch(t, reply.calls.slice(i + 1), 'turn stopped after repeated tool errors');
        return fail('TOOL_ERRORS', `${errors} consecutive tool failures, last: ${step.code}`);
      }
    }
  }
}

async function handleCall(t: Turn, call: ModelCall): Promise<Step> {
  const tool = t.tools.get(call.name);
  if (!tool) return answer(t, call, undefined, null, { ok: false, code: 'UNKNOWN_TOOL', fix: `use one of: ${[...t.tools.keys()].join(', ')}` });
  let raw: unknown;
  try { raw = JSON.parse(call.args || '{}'); }
  catch { return answer(t, call, tool, call.args, { ok: false, code: 'BAD_JSON', fix: 'arguments must be one JSON object' }); }
  const parsed = tool.parse(raw);
  if (!parsed.ok) return answer(t, call, tool, raw, { ok: false, code: 'INVALID_ARGS', fix: parsed.error });
  const key = `${t.id}:${tool.name}:${JSON.stringify(parsed.value)}`;
  const earlier = t.seen.get(key);
  if (earlier !== undefined) { // the same call twice in one turn replays the first answer instead of acting twice
    t.messages.push({ role: 'tool', callId: call.id, content: earlier });
    t.trace.push({ at: t.now(), kind: 'tool', tool: tool.name, tier: tool.tier, args: parsed.value, ok: true, ms: 0, replayed: true });
    return { kind: 'answered', ok: true };
  }
  if (t.policy.gated.includes(tool.tier)) return gate(t, call, tool, parsed.value, key);
  const started = t.now();
  let result: ToolResult;
  try { result = await tool.run(parsed.value, { turnId: t.id, idempotencyKey: key }); }
  catch (e) { result = { ok: false, code: 'TOOL_CRASHED', fix: `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}` }; }
  if (result.ok && result.effect) t.effects.push(result.effect);
  return answer(t, call, tool, parsed.value, result, t.now() - started, key);
}

function answer(t: Turn, call: ModelCall, tool: Tool | undefined, args: unknown, r: ToolResult, ms = 0, key?: string): Step {
  const max = t.policy.maxResultChars;
  let content = JSON.stringify(r.ok ? r.forModel ?? null : { error: r.code, fix: r.fix });
  if (content.length > max) content = `${content.slice(0, max)}…[truncated ${content.length - max} chars: ask for less]`;
  if (r.ok && key) t.seen.set(key, content); // only successes replay. A failed call may be retried as-is
  t.messages.push({ role: 'tool', callId: call.id, content });
  t.trace.push({ at: t.now(), kind: 'tool', tool: call.name, tier: tool?.tier, args, ok: r.ok, code: r.ok ? undefined : r.code, ms });
  return r.ok ? { kind: 'answered', ok: true } : { kind: 'answered', ok: false, code: r.code };
}

function gate(t: Turn, call: ModelCall, tool: Tool, input: unknown, key: string): Step {
  const pending: PendingAction = { id: key, turnId: t.id, tool: tool.name, input };
  t.messages.push({ role: 'tool', callId: call.id, content: JSON.stringify({ status: 'awaiting_confirmation', pendingId: pending.id }) });
  t.trace.push({ at: t.now(), kind: 'gate', tool: tool.name, pendingId: pending.id });
  return { kind: 'gated', pending };
}

// Every tool call the model issued needs an answer, or the next request fails as malformed history.
function closeBatch(t: Turn, rest: ModelCall[], why: string) {
  for (const c of rest) t.messages.push({ role: 'tool', callId: c.id, content: JSON.stringify({ error: 'NOT_RUN', fix: why }) });
}

// The only path that runs a gated action: outside the model loop, after a human decided.
// Validate again here, because balances, limits and ownership may have changed since the proposal.
export async function resolvePending(p: PendingAction, tools: Tool[], approved: boolean): Promise<ToolResult> {
  if (!approved) return { ok: false, code: 'DECLINED', fix: 'the user declined; do not re-propose unless they ask' };
  const tool = tools.find(x => x.name === p.tool);
  if (!tool) return { ok: false, code: 'UNKNOWN_TOOL', fix: `${p.tool} is no longer available` };
  const parsed = tool.parse(p.input);
  if (!parsed.ok) return { ok: false, code: 'INVALID_ARGS', fix: parsed.error };
  try { return await tool.run(parsed.value, { turnId: p.turnId, idempotencyKey: p.id }); }
  catch (e) { return { ok: false, code: 'TOOL_CRASHED', fix: e instanceof Error ? e.message : String(e) }; }
}

// Tells the model what the human decided. Append it before the next turn. A user could type this
// tag too, but that only changes what the model believes, not what runs: execution stays behind resolvePending.
export const confirmationMessage = (p: PendingAction, r: ToolResult): Message => ({
  role: 'user',
  content: `[confirmation ${p.id}] ${p.tool}: ${JSON.stringify(r.ok ? { ok: true, result: r.forModel ?? null } : { ok: false, error: r.code, fix: r.fix })}`,
});

// Wraps text from outside the trust boundary (emails, web pages, reviews, stored memories).
// Markers don't stop injection; gates and capability limits do. What markers buy is that the model
// and the trace can tell data from instructions. Look-alike tags are stripped so the payload can't close the fence.
export const untrusted = (source: string, text: string) =>
  `<untrusted source="${source}">\n${text.replace(/<\/?untrusted[^>]*>/gi, '')}\n</untrusted>`;
