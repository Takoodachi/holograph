// Optional AI mode for "Describe it": free-form descriptions the built-in reader (describe.js) can't place.
// Qwen is free for everyone through Holograph's Cloudflare Worker (worker/); the others run in the browser with the
// user's own key. The model's answer is untrusted, so it goes through the same parser as typed equations before the
// app loads it, with one retry that shows the model the error.
import { analyze, compileExpr } from './parse.js';
import { SYSTEM, SCHEMA } from './prompt.js';

// Claude goes through Anthropic's SDK; the rest share the Chat Completions format (Gemini's OpenAI-compatible
// endpoint, and the Worker answers in the same shape), so another OpenAI-compatible provider is one more entry here
export const PROVIDERS = {
  qwen: { name: 'Qwen', company: 'Holograph', model: 'qwen3-30b-a3b-fp8', free: true, ask: askChat, url: 'https://holograph-ai.takoodachi.workers.dev' },
  anthropic: { name: 'Claude', company: 'Anthropic', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', ask: askClaude },
  openai: { name: 'GPT', company: 'OpenAI', model: 'gpt-6-astra', keyUrl: 'https://platform.openai.com/api-keys', ask: askChat, url: 'https://api.openai.com/v1/chat/completions' },
  gemini: {
    name: 'Gemini', company: 'Google', model: 'gemini-4-argon', keyUrl: 'https://aistudio.google.com/apikey', ask: askChat,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
};

// The model's answer → an example-shaped object, checked by the app's own parser. Throws with a message the model can act on.
export function toPreset(out) {
  if (!['eqs', 'params', 'ic'].every(k => Array.isArray(out[k]))) throw new Error('eqs, params and ic must be lists, as in the JSON schema');
  const p = {
    name: String(out.name || 'Described system'), notes: (out.notes ?? []).map(String), eqs: out.eqs,
    params: Object.fromEntries(out.params.map(e => [e.name, e.value])),
    ic: Object.fromEntries(out.ic.map(e => [e.key, e.latex])),
  };
  const m = analyze(p.eqs);
  const keys = m.kind === 'pde' ? m.fields.flatMap(f => (f.tOrder === 2 ? [f.name, `${f.name}__t`] : [f.name])) : m.state;
  const used = new Set(m.params);
  for (const [k, latex] of Object.entries(p.ic)) {
    if (!keys.includes(k)) throw new Error(`ic has "${k}", but the state names are ${keys.join(', ')}`);
    try { compileExpr(latex, m.kind === 'pde' ? ['x', 'y'] : []).params.forEach(s => used.add(s)); } catch (e) { throw new Error(`ic ${k} = ${latex}: ${e.message}`); }
  }
  // an unused entry is harmless and dropped; a misspelt name ("Ta" for T_a) shows up as a used one with no value
  p.params = Object.fromEntries(Object.entries(p.params).filter(([k]) => used.has(k)));
  const missing = [...used].filter(k => !Number.isFinite(p.params[k]));
  if (missing.length) throw new Error(`No numeric value for ${missing.join(', ')}. The app reads these parameters: ${[...used].join(', ')}`);
  if (m.kind === 'pde') {
    if (out.bc) p.bc = out.bc;
    if (out.domain) {
      const [a, b] = out.domain;
      if (out.domain.length !== 2 || !(a < b) || !Number.isFinite(a + b)) throw new Error('domain must be [start, end] with start < end');
      p.domain = [a, b];
    }
  }
  if (m.views.includes(out.view)) p.view = out.view;
  return p;
}

// Errors carry the HTTP status; turn the common ones into something a user can act on
function apiMessage(p, status, detail) {
  if (p.free && status) return detail || `The free ${p.name} is unavailable right now (${status}). Try again later.`; // the Worker writes its own
  if (status === 401) return `${p.company} rejected the API key. Check it in Settings.`;
  if (status === 403) return `This API key can't use ${p.model}.`;
  if (status === 429) return `Your ${p.company} key hit its rate limit or quota. Wait a minute or check your plan.`;
  if (status >= 500) return `${p.name} is busy right now. Try again in a moment.`;
  if (status) return `${p.company} API error ${status}: ${detail}`;
  return `Couldn't reach the ${p.company} API. Check your connection.`;
}
const declined = p => new Error(`${p.name} declined to build that one. Try describing it differently.`);
const cutOff = p => new Error(`${p.name}'s answer was cut off. Try a shorter description.`);

async function askClaude(p, content, { apiKey, client }) {
  // the SDK loads only on first use
  client ??= new (await import('@anthropic-ai/sdk')).default({ apiKey, dangerouslyAllowBrowser: true });
  let res;
  try {
    res = await client.beta.messages.create({
      model: p.model, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }],
      // thinking is always on (adaptive) for this model; effort sets how hard it thinks
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // a safety decline re-runs on a fallback model
    });
  } catch (e) {
    throw new Error(apiMessage(p, e.status, e.error?.error?.message ?? e.message));
  }
  if (res.stop_reason === 'refusal') throw declined(p);
  if (res.stop_reason === 'max_tokens') throw cutOff(p);
  return res.content.find(b => b.type === 'text').text;
}

async function askChat(p, content, { apiKey, fetch = globalThis.fetch }) {
  let res;
  try {
    res = await fetch(p.url, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({
        model: p.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }],
        response_format: { type: 'json_schema', json_schema: { name: 'simulation', strict: true, schema: SCHEMA } },
      }),
    });
  } catch {
    throw new Error(apiMessage(p));
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiMessage(p, res.status, [body].flat()[0]?.error?.message)); // Gemini wraps errors in an array
  const { message, finish_reason: end } = body.choices[0];
  if (message.refusal || end === 'content_filter') throw declined(p);
  if (end === 'length') throw cutOff(p);
  return message.content ?? '';
}

// Describe → example-shaped object. client (Anthropic SDK) and fetch are injectable for tests.
export async function buildWithAI(text, { provider = 'anthropic', ...opts } = {}) {
  const p = PROVIDERS[provider];
  let prompt = text;
  for (let attempt = 0; attempt < 2; attempt++) {
    // a model without enforced JSON (the free Qwen) may wrap it in reasoning or code fences
    const answer = (await p.ask(p, prompt, opts)).replace(/<think>[\s\S]*?<\/think>/, '').trim();
    try {
      return toPreset(JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)));
    } catch (e) {
      if (attempt) throw new Error(`${p.name}'s equations didn't parse: ${e.message}`);
      prompt = `${text}\n\nYour previous answer was:\n${answer}\n\nThe app rejected it: ${e.message}\nFix that and answer again.`;
    }
  }
}
