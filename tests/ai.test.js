// AI mode with the APIs mocked: what a model returns is untrusted and must pass the app's parser before it loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWithAI, toPreset, PROVIDERS, SCHEMA } from '../js/ai.js';
import { analyze } from '../js/parse.js';

// a fake Anthropic SDK client answering with each item in turn: an answer object (sent back as JSON text), a response, or an error
function fakeClient(...replies) {
  const calls = [];
  const create = async req => {
    calls.push(req);
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return r.stop_reason ? r : { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(r) }] };
  };
  return { calls, beta: { messages: { create } } };
}
const apiError = status => Object.assign(new Error(`${status}`), { status });

// a fake fetch for the Chat Completions providers: an answer object, a raw { choices } body, { status, body } or an error
function fakeFetch(...replies) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = replies.shift();
    if (r instanceof Error) throw r;
    if (r.status) return new Response(JSON.stringify(r.body), { status: r.status });
    return Response.json(r.choices ? r : { choices: [{ message: { content: JSON.stringify(r), refusal: null }, finish_reason: 'stop' }] });
  };
  return Object.assign(fetch, { calls });
}

const bowl = {
  name: 'Ball in a bowl', notes: ['bowl y = x²/2', 'light friction'],
  eqs: [String.raw`\ddot{x}+b\dot{x}+\frac{gx}{1+x^2}=0`],
  params: [{ name: 'b', value: 0.2 }, { name: 'g', value: 9.81 }],
  ic: [{ key: 'x', latex: '1' }, { key: 'x__t', latex: '0' }], bc: null, domain: null, view: 'spring',
};

test('a valid answer becomes an example-shaped object', async () => {
  const client = fakeClient(bowl);
  const p = await buildWithAI('a ball rolling in a bowl with a little friction', { client });
  assert.deepEqual(p.params, { b: 0.2, g: 9.81 });
  assert.deepEqual(p.ic, { x: '1', x__t: '0' });
  assert.equal(p.view, 'spring');
  assert.ok(!('bc' in p) && !('domain' in p)); // null means "not given"
  assert.equal(analyze(p.eqs).kind, 'ode');
  const req = client.calls[0];
  assert.equal(req.model, PROVIDERS.anthropic.model);
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.fallbacks, 'default');
  assert.equal(client.calls.length, 1);
});

test('GPT and Gemini send Chat Completions with a strict JSON schema', async () => {
  for (const provider of ['openai', 'gemini']) {
    const fetch = fakeFetch(bowl);
    assert.equal((await buildWithAI('a ball in a bowl', { provider, apiKey: 'k', fetch })).name, 'Ball in a bowl');
    const { url, headers, body } = fetch.calls[0];
    assert.equal(url, PROVIDERS[provider].url);
    assert.equal(headers.authorization, 'Bearer k');
    assert.equal(body.model, PROVIDERS[provider].model);
    assert.deepEqual(body.messages.map(m => m.role), ['system', 'user']);
    assert.equal(body.response_format.json_schema.strict, true);
  }
  // OpenAI's strict mode: every field required
  assert.deepEqual([...SCHEMA.required].sort(), Object.keys(SCHEMA.properties).sort());
});

test('PDE answers keep bc and domain; a view that does not fit is dropped', () => {
  const p = toPreset({
    name: 'Rope', notes: [], eqs: ['u_{tt}=c^2u_{xx}'], params: [{ name: 'c', value: 1 }],
    ic: [{ key: 'u', latex: String.raw`e^{-40x^2}` }, { key: 'u__t', latex: '0' }], bc: 'fixed', domain: [-2, 2], view: 'pendulum',
  });
  assert.equal(p.bc, 'fixed');
  assert.deepEqual(p.domain, [-2, 2]);
  assert.equal(p.view, undefined);
});

