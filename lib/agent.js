// Server-side AI image agent: understand -> plan queries -> multi-page search -> batched ranking.
// Powers GET/POST /api/agent. The LLM and the search backend are injectable so it can be tested offline.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseParams, HttpError } from './params.js';
import { runSearch } from './search.js';
import { dedupeKey } from './rank.js';

/* ------------------------------ config ------------------------------ */
/** Groq settings: env vars win, otherwise the (public, test) public/config.js file the browser agent also uses. */
export function loadConfig() {
  const cfg = { key: process.env.GROQ_API_KEY || '', base: process.env.GROQ_BASE_URL || '', model: process.env.GROQ_MODEL || '' };
  if (!cfg.key || !cfg.base || !cfg.model) {
    try {
      const txt = readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');
      const pick = (k) => new RegExp(`${k}\\s*:\\s*'([^']*)'`).exec(txt)?.[1] || '';
      cfg.key ||= pick('GROQ_API_KEY');
      cfg.base ||= pick('GROQ_BASE_URL');
      cfg.model ||= pick('GROQ_MODEL');
    } catch { /* no file: fine */ }
  }
  cfg.base ||= 'https://api.groq.com/openai/v1';
  cfg.model ||= 'openai/gpt-oss-120b';
  if (cfg.key.startsWith('PASTE_')) cfg.key = '';
  return cfg;
}

/* ------------------------------ prompts (keep in sync with public/agent.js) ------------------------------ */
export const PLAN_SYS = `You are the planning brain of a professional image-search agent. The user describes an image or GIF they want (any language, maybe vague or short).
Understand the need deeply: the main subject, every visual detail (colors, setting, style, mood, count, camera angle, era), and the format wanted.
Then write search queries that Google/Bing/DuckDuckGo image search will answer well.
Reply with ONLY one JSON object, no markdown:
{"intent":"one precise sentence describing the ideal image",
 "subject":"the main subject in a few words",
 "details":["up to 6 specific visual details a correct result must show"],
 "avoid":["things that would make a result wrong, e.g. cartoon, logo, watermark, text-only"],
 "format":"photo | gif | illustration | any",
 "queries":["4 to 6 distinct queries, most precise first, each 2-8 words, no quotes or operators; vary the wording and angle; English unless the subject is language-specific; if the user wrote in another language include one query in that language"],
 "filters":{"size":"l|m|i or empty","image_type":"photo|clipart|lineart|animated|face or empty","image_color":"color|gray or empty"},
 "summary":"one short friendly sentence, in the user's language, saying what you will look for"}
Rules: format "gif" (user says gif/animated/moving/reaction) => filters.image_type "animated". "illustration/vector/icon" => clipart. "black and white" => gray. "wallpaper/high resolution/hd" => size l. A person's face/portrait => face. Otherwise leave filters empty.
For a follow-up message, combine it with the previous request: keep what still applies, change what the user changed.`;

export const RANK_SYS = `You are a strict judge of image search results. You only see metadata (title, source domain, pixel size, format), not the picture.
Given the user's wish, the ideal-image description, details that must show and things to avoid, score every candidate 0-100 for how likely the picture is EXACTLY what was asked.
Scoring: 90-100 = title clearly confirms the subject AND most details; 70-89 = right subject, some details confirmed; 50-69 = probably right subject, details unknown; below 50 = off-topic, generic listicle/stock page, logo/icon (unless wanted), wrong format, or tiny.
If a GIF was requested, candidates with format gif score higher and non-gif lower. Titles that say nothing relevant must not exceed 60.
Reply with ONLY one JSON object, no markdown:
{"ranked":[{"i":<candidate id>,"s":<0-100>,"why":"<=9 words saying why it fits"}],"summary":"one friendly sentence, in the user's language, about what you found"}
Include only candidates scoring 50 or more, best first, at most 45.`;

/* ------------------------------ pure helpers ------------------------------ */
export function extractJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  if (a < 0) throw new Error('The AI reply had no JSON.');
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(s.slice(a, i + 1));
  }
  throw new Error('The AI reply was cut off.');
}

