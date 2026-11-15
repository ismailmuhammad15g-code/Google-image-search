let items = [], seen = new Set(), page = 0, query = '', loading = false, cur = -1;
const SUGG = ['Sunset', 'Cats', 'Mountains', 'Cars', 'Food', 'Anime', 'Space', 'Architecture'];
$('chips').innerHTML = SUGG.map((s) => `<button type="button" class="chip">${s}</button>`).join('');
$('chips').addEventListener('click', (e) => { if (e.target.classList.contains('chip')) { $('q').value = e.target.textContent; start(); } });

const params = () => ({ q: query, ijn: page || '', imgsz: $('imgsz').value, image_type: $('image_type').value, image_color: $('image_color').value, safe: $('safe').value });

function card(i, n) {
  return `<a href="${esc(i.original)}" data-n="${n}" target="_blank" rel="noopener" aria-label="${esc(i.title)}">
    <img loading="lazy" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" alt="${esc(i.title)}"
      onerror="this.closest('a').remove()"><span class="cap">${esc(i.title || i.source)}</span></a>`;
}

async function load(reset) {
  if (loading) return;
  loading = true;
  $('more').hidden = true;
  $('status').className = '';
  if (reset) {
    $('gallery').innerHTML = Array.from({ length: 12 }, (_, i) => `<div class="skel" style="height:${130 + ((i * 53) % 130)}px"></div>`).join('');
    $('status').textContent = '';
  } else $('status').textContent = 'Loading more…';
  try {
    const { data } = await searchApi(params());
    const fresh = (data.images_results || []).filter((i) => i.original && !seen.has(i.original));
    fresh.forEach((i) => seen.add(i.original));
    const base = items.length;
    items = items.concat(fresh);
    if (reset) $('gallery').innerHTML = '';
    $('gallery').insertAdjacentHTML('beforeend', fresh.map((i, k) => card(i, base + k)).join(''));
    if (!items.length) {
      $('gallery').innerHTML = `<div class="empty">No images found for “${esc(query)}”. Try another search.</div>`;
      $('status').textContent = '';
    } else {
      $('status').textContent = `${items.length} images`;
      if (fresh.length) $('more').hidden = false;
      else $('status').textContent = `${items.length} images · no more new results`;
    }
  } catch (err) {
    if (reset) $('gallery').innerHTML = '';
    $('status').className = 'err';
    $('status').textContent = err.message;
    if (!reset) $('more').hidden = false;
  } finally {
    loading = false;
  }
}

function start() {
  query = $('q').value.trim();
  if (!query) return;
  items = []; seen = new Set(); page = 0;
  history.replaceState(null, '', `?q=${encodeURIComponent(query)}`);
  document.title = `${query} – Image Search`;
  load(true);
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); start(); });
for (const id of ['imgsz', 'image_type', 'image_color', 'safe']) $(id).addEventListener('change', () => $('q').value.trim() && start());
$('more').addEventListener('click', () => { page++; load(false); });

// Lightbox
function show(n) {
  if (n < 0 || n >= items.length) return;
  cur = n;
  const i = items[n];
  const img = $('lbimg');
  img.onerror = () => { img.onerror = null; img.src = i.thumbnail; };
  img.referrerPolicy = 'no-referrer';
  img.src = i.original;
  img.alt = i.title || '';
  $('lbmeta').innerHTML = `${esc(i.title)}<br>${i.original_width}×${i.original_height} · <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.source)}</a> · <a href="${esc(i.original)}" target="_blank" rel="noopener">Open original</a> · <a href="#" id="cpimg">Copy image URL</a>`;
  $('cpimg').onclick = (e) => { e.preventDefault(); copyText(i.original, 'Image URL copied'); };
  $('lb').classList.add('open');
}
const closeLb = () => { $('lb').classList.remove('open'); $('lbimg').src = ''; cur = -1; };
$('gallery').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-n]');
  if (a) { e.preventDefault(); show(Number(a.dataset.n)); }
});
$('lbx').onclick = closeLb;
$('lbp').onclick = () => show(cur - 1);
$('lbn').onclick = () => show(cur + 1);
$('lb').addEventListener('click', (e) => { if (e.target === $('lb') || e.target.classList.contains('stage')) closeLb(); });
document.addEventListener('keydown', (e) => {
  if (cur < 0) return;
  if (e.key === 'Escape') closeLb();
  else if (e.key === 'ArrowLeft') show(cur - 1);
  else if (e.key === 'ArrowRight') show(cur + 1);
});

const initial = new URLSearchParams(location.search).get('q');
if (initial) { $('q').value = initial; start(); } else { $('q').value = 'Sunset'; start(); }
