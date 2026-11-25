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

const PLAN_SYS = `You are the planning brain of a professional image-search agent. The user describes an image or GIF they want (any language, maybe vague or short).
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

const RANK_SYS = `You are a strict judge of image search results. You only see metadata (title, source domain, pixel size, format), not the picture.
Given the user's wish, the ideal-image description, details that must show and things to avoid, score every candidate 0-100 for how likely the picture is EXACTLY what was asked.
Scoring: 90-100 = title clearly confirms the subject AND most details; 70-89 = right subject, some details confirmed; 50-69 = probably right subject, details unknown; below 50 = off-topic, generic listicle/stock page, logo/icon (unless wanted), wrong format, or tiny.
If a GIF was requested, candidates with format gif score higher and non-gif lower. Titles that say nothing relevant must not exceed 60.
Reply with ONLY one JSON object, no markdown:
{"ranked":[{"i":<candidate id>,"s":<0-100>,"why":"<=9 words saying why it fits"}],"summary":"one friendly sentence, in the user's language, about what you found"}
Include only candidates scoring 50 or more, best first, at most 45.`;

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
const isGif = (i) => /\.gif(\?|#|$)/i.test(i.original || '');
function heuristic(text, img) {
  const q = toks(text);
  if (!q.length) return 0;
  const hay = `${img.title} ${img.source}`.toLowerCase();
  return q.filter((t) => hay.includes(t)).length / q.length;
}
const CAP = 180, BATCH = 60;
const FILTER_OK = { size: ['l', 'm', 'i'], image_type: ['photo', 'clipart', 'lineart', 'animated', 'face'], image_color: ['color', 'gray'] };

/** Run every query over two result pages (plus animated variants when GIFs are wanted) and merge round-robin. */
async function gather(plan, text, wantGif, onProgress) {
  const f = plan.filters || {};
  const base = {
    imgsz: FILTER_OK.size.includes(f.size) ? f.size : '',
    image_type: FILTER_OK.image_type.includes(f.image_type) ? f.image_type : '',
    image_color: FILTER_OK.image_color.includes(f.image_color) ? f.image_color : '',
  };
  const queries = [...new Set((plan.queries || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 6);
  if (!queries.length) queries.push(text);
  const jobs = [];
  queries.forEach((q, qi) => {
    jobs.push({ q, ...base, ijn: '' });
    if (qi < 4) jobs.push({ q, ...base, ijn: 1 });
    if (wantGif && base.image_type !== 'animated' && qi < 3) jobs.push({ q, ...base, image_type: 'animated', ijn: '' });
  });
  let ok = 0, fin = 0, lastErr;
  const lists = await Promise.all(jobs.map(async (j) => {
    try { const { data } = await searchApi(j); ok++; return data.images_results || []; }
    catch (e) { lastErr = e; return []; }
    finally { onProgress?.(++fin, jobs.length); }
  }));
  if (!ok) throw lastErr || new Error('Search failed.');
  const seen = new Set(), out = [];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < CAP; i++) {
    for (const l of lists) {
      const img = l[i];
      if (!img?.original) continue;
      const k = key(img.original);
      if (seen.has(k)) continue;
      if (img.original_width && img.original_height && (img.original_width < 120 || img.original_height < 120)) continue;
      seen.add(k); out.push(img);
    }
  }
  return { candidates: out, queries, jobs: jobs.length };
}

/** Score candidates in parallel batches of 60 so the agent can inspect far more than one prompt allows. */
async function rankAll(candidates, text, plan, wantGif, onReasoning) {
  const batches = [];
  for (let i = 0; i < candidates.length; i += BATCH) batches.push(candidates.slice(i, i + BATCH).map((c, k) => ({ c, id: i + k })));
  const head = `User wish: ${text}\nIdeal image: ${plan.intent}\nSubject: ${plan.subject || '-'}\nMust show: ${(plan.details || plan.must || []).join('; ') || '-'}\nAvoid: ${(plan.avoid || []).join('; ') || '-'}\nFormat wanted: ${wantGif ? 'gif' : plan.format || 'any'}`;
  let summary = '', okBatches = 0, lastErr;
  const results = await Promise.all(batches.map(async (batch, bi) => {
    const list = batch.map(({ c, id }) => `${id}|${(c.title || '').slice(0, 90)}|${c.source}|${c.original_width || '?'}x${c.original_height || '?'}|${isGif(c) ? 'gif' : 'img'}`).join('\n');
    try {
      const r = await groq([{ role: 'system', content: RANK_SYS }, { role: 'user', content: `${head}\n\nCandidates (id|title|source|size|format):\n${list}` }], { effort: 'low', max: 5000, onReasoning: bi === 0 ? onReasoning : undefined });
      const j = extractJson(r.content);
      okBatches++;
      if (bi === 0) summary = j.summary || '';
      return (j.ranked || []).filter((x) => candidates[x.i] && Number.isFinite(+x.s));
    } catch (e) { lastErr = e; return []; }
  }));
  if (!okBatches) throw lastErr || new Error('Ranking failed.');
  const ranked = results.flat().sort((a, b) => b.s - a.s);
  return { ranked, summary, batches: batches.length, okBatches };
}

/* ------------------------- UI ------------------------- */
$('send').innerHTML = I.send;
$('examples').innerHTML = EXAMPLES.map(([e, t]) => `<button type="button" class="ex"><span class="em">${e}</span><span>${esc(t)}</span></button>`).join('');
mountLottie($('orb'));

const input = $('input'), thread = $('thread');
let busy = false, ctx = null, gifOn = store.get('ll_gif', false);
const syncGif = () => { $('gifToggle').classList.toggle('on', gifOn); $('gifToggle').setAttribute('aria-pressed', gifOn); };
syncGif();
$('gifToggle').onclick = () => { gifOn = !gifOn; store.set('ll_gif', gifOn); syncGif(); toast(gifOn ? 'GIFs will be included' : 'GIFs off'); };
const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; $('send').disabled = busy || !input.value.trim(); };
input.addEventListener('input', grow);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form').requestSubmit(); } });
$('examples').addEventListener('click', (e) => { const b = e.target.closest('.ex'); if (b) ask(b.querySelector('span:last-child').textContent); });
$('form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });

const near = () => innerHeight + scrollY > document.documentElement.scrollHeight - 320;
const follow = (el) => { if (near()) el.scrollIntoView({ behavior: 'smooth', block: 'end' }); };
const STEPS = ['Understanding your description', 'Writing smarter searches', 'Searching the web', 'Inspecting & ranking matches'];
const PAGE = 24;

function understood(plan, wantGif) {
  const chips = (arr, cls = '') => (arr || []).filter(Boolean).slice(0, 6).map((x) => `<span class="c ${cls}">${esc(x)}</span>`).join('');
  const fmt = wantGif ? 'GIF / animated' : ({ photo: 'Photo', gif: 'GIF / animated', illustration: 'Illustration', any: 'Any format' }[plan.format] || 'Any format');
  const rows = [['Looking for', esc(plan.intent || plan.subject || '')], plan.subject && ['Subject', chips([plan.subject])], plan.details?.length && ['Must show', chips(plan.details)], plan.avoid?.length && ['Avoiding', chips(plan.avoid)], ['Format', chips([fmt])], ['Searches', chips(plan.queries, 'q')]].filter(Boolean);
  return `<div class="understood"><h4>Here's what I understood</h4><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
}

