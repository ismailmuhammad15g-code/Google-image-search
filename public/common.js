/* Shared helpers: layout (announce bar, header, footer), icons, toast, favorites, Lottie, reveal. */
const $ = (id) => document.getElementById(id);
const BASE = location.origin;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const I = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.4C1.7 7.3 3.7 4 7 4c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.3 0 5.3 3.3 4.2 6.6C19.5 15.4 12 20 12 20z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 16l.7 2 2 .7-2 .7L19 21l-.7-1.6-2-.7 2-.7z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
};

const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16.5" fill="none" stroke="#14152e" stroke-width="3.4"/><circle cx="20" cy="20" r="9" fill="#d4f14f" stroke="#14152e" stroke-width="2.4"/><circle cx="20" cy="20" r="3.4" fill="#14152e"/></svg>`;
const SQUIG = `<svg viewBox="0 0 200 80" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 54c30-34 56-30 74-8s44 14 106-30"/></svg>`;
const RING = `<svg viewBox="0 0 100 100" fill="none" stroke="#1c4a3f" stroke-width="7" stroke-linecap="round"><path d="M50 50m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M50 50m-18 0a18 18 0 1 0 36 0a18 18 0 1 0 -36 0M50 50m-30 0a30 30 0 1 0 60 0a30 30 0 1 0 -60 0M50 50m-42 0a42 42 0 1 0 84 0" stroke-dasharray="140 40"/></svg>`;
const TRI = `<svg viewBox="0 0 60 60" fill="none" stroke="#1c4a3f" stroke-width="5" stroke-linejoin="round"><path d="M8 30L52 8v44z"/></svg>`;
const SPARK = `<svg viewBox="0 0 24 24" fill="#1c4a3f"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>`;

const NAV = [['/', 'Home'], ['/images', 'Image Search'], ['/agent', 'AI Agent'], ['/playground', 'API Playground'], ['/guide', 'Developer Guide']];

(function layout() {
  const sheet = document.querySelector('.sheet');
  if (!sheet) return;
  const p = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
  sheet.insertAdjacentHTML('afterbegin',
    `<div class="announce">New: <b>AI Agent Search</b> &mdash; describe any image in your own words.<a href="/agent">Try it now &rarr;</a></div>
     <header class="top"><div class="in">
       <a class="logo" href="/" aria-label="Lemon Lens home">${LOGO}Lemon Lens</a>
       <nav id="nav">${NAV.map(([h, t]) => `<a href="${h}" class="${p === h ? 'on' : ''}">${t}</a>`).join('')}</nav>
       <div class="cta"><a class="btn sm" href="/agent">${I.spark}AI Agent</a>
       <button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><i></i></button></div>
     </div></header>`);
  sheet.insertAdjacentHTML('beforeend',
    `<footer class="foot"><div class="wrap"><div class="cols">
       <div><a class="logo" href="/">${LOGO}Lemon Lens</a><p style="margin:12px 0 0;max-width:320px">Free, unlimited image search with an AI agent that finds exactly what you describe.</p></div>
       <div class="links">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div>
     </div><small>Free &amp; unlimited image search &middot; results come from public search engines &middot; no signup, no API key.</small></div></footer>
     <div class="toast" id="toast" role="status"></div>`);
  const top = sheet.querySelector('.top');
  const onScroll = () => top.classList.toggle('stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('burger').onclick = () => { const o = document.body.classList.toggle('menu-open'); $('burger').setAttribute('aria-expanded', o); };
  $('nav').addEventListener('click', () => document.body.classList.remove('menu-open'));
})();

(function reveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
})();

function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 1800);
}

async function copyText(text, label = 'Copied!') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

/* ---- tiny safe localStorage wrapper ---- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const Favs = {
  list: () => store.get('ll_favs', []),
  has: (u) => Favs.list().some((f) => f.original === u),
  toggle(img) {
    let l = Favs.list();
    const on = l.some((f) => f.original === img.original);
    l = on ? l.filter((f) => f.original !== img.original) : [{ original: img.original, thumbnail: img.thumbnail, title: img.title, source: img.source, link: img.link, original_width: img.original_width, original_height: img.original_height }, ...l].slice(0, 300);
    store.set('ll_favs', l);
    return !on;
  },
};
const History = {
  list: () => store.get('ll_hist', []),
  add(q) { store.set('ll_hist', [q, ...History.list().filter((x) => x !== q)].slice(0, 8)); },
};

/* ---- Lottie (the uploaded AI-loading animation) ---- */
let lottieData;
async function mountLottie(el, { loop = true, autoplay = true } = {}) {
  if (!el || !window.lottie) return null;
  try {
    lottieData ||= await fetch('/assets/ai-loading.json').then((r) => r.json());
    return window.lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay, animationData: lottieData, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
  } catch { return null; }
}

/* ---- search API ---- */
async function searchApi(params, signal) {
  const u = new URL('/api/search', BASE);
  u.searchParams.set('engine', 'google_images');
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
  const res = await fetch(u, { signal });
  let data;
  try { data = await res.json(); } catch { throw new Error(`Server returned HTTP ${res.status}`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return { data, url: u.toString() };
}
