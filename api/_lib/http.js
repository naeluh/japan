import crypto from 'node:crypto';

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
export function fail(res, status, code, message) { send(res, status, { code, message }); }

export function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// EDIT_KEY is required for changes. VIEW_KEY (optional) makes the plan private to people with a link.
export function access(req) {
  const key = req.headers['x-trip-key'] || '';
  const edit = process.env.EDIT_KEY || '';
  const view = process.env.VIEW_KEY || '';
  const canEdit = !!edit && !!key && same(key, edit);
  const canView = canEdit || !view || (!!key && same(key, view));
  return { canEdit, canView };
}
// Read-only token for calendar subscriptions: calendar apps can't send headers, and a raw key in a shared URL would leak edit rights.
export function calToken() {
  const secret = process.env.EDIT_KEY || process.env.VIEW_KEY || '';
  return secret ? crypto.createHmac('sha256', secret).update('calendar').digest('hex').slice(0, 24) : '';
}
export function query(req) {
  if (req.query) return req.query;
  const u = new URL(req.url, 'http://x'); return Object.fromEntries(u.searchParams);
}
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
export async function getJSON(url, opts = {}, timeoutMs = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, json: j, text };
  } finally { clearTimeout(t); }
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const UA = `japan-trip-planner/1.0 (${process.env.CONTACT_EMAIL || 'personal trip planner'})`;
