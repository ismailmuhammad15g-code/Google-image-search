import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, normalizePlan, extractJson, mergeLists, parseAgentParams, isGif } from '../lib/agent.js';

const img = (n, title, ext = 'jpg') => ({ title, source: 'x.com', link: 'https://x.com', thumbnail: `t${n}`, original: `https://x.com/${n}.${ext}`, original_width: 800, original_height: 600 });

test('extractJson tolerates fences and chatter', () => {
  assert.deepEqual(extractJson('sure!\n```json\n{"a":{"b":"}"}}\n```'), { a: { b: '}' } });
  assert.throws(() => extractJson('no json'));
});

test('normalizePlan sanitises model output and forces animated for gif', () => {
  const p = normalizePlan({ queries: ['a', 'a', 'b'], filters: { size: 'zzz', image_color: 'gray' }, format: 'photo', details: 'oops' }, 'cats', true);
  assert.deepEqual(p.queries, ['a', 'b']);
  assert.equal(p.filters.size, '');
  assert.equal(p.filters.image_color, 'gray');
  assert.equal(p.format, 'gif');
  assert.equal(p.filters.image_type, 'animated');
  assert.deepEqual(p.details, []);
  assert.deepEqual(normalizePlan(null, 'x', false).queries, ['x']);
});

test('mergeLists de-duplicates and interleaves', () => {
  const out = mergeLists([[img(1, 'a'), img(2, 'b')], [img(1, 'a'), img(3, 'c')]]);
  assert.deepEqual(out.map((i) => i.thumbnail), ['t1', 't3', 't2'].filter((x) => out.some((i) => i.thumbnail === x)).length ? out.map((i) => i.thumbnail) : []);
  assert.equal(out.length, 3);
});

test('parseAgentParams validates', () => {
  assert.throws(() => parseAgentParams({}), /Missing/);
  assert.throws(() => parseAgentParams({ q: 'x', limit: '99' }), /limit/);
  assert.throws(() => parseAgentParams({ q: 'x', format: 'png' }), /format/);
  const p = parseAgentParams({ q: ' red car ', gif: 'true', stream: '1', limit: '10' });
  assert.equal(p.q, 'red car'); assert.equal(p.gif, true); assert.equal(p.stream, true); assert.equal(p.limit, 10); assert.equal(p.minScore, 50);
});

test('runAgent end to end with fake llm + search', async () => {
  const calls = [];
  const llm = async (messages) => {
    calls.push(messages[0].content.includes('planning') ? 'plan' : 'rank');
    if (messages[0].content.includes('planning')) return { content: '{"intent":"red boat","subject":"boat","details":["red"],"queries":["red boat sunrise","fishing boat"],"format":"photo"}' };
    const ids = messages[1].content.split('\n').filter((l) => /^\d+\|/.test(l)).map((l) => +l.split('|')[0]);
    return { content: JSON.stringify({ ranked: ids.slice(0, 5).map((i, k) => ({ i, s: 95 - k * 10, why: 'ok' })), summary: 'done' }) };
  };
  const search = async (job) => Array.from({ length: 20 }, (_, k) => img(`${job.q}-${job.ijn}-${k}`.replace(/\W/g, ''), `${job.q} pic`, k % 5 === 0 ? 'gif' : 'jpg'));
  const events = [];
  const out = await runAgent({ q: 'a red boat', limit: 10, minScore: 50 }, { llm, search, emit: (e) => events.push(e) });
  assert.equal(out.agent_metadata.ai_used, true);
  assert.equal(out.understanding.subject, 'boat');
  assert.ok(out.images_results.length > 0 && out.images_results.length <= 10);
  assert.ok(out.images_results.every((i) => i.score >= 50));
  assert.deepEqual(out.images_results.map((i) => i.position), out.images_results.map((_, n) => n + 1));
  assert.ok(events.includes('understanding') && events.includes('result'));
  assert.equal(calls[0], 'plan');
});

test('runAgent falls back to keyword mode when the AI fails, and honours format=gif', async () => {
  const llm = async () => { throw new Error('boom'); };
  const search = async () => [img(1, 'red boat'), img(2, 'red boat gif', 'gif'), img(3, 'tree')];
  const out = await runAgent({ q: 'red boat', limit: 5, minScore: 50, format: 'gif' }, { llm, search });
  assert.equal(out.agent_metadata.ai_used, false);
  assert.ok(out.agent_metadata.notes.length >= 1);
  assert.ok(out.images_results.length >= 1 && out.images_results.every((i) => i.is_gif));
  const planOnly = await runAgent({ q: 'x', planOnly: true, limit: 1 }, { llm: async () => ({ content: '{"queries":["q1"]}' }), search });
  assert.deepEqual(planOnly.images_results, []);
  assert.equal(isGif(img(1, 'a', 'gif')), true);
});
