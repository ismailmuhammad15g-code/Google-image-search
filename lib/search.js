import { randomUUID } from 'node:crypto';
import { TTLCache } from './cache.js';
import { searchBing } from './bing.js';
import { searchGoogle } from './google.js';
import { searchDdg } from './ddg.js';
import { mergeResults } from './rank.js';

const cache = new TTLCache();

const ENGINES = { bing: searchBing, ddg: searchDdg, duckduckgo: searchDdg, google: searchGoogle };

/** Which engines to query. `auto` = Bing + DuckDuckGo in parallel (+ Google when a proxy is configured). */
function backends(p) {
  const b = p.backend;
  if (ENGINES[b]) return [b === 'duckduckgo' ? 'ddg' : b];
  return process.env.PROXY_URL ? ['google', 'bing', 'ddg'] : ['bing', 'ddg'];
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
    const names = backends(p);
    const settled = await Promise.allSettled(names.map((n) => ENGINES[n](p)));
    const ok = settled.map((r, i) => ({ r, name: names[i] })).filter((x) => x.r.status === 'fulfilled' && x.r.value.images.length);
    if (!ok.length) {
      const err = settled.find((r) => r.status === 'rejected');
      if (err) throw err.reason;
      hit = { images: [], suggestions: [], sourceUrl: '', backend: names.join('+') };
    } else {
      const images = ok.length === 1 ? ok[0].r.value.images : mergeResults(ok.map((x) => x.r.value.images), p.q);
      hit = {
        images,
        suggestions: ok.flatMap((x) => x.r.value.suggestions || []).filter((v, i, a) => a.indexOf(v) === i),
        sourceUrl: ok[0].r.value.sourceUrl,
        backend: ok.map((x) => x.name).join('+'),
      };
    }
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