export const isGif = (i) => /\.gif(\?|#|$)/i.test(i?.original || '');
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'to', 'is', 'photo', 'image', 'picture']);
const toks = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));
export function heuristic(text, img) {
  const q = toks(text);
  if (!q.length) return 0;
  const hay = `${img.title} ${img.source}`.toLowerCase();
  return q.filter((t) => hay.includes(t)).length / q.length;
}
export const GIF_WORDS = /\b(gifs?|animated|animation|moving|reaction|jif)\b|جيف|متحرك/i;
const OK = { size: ['l', 'm', 'i'], image_type: ['photo', 'clipart', 'lineart', 'animated', 'face'], image_color: ['color', 'gray'] };
const strArr = (a, n) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);

/** Clean whatever the model returned into a safe, fully-typed plan. */
export function normalizePlan(raw, text, wantGif) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const queries = [...new Set(strArr(p.queries, 6))];
  if (!queries.length) queries.push(text);
  const f = p.filters || {};
  const filters = {
    size: OK.size.includes(f.size) ? f.size : '',
    image_type: OK.image_type.includes(f.image_type) ? f.image_type : '',
    image_color: OK.image_color.includes(f.image_color) ? f.image_color : '',
  };
  let format = ['photo', 'gif', 'illustration', 'any'].includes(p.format) ? p.format : 'any';
  if (wantGif) format = 'gif';
  if (format === 'gif') filters.image_type = 'animated';
  return {
    intent: String(p.intent || text).slice(0, 300),
    subject: String(p.subject || '').slice(0, 120),
    details: strArr(p.details, 6),
    avoid: strArr(p.avoid, 6),
    format,
    queries,
    filters,
    summary: String(p.summary || '').slice(0, 300),
  };
}

export const CAP = 180;
export const BATCH = 60;

/** Merge result lists round-robin, de-duplicating and dropping tiny images. */
export function mergeLists(lists, cap = CAP) {
  const seen = new Set(), out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < cap; i++) {
    for (const l of lists) {
      const img = l[i];
      if (!img?.original) continue;
      const k = dedupeKey(img.original);
      if (seen.has(k)) continue;
      if (img.original_width && img.original_height && (img.original_width < 120 || img.original_height < 120)) continue;
      seen.add(k);
      out.push(img);
    }
  }
  return out;
}

