// Unusual places near a point, from OpenStreetMap and Wikidata (no keys).
// GET  /api/discover?lat=&lng=&walk=15&date=YYYY-MM-DD&from=HH:MM&to=HH:MM&taste=kind:weight,...&exclude=node/1,...
// POST /api/discover { stops: [{ id, lat, lng, name, date, from, to }] }  -> opening-hours clash check
import crypto from 'node:crypto';
import { send, fail, access, query, body } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';
import { nearby, rank, hoursFor, KINDS } from './_lib/osm.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const inJapan = (lat, lng) => lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;

export default async function handler(req, res) {
  if (!access(req).canView) return fail(res, 403, 'not_granted', 'This link needs a valid trip key.');
  try {
    if (req.method === 'POST') {
      const b = await body(req);
      const stops = (Array.isArray(b.stops) ? b.stops : []).slice(0, 40).map(s => ({
        id: String(s.id || '').slice(0, 80), name: String(s.name || '').slice(0, 120), alt: String(s.alt || '').slice(0, 120), lat: Number(s.lat), lng: Number(s.lng),
        date: ISO.test(s.date || '') ? s.date : '', from: hm(s.from), to: hm(s.to)
      })).filter(s => s.id && inJapan(s.lat, s.lng) && s.date);
      if (!stops.length) return send(res, 200, { hours: {} });
      const key = 'hours:' + crypto.createHash('sha1').update(JSON.stringify(stops)).digest('hex');
      const hit = await cacheGet(key); if (hit) return send(res, 200, hit);
      const out = { hours: await hoursFor(stops) };
      await cacheSet(key, out, 86400);
      return send(res, 200, out);
    }
    const q = query(req);
    const lat = Number(q.lat), lng = Number(q.lng);
    if (!inJapan(lat, lng)) return fail(res, 400, 'invalid_argument', 'Need a point in Japan (lat, lng).');
    const walk = Math.min(30, Math.max(5, Number(q.walk) || 15));
    const taste = {};
    String(q.taste || '').split(',').forEach(p => { const [k, w] = p.split(':'); if (KINDS[k] && isFinite(+w)) taste[k] = Math.max(-20, Math.min(20, +w)); });
    const exclude = String(q.exclude || '').split(',').filter(x => /^(node|way|relation)\/\d+$/.test(x)).slice(0, 200);
    const places = await nearby(lat, lng, Math.round(walk * 80 / 1.3));
    const ranked = rank(places, { lat, lng, maxWalk: walk, date: ISO.test(q.date || '') ? q.date : '', from: hm(q.from), to: hm(q.to), taste, exclude });
    send(res, 200, { count: places.length, places: ranked.slice(0, 12), source: 'OpenStreetMap contributors, Wikidata' });
  } catch (e) {
    console.error(e);
    fail(res, 502, 'unavailable', 'OpenStreetMap didn\'t answer. Try again in a minute.');
  }
}
