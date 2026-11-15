const $ = (id) => document.getElementById(id);
const BASE = location.origin;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(function nav() {
  const p = location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
  const links = [['/', 'Playground'], ['/images', 'Image Search'], ['/guide', 'Developer Guide']];
  document.body.insertAdjacentHTML('afterbegin',
    `<header class="top"><a class="logo" href="/"><b>&#128034;</b>ImageSERP</a><nav>${links
      .map(([h, t]) => `<a href="${h}" class="${p === h ? 'on' : ''}">${t}</a>`).join('')}</nav></header><div class="toast" id="toast"></div>`);
})();

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 1600);
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

async function searchApi(params) {
  const u = new URL('/api/search', BASE);
  u.searchParams.set('engine', 'google_images');
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
  const res = await fetch(u);
  let data;
  try { data = await res.json(); } catch { throw new Error(`Server returned HTTP ${res.status}`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return { data, url: u.toString() };
}
