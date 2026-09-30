// Storage: Postgres on Neon's free plan (DATABASE_URL), or a local JSON file for development.
// Every doc row carries the revision of its last write; a delete keeps the row with value NULL so clients can sync it.
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import seed from './seed.js';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const TRIP = process.env.TRIP_ID || 'japan-2027';
export const backend = DB_URL ? 'postgres' : 'local';
const sql = DB_URL ? neon(DB_URL) : null;

// ---------- local file store (dev only; Vercel's filesystem is read-only) ----------
const LOCAL = process.env.LOCAL_DB_FILE || path.join(process.cwd(), '.local-db.json');
let mem = null;
function loadLocal() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(LOCAL, 'utf8')); }
  catch { mem = { docs: { ...seed }, rev: 1, changes: [], cache: {} }; saveLocal(); }
  if (!mem.epoch) { mem.epoch = String(Date.now()); saveLocal(); }
  return mem;
}
function saveLocal() { try { fs.writeFileSync(LOCAL, JSON.stringify(mem)); } catch { /* read-only FS: keep in memory */ } }

// ---------- Postgres: schema and first-run seed ----------
// The meta row holds an epoch; clients compare it so a reset store forces a full reload instead of a stale delta.
let ready = null;
function ensure() {
  if (!ready) ready = (async () => {
    await sql.transaction([
      sql`CREATE SEQUENCE IF NOT EXISTS trip_rev`,
      sql`CREATE TABLE IF NOT EXISTS trip_docs (trip text NOT NULL, path text NOT NULL, value jsonb, rev bigint NOT NULL, PRIMARY KEY (trip, path))`,
      sql`CREATE INDEX IF NOT EXISTS trip_docs_rev ON trip_docs (trip, rev)`,
      sql`CREATE TABLE IF NOT EXISTS trip_meta (trip text PRIMARY KEY, epoch text NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS trip_cache (key text PRIMARY KEY, value jsonb NOT NULL, exp timestamptz NOT NULL)`
    ]);
    // One statement: only the instance that creates the meta row seeds, and nobody sees the row before the docs.
    await sql`WITH m AS (INSERT INTO trip_meta (trip, epoch) VALUES (${TRIP}, ${String(Date.now())}) ON CONFLICT (trip) DO NOTHING RETURNING epoch)
      INSERT INTO trip_docs (trip, path, value, rev) SELECT ${TRIP}, d.key, d.value, nextval('trip_rev') FROM jsonb_each(${JSON.stringify(seed)}::jsonb) d WHERE EXISTS (SELECT 1 FROM m)`;
    const [row] = await sql`SELECT epoch FROM trip_meta WHERE trip = ${TRIP}`;
    return row.epoch;
  })().catch(e => { ready = null; throw e; });
  return ready;
}
async function currentRev() { const [r] = await sql`SELECT coalesce(max(rev), 0) AS rev FROM trip_docs WHERE trip = ${TRIP}`; return Number(r.rev); }

export async function readAll() {
  if (!sql) { const m = loadLocal(); return { rev: m.rev, epoch: m.epoch, docs: m.docs }; }
  const epoch = await ensure();
  const rows = await sql`SELECT path, value, rev FROM trip_docs WHERE trip = ${TRIP}`;
  const docs = {}; let rev = 0;
  for (const r of rows) { rev = Math.max(rev, Number(r.rev)); if (r.value !== null) docs[r.path] = r.value; }
  return { rev, epoch, docs };
}

export async function readSince(since) {
  if (!sql) {
    const m = loadLocal();
    const paths = [...new Set(m.changes.filter(c => c.rev > since).map(c => c.path))];
    const docs = {}; for (const p of paths) docs[p] = m.docs[p] ?? null;
    return { rev: m.rev, epoch: m.epoch, docs };
  }
  const epoch = await ensure();
  const rev = await currentRev(); // first: rows committed after this are resent next time, never skipped
  const rows = await sql`SELECT path, value FROM trip_docs WHERE trip = ${TRIP} AND rev > ${since}`;
  const docs = {}; for (const r of rows) docs[r.path] = r.value;
  return { rev, epoch, docs };
}

export async function getDoc(p) {
  if (!sql) return loadLocal().docs[p] ?? null;
  await ensure();
  const [r] = await sql`SELECT value FROM trip_docs WHERE trip = ${TRIP} AND path = ${p}`;
  return r ? r.value : null;
}

export async function writeDoc(p, value) { // value null = delete
  if (!sql) {
    const m = loadLocal();
    if (value === null) delete m.docs[p]; else m.docs[p] = value;
    m.rev += 1; m.changes.push({ rev: m.rev, path: p });
    if (m.changes.length > 5000) m.changes = m.changes.slice(-4000);
    saveLocal(); return m.rev;
  }
  await ensure();
  // The lock makes revisions commit in order, so a client that has seen rev N can never miss a write numbered below N.
  const [, rows] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${TRIP}))`,
    sql`INSERT INTO trip_docs (trip, path, value, rev) VALUES (${TRIP}, ${p}, ${value === null ? null : JSON.stringify(value)}::jsonb, nextval('trip_rev'))
      ON CONFLICT (trip, path) DO UPDATE SET value = EXCLUDED.value, rev = EXCLUDED.rev RETURNING rev`
  ]);
  return Number(rows[0].rev);
}

// ---------- cache for API lookups ----------
export async function cacheGet(key) {
  if (!sql) { const c = loadLocal().cache[key]; return c && c.exp > Date.now() ? c.v : null; }
  await ensure();
  const [r] = await sql`SELECT value FROM trip_cache WHERE key = ${TRIP + ':' + key} AND exp > now()`;
  return r ? r.value : null;
}
export async function cacheSet(key, value, seconds) {
  if (!sql) { const m = loadLocal(); m.cache[key] = { v: value, exp: Date.now() + seconds * 1000 }; saveLocal(); return; }
  await ensure();
  await sql`INSERT INTO trip_cache (key, value, exp) VALUES (${TRIP + ':' + key}, ${JSON.stringify(value)}::jsonb, now() + make_interval(secs => ${seconds}))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, exp = EXCLUDED.exp`;
  if (Math.random() < 0.02) await sql`DELETE FROM trip_cache WHERE exp < now()`; // ponytail: lazy sweep, a cron if the table ever grows
}