async function ask(raw) {
  const text = String(raw || '').trim();
  if (!text || busy) return;
  busy = true; input.value = ''; grow();
  $('welcome').hidden = true;
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.innerHTML = `<div class="narrow"><div class="umsg">${esc(text)}</div>
    <div class="amsg"><div class="avatar">${LOGO.replace('#14152e', '#fff')}</div><div class="abody">
      <div class="think live open"><button type="button" aria-expanded="true"><span class="lot"></span><span class="tt"><span>Thinking…</span></span><span class="tm">0s</span><span class="chev"></span></button><div class="tbody"></div></div>
      <ul class="todo">${STEPS.map((s) => `<li><span class="dot"></span><span>${s}</span> <small></small></li>`).join('')}</ul>
      <div class="plan-slot"></div><div class="notes"></div>
    </div></div></div>
    <section class="rpanel" hidden>
      <div class="rhead"><div><h2>Results <small class="cnt"></small></h2><p class="rsum"></p></div>
        <div class="rtools"><span class="tabs fmt"><button type="button" class="on" data-f="all">All</button><button type="button" data-f="photo">Photos</button><button type="button" data-f="gif">GIFs</button></span>
          <label class="sel"><select class="ori" aria-label="Orientation"><option value="all">Any shape</option><option value="land">Landscape</option><option value="port">Portrait</option><option value="sq">Square</option></select></label>
          <label class="sel"><select class="sort" aria-label="Sort"><option value="match">Best match</option><option value="size">Largest first</option></select></label></div></div>
      <div class="rgrid"></div>
      <div class="rmore" hidden><button type="button" class="btn ghost">Show more</button></div>
      <div class="followups" style="justify-content:center"></div>
    </section>`;
  thread.appendChild(turn);
  const $$ = (s) => turn.querySelector(s);
  const think = $$('.think'), tbody = $$('.tbody'), steps = [...turn.querySelectorAll('.todo li')], panel = $$('.rpanel');
  const lot = await mountLottie($$('.lot'));
  think.querySelector('button').onclick = () => { const o = think.classList.toggle('open'); think.querySelector('button').setAttribute('aria-expanded', o); };
  const t0 = Date.now();
  const timer = setInterval(() => { $$('.tm').textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 500);
  const say = (t) => { tbody.textContent += t; tbody.scrollTop = tbody.scrollHeight; };
  const mark = (n, st, note) => { steps[n].className = st; if (note != null) steps[n].querySelector('small').textContent = note; };
  const note = (msg, err) => { $$('.notes').insertAdjacentHTML('beforeend', `<div class="notice${err ? ' err' : ''}">${esc(msg)}</div>`); };
  follow(turn);
  const gal = createGallery($$('.rgrid'), { uniform: true, onSimilar: (i) => ask(`More images like this one: ${i.title || i.source}`) });

  // result view state (filters / sort / paging happen client side)
  let all = [], shown = PAGE, view = { f: 'all', o: 'all', s: 'match' };
  const shape = (i) => { if (!i.original_width || !i.original_height) return 'unk'; const r = i.original_width / i.original_height; return r > 1.15 ? 'land' : r < 0.87 ? 'port' : 'sq'; };
  const passes = (i) => (view.f === 'all' || (view.f === 'gif') === isGif(i)) && (view.o === 'all' || shape(i) === 'unk' || shape(i) === view.o);
  const render = () => {
    let list = all.filter(passes);
    if (view.s === 'size') list = [...list].sort((a, b) => (b.original_width * b.original_height || 0) - (a.original_width * a.original_height || 0));
    gal.hero = view.s === 'match' && view.f === 'all' && view.o === 'all' && list.length >= 7 && list[0].score != null;
    gal.set(list.slice(0, shown));
    $$('.cnt').textContent = `${list.length}`;
    $$('.rmore').hidden = list.length <= shown;
    $$('.rmore button').textContent = `Show ${Math.min(PAGE, list.length - shown)} more`;
    if (!list.length) $$('.rgrid').innerHTML = '<div class="rempty"><b>Nothing with these filters</b><br>Try “All” formats or any shape.</div>';
    const n = (fn) => all.filter(fn).length;
    const tb = $$('.fmt').querySelectorAll('button');
    tb[0].innerHTML = `All <small>${all.length}</small>`; tb[1].innerHTML = `Photos <small>${n((i) => !isGif(i))}</small>`; tb[2].innerHTML = `GIFs <small>${n(isGif)}</small>`;
  };
  $$('.fmt').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; view.f = b.dataset.f; shown = PAGE; $$('.fmt').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); render(); };
  $$('.ori').onchange = (e) => { view.o = e.target.value; shown = PAGE; render(); };
  $$('.sort').onchange = (e) => { view.s = e.target.value; shown = PAGE; render(); };
  $$('.rmore button').onclick = () => { shown += PAGE; render(); };

  const wantGif = gifOn || /\b(gifs?|animated|animation|moving|reaction|jif)\b|جيف|متحرك/i.test(text);
  let plan = { intent: text, queries: [text], filters: {}, summary: '' }, candidates = [], summary = '';
  try {
    /* 1 + 2: understand & plan */
    mark(0, 'run');
    const prev = ctx ? `Previous request: ${ctx.text}\nPrevious intent: ${ctx.plan.intent}\nNew message (a refinement, or a brand new request): ${text}` : text;
    let planOk = false;
    try {
      say('Understanding the request…\n');
      const r = await groq([{ role: 'system', content: PLAN_SYS }, { role: 'user', content: prev + (wantGif ? '\n(The user wants GIFs included.)' : '') }], { effort: 'low', max: 3500, onReasoning: say });
      const p = extractJson(r.content);
      if (Array.isArray(p.queries) && p.queries.length) { plan = { ...plan, ...p }; planOk = true; }
    } catch (e) {
      note(`AI planning is unavailable right now (${e.message}) so I used a direct search of your words instead.`);
    }
    mark(0, 'done'); mark(1, 'run');
    plan.queries = (plan.queries || []).map(String);
    if (plan.format === 'gif' || plan.filters?.image_type === 'animated') { plan.format = 'gif'; plan.filters = { ...plan.filters, image_type: 'animated' }; }
    const gifMode = wantGif || plan.format === 'gif';
    $$('.plan-slot').innerHTML = understood(plan, gifMode);
    say(`\n\n▸ Plan: ${plan.intent}\n▸ Queries: ${plan.queries.join(' | ')}\n`);
    mark(1, 'done', planOk ? `${plan.queries.length} queries` : 'direct'); mark(2, 'run');
    panel.hidden = false;
    gal.skeleton(10);
    follow(turn);

    /* 3: search (multi page, multi engine) */
    const g = await gather(plan, text, gifMode, (n, m) => { steps[2].querySelector('small').textContent = `${n}/${m} searches`; });
    candidates = g.candidates;
    if (!candidates.length) throw new Error('No images came back for these searches. Try describing it differently.');
    mark(2, 'done', `${candidates.length} candidates`);
    say(`▸ Found ${candidates.length} candidate images from ${g.jobs} searches.\n`);

    /* 4: rank in batches */
    mark(3, 'run', 'checking…');
    let ranked = null;
    try {
      say('\n▸ Checking every candidate against your description…\n');
      const r = await rankAll(candidates, text, plan, gifMode, say);
      ranked = r.ranked.length ? r.ranked : null;
      summary = r.summary;
      if (r.okBatches < r.batches) note(`Only ${r.okBatches} of ${r.batches} ranking batches succeeded, so some candidates were not scored.`);
    } catch (e) {
      note(`AI ranking is unavailable (${e.message}); results are ordered by keyword match instead.`);
    }
    if (ranked) {
      const used = new Set();
      all = ranked.map((x) => { used.add(x.i); return { ...candidates[x.i], score: Math.max(1, Math.min(99, Math.round(+x.s))), why: String(x.why || '').slice(0, 90) }; });
      if (all.length < 12) {
        const rest = candidates.map((c, i) => ({ c, i })).filter((x) => !used.has(x.i)).sort((a, b) => heuristic(text, b.c) - heuristic(text, a.c)).slice(0, 12 - all.length);
        all = all.concat(rest.map((x) => x.c));
      }
    } else {
      all = candidates.map((c, i) => ({ c, i, h: heuristic(text + ' ' + plan.queries[0], c) })).sort((a, b) => b.h - a.h || a.i - b.i).map((x) => x.c);
    }
    mark(3, 'done', `${all.length} matches`);
    summary = summary || plan.summary || `Here are the best matches for “${text}”.`;
    $$('.rsum').textContent = summary;
    render();
    const fu = ['Only black & white', 'Larger, high resolution', 'Closer view', 'Different style', 'Show as GIFs'];
    $$('.followups').innerHTML = fu.map((s) => `<button type="button" class="chip">${s}</button>`).join('');
    $$('.followups').onclick = (e) => { const c = e.target.closest('.chip'); if (c) ask(`Same thing but: ${c.textContent.toLowerCase()}`); };
    ctx = { text, plan };
    $$('.tt').textContent = `Thought for ${Math.max(1, Math.round((Date.now() - t0) / 1000))}s`;
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  } catch (err) {
    steps.forEach((s) => { if (s.classList.contains('run')) s.className = 'fail'; });
    panel.hidden = true;
    note(err.message || 'Something went wrong.', true);
    $$('.notes').insertAdjacentHTML('beforeend', '<div class="followups"><button type="button" class="chip" id="retry">Try again</button></div>');
    $$('#retry').onclick = () => ask(text);
    $$('.tt').textContent = 'Stopped';
  } finally {
    clearInterval(timer);
    think.classList.remove('live', 'open');
    think.querySelector('button').setAttribute('aria-expanded', 'false');
    lot?.pause();
    busy = false; grow();
  }
}

const q0 = new URLSearchParams(location.search).get('q');
if (q0) ask(q0);