test('invalid answers are rejected with a message the model can act on', () => {
  const bad = patch => () => toPreset({ ...bowl, ...patch });
  assert.throws(bad({ eqs: ['x+1=0'] }), /No derivative/);
  assert.throws(bad({ eqs: [String.raw`\ddot{x}=\foo{x}`] }), /Unsupported command/);
  assert.throws(bad({ ic: [{ key: 'x_t', latex: '0' }] }), /state names are x, x__t/);
  assert.throws(bad({ ic: [{ key: 'x', latex: String.raw`\frac{1}{` }] }), /ic x/);
  assert.throws(bad({ params: [{ name: 'b', value: 0.2 }] }), /No numeric value for g/); // a missing value
  assert.throws(bad({ params: [{ name: 'B', value: 0.2 }, { name: 'g', value: Infinity }] }), /b, g/);
  assert.throws(bad({ eqs: ['u_t=u_{xx}'], params: [], ic: [{ key: 'u', latex: '0' }], domain: [1, -1] }), /start < end/);
  // an unused parameter is harmless and dropped
  assert.deepEqual(toPreset({ ...bowl, params: [...bowl.params, { name: 'm', value: 2 }] }).params, { b: 0.2, g: 9.81 });
});

test('one retry feeds the parser error back to the model', async () => {
  const client = fakeClient({ ...bowl, ic: [{ key: 'xdot', latex: '0' }] }, bowl);
  const p = await buildWithAI('a ball in a bowl', { client });
  assert.equal(p.name, 'Ball in a bowl');
  assert.equal(client.calls.length, 2);
  const retry = client.calls[1].messages[0].content;
  assert.match(retry, /^a ball in a bowl/);
  assert.match(retry, /"xdot"/); // its previous answer
  assert.match(retry, /state names are x, x__t/); // and why it failed
  // the same on the Chat Completions path
  const fetch = fakeFetch({ ...bowl, eqs: ['x=1'] }, bowl);
  await buildWithAI('a ball in a bowl', { provider: 'gemini', fetch });
  assert.match(fetch.calls[1].body.messages[1].content, /No derivative/);
});

test('a second invalid answer is reported, not loaded', async () => {
  const wrong = { ...bowl, eqs: ['x=1'] };
  await assert.rejects(buildWithAI('a ball in a bowl', { client: fakeClient(wrong, wrong) }), /Claude's equations didn't parse: No derivative/);
  await assert.rejects(buildWithAI('a ball in a bowl', { provider: 'openai', fetch: fakeFetch(wrong, wrong) }), /GPT's equations didn't parse/);
});

test('refusals, cut-off answers and API errors become readable messages', async () => {
  const run = (...r) => buildWithAI('x', { client: fakeClient(...r) });
  await assert.rejects(run({ stop_reason: 'refusal', content: [] }), /declined/);
  await assert.rejects(run({ stop_reason: 'max_tokens', content: [] }), /cut off/);
  await assert.rejects(run(apiError(401)), /Anthropic rejected the API key/);
  await assert.rejects(run(apiError(429)), /rate limit/);
  await assert.rejects(run(apiError(529)), /busy/);
  await assert.rejects(run(new Error('Failed to fetch')), /Couldn't reach the Anthropic API/);

  const chat = (provider, ...r) => buildWithAI('x', { provider, apiKey: 'k', fetch: fakeFetch(...r) });
  await assert.rejects(chat('openai', { choices: [{ message: { content: null, refusal: 'no' }, finish_reason: 'stop' }] }), /GPT declined/);
  await assert.rejects(chat('gemini', { choices: [{ message: { content: '{' }, finish_reason: 'length' }] }), /Gemini's answer was cut off/);
  await assert.rejects(chat('openai', { status: 401, body: { error: { message: 'Incorrect API key' } } }), /OpenAI rejected the API key/);
  // Gemini reports a bad key as a 400, with the error wrapped in an array
  await assert.rejects(chat('gemini', { status: 400, body: [{ error: { code: 400, message: 'API key not valid.' } }] }), /Google API error 400: API key not valid/);
  await assert.rejects(chat('gemini', new TypeError('Failed to fetch')), /Couldn't reach the Google API/);
});
