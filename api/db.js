// GET /api/db?since=REV  -> { rev, docs: {path: doc|null}, full? }
// POST /api/db { op: "set"|"update"|"delete", path, data }  (needs the edit key)
import { readAll, readSince, getDoc, writeDoc } from './_lib/store.js';
import { send, fail, access, query, body } from './_lib/http.js';

const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const COLLECTIONS = new Set(['items', 'settings', 'expenses', 'log', 'people']);

function validPath(p) {
  if (typeof p !== 'string' || p.length > 400) return false;
  const s = p.split('/');
  return s.length === 2 && COLLECTIONS.has(s[0]) && s.every(x => SEG.test(x) && x !== '.' && x !== '..');
}
function merge(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) ? merge(out[k], v) : v;
  }
  return out;
}

export default async function handler(req, res) {
  const { canEdit, canView } = access(req);
  try {
    if (req.method === 'GET') {
      if (!canView) return fail(res, 403, 'not_granted', 'This link needs a valid trip key.');
      const since = Number(query(req).since || 0);
      if (!since) { const all = await readAll(); return send(res, 200, { ...all, full: true }); }
      const ch = await readSince(since);
      if (since < ch.rev - 19000) { const all = await readAll(); return send(res, 200, { ...all, full: true }); }
      return send(res, 200, ch);
    }
    if (req.method === 'POST') {
      if (!canEdit) return fail(res, 403, 'invalid_argument', 'This link is view-only.');
      const { op, path, data } = await body(req);
      if (!validPath(path)) return fail(res, 400, 'invalid_argument', 'Bad document path.');
      if (op === 'delete') { const rev = await writeDoc(path, null); return send(res, 200, { rev }); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(res, 400, 'invalid_argument', 'Document must be an object.');
      if (JSON.stringify(data).length > 64000) return fail(res, 400, 'invalid_argument', 'Document too large.');
      let value = data;
      if (op === 'update') {
        const cur = await getDoc(path);
        if (!cur) return fail(res, 404, 'invalid_argument', 'Document does not exist.');
        value = merge(cur, data);
      } else if (op !== 'set') return fail(res, 400, 'invalid_argument', 'Unknown op.');
      const rev = await writeDoc(path, value);
      return send(res, 200, { rev });
    }
    return fail(res, 405, 'invalid_argument', 'Method not allowed.');
  } catch (e) {
    console.error(e);
    return fail(res, 503, 'unavailable', 'Storage is unavailable. Check the Redis settings.');
  }
}
