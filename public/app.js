const $ = (id) => document.getElementById(id);
const base = location.origin;
$('endpoint').textContent = `${base}/api/search?engine=google_images`;
$('example').textContent = `curl "${base}/api/search?engine=google_images&q=Coffee&location=Austin,+Texas,+United+States"`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let last = null;

fetch('/api/locations').then((r) => r.json()).then((list) => {
  $('location').innerHTML = list.map((l) => `<option>${esc(l.name)}</option>`).join('');
}).catch(() => { $('location').innerHTML = '<option>Austin, Texas, United States</option>'; });

function buildUrl() {
  const u = new URL('/api/search', base);
  u.searchParams.set('engine', 'google_images');
  u.searchParams.set('q', $('q').value.trim());
  u.searchParams.set('location', $('location').value);
  for (const id of ['ijn', 'safe', 'imgsz', 'image_type', 'image_color', 'api_key']) {
    const v = $(id).value.trim();
    if (v && !(id === 'ijn' && v === '0')) u.searchParams.set(id, v);
  }
  return u.toString();
}

function colorize(json, idx) {
  // Pretty-print and highlight the block of images_results[idx].
  const lines = JSON.stringify(json, null, 2).split('\n');
  let out = '';
  let start = -1, end = -1;
  const mark = '    {';
  let inImgs = false, count = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('  "images_results"')) inImgs = true;
    else if (inImgs && l === mark) { count++; if (count === idx) start = i; }
    else if (inImgs && count === idx && start >= 0 && end < 0 && (l === '    },' || l === '    }')) end = i;
  });
  lines.forEach((l, i) => {
    const h = esc(l).replace(/^(\s*)(&quot;[^&]*?&quot;)(:)?/, (m, sp, key, colon) => `${sp}<span class="${colon ? 'k' : 's2'}">${key}</span>${colon || ''}`)
      .replace(/: (&quot;.*?&quot;)(,?)$/, ': <span class="s2">$1</span>$2')
      .replace(/: (-?\d+(?:\.\d+)?)(,?)$/, ': <span class="n">$1</span>$2')
      .replace(/: (true|false)(,?)$/, ': <span class="b">$1</span>$2');
    out += i >= start && i <= end && start >= 0 ? `<span class="hl">${h}</span>` : h + '\n';
  });
  return out;
}

function select(idx) {
  document.querySelectorAll('.item').forEach((el, i) => el.classList.toggle('sel', i === idx));
  $('json').innerHTML = colorize(last, idx);
  const hl = $('json').querySelector('.hl');
  if (hl) $('json').scrollTop = hl.offsetTop - 60;
}

async function run(e) {
  e?.preventDefault();
  const url = buildUrl();
  $('go').disabled = true;
  $('status').className = '';
  $('status').textContent = 'Searching…';
  $('grid').innerHTML = '';
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    last = data;
    const imgs = data.images_results || [];
    $('status').textContent = imgs.length
      ? `${imgs.length} results in ${data.search_metadata.total_time_taken}s (${data.search_metadata.backend}${data.search_metadata.cached ? ', cached' : ''})`
      : 'No results.';
    $('grid').innerHTML = imgs.map((i, n) => `
      <div class="item" data-i="${n}">
        <img loading="lazy" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" alt="${esc(i.title)}">
        <div class="t">${esc(i.title)}</div>
        <div class="s"><img src="${esc(i.source_logo)}" alt="" onerror="this.remove()">${esc(i.source)}</div>
      </div>`).join('');
    if (imgs.length) select(0); else $('json').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    $('status').className = 'err';
    $('status').textContent = err.message;
  } finally {
    $('go').disabled = false;
  }
}

$('form').addEventListener('submit', run);
$('grid').addEventListener('click', (e) => {
  const el = e.target.closest('.item');
  if (el) select(Number(el.dataset.i));
});
const copy = (t, b) => navigator.clipboard?.writeText(t).then(() => { const o = b.textContent; b.textContent = 'Copied'; setTimeout(() => (b.textContent = o), 1200); });
$('copyUrl').onclick = (e) => copy(buildUrl(), e.target);
$('copyCurl').onclick = (e) => copy(`curl "${buildUrl()}"`, e.target);
$('copyJson').onclick = (e) => last && copy(JSON.stringify(last, null, 2), e.target);
