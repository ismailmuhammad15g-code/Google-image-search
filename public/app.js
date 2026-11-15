$('endpoint').textContent = `${BASE}/api/search?engine=google_images`;
let last = null;
let lastUrl = '';

fetch('/api/health').then((r) => r.json()).then(() => { $('up').textContent = 'online'; })
  .catch(() => { $('up').textContent = 'offline'; $('up').classList.add('bad'); });

fetch('/api/locations').then((r) => r.json()).then((list) => {
  $('location').innerHTML = list.map((l) => `<option>${esc(l.name)}</option>`).join('');
}).catch(() => { $('location').innerHTML = '<option>Austin, Texas, United States</option>'; });

const fields = () => ({
  q: $('q').value.trim(),
  location: $('location').value,
  ijn: $('ijn').value === '0' ? '' : $('ijn').value,
  safe: $('safe').value, imgsz: $('imgsz').value, image_type: $('image_type').value, image_color: $('image_color').value,
});
const urlNow = () => { const u = new URL('/api/search', BASE); u.searchParams.set('engine', 'google_images'); for (const [k, v] of Object.entries(fields())) if (v) u.searchParams.set(k, v); return u.toString(); };

function colorize(json, idx) {
  const lines = JSON.stringify(json, null, 2).split('\n');
  let start = -1, end = -1, inImgs = false, count = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('  "images_results"')) inImgs = true;
    else if (inImgs && l === '    {') { count++; if (count === idx) start = i; }
    else if (inImgs && count === idx && start >= 0 && end < 0 && /^    \},?$/.test(l)) end = i;
  });
  return lines.map((l, i) => {
    let h = esc(l).replace(/^(\s*)(&quot;.*?&quot;)(:)?(?=\s|$)/, (m, sp, key, colon) => `${sp}<span class="${colon ? 'k' : 's2'}">${key}</span>${colon || ''}`)
      .replace(/: (&quot;.*&quot;)(,?)$/, ': <span class="s2">$1</span>$2')
      .replace(/: (-?\d+(?:\.\d+)?)(,?)$/, ': <span class="n">$1</span>$2')
      .replace(/: (true|false)(,?)$/, ': <span class="b">$1</span>$2');
    if (start >= 0 && i >= start && i <= end) return `<span class="hl${i === start ? ' first' : ''}${i === end ? ' last' : ''}">${h || ' '}</span>`;
    return h + '\n';
  }).join('');
}

function select(idx) {
  document.querySelectorAll('.item').forEach((el, i) => el.classList.toggle('sel', i === idx));
  $('json').innerHTML = colorize(last, idx);
  const hl = $('json').querySelector('.hl');
  if (hl) $('json').scrollTop = Math.max(0, hl.offsetTop - 70);
}

async function run(e) {
  e?.preventDefault();
  $('go').disabled = true;
  $('status').className = '';
  $('status').textContent = 'Searching…';
  $('grid').innerHTML = '';
  try {
    const { data, url } = await searchApi(fields());
    last = data; lastUrl = url;
    const imgs = data.images_results || [];
    $('status').textContent = imgs.length ? `${imgs.length} results in ${data.search_metadata.total_time_taken}s` : 'No results for this search.';
    $('grid').innerHTML = imgs.map((i, n) => `
      <div class="item" data-i="${n}">
        <img class="th" loading="lazy" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" alt="${esc(i.title)}">
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
$('grid').addEventListener('click', (e) => { const el = e.target.closest('.item'); if (el) select(Number(el.dataset.i)); });
$('copyUrl').onclick = () => copyText(lastUrl || urlNow(), 'URL copied');
$('copyCurl').onclick = () => copyText(`curl "${lastUrl || urlNow()}"`, 'cURL copied');
$('copyJson').onclick = () => last ? copyText(JSON.stringify(last, null, 2), 'JSON copied') : toast('Run a search first');
run();
