// /api/db against a throwaway local store. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const file = path.join(os.tmpdir(), `trip-db-test-${process.pid}.json`);
process.env.LOCAL_DB_FILE = file;
process.env.EDIT_KEY = 'edit-secret';
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const { default: db } = await import('../api/db.js');
test.after(() => fs.rmSync(file, { force: true }));

const K = 'edit-secret';
function call(method, qs, body, key) {
  return new Promise((resolve) => {
    const req = { method, url: '/api/db?' + qs, query: Object.fromEntries(new URLSearchParams(qs)), headers: key ? { 'x-trip-key': key } : {}, body };
    const res = { statusCode: 200, setHeader() {}, end(s) { resolve({ status: res.statusCode, json: JSON.parse(s) }); } };
    db(req, res);
  });
}

test('db: full load, deltas, and full reloads for stale clients', async () => {
  const all = await call('GET', 'since=0', null, K);
  assert.equal(all.status, 200);
  assert.equal(all.json.full, true);
  assert.ok(all.json.epoch);
  assert.ok(Object.keys(all.json.docs).length > 100, 'seeded plan');
  const w = await call('POST', '', { op: 'set', path: 'items/t1', data: { title: 'Test' } }, 'edit-secret');
  assert.equal(w.status, 200);
  const delta = await call('GET', `since=${w.json.rev - 1}&epoch=${all.json.epoch}`, null, K);
  assert.equal(delta.json.full, undefined);
  assert.deepEqual(Object.keys(delta.json.docs), ['items/t1']);
  assert.equal((await call('GET', `since=${w.json.rev + 50}`, null, K)).json.full, true, 'client ahead of the store');
  assert.equal((await call('GET', `since=${w.json.rev}&epoch=old`, null, K)).json.full, true, 'store was reset');
  const merged = await call('POST', '', { op: 'update', path: 'items/t1', data: { done: true } }, 'edit-secret');
  assert.equal(merged.status, 200);
  const d2 = await call('GET', `since=${merged.json.rev - 1}&epoch=${all.json.epoch}`, null, K);
  assert.deepEqual(d2.json.docs['items/t1'], { title: 'Test', done: true });
});

test('db: with EDIT_KEY set, reads and writes need it; without it, anyone can edit', async () => {
  assert.equal((await call('GET', 'since=0')).status, 403);
  delete process.env.EDIT_KEY;
  assert.equal((await call('GET', 'since=0')).status, 200);
  assert.equal((await call('POST', '', { op: 'set', path: 'items/open', data: { title: 'Open' } })).status, 200);
  process.env.EDIT_KEY = 'edit-secret';
});

test('db: writes need the edit key and a known collection', async () => {
  assert.equal((await call('POST', '', { op: 'set', path: 'items/x', data: {} })).status, 403);
  assert.equal((await call('POST', '', { op: 'set', path: 'watch/x', data: {} }, 'edit-secret')).status, 400);
  assert.equal((await call('POST', '', { op: 'set', path: 'items/../x', data: {} }, 'edit-secret')).status, 400);
});
