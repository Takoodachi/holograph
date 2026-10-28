// Holograph's free AI: answers "Describe it" with Qwen on Cloudflare Workers AI, so visitors need no key.
// There is no secret to leak: the model is reached through the AI binding. Spending is capped twice: Cloudflare's free
// daily allowance (on the Workers Free plan, requests past it fail and are never billed) and a per-visitor daily count.
// It only runs Holograph's own prompt, so it can't be used as a general chatbot.
import { SYSTEM, SCHEMA } from '../js/prompt.js';

const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const ORIGINS = ['https://takoodachi.github.io', 'http://localhost:5173'];
const PER_DAY = 10; // requests per visitor per UTC day; a build that needs its retry uses two
const MAX_INPUT = 8000; // characters: a description, plus the previous answer and the error on a retry
// this model doesn't enforce a JSON schema, so it reads the schema instead
const PROMPT = `${SYSTEM}\n\nThe JSON schema:\n${JSON.stringify(SCHEMA)}\n\nReply with only the JSON object.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const cors = { 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], vary: 'origin' };
    const fail = (status, message) => Response.json({ error: { message } }, { status, headers: cors });
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
    }
    if (request.method !== 'POST' || !ORIGINS.includes(origin)) return fail(403, 'This service only answers Holograph.');

    // the app sends a Chat Completions body; only its user message is used
    const content = (await request.json().catch(() => null))?.messages?.findLast?.(m => m.role === 'user')?.content;
    if (typeof content !== 'string' || !content.trim()) return fail(400, 'Describe a system first.');
    if (content.length > MAX_INPUT) return fail(400, 'That description is too long for the free AI. Try a shorter one.');

    const key = `${new Date().toISOString().slice(0, 10)}:${request.headers.get('cf-connecting-ip')}`;
    const used = Number(await env.LIMITS.get(key)) || 0;
    if (used >= PER_DAY) return fail(429, `You've used today's ${PER_DAY} free AI requests. Try again tomorrow, or add your own key in Settings.`);
    await env.LIMITS.put(key, String(used + 1), { expirationTtl: 2 * 86400 });

    let res;
    try {
      res = await env.AI.run(MODEL, { messages: [{ role: 'system', content: PROMPT }, { role: 'user', content }], max_tokens: 8000 });
    } catch (e) {
      // the free allowance is shared by every visitor and resets at 00:00 UTC (Workers AI error 4006)
      if (/4006|neuron|allocation/i.test(e.message)) return fail(429, "The free AI has used up today's allowance. Try again tomorrow, or add your own key in Settings.");
      return fail(502, 'The free AI is busy right now. Try again in a moment.');
    }
    const choice = res.choices?.[0];
    return Response.json(
      { choices: [{ message: { content: choice?.message?.content ?? res.response ?? '' }, finish_reason: choice?.finish_reason ?? 'stop' }] },
      { headers: cors },
    );
  },
};
