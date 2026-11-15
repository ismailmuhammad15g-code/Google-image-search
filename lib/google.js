import { pickProxy, randomUA } from './net.js';

export class GoogleBlockedError extends Error {
  constructor(m) {
    super(m);
    this.status = 503;
  }
}

async function launch(proxy) {
  const puppeteer = (await import('puppeteer-core')).default;
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'];
  let proxyAuth;
  if (proxy) {
    const u = new URL(proxy);
    args.push(`--proxy-server=${u.protocol}//${u.host}`);
    if (u.username) proxyAuth = { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
  }
  if (process.env.VERCEL || process.env.CHROMIUM_PACK_URL) {
    if (!process.env.CHROMIUM_PACK_URL) throw new Error('Set CHROMIUM_PACK_URL to use the Google engine on Vercel.');
    const chromium = (await import('@sparticuz/chromium-min')).default;
    const browser = await puppeteer.launch({
      args: [...chromium.args, ...args],
      executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL),
      headless: 'shell',
    });
    return { browser, proxyAuth };
  }
  const executablePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
  return { browser: await puppeteer.launch({ args, executablePath, headless: true }), proxyAuth };
}

/** Walk Google's AF_initDataCallback blobs and collect image records. */
export function extractFromHtml(html) {
  const out = [];
  const seen = new Set();
  const re = /AF_initDataCallback\(\{[^]*?data:([^]*?),\s*sideChannel:/g;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const walk = (n) => {
      if (!Array.isArray(n)) return;
      const t = n[1];
      const o = n[2];
      if (
        Array.isArray(t) && Array.isArray(o) &&
        typeof t[0] === 'string' && /^https?:/.test(t[0]) &&
        typeof o[0] === 'string' && /^https?:/.test(o[0]) &&
        Number.isFinite(o[1]) && Number.isFinite(o[2]) && !seen.has(o[0])
      ) {
        seen.add(o[0]);
        const strings = [];
        JSON.stringify(n[n.length - 1] ?? n, (k, v) => (typeof v === 'string' ? (strings.push(v), v) : v));
        const link = strings.find((s) => /^https?:/.test(s) && s !== o[0] && s !== t[0] && !/gstatic|google/.test(s)) || '';
        const idx = strings.indexOf(link);
        out.push({
          id: typeof n[0] === 'string' ? n[0] : '',
          thumbnail: t[0],
          original: o[0],
          original_height: o[1],
          original_width: o[2],
          link,
          title: idx >= 0 ? strings.slice(idx + 1).find((s) => s.length > 2 && !/^https?:/.test(s)) || '' : '',
        });
        return;
      }
      n.forEach(walk);
    };
    walk(data);
  }
  return out;
}

export async function searchGoogle(p) {
  const proxy = pickProxy();
  const { browser, proxyAuth } = await launch(proxy);
  try {
    const page = await browser.newPage();
    if (proxyAuth) await page.authenticate(proxyAuth);
    await page.setUserAgent(randomUA());
    await page.setExtraHTTPHeaders({ 'Accept-Language': `${p.hl}-${p.gl.toUpperCase()},${p.hl};q=0.9` });
    await page.setCookie(
      { name: 'CONSENT', value: 'YES+cb', domain: '.google.com' },
      { name: 'SOCS', value: 'CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg', domain: '.google.com' },
    );
    const url =
      `https://www.${p.googleDomain}/search?q=${encodeURIComponent(p.q)}&udm=2&hl=${p.hl}&gl=${p.gl}&ijn=${p.ijn}` +
      (p.safe === 'active' ? '&safe=active' : '');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (/\/sorry\//.test(page.url())) {
      throw new GoogleBlockedError('Google showed a CAPTCHA for this IP. Use a residential proxy (PROXY_URL).');
    }
    await page.waitForFunction(() => document.querySelectorAll('img').length > 5, { timeout: 8000 }).catch(() => {});
    const html = await page.content();
    const found = extractFromHtml(html);
    if (!found.length) throw new GoogleBlockedError('Could not extract results from Google (layout changed or blocked).');
    const images = found.map((f, i) => {
      let host = '';
      try { host = new URL(f.link).hostname.replace(/^www\./, ''); } catch {}
      return {
        position: p.ijn * 100 + i + 1,
        thumbnail: f.thumbnail,
        related_content_id: f.id,
        source: host,
        source_logo: host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '',
        title: f.title,
        link: f.link,
        original: f.original,
        original_height: f.original_height,
        original_width: f.original_width,
        is_product: false,
      };
    });
    return { images, suggestions: [], sourceUrl: url };
  } finally {
    await browser.close().catch(() => {});
  }
}
