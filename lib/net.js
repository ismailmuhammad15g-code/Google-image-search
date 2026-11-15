// Outgoing HTTP with optional proxy rotation (PROXY_URL, comma-separated).
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
export const randomUA = () => UAS[Math.floor(Math.random() * UAS.length)];

export function pickProxy() {
  const list = (process.env.PROXY_URL || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

const agents = new Map();
async function dispatcherFor(proxy) {
  if (!agents.has(proxy)) {
    const { ProxyAgent } = await import('undici');
    agents.set(proxy, new ProxyAgent(proxy));
  }
  return agents.get(proxy);
}

/** fetch() with timeout, 1 retry on network/5xx errors, and optional proxy. */
export async function httpGet(url, { headers = {}, timeoutMs = 8000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const proxy = pickProxy();
      const opts = {
        headers: { 'User-Agent': randomUA(), 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      };
      if (proxy) opts.dispatcher = await dispatcherFor(proxy);
      const res = await fetch(url, opts);
      if (res.status >= 500 && attempt < retries) continue;
      return { status: res.status, url: res.url, text: await res.text() };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new HttpError502(`Upstream request failed: ${lastErr?.message || lastErr}`);
}

export class HttpError502 extends Error {
  constructor(m) {
    super(m);
    this.status = 502;
  }
}
