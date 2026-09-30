// Storage: Upstash Redis (Vercel Marketplace) over its REST API, or a local JSON file for development.
import fs from 'node:fs';
import path from 'node:path';
import seed from './seed.js';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const P = 'trip:' + (process.env.TRIP_ID || 'japan-2027');
export const hasRedis = !!(URL_ && TOKEN);

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}
async function pipeline(cmds) {
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmds) });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('Redis pipeline failed');
  for (const x of j) if (x.error) throw new Error('Redis: ' + x.error);
  return j.map(x => x.result);
}

// ---------- local file store (dev only; Vercel's filesystem is read-only) ----------
const LOCAL = path.join(process.cwd(), '.local-db.json');
let mem = null;
function loadLocal() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); }
  catch { mem = { docs: { ...seed }, rev: 1, changes: [], cache: {} }; saveLocal(); }
  return mem;
}
function saveLocal() { try { fs.writeFileSync(LOCAL, JSON.stringify(mem)); } catch { /* read-only FS: keep in memory */ } }

// ---------- seeding ----------
let seeded = false;
async function ensureSeed() {
  if (!hasRedis || seeded) return;
  const first = await redis(['SET', `${P}:seeded`, '1', 'NX']);
  if (first === 'OK') {
    const hset = ['HSET', `${P}:docs`];
    for (const [k, v] of Object.entries(seed)) hset.push(k, JSON.stringify(v));
    await pipeline([hset, ['SET', `${P}:rev`, '1']]);
  }
  seeded = true;
}

export async function readAll() {
  if (!hasRedis) { const m = loadLocal(); return { rev: m.rev, docs: m.docs }; }
  await ensureSeed();
  const [flat, rev] = await pipeline([['HGETALL', `${P}:docs`], ['GET', `${P}:rev`]]);
  const docs = {};
  for (let i = 0; i < (flat || []).length; i += 2) docs[flat[i]] = JSON.parse(flat[i + 1]);
  return { rev: Number(rev) || 1, docs };
}

export async function readSince(since) {
  if (!hasRedis) {
    const m = loadLocal();
    const paths = [...new Set(m.changes.filter(c => c.rev > since).map(c => c.path))];
    const docs = {}; for (const p of paths) docs[p] = m.docs[p] ?? null;
    return { rev: m.rev, docs };
  }
  await ensureSeed();
  const [rev, paths] = await pipeline([['GET', `${P}:rev`], ['ZRANGEBYSCORE', `${P}:changes`, `(${since}`, '+inf']]);
  const uniq = [...new Set(paths || [])];
  const docs = {};
  if (uniq.length) {
    const vals = await redis(['HMGET', `${P}:docs`, ...uniq]);
    uniq.forEach((p, i) => { docs[p] = vals[i] == null ? null : JSON.parse(vals[i]); });
  }
  return { rev: Number(rev) || 1, docs };
}

export async function getDoc(p) {
  if (!hasRedis) return loadLocal().docs[p] ?? null;
  await ensureSeed();
  const v = await redis(['HGET', `${P}:docs`, p]);
  return v == null ? null : JSON.parse(v);
}

export async function writeDoc(p, value) { // value null = delete
  if (!hasRedis) {
    const m = loadLocal();
    if (value === null) delete m.docs[p]; else m.docs[p] = value;
    m.rev += 1; m.changes.push({ rev: m.rev, path: p });
    if (m.changes.length > 5000) m.changes = m.changes.slice(-4000);
    saveLocal(); return m.rev;
  }
  await ensureSeed();
  const rev = await redis(['INCR', `${P}:rev`]);
  await pipeline([
    value === null ? ['HDEL', `${P}:docs`, p] : ['HSET', `${P}:docs`, p, JSON.stringify(value)],
    ['ZADD', `${P}:changes`, String(rev), p],
    ['ZREMRANGEBYSCORE', `${P}:changes`, '-inf', String(rev - 20000)]
  ]);
  return rev;
}

// ---------- cache for API lookups ----------
export async function cacheGet(key) {
  if (!hasRedis) { const c = loadLocal().cache[key]; return c && c.exp > Date.now() ? c.v : null; }
  const v = await redis(['GET', `${P}:cache:${key}`]);
  return v == null ? null : JSON.parse(v);
}
export async function cacheSet(key, value, seconds) {
  if (!hasRedis) { const m = loadLocal(); m.cache[key] = { v: value, exp: Date.now() + seconds * 1000 }; saveLocal(); return; }
  await redis(['SET', `${P}:cache:${key}`, JSON.stringify(value), 'EX', String(seconds)]);
}
