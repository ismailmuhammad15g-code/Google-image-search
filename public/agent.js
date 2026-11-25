/* AI image agent: understand -> plan queries -> search -> rank. Streams the model's thinking like a chat UI. */
const CFG = window.APP_CONFIG || {};
const EXAMPLES = [
  ['🌅', 'A lone red fishing boat on calm water at sunrise with mist'],
  ['🐕', 'Golden retriever puppy wearing a yellow raincoat'],
  ['🛋️', 'Minimalist living room with a beige sofa, big window and plants'],
  ['🌃', 'Retro 80s neon synthwave city poster'],
  ['🕌', 'صورة مسجد قديم عند الغروب'],
  ['🍜', 'Steaming bowl of ramen, top-down photo, dark background'],
];

const PLAN_SYS = `You are the planning brain of an image-search agent. The user describes an image they want (any language, maybe vague).
Work out exactly what they want, then write search queries that Google/Bing/DuckDuckGo image search will answer well.
Reply with ONLY one JSON object, no markdown:
{"intent":"one precise sentence about the image wanted",
 "queries":["3 to 5 distinct queries, most precise first, each 2-8 words, no quotes/operators, English unless the subject is language-specific; if the user wrote in another language include one query in that language"],
 "filters":{"size":"l|m|i or empty","image_type":"photo|clipart|lineart|animated|face or empty","image_color":"color|gray or empty"},
 "must":["visual details a correct result must show"],
 "summary":"one short friendly sentence, in the user's language, telling what you will look for"}
Only set a filter when the user clearly implies it (e.g. "black and white" => gray, "illustration/vector" => clipart, "wallpaper/high resolution" => size l, "portrait of a person" => face).
For a follow-up message, combine it with the previous request: keep what still applies, change what the user changed.`;

const RANK_SYS = `You judge image search results using only their metadata (title, source domain, pixel size).
Given the user's wish and a numbered candidate list, score each candidate 0-100 for how likely the picture is exactly what was asked:
reward matching subject AND the specific details (colors, setting, style, count, mood); penalise off-topic, generic listicles, logos/icons unless requested, and tiny images.
Reply with ONLY one JSON object, no markdown:
{"ranked":[{"i":<candidate id>,"s":<0-100>,"why":"<=9 words saying why it fits"}],"summary":"one friendly sentence, in the user's language, about what you found"}
Include only candidates scoring 45 or more, best first, at most 40.`;

