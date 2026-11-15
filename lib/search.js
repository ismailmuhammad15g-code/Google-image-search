import { randomUUID } from 'node:crypto';
import { TTLCache } from './cache.js';
import { searchBing } from './bing.js';
import { searchGoogle } from './google.js';

const cache = new TTLCache();

/** Decide engine order. `auto`: Google (only if a proxy is configured), then Bing. */
function backends(p) {
  const googleReady = Boolean(process.env.PROXY_URL);
  if (p.backend === 'bing') return ['bing'];
  if (p.backend === 'google') return ['google'];
  return googleReady ? ['google', 'bing'] : ['bing'];
}

const fmt = (d) => d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

export async function runSearch(p, { origin = '' } = {}) {
  const started = Date.now();
  const created = new Date();
  const key = JSON.stringify([p.q, p.ijn, p.gl, p.hl, p.safe, p.filters, p.backend]);

  let hit = cache.get(key);
  let cached = true;
  if (!hit) {
    cached = false;
    let lastErr;
    for (const name of backends(p)) {
      try {
        const r = name === 'google' ? await searchGoogle(p) : await searchBing(p);
        hit = { ...r, backend: name };
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!hit) throw lastErr;
    cache.set(key, hit);
  }

  const processed = new Date();
  const qs = (q) => `${origin}/api/search?engine=google_images&q=${encodeURIComponent(q)}`;
  const images = hit.images.map((i) => ({
    ...i,
    serpapi_related_content_link: i.title ? qs(i.title) : '',
  }));
  const id = randomUUID().replace(/-/g, '').slice(0, 24);

  return {
    search_metadata: {
      id,
      status: 'Success',
      json_endpoint: `${origin}/api/search?engine=google_images&q=${encodeURIComponent(p.q)}&ijn=${p.ijn}`,
      created_at: fmt(created),
      processed_at: fmt(processed),
      google_url: hit.sourceUrl,
      backend: hit.backend,
      cached,
      total_time_taken: Number(((Date.now() - started) / 1000).toFixed(2)),
    },
    search_parameters: {
      engine: 'google_images',
      q: p.q,
      location_requested: p.locationRequested,
      location_used: p.locationUsed,
      google_domain: p.googleDomain,
      hl: p.hl,
      gl: p.gl,
      safe: p.safe,
      ijn: String(p.ijn),
    },
    search_information: {
      image_results_state: images.length ? 'Results for exact spelling' : 'Fully empty',
      query_displayed: p.q,
    },
    ...(hit.suggestions?.length
      ? { suggested_searches: hit.suggestions.map((name) => ({ name, link: qs(`${p.q} ${name}`) })) }
      : {}),
    images_results: images,
  };
}
