// Walking time between consecutive stops, from the FOSSGIS OSRM foot router (OpenStreetMap, no key).
// /api/walk?pts=lng,lat;lng,lat;...   (2-12 points)  -> { legs: [{ minutes, km }] }
import { send, fail, query, getJSON, UA } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';

export default async function handler(req, res) {
  const raw = String(query(req).pts || '');
  const pts = raw.split(';').map(s => s.split(',').map(Number));
  if (pts.length < 2 || pts.length > 12 || pts.some(p => p.length !== 2 || !p.every(isFinite))) return fail(res, 400, 'invalid_argument', 'Need 2-12 points as lng,lat;lng,lat');
  const norm = pts.map(([x, y]) => `${x.toFixed(5)},${y.toFixed(5)}`).join(';');
  const key = 'walk:' + norm;
  try {
    const hit = await cacheGet(key); if (hit) return send(res, 200, hit);
    const r = await getJSON(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${norm}?overview=false&steps=false`, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok || !r.json || r.json.code !== 'Ok' || !r.json.routes || !r.json.routes[0]) return fail(res, 502, 'unavailable', 'Walking router unavailable.');
    const out = { legs: r.json.routes[0].legs.map(l => ({ minutes: Math.round(l.duration / 60), km: Math.round(l.distance / 100) / 10 })) };
    await cacheSet(key, out, 30 * 86400);
    send(res, 200, out);
  } catch (e) { console.error(e); fail(res, 502, 'unavailable', 'Walking lookup failed.'); }
}
