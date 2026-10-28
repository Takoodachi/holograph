// The free Qwen Worker with Workers AI and KV faked: only Holograph may use it, each visitor gets a daily count,
// and it always runs Holograph's own prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const answer = '{"name":"x"}';
function fakeEnv(run = async () => ({ choices: [{ message: { content: answer }, finish_reason: 'stop' }] })) {
  const kv = new Map(), calls = [];
  return {
    calls,
    AI: { run: async (model, input) => { calls.push({ model, input }); return run(); } },
    LIMITS: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
  };
}
const ask = (env, { origin = 'https://takoodachi.github.io', ip = '1.2.3.4', content = 'a ball in a bowl', method = 'POST' } = {}) =>
  worker.fetch(new Request('https://holograph-ai.example.workers.dev/', {
    method, headers: { origin, 'cf-connecting-ip': ip, 'content-type': 'application/json' },
    ...(method === 'POST' && { body: JSON.stringify({ messages: [{ role: 'system', content: 'ignored' }, { role: 'user', content }] }) }),
  }), env);

test('answers Holograph with its own prompt, in the Chat Completions shape', async () => {
  const env = fakeEnv(), res = await ask(env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://takoodachi.github.io');
  assert.equal((await res.json()).choices[0].message.content, answer);
  const { model, input } = env.calls[0];
  assert.equal(model, '@cf/qwen/qwen3-30b-a3b-fp8');
  assert.match(input.messages[0].content, /^You turn a plain-English description/); // its own prompt, not the client's
  assert.match(input.messages[0].content, /The JSON schema:/);
  assert.equal(input.messages[1].content, 'a ball in a bowl');
});

test('preflight passes; other sites and oversized or empty input are refused without calling the model', async () => {
  const env = fakeEnv();
  const pre = await ask(env, { method: 'OPTIONS', origin: 'http://localhost:5173' });
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
  assert.equal((await ask(env, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await ask(env, { content: 'x'.repeat(8001) })).status, 400);
  assert.equal((await ask(env, { content: '  ' })).status, 400);
  assert.equal(env.calls.length, 0);
});

test('each visitor gets 10 requests a day; others are unaffected', async () => {
  const env = fakeEnv();
  for (let i = 0; i < 10; i++) assert.equal((await ask(env)).status, 200);
  const over = await ask(env);
  assert.equal(over.status, 429);
  assert.match((await over.json()).error.message, /today's 10 free AI requests/);
  assert.equal((await ask(env, { ip: '5.6.7.8' })).status, 200);
  assert.equal(env.calls.length, 11);
});

test("a spent free allowance and other model errors become readable messages", async () => {
  const spent = await ask(fakeEnv(async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); }));
  assert.equal(spent.status, 429);
  assert.match((await spent.json()).error.message, /used up today's allowance/);
  const busy = await ask(fakeEnv(async () => { throw new Error('3040: capacity'); }));
  assert.equal(busy.status, 502);
  // the older { response } shape is passed on too
  const old = await ask(fakeEnv(async () => ({ response: answer })));
  assert.equal((await old.json()).choices[0].message.content, answer);
});