/* ------------------------------ default dependencies ------------------------------ */
/** Streaming chat completion against an OpenAI-compatible endpoint (Groq). */
export async function groqChat(messages, { effort = 'low', max = 3000, onReasoning, cfg = loadConfig() } = {}) {
  if (!cfg.key) throw new Error('No Groq API key configured (set GROQ_API_KEY or public/config.js).');
  const body = JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.3, max_completion_tokens: max, reasoning_effort: effort });
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(`${cfg.base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body, signal: AbortSignal.timeout(28000) });
    if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, Math.min(4000, (Number(res.headers.get('retry-after')) || 2) * 1000))); continue; }
    break;
  }
  if (!res.ok) {
    let msg = `AI service error (HTTP ${res.status})`;
    try { msg = (await res.json()).error?.message || msg; } catch { /* keep */ }
    throw new Error(res.status === 401 ? 'The AI API key was rejected.' : msg);
  }
  const dec = new TextDecoder();
  let buf = '', content = '', reasoning = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      const d = j.choices?.[0]?.delta || {};
      const r = d.reasoning ?? d.reasoning_content;
      if (r) { reasoning += r; onReasoning?.(r); }
      if (d.content) content += d.content;
    }
  }
  return { content, reasoning };
}

async function defaultSearch(job, o) {
  const p = parseParams({ q: job.q, ijn: job.ijn, imgsz: job.imgsz, image_type: job.image_type, image_color: job.image_color, safe: o.safe, gl: o.gl, hl: o.hl, backend: o.backend });
  const out = await runSearch(p, { origin: '' });
  return out.images_results || [];
}

/* ------------------------------ the agent ------------------------------ */
/**
 * @param o {q, previous, gif, format, limit, minScore, safe, gl, hl, backend, thinking, planOnly}
 * @param deps {llm, search, emit}
 */
export async function runAgent(o, { llm = groqChat, search = defaultSearch, emit = () => {} } = {}) {
  const started = Date.now();
  const text = String(o.q || '').trim();
  const steps = [];
  const notes = [];
  let thinking = '';
  const step = async (name, fn) => {
    const t = Date.now();
    emit('status', { step: name, status: 'running' });
    try {
      const r = await fn();
      steps.push({ name, status: 'done', seconds: Number(((Date.now() - t) / 1000).toFixed(2)) });
      emit('status', { step: name, status: 'done' });
      return r;
    } catch (e) {
      steps.push({ name, status: 'failed', seconds: Number(((Date.now() - t) / 1000).toFixed(2)), error: e.message });
      emit('status', { step: name, status: 'failed', error: e.message });
      throw e;
    }
  };
  const onReasoning = (t) => { thinking += t; emit('thinking', { text: t }); };
  const wantGif = Boolean(o.gif) || o.format === 'gif' || GIF_WORDS.test(text);

  /* 1. understand + plan */
  let plan = normalizePlan(null, text, wantGif);
  let aiUsed = false;
  try {
    await step('understand', async () => {
      const prev = o.previous ? `Previous request: ${o.previous}\nNew message (a refinement, or a brand new request): ${text}` : text;
      const r = await llm([{ role: 'system', content: PLAN_SYS }, { role: 'user', content: prev + (wantGif ? '\n(The user wants GIFs included.)' : '') }], { effort: 'low', max: 3500, onReasoning });
      plan = normalizePlan(extractJson(r.content), text, wantGif);
      aiUsed = true;
    });
  } catch (e) {
    notes.push(`AI planning unavailable (${e.message}); used a direct search of the query instead.`);
  }
  emit('understanding', plan);
  const meta = (extra = {}) => ({
    id: randomUUID().replace(/-/g, '').slice(0, 24),
    status: 'Success',
    ai_used: aiUsed,
    model: aiUsed ? loadConfig().model : null,
    steps,
    notes,
    total_time_taken: Number(((Date.now() - started) / 1000).toFixed(2)),
    ...extra,
  });
  const base = () => ({ agent_metadata: meta(), search_parameters: { q: text, previous: o.previous || undefined, gif: wantGif, format: o.format || 'any', limit: o.limit, min_score: o.minScore, safe: o.safe }, understanding: plan, ...(o.thinking ? { thinking } : {}) });
  if (o.planOnly) return { ...base(), summary: plan.summary, images_results: [] };

  /* 2. search: every query over 2 pages (+ animated variants for GIFs) */
  const candidates = await step('search', async () => {
    const f = plan.filters;
    const jobs = [];
    plan.queries.forEach((q, qi) => {
      jobs.push({ q, ...f, ijn: 0 });
      if (qi < 4) jobs.push({ q, ...f, ijn: 1 });
      if (wantGif && f.image_type !== 'animated' && qi < 3) jobs.push({ q, ...f, image_type: 'animated', ijn: 0 });
    });
    let ok = 0, lastErr;
    const lists = await Promise.all(jobs.map(async (j) => { try { const r = await search(j, o); ok++; return r; } catch (e) { lastErr = e; return []; } }));
    if (!ok) throw Object.assign(new Error(`Search failed: ${lastErr?.message || 'no engine answered'}`), { status: lastErr?.status || 502 });
    const merged = mergeLists(lists);
    emit('candidates', { count: merged.length, searches: jobs.length });
    return Object.assign(merged, { searches: jobs.length });
  });
  const searches = candidates.searches;

  /* 3. rank in parallel batches */
  let ranked = null, summary = '';
  if (candidates.length && (aiUsed || loadConfig().key)) {
    try {
      await step('rank', async () => {
        const batches = [];
        for (let i = 0; i < candidates.length; i += BATCH) batches.push(candidates.slice(i, i + BATCH).map((c, k) => ({ c, id: i + k })));
        const head = `User wish: ${text}\nIdeal image: ${plan.intent}\nSubject: ${plan.subject || '-'}\nMust show: ${plan.details.join('; ') || '-'}\nAvoid: ${plan.avoid.join('; ') || '-'}\nFormat wanted: ${wantGif ? 'gif' : plan.format}`;
        let okB = 0, lastErr;
        const results = await Promise.all(batches.map(async (batch, bi) => {
          const list = batch.map(({ c, id }) => `${id}|${(c.title || '').slice(0, 90)}|${c.source}|${c.original_width || '?'}x${c.original_height || '?'}|${isGif(c) ? 'gif' : 'img'}`).join('\n');
          try {
            const r = await llm([{ role: 'system', content: RANK_SYS }, { role: 'user', content: `${head}\n\nCandidates (id|title|source|size|format):\n${list}` }], { effort: 'low', max: 5000, onReasoning: bi === 0 ? onReasoning : undefined });
            const j = extractJson(r.content);
            okB++;
            if (bi === 0) summary = String(j.summary || '');
            return (j.ranked || []).filter((x) => candidates[x.i] && Number.isFinite(+x.s));
          } catch (e) { lastErr = e; return []; }
        }));
        if (!okB) throw lastErr || new Error('Ranking failed.');
        if (okB < batches.length) notes.push(`Only ${okB} of ${batches.length} ranking batches succeeded; some candidates were not scored.`);
        ranked = results.flat().sort((a, b) => b.s - a.s);
        aiUsed = true;
      });
    } catch (e) {
      notes.push(`AI ranking unavailable (${e.message}); results ordered by keyword match.`);
      ranked = null;
    }
  }

  /* 4. assemble */
  const minScore = Number.isFinite(o.minScore) ? o.minScore : 50;
  let list;
  if (ranked?.length) {
    const seen = new Set();
    list = ranked.filter((x) => !seen.has(x.i) && seen.add(x.i)).map((x) => ({ ...candidates[x.i], score: Math.max(1, Math.min(99, Math.round(+x.s))), why: String(x.why || '').slice(0, 90) })).filter((x) => x.score >= minScore);
  } else {
    list = candidates.map((c, i) => ({ c, i, h: heuristic(`${text} ${plan.queries[0]}`, c) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => ({ ...x.c, score: null, why: '' }));
  }
  if (o.format === 'gif' || (!o.format && wantGif && o.gifOnly)) list = list.filter(isGif);
  else if (o.format === 'photo') list = list.filter((i) => !isGif(i));
  const total = list.length;
  list = list.slice(0, o.limit).map((i, n) => ({ position: n + 1, score: i.score, why: i.why, is_gif: isGif(i), title: i.title, source: i.source, source_logo: i.source_logo, link: i.link, thumbnail: i.thumbnail, original: i.original, original_width: i.original_width, original_height: i.original_height }));
  const out = {
    ...base(),
    agent_metadata: meta({ candidates_considered: candidates.length, searches_run: searches, matches_total: total, returned: list.length }),
    summary: summary || plan.summary || `Best matches for “${text}”.`,
    images_results: list,
  };
  emit('result', out);
  return out;
}

/** Validate/normalise request parameters (GET query or POST body). */
export function parseAgentParams(src) {
  const q = String(src.q ?? '').trim();
  if (!q) throw new HttpError(400, 'Missing `q` parameter: describe the image you want.');
  if (q.length > 600) throw new HttpError(400, '`q` is too long (max 600 characters).');
  const bool = (v) => v === true || ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
  const limit = src.limit === undefined || src.limit === '' ? 24 : Number(src.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 60) throw new HttpError(400, '`limit` must be an integer from 1 to 60 (default 24).');
  const minScore = src.min_score === undefined || src.min_score === '' ? 50 : Number(src.min_score);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) throw new HttpError(400, '`min_score` must be a number from 0 to 100 (default 50).');
  const format = src.format ? String(src.format).toLowerCase() : '';
  if (format && !['any', 'photo', 'gif'].includes(format)) throw new HttpError(400, '`format` must be `any`, `photo` or `gif`.');
  const safe = src.safe ? String(src.safe).toLowerCase() : 'moderate';
  if (!['active', 'off', 'moderate'].includes(safe)) throw new HttpError(400, '`safe` must be `active`, `moderate` or `off`.');
  return {
    q, limit, minScore, safe,
    previous: src.previous ? String(src.previous).slice(0, 600) : '',
    gif: bool(src.gif),
    format: format === 'any' ? '' : format,
    thinking: bool(src.thinking),
    planOnly: bool(src.plan_only),
    stream: bool(src.stream),
    gl: src.gl ? String(src.gl).toLowerCase() : undefined,
    hl: src.hl ? String(src.hl).toLowerCase() : undefined,
    backend: src.backend ? String(src.backend) : undefined,
  };
}
