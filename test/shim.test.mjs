// The sync layer (public/shim.js) against a fake /api/db whose requests the test can hold and release in any order.
// Each request is answered with the server state at the moment it ARRIVES (like the real one), delivered when released.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/shim.js', import.meta.url), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 5));
async function settle() { for (let k = 0; k < 20; k++) await tick(); }

function boot(initial) {
  const server = { docs: new Map(Object.entries(initial)), rev: 1, changes: [], posts: [], refuse: null, offline: false };
  const held = [];       // requests the test holds: { kind, deliver }
  let hold = () => false;
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v; return out; };
  const answer = (url, opts) => {
    if (url === '/api/config') return [200, { canEdit: true, canView: true, features: {} }];
    if (opts && opts.method === 'POST') {
      const o = JSON.parse(opts.body);
      if (server.refuse && server.refuse(o)) return [403, { code: 'not_granted', message: 'no' }];
      server.posts.push(o);
      const cur = server.docs.get(o.path);
      if (o.op === 'delete') server.docs.delete(o.path); else server.docs.set(o.path, o.op === 'update' ? merge(cur, o.data) : o.data);
      server.rev++; server.changes.push({ rev: server.rev, path: o.path });
      return [200, { rev: server.rev }];
    }
    const since = Number(new URL(url, 'http://x').searchParams.get('since')) || 0;
    const docs = {};
    if (!since) server.docs.forEach((v, p) => { docs[p] = v; });
    else for (const c of server.changes) if (c.rev > since) docs[c.path] = server.docs.has(c.path) ? server.docs.get(c.path) : null;
    return [200, { rev: server.rev, epoch: 'e1', docs, full: !since }];
  };
  const fetch = (url, opts) => {
    if (server.offline && url !== '/api/config') return Promise.reject(new TypeError('Failed to fetch'));
    const [status, body] = answer(url, opts);   // computed on arrival
    const res = { ok: status < 400, status, statusText: '', json: async () => body };
    const kind = opts && opts.method === 'POST' ? 'post' : url === '/api/config' ? 'config' : 'get';
    if (!hold(kind, url, opts)) return Promise.resolve(res);
    return new Promise(r => held.push({ kind, deliver: () => r(res) }));
  };
  const store = new Map([['trip:name', 'Test']]);
  const listeners = {};
  const window = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: () => true };
  const ctx = vm.createContext({
    window, fetch, console, URL, URLSearchParams, Promise, JSON, Date, Math, Object, Map, Set, Array, String, Number, TypeError,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { search: '', pathname: '/', hash: '' }, history: { replaceState() {} },
    document: { hidden: false, addEventListener() {} },
    setTimeout: (f, ms) => ms >= 1000 ? 0 : setTimeout(f, ms), clearTimeout: () => {}   // no 5-second poll in tests
  });
  vm.runInContext(SRC, ctx);
  return { server, held, window, fire: (t) => (listeners[t] || []).forEach(f => f()), setHold: (f) => { hold = f; }, release: (kind) => { const i = held.findIndex(h => h.kind === kind); const [h] = held.splice(i, 1); h.deliver(); } };
}
async function client(initial) {
  const t = boot(initial);
  const db = await t.window.claude.use('db');
  await db.doc('items/a').get();
  return { ...t, db, local: (p) => { const v = t.window.TRIP_API.doc(p); return v === undefined ? v : JSON.parse(JSON.stringify(v)); } };   // plain objects: the shim runs in another realm
}

test('sync: a fetch that left before an edit cannot undo it on screen', async () => {
  const t = await client({ 'items/a': { n: 0 } });
  t.server.docs.set('items/a', { n: 1 }); t.server.rev++; t.server.changes.push({ rev: t.server.rev, path: 'items/a' });   // the other person
  t.setHold((kind) => kind === 'get');
  t.window.TRIP_API.pull();                       // a poll leaves, carrying n: 1
  t.setHold(() => false);
  await t.db.doc('items/a').set({ n: 2 });          // our edit lands on the server
  assert.equal(t.local('items/a').n, 2);
  t.release('get'); await settle();                 // the old poll comes back
  assert.equal(t.local('items/a').n, 2, 'the edit stays on screen');
  assert.equal(t.server.docs.get('items/a').n, 2);
});

test('sync: edits reach the server in the order they were made, one at a time', async () => {
  const t = await client({ 'settings/picks': { food: 'balanced' } });
  t.setHold((kind) => kind === 'post');
  const a = t.db.doc('settings/picks').set({ food: 'treat' });
  const b = t.db.doc('settings/picks').set({ food: 'easy' });
  await settle();
  assert.equal(t.held.filter(h => h.kind === 'post').length, 1, 'the second waits for the first');
  t.setHold(() => false); t.release('post'); await a; await b; await settle();
  assert.deepEqual(t.server.posts.map(o => o.data.food), ['treat', 'easy']);
  assert.equal(t.server.docs.get('settings/picks').food, 'easy');
  assert.equal(t.local('settings/picks').food, 'easy');
});

test('sync: a save while a fetch is running still gets its own fresh fetch', async () => {
  const t = await client({ 'items/a': { n: 0 }, 'items/b': { n: 0 } });
  let gets = 0;
  t.setHold((kind) => { if (kind === 'get') gets++; return kind === 'get' && gets === 1; });
  t.window.TRIP_API.pull();                       // held
  t.server.docs.set('items/b', { n: 5 }); t.server.rev++; t.server.changes.push({ rev: t.server.rev, path: 'items/b' });   // lands after the held fetch left
  await t.db.doc('items/a').set({ n: 1 });
  t.release('get'); await settle();
  assert.ok(gets >= 2, 'another fetch after the held one');
  assert.equal(t.local('items/b').n, 5, 'the change that landed meanwhile shows up now, not at the next poll');
});

test('sync: a refused edit is undone and reported; offline edits wait and send in order', async () => {
  const t = await client({ 'items/a': { n: 0 } });
  t.server.refuse = (o) => o.path === 'items/a';
  await assert.rejects(t.db.doc('items/a').set({ n: 9 }));
  await settle();
  assert.equal(t.local('items/a').n, 0, 'back to the server value');
  t.server.refuse = null; t.server.offline = true;
  await t.db.doc('items/a').set({ n: 1 }); await t.db.doc('items/a').update({ m: 2 });   // resolve at once: queued
  assert.deepEqual(t.local('items/a'), { n: 1, m: 2 });
  assert.equal(t.window.TRIP_API.pending(), 2);
  t.server.offline = false; t.fire('online'); await settle();
  assert.deepEqual(t.server.posts.slice(-2).map(o => o.op), ['set', 'update']);
  assert.deepEqual(t.server.docs.get('items/a'), { n: 1, m: 2 });
  assert.equal(t.window.TRIP_API.pending(), 0);
});

test('sync: an update merges nested fields the same way the server does', async () => {
  const t = await client({ 'items/a': { live: { found: true, price: 1 }, n: 0 } });
  await t.db.doc('items/a').update({ live: { price: 2 } });
  assert.deepEqual(t.local('items/a'), { live: { found: true, price: 2 }, n: 0 });
  await settle();
  assert.deepEqual(t.local('items/a'), t.server.docs.get('items/a'));
});
