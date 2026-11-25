import { parseParams, HttpError } from './params.js';
import { runSearch } from './search.js';
import { LOCATIONS } from './locations.js';
import { runAgent, parseAgentParams, loadConfig } from './agent.js';
import { openapi } from './openapi.js';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) { try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); } }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 20_000) throw new HttpError(413, 'Request body too large.'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
}

/** GET|POST /api/agent - the full AI image agent over HTTP (JSON, or Server-Sent Events with stream=true). */
export async function agentHandler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
  const started = Date.now();
  let sse = false;
  try {
    const query = queryOf(req);
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const src = { ...query, ...body };
    authorize({ api_key: src.api_key ?? (req.headers.authorization || '').replace(/^Bearer\s+/i, '') });
    const p = parseAgentParams(src);
    if (!loadConfig().key) console.warn('[agent] no Groq key configured: running in keyword-fallback mode');
    if (p.stream) {
      sse = true;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders?.();
      const emit = (event, data) => { if (event === 'thinking' && !p.thinking) return; if (event !== 'result') res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const out = await runAgent(p, { emit });
      res.write(`event: result\ndata: ${JSON.stringify(out)}\n\n`);
      res.write('event: done\ndata: {}\n\n');
      return res.end();
    }
    const out = await runAgent(p);
    return send(res, 200, out, { 'Cache-Control': 'no-store' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[agent]', e);
    const payload = { error: status === 500 ? 'Internal error.' : e.message, agent_metadata: { status: 'Error', total_time_taken: Number(((Date.now() - started) / 1000).toFixed(2)) } };
    if (sse) { res.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`); return res.end(); }
    return send(res, status, payload, { 'Cache-Control': 'no-store' });
  }
}

export function openapiHandler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  send(res, 200, openapi(host ? `${proto}://${host}` : ''), { 'Cache-Control': 'public, s-maxage=3600' });
}
