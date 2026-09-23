// Model adapter for any OpenAI-compatible /chat/completions endpoint: OpenAI, relays, DeepSeek,
// Qwen, local servers. For Anthropic's native Messages API, keep the same Model interface and
// map tool_use / tool_result blocks instead.
// Deliberately non-streaming. Streamed tool calls arrive as fragments keyed by index, and joining
// them by position instead of index silently drops calls. Stream only once you need it for UX.
import type { Message, Model, ModelReply, Tool } from './harness.ts';

type ErrorCode = 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'BAD_RESPONSE' | 'TRUNCATED';
export class ModelError extends Error {
  code: ErrorCode; status?: number;
  constructor(code: ErrorCode, message: string, status?: number) { super(`${code}: ${message}`); this.code = code; this.status = status; }
}

export interface OpenAICompatOptions {
  baseURL: string; apiKey: string; model: string;
  maxTokens: number; // always sent. Without it, some relays refuse or truncate unpredictably
  timeoutMs: number; // per attempt
  retries: number;   // transient failures only
}

export function openAICompatible(o: OpenAICompatOptions): Model {
  return {
    async complete({ system, messages, tools }) {
      const body = JSON.stringify({
        model: o.model, max_tokens: o.maxTokens,
        messages: [{ role: 'system', content: system }, ...messages.map(toWire)],
        ...(tools.length ? { tools: tools.map(toolWire) } : {}),
      });
      let last: unknown;
      for (let attempt = 0; attempt <= o.retries; attempt++) {
        // Parsing sits inside the retry: a 200 with an empty or broken body is a transient failure too.
        try { return parseReply(await post(o, body)); }
        catch (e) {
          last = e;
          if (!retryable(e)) throw e;
          await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
        }
      }
      throw last;
    },
  };
}

const toolWire = (t: Tool) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } });

function toWire(m: Message) {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.callId, content: m.content };
  if (m.role === 'user') return { role: 'user', content: m.content };
  const calls = m.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } }));
  return { role: 'assistant', content: m.content || null, ...(calls.length ? { tool_calls: calls } : {}) };
}

async function post(o: OpenAICompatOptions, body: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${o.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', body, signal: AbortSignal.timeout(o.timeoutMs),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
    });
  } catch (e) {
    throw new ModelError(e instanceof Error && e.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK', String(e));
  }
  const text = await res.text();
  if (!res.ok) throw new ModelError('HTTP', `${res.status} ${text.slice(0, 300)}`, res.status);
  try { return JSON.parse(text); } catch { throw new ModelError('BAD_RESPONSE', `non-JSON body: ${text.slice(0, 200)}`); }
}

function parseReply(json: any): ModelReply {
  const choice = json?.choices?.[0], msg = choice?.message;
  if (!msg) throw new ModelError('BAD_RESPONSE', 'no choices[0].message');
  if (choice.finish_reason === 'length') throw new ModelError('TRUNCATED', 'hit max_tokens: raise it or shrink the request');
  const calls = (msg.tool_calls ?? []).map((c: any, i: number) => ({
    id: c.id ?? `call_${i}`,
    name: String(c.function?.name ?? ''),
    args: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}),
  }));
  if (!calls.length && !msg.content) throw new ModelError('BAD_RESPONSE', 'empty message: no text and no tool calls');
  // usage.model records what actually answered. Relays can serve a different model than the one requested.
  return { text: msg.content ?? '', calls, usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0, model: String(json.model ?? 'unknown') } };
}

function retryable(e: unknown): boolean {
  if (!(e instanceof ModelError)) return false;
  if (e.code === 'HTTP') return e.status === 429 || (e.status ?? 0) >= 500;
  return e.code !== 'TRUNCATED';
}
