import { httpGet } from './net.js';

export const DDG_PAGE = 100;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Pure: pull the `vqd` token out of the DuckDuckGo landing page / any response. */
export function parseVqd(html) {
  const m = /vqd=["']?([\d-]+)["']?/.exec(String(html)) || /"vqd":"([\d-]+)"/.exec(String(html));
  return m ? m[1] : null;
}

/** Pure: DuckDuckGo `i.js` JSON -> SerpApi-style image results. */
export function parseDdg(json, { offset = 0 } = {}) {
  const out = [];
  for (const r of json?.results || []) {
    if (!r?.image || !r?.thumbnail) continue;
    const domain = hostOf(r.url) || String(r.source || '').replace(/^www\./, '');
    out.push({
      position: offset + out.length + 1,
      thumbnail: r.thumbnail,
      related_content_id: '',
      source: domain,
      source_logo: domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '',
      title: String(r.title || '').replace(/\s+/g, ' ').trim(),
      link: r.url || '',
      original: r.image,
      original_height: Number(r.height) || 0,
      original_width: Number(r.width) || 0,
      is_product: false,
    });
  }
  return out;
}

function filterParam({ size, type, color }) {
  const sizes = { large: 'Large', medium: 'Medium', small: 'Small' };
  const types = { photo: 'photo', clipart: 'clipart', linedrawing: 'line', animatedgif: 'gif', portrait: 'face' };
  const parts = ['', size ? `size:${sizes[size]}` : '', color ? (color === 'bw' ? 'color:Monochrome' : '') : '', type ? `type:${types[type]}` : '', '', ''];
  return parts.join(',');
}

/** DuckDuckGo image search (free, no key, works from most datacenter IPs). */
export async function searchDdg(p) {
  const kl = `${p.gl}-${p.hl}`;
  const headers = { Referer: 'https://duckduckgo.com/', 'Accept-Language': `${p.hl}-${p.gl.toUpperCase()},${p.hl};q=0.9` };
  const landing = await httpGet(`https://duckduckgo.com/?q=${encodeURIComponent(p.q)}&iax=images&ia=images`, { headers, timeoutMs: 7000 });
  const vqd = parseVqd(landing.text);
  if (!vqd) throw Object.assign(new Error('DuckDuckGo did not return a session token.'), { status: 502 });
  const safe = p.safe === 'active' ? '1' : p.safe === 'off' ? '-2' : '-1';
  const s = p.ijn * DDG_PAGE;
  const url =
    `https://duckduckgo.com/i.js?l=${encodeURIComponent(kl)}&o=json&q=${encodeURIComponent(p.q)}` +
    `&vqd=${encodeURIComponent(vqd)}&f=${encodeURIComponent(filterParam(p.filters))}&p=${safe}&s=${s}`;
  const res = await httpGet(url, { headers, timeoutMs: 8000 });
  if (res.status === 429 || res.status === 403) throw Object.assign(new Error('DuckDuckGo rate limited this request.'), { status: 503 });
  if (res.status !== 200) throw Object.assign(new Error(`DuckDuckGo returned HTTP ${res.status}.`), { status: 502 });
  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw Object.assign(new Error('DuckDuckGo returned an unreadable response.'), { status: 502 });
  }
  return { images: parseDdg(json, { offset: s }), suggestions: [], sourceUrl: `https://duckduckgo.com/?q=${encodeURIComponent(p.q)}&iax=images&ia=images` };
}
