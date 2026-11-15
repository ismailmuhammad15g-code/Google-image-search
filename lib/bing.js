import { httpGet } from './net.js';

export const PAGE_SIZE = 35;

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Bing wraps matched words in private-use highlight markers (U+E000/U+E001); strip them.
const clean = (s) => decodeEntities(s).replace(/[]/g, '').replace(/\s+/g, ' ').trim();

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Pure parser: Bing `/images/async` HTML -> SerpApi-style image results. */
export function parseBing(html, { offset = 0 } = {}) {
  const chunks = String(html).split('class="iuscp').slice(1);
  const results = [];
  for (const chunk of chunks) {
    const m = /\sm="([^"]*)"/.exec(chunk);
    if (!m) continue;
    let meta;
    try {
      meta = JSON.parse(decodeEntities(m[1]));
    } catch {
      continue;
    }
    if (!meta.murl || !meta.turl) continue;

    let width = 0;
    let height = 0;
    const exp = /[?&;]exph=(\d+)(?:&amp;|&)expw=(\d+)/.exec(chunk);
    if (exp) {
      height = Number(exp[1]);
      width = Number(exp[2]);
    } else {
      const sz = /(\d+)(?:&#215;|×)(\d+)/.exec(chunk);
      if (sz) {
        width = Number(sz[1]);
        height = Number(sz[2]);
      }
    }

    const domain = decodeEntities(/class="lnkw"><a title="([^"]*)"/.exec(chunk)?.[1] || '') || hostOf(meta.purl);
    results.push({
      position: offset + results.length + 1,
      thumbnail: meta.turl,
      related_content_id: meta.mid || meta.cid || '',
      source: domain,
      source_logo: domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '',
      title: clean(meta.t || meta.desc),
      link: meta.purl,
      original: meta.murl,
      original_height: height,
      original_width: width,
      is_product: false,
    });
  }
  return results;
}

/** Related searches (the chips above results) when present. */
export function parseSuggestions(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*suggestion[^"]*"[^>]*>(.*?)<\/a>/gis;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    const name = clean(m[1].replace(/<[^>]+>/g, ''));
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function qft({ size, type, color }) {
  const f = [];
  if (size) f.push(`filterui:imagesize-${size}`);
  if (type) f.push(`filterui:photo-${type === 'linedrawing' ? 'linedrawing' : type}`);
  if (color) f.push(color === 'bw' ? 'filterui:color2-bw' : 'filterui:color2-color');
  return f.length ? '+' + f.join('+') : '';
}

export async function searchBing(p) {
  const first = p.ijn * PAGE_SIZE + 1;
  const mkt = `${p.hl}-${p.gl}`;
  const url =
    `https://www.bing.com/images/async?q=${encodeURIComponent(p.q)}` +
    `&first=${first}&count=${PAGE_SIZE}&mmasync=1&setlang=${encodeURIComponent(p.hl)}&cc=${encodeURIComponent(p.gl)}` +
    (qft(p.filters) ? `&qft=${qft(p.filters)}` : '');
  const adlt = p.safe === 'active' ? 'STRICT' : p.safe === 'off' ? 'OFF' : 'DEMOTE';
  const res = await httpGet(url, {
    headers: { Cookie: `SRCHHPGUSR=ADLT=${adlt}; _EDGE_S=mkt=${mkt}&ui=${p.hl}`, 'Accept-Language': `${p.hl}-${p.gl.toUpperCase()},${p.hl};q=0.9` },
  });
  if (res.status === 429 || res.status === 403) throw Object.assign(new Error('Bing blocked this request (rate limited). Try again later or set PROXY_URL.'), { status: 503 });
  if (res.status !== 200) throw Object.assign(new Error(`Bing returned HTTP ${res.status}.`), { status: 502 });
  return {
    images: parseBing(res.text, { offset: first - 1 }),
    suggestions: parseSuggestions(res.text),
    sourceUrl: url.replace('/images/async', '/images/search').replace('&mmasync=1', ''),
  };
}
