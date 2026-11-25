// Local dev server: mirrors Vercel routing (api/* + static public/ + rewrites).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchHandler, healthHandler, locationsHandler, agentHandler, openapiHandler } from './lib/handler.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const routes = {
  '/api/search': searchHandler,
  '/search': searchHandler,
  '/search.json': searchHandler,
  '/api/agent': agentHandler,
  '/api/openapi': openapiHandler,
  '/openapi.json': openapiHandler,
  '/api/health': healthHandler,
  '/api/locations': locationsHandler,
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon' };

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (routes[path]) return routes[path](req, res);
    const clean = { '/': '/index.html', '/images': '/images.html', '/guide': '/guide.html', '/agent': '/agent.html', '/playground': '/playground.html' };
    const file = normalize(clean[path] || path);
    if (file.includes('..')) return res.writeHead(400).end();
    try {
      const body = await readFile(join(root, file));
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}`));
