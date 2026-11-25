const SUGG = ['Sunset beach', 'Cute cats', 'Mountains', 'Sports cars', 'Street food', 'Anime wallpaper', 'Galaxy', 'Modern architecture'];
const norm = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).toLowerCase(); } catch { return String(u); } };

let seen = new Set(), page = 0, query = '', loading = false, done = false, ctl = null, tab = 'search';
const gal = createGallery($('gallery'), { onSimilar: (i) => { $('q').value = (i.title || i.source).split(/\s+/).slice(0, 8).join(' '); setTab('search'); start(); scrollTo({ top: 0, behavior: 'smooth' }); } });

const params = () => ({ q: query, ijn: page || '', imgsz: $('imgsz').value, image_type: $('image_type').value, image_color: $('image_color').value, safe: $('safe').value });
const setStatus = (t, err) => { $('status').className = err ? 'err' : ''; $('status').textContent = t; };

function renderHistory() {
  const h = History.list();
  $('hist').innerHTML = (h.length ? h : SUGG).map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('');
}
$('hist').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { $('q').value = c.textContent; setTab('search'); start(); } });
$('related').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) { $('q').value = c.dataset.q; start(); scrollTo({ top: 0, behavior: 'smooth' }); } });

async function load(reset) {
  if (loading || done) return;
  loading = true;
  ctl?.abort();
  ctl = new AbortController();
  const my = ctl;
  $('more').hidden = true;
  if (reset) { gal.skeleton(12); setStatus('Searching…'); } else setStatus('Loading more…');
  try {
    const { data } = await searchApi(params(), my.signal);
    const fresh = (data.images_results || []).filter((i) => i.original && !seen.has(norm(i.original)));
    fresh.forEach((i) => seen.add(norm(i.original)));
    if (reset) gal.clear();
    gal.append(fresh);
    const rel = data.suggested_searches || [];
    if (reset) $('related').innerHTML = rel.map((s) => `<button type="button" class="chip" data-q="${esc(query + ' ' + s.name)}">${esc(s.name)}</button>`).join('');
    if (!gal.items.length) {
      $('gallery').innerHTML = `<div class="empty"><b>No images found</b>for “${esc(query)}”. Try different words or ask the <a href="/agent">AI agent</a>.</div>`;
      setStatus('');
      done = true;
    } else if (!fresh.length) {
      done = true;
      setStatus(`${gal.items.length} images · that's everything for now`);
    } else {
      setStatus(`${gal.items.length} images${data.search_metadata?.backend ? ' · ' + data.search_metadata.backend.replace(/\+/g, ' + ') : ''}`);
      $('more').hidden = false;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (reset) gal.clear();
    setStatus(err.message + ' — please try again.', true);
    if (!reset) $('more').hidden = false;
  } finally {
    if (ctl === my) loading = false;
  }
}

function start() {
  query = $('q').value.trim();
  if (!query) return;
  ctl?.abort(); loading = false; done = false;
  seen = new Set(); page = 0;
  History.add(query); renderHistory();
  history.replaceState(null, '', `?q=${encodeURIComponent(query)}`);
  document.title = `${query} · Lemon Lens`;
  load(true);
}

function showSaved() {
  const f = Favs.list();
  $('related').innerHTML = ''; $('more').hidden = true;
  gal.set(f);
  setStatus(f.length ? `${f.length} saved image${f.length > 1 ? 's' : ''}` : '');
  if (!f.length) $('gallery').innerHTML = '<div class="empty"><b>Nothing saved yet</b>Tap the heart on any image to keep it here.</div>';
}
function setTab(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  if (t === 'saved') showSaved(); else if (query && !gal.items.length) start();
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.t === 'search') { tab = 'search'; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); done = false; seen = new Set(); page = 0; query ? (loading = false, start()) : null; }
  else setTab('saved');
});
const favCount = () => { const n = Favs.list().length; $('favn').textContent = n ? `(${n})` : ''; };
document.addEventListener('favs-changed', favCount); favCount();

$('form').addEventListener('submit', (e) => { e.preventDefault(); tab = 'search'; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === 'search')); start(); });
for (const id of ['imgsz', 'image_type', 'image_color', 'safe']) $(id).addEventListener('change', () => { if (tab === 'search' && $('q').value.trim()) start(); });
$('more').addEventListener('click', () => { page++; load(false); });
new IntersectionObserver((es) => { if (es[0].isIntersecting && tab === 'search' && !loading && !done && gal.items.length && !$('more').hidden) { page++; load(false); } }, { rootMargin: '700px' }).observe($('sentinel'));

renderHistory();
const initial = new URLSearchParams(location.search).get('q');
$('q').value = initial || 'Sunset beach';
start();