/* ------------------------- Groq streaming client ------------------------- */
async function groq(messages, { effort = 'low', max = 3000, onReasoning, signal } = {}) {
  if (!CFG.GROQ_API_KEY || CFG.GROQ_API_KEY.startsWith('PASTE_')) throw new Error('No Groq API key configured (public/config.js).');
  const body = { model: CFG.GROQ_MODEL, messages, stream: true, temperature: 0.3, max_completion_tokens: max, reasoning_effort: effort };
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(`${CFG.GROQ_BASE_URL}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.GROQ_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt === 0) { await sleep(Math.min(6000, (Number(res.headers.get('retry-after')) || 2) * 1000)); continue; }
    break;
  }
  if (!res.ok) {
    let msg = `AI service error (HTTP ${res.status})`;
    try { msg = (await res.json()).error?.message || msg; } catch { /* keep default */ }
    if (res.status === 401) msg = 'The AI API key was rejected.';
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', content = '', reasoning = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
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

/** Pull the first balanced JSON object out of a model reply (tolerates fences / chatter). */
function extractJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  if (a < 0) throw new Error('The AI reply had no JSON.');
  let depth = 0, inStr = false, esc_ = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc_) esc_ = false; else if (c === '\\') esc_ = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(s.slice(a, i + 1));
  }
  throw new Error('The AI reply was cut off.');
}

/* ------------------------- search + merge ------------------------- */
const key = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).toLowerCase(); } catch { return String(u); } };
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'with', 'to', 'is', 'photo', 'image', 'picture']);
const toks = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP.has(t));
function heuristic(text, img) {
  const q = toks(text);
  if (!q.length) return 0;
  const hay = `${img.title} ${img.source}`.toLowerCase();
  return q.filter((t) => hay.includes(t)).length / q.length;
}

async function gather(plan, text, signal, onProgress) {
  const f = plan.filters || {};
  const filters = { imgsz: ['l', 'm', 'i'].includes(f.size) ? f.size : '', image_type: ['photo', 'clipart', 'lineart', 'animated', 'face'].includes(f.image_type) ? f.image_type : '', image_color: ['color', 'gray'].includes(f.image_color) ? f.image_color : '' };
  const queries = [...new Set((plan.queries || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 5);
  if (!queries.length) queries.push(text);
  let okCount = 0, lastErr;
  const lists = await Promise.all(queries.map(async (q) => {
    try { const { data } = await searchApi({ q, ...filters }, signal); okCount++; onProgress?.(okCount, queries.length); return data.images_results || []; }
    catch (e) { if (e.name === 'AbortError') throw e; lastErr = e; return []; }
  }));
  if (!okCount) throw lastErr || new Error('Search failed.');
  const seen = new Set(), out = [];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < 72; i++) {
    for (const l of lists) {
      const img = l[i];
      if (!img?.original) continue;
      const k = key(img.original);
      if (seen.has(k)) continue;
      if (img.original_width && img.original_height && (img.original_width < 120 || img.original_height < 120)) continue;
      seen.add(k); out.push(img);
    }
  }
  return { candidates: out, queries };
}

/* ------------------------- UI ------------------------- */
$('send').innerHTML = I.send;
$('examples').innerHTML = EXAMPLES.map(([e, t]) => `<button type="button" class="ex"><span class="em">${e}</span><span>${esc(t)}</span></button>`).join('');
mountLottie($('orb'));

const input = $('input'), thread = $('thread');
let busy = false, ctx = null;
const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; $('send').disabled = busy || !input.value.trim(); };
input.addEventListener('input', grow);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form').requestSubmit(); } });
$('examples').addEventListener('click', (e) => { const b = e.target.closest('.ex'); if (b) ask(b.querySelector('span:last-child').textContent); });
$('form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });

const near = () => innerHeight + scrollY > document.documentElement.scrollHeight - 320;
const follow = (el) => { if (near()) el.scrollIntoView({ behavior: 'smooth', block: 'end' }); };

const STEPS = ['Understanding your description', 'Writing smarter searches', 'Searching the web', 'Ranking the best matches'];

async function ask(raw) {
  const text = String(raw || '').trim();
  if (!text || busy) return;
  busy = true; input.value = ''; grow();
  $('welcome').hidden = true;
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.innerHTML = `<div class="umsg">${esc(text)}</div>
    <div class="amsg"><div class="avatar">${LOGO.replace('#14152e', '#fff')}</div><div class="abody">
      <div class="think live open"><button type="button" aria-expanded="true"><span class="lot"></span><span class="tt"><span>Thinking…</span></span><span class="tm">0s</span><span class="chev"></span></button><div class="tbody"></div></div>
      <ul class="todo">${STEPS.map((s) => `<li><span class="dot"></span><span>${s}</span> <small></small></li>`).join('')}</ul>
      <div class="plan-slot"></div><div class="notes"></div><div class="summary"></div>
      <div class="aresults"><div class="gallery"></div></div><div class="followups"></div>
    </div></div>`;
  thread.appendChild(turn);
  const $$ = (s) => turn.querySelector(s);
  const think = $$('.think'), tbody = $$('.tbody'), steps = [...turn.querySelectorAll('.todo li')];
  const lot = await mountLottie($$('.lot'));
  think.querySelector('button').onclick = () => { const o = think.classList.toggle('open'); think.querySelector('button').setAttribute('aria-expanded', o); };
  const t0 = Date.now();
  const timer = setInterval(() => { $$('.tm').textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 500);
  const say = (t) => { tbody.textContent += t; tbody.scrollTop = tbody.scrollHeight; };
  const mark = (n, st, note) => { steps[n].className = st; if (note != null) steps[n].querySelector('small').textContent = note; };
  const note = (msg, err) => { $$('.notes').insertAdjacentHTML('beforeend', `<div class="notice${err ? ' err' : ''}">${esc(msg)}</div>`); };
  follow(turn);
  const gal = createGallery($$('.gallery'), { onSimilar: (i) => ask(`More images like this one: ${i.title || i.source}`) });

  let plan = { intent: text, queries: [text], filters: {}, summary: '' }, candidates = [], final = [], summary = '';
  try {
    /* 1 + 2: understand & plan */
    mark(0, 'run');
    const prev = ctx ? `Previous request: ${ctx.text}\nPrevious intent: ${ctx.plan.intent}\nNew message (a refinement, or a brand new request): ${text}` : text;
    let planOk = false;
    try {
      say('Understanding the request…\n');
      const r = await groq([{ role: 'system', content: PLAN_SYS }, { role: 'user', content: prev }], { effort: 'low', max: 3500, onReasoning: say });
      const p = extractJson(r.content);
      if (Array.isArray(p.queries) && p.queries.length) { plan = { ...plan, ...p }; planOk = true; }
    } catch (e) {
      note(`AI planning is unavailable right now (${e.message}) so I used a direct search of your words instead.`);
    }
    mark(0, 'done'); mark(1, 'run');
    plan.queries = (plan.queries || []).map(String);
    $$('.plan-slot').innerHTML = `<div class="plan"><p><b>Looking for:</b> ${esc(plan.intent || text)}</p><div class="q">${plan.queries.slice(0, 5).map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>`;
    say(`\n\n▸ Plan: ${plan.intent}\n▸ Queries: ${plan.queries.join(' | ')}\n`);
    mark(1, 'done', planOk ? `${plan.queries.length} queries` : 'direct'); mark(2, 'run');
    follow(turn);

    /* 3: search */
    gal.skeleton(12);
    $$('.aresults').classList.add('analyzing');
    const g = await gather(plan, text, undefined, (n, m) => { steps[2].querySelector('small').textContent = `${n}/${m} done`; });
    candidates = g.candidates;
    if (!candidates.length) throw new Error('No images came back for these searches. Try describing it differently.');
    mark(2, 'done', `${candidates.length} candidates`);
    say(`▸ Found ${candidates.length} candidate images across ${g.queries.length} searches.\n`);
    gal.set(candidates);
    follow(turn);

    /* 4: rank */
    mark(3, 'run');
    let ranked = null;
    try {
      say('\n▸ Checking each candidate against your description…\n');
      const list = candidates.map((c, i) => `${i}|${(c.title || '').slice(0, 90)}|${c.source}|${c.original_width || '?'}x${c.original_height || '?'}`).join('\n');
      const r = await groq([
        { role: 'system', content: RANK_SYS },
        { role: 'user', content: `User wish: ${text}\nIntent: ${plan.intent}\nMust show: ${(plan.must || []).join('; ') || '-'}\n\nCandidates (id|title|source|size):\n${list}` },
      ], { effort: 'low', max: 5000, onReasoning: say });
      const j = extractJson(r.content);
      ranked = (j.ranked || []).filter((x) => candidates[x.i] && Number.isFinite(+x.s)).slice(0, 40);
      summary = j.summary || '';
      if (!ranked.length) ranked = null;
    } catch (e) {
      note(`AI ranking is unavailable (${e.message}); results are ordered by keyword match instead.`);
    }
    if (ranked) {
      const used = new Set();
      final = ranked.map((x) => { used.add(x.i); return { ...candidates[x.i], score: Math.max(1, Math.min(99, Math.round(+x.s))), why: String(x.why || '').slice(0, 90) }; });
      if (final.length < 8) {
        const rest = candidates.map((c, i) => ({ c, i })).filter((x) => !used.has(x.i)).sort((a, b) => heuristic(text, b.c) - heuristic(text, a.c)).slice(0, 8 - final.length);
        final = final.concat(rest.map((x) => x.c));
      }
    } else {
      final = candidates.map((c, i) => ({ c, i, h: heuristic(text + ' ' + plan.queries[0], c) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => x.c);
    }
    mark(3, 'done', `${final.length} shown`);
    $$('.aresults').classList.remove('analyzing');
    gal.set(final);
    summary = summary || plan.summary || `Here are the best matches for “${text}”.`;
    $$('.summary').textContent = summary;
    $$('.followups').innerHTML = ['Only black & white', 'Larger, high resolution', 'Closer view', 'Different style'].map((s) => `<button type="button" class="chip">${s}</button>`).join('');
    $$('.followups').onclick = (e) => { const c = e.target.closest('.chip'); if (c) ask(`Same thing but: ${c.textContent.toLowerCase()}`); };
    ctx = { text, plan };
    $$('.tt').textContent = `Thought for ${Math.max(1, Math.round((Date.now() - t0) / 1000))}s`;
  } catch (err) {
    steps.forEach((s) => { if (s.classList.contains('run')) s.className = 'fail'; });
    $$('.aresults').classList.remove('analyzing');
    if (!gal.items.length) gal.clear();
    note(err.message || 'Something went wrong.', true);
    $$('.followups').innerHTML = '<button type="button" class="chip">Try again</button>';
    $$('.followups').onclick = () => ask(text);
    $$('.tt').textContent = 'Stopped';
  } finally {
    clearInterval(timer);
    think.classList.remove('live', 'open');
    think.querySelector('button').setAttribute('aria-expanded', 'false');
    lot?.pause();
    busy = false; grow();
    setTimeout(() => follow(turn), 300);
  }
}

const q0 = new URLSearchParams(location.search).get('q');
if (q0) ask(q0);
