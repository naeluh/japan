// Local preview without the Vercel CLI:  node dev-server.mjs  ->  http://localhost:3000/?k=<EDIT_KEY>
// Reads .env if present. Uses a local .local-db.json file unless Redis variables are set.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.ics': 'text/calendar; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const file = path.join(process.cwd(), 'api', name + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"code":"not_found"}'); }
    req.query = Object.fromEntries(url.searchParams);
    try { const mod = await import(pathToFileURL(file).href); await mod.default(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; res.end('{"code":"unavailable"}'); }
    return;
  }
  let p = path.join(process.cwd(), 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!p.startsWith(path.join(process.cwd(), 'public'))) { res.statusCode = 403; return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log(`Trip planner running at http://localhost:${PORT}/?k=${process.env.EDIT_KEY || '<set EDIT_KEY in .env>'}`));
