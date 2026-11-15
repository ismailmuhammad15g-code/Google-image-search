import { parseParams, HttpError } from './params.js';
import { runSearch } from './search.js';
import { LOCATIONS } from './locations.js';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body, null, 2));
}

function queryOf(req) {
  if (req.query && typeof req.query === 'object') {
    return Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  }
  return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
}

function authorize(query) {
  const keys = (process.env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.length && !keys.includes(String(query.api_key || ''))) {
    throw new HttpError(401, 'Invalid or missing API key. Pass ?api_key=YOUR_KEY.');
  }
}

export async function searchHandler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET.' });
  const started = Date.now();
  try {
    const query = queryOf(req);
    authorize(query);
    const p = parseParams(query);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
    const out = await runSearch(p, { origin: host ? `${proto}://${host}` : '' });
    return send(res, 200, out, { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[search]', e);
    return send(
      res,
      status,
      {
        error: status === 500 ? 'Internal error.' : e.message,
        search_metadata: { status: 'Error', total_time_taken: Number(((Date.now() - started) / 1000).toFixed(2)) },
      },
      { 'Cache-Control': 'no-store' },
    );
  }
}

export function locationsHandler(req, res) {
  const q = String(queryOf(req).q || '').toLowerCase();
  send(res, 200, LOCATIONS.filter((l) => l.name.toLowerCase().includes(q)), { 'Cache-Control': 'public, s-maxage=86400' });
}

export function healthHandler(_req, res) {
  send(res, 200, { status: 'ok', time: new Date().toISOString() }, { 'Cache-Control': 'no-store' });
}
