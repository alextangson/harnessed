// Adapter self-test against a local fake endpoint: node --test openai-compat.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openAICompatible, ModelError } from './openai-compat.ts';

async function fakeEndpoint(responses: { status: number; body: unknown }[]) {
  const seen: any[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      seen.push(JSON.parse(raw));
      const next = responses[Math.min(seen.length - 1, responses.length - 1)];
      res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${port}/v1`, seen, close: () => server.close() };
}

const ok = (message: object, extra: object = {}) => ({ status: 200, body: { model: 'served-model', choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 3 }, ...extra } });
const opts = (baseURL: string) => ({ baseURL, apiKey: 'k', model: 'asked-model', maxTokens: 512, timeoutMs: 2_000, retries: 2 });
const req = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };

test('sends max_tokens, records the model that actually answered, normalizes object arguments', async () => {
  const ep = await fakeEndpoint([ok({ content: null, tool_calls: [{ id: 'a', function: { name: 'x', arguments: { n: 1 } } }] })]);
  try {
    const reply = await openAICompatible(opts(ep.baseURL)).complete(req);
    assert.equal(ep.seen[0].max_tokens, 512);
    assert.equal(reply.usage.model, 'served-model');
    assert.deepEqual(reply.calls, [{ id: 'a', name: 'x', args: '{"n":1}' }]);
  } finally { ep.close(); }
});

test('retries 5xx and empty 200 bodies, then succeeds', async () => {
  const ep = await fakeEndpoint([{ status: 503, body: 'busy' }, ok({ content: '' }), ok({ content: 'fine' })]);
  try {
    const reply = await openAICompatible(opts(ep.baseURL)).complete(req);
    assert.equal(reply.text, 'fine');
    assert.equal(ep.seen.length, 3);
  } finally { ep.close(); }
});

test('does not retry truncation or 4xx, and says which it was', async () => {
  const cut = await fakeEndpoint([{ status: 200, body: { choices: [{ message: { content: 'half' }, finish_reason: 'length' }] } }]);
  const auth = await fakeEndpoint([{ status: 401, body: { error: 'bad key' } }]);
  try {
    await assert.rejects(openAICompatible(opts(cut.baseURL)).complete(req), (e: unknown) => e instanceof ModelError && e.code === 'TRUNCATED');
    await assert.rejects(openAICompatible(opts(auth.baseURL)).complete(req), (e: unknown) => e instanceof ModelError && e.status === 401);
    assert.equal(cut.seen.length + auth.seen.length, 2);
  } finally { cut.close(); auth.close(); }
});
