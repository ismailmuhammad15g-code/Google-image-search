$('swish').innerHTML = SQUIG; $('ring').innerHTML = RING; $('tri').innerHTML = TRI; $('sp1').innerHTML = SPARK; $('sp2').innerHTML = SPARK;
mountLottie($('hlot'));

const FEATURES = [
  ['spark', 'AI agent search', 'Describe the image in your own words. The agent thinks, searches and ranks the best matches.'],
  ['layers', 'Multi-engine results', 'Bing and DuckDuckGo are queried together, then merged, de-duplicated and ranked.'],
  ['bolt', 'Fast & unlimited', 'No quotas, no signup. Infinite scroll, instant lightbox and cached repeat searches.'],
  ['filter', 'Smart filters', 'Size, type, color and safe-search filters, plus related searches to refine quickly.'],
  ['heart', 'Favorites', 'Save the images you like and come back to them any time, stored privately on your device.'],
  ['code', 'Free API', 'A SerpApi-style JSON endpoint with a live playground and a copy-paste developer guide.'],
];
$('features').innerHTML = FEATURES.map(([ic, t, d], n) => `<div class="fcard reveal" style="--d:${(n % 3) * 0.1}s"><div class="ic">${I[ic]}</div><h3>${t}</h3><p>${d}</p></div>`).join('');
document.querySelectorAll('.reveal').forEach((e) => { if (e.getBoundingClientRect().top < innerHeight) e.classList.add('in'); });

const CH = ['Sunset lake', 'Cute corgi', 'Neon city', 'Minimal desk setup', 'Tropical beach'];
$('hchips').innerHTML = CH.map((c) => `<a class="chip" href="/images?q=${encodeURIComponent(c)}">${c}</a>`).join('');
$('hform').addEventListener('submit', (e) => { e.preventDefault(); const v = $('hq').value.trim(); location.href = v ? `/images?q=${encodeURIComponent(v)}` : '/images'; });
$('hq').addEventListener('input', () => { $('agentBtn').href = $('hq').value.trim() ? `/agent?q=${encodeURIComponent($('hq').value.trim())}` : '/agent'; });

// typing demo in the floating card
const PH = ['a red boat at sunrise…', 'cozy cabin in the snow…', 'retro neon city poster…', 'golden retriever puppy…'];
(function type(n = 0, c = 0, del = false) {
  const el = $('typing'), w = PH[n % PH.length];
  el.textContent = w.slice(0, c);
  if (!del && c < w.length) return setTimeout(() => type(n, c + 1, false), 70);
  if (!del) return setTimeout(() => type(n, c, true), 1400);
  if (c > 0) return setTimeout(() => type(n, c - 1, true), 28);
  setTimeout(() => type(n + 1, 0, false), 250);
})();

// live imagery for the hero collage and the marquee
const good = (i) => i.thumbnail && i.original_width >= 300;
searchApi({ q: 'beautiful landscape photography', imgsz: 'l' }).then(({ data }) => {
  const imgs = (data.images_results || []).filter(good).slice(0, 3);
  if (imgs.length < 3) throw 0;
  $('collage').innerHTML = imgs.map((i) => `<div><img alt="${esc(i.title)}" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" onerror="this.parentNode.style.background='#e6f98f'"></div>`).join('');
}).catch(() => { $('collage').innerHTML = ['#d4f14f', '#bfe6d8', '#f5fdcf'].map((c) => `<div style="background:${c}"></div>`).join(''); });
searchApi({ q: 'colorful design inspiration art' }).then(({ data }) => {
  const imgs = (data.images_results || []).filter(good).slice(0, 14);
  if (imgs.length < 6) return;
  const cell = (i) => `<div><img loading="lazy" alt="" referrerpolicy="no-referrer" src="${esc(i.thumbnail)}" onerror="this.parentNode.remove()"></div>`;
  $('track').innerHTML = imgs.map(cell).join('') + imgs.map(cell).join('');
  $('marqueeSec').hidden = false;
}).catch(() => {});
