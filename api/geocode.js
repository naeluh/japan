// Place name -> map pin, from OpenStreetMap Nominatim (no key; 1 request per second, cached).
import { send, fail, query, getJSON, UA } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';

/* Place name -> { found, lat, lng, name }, or null when Nominatim is down. The assistant uses this too. */
export async function geocode(q, near = '') {
  const key = 'geo:' + q.toLowerCase() + '|' + near;
  const hit = await cacheGet(key); if (hit) return hit;
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('limit', '1');
  u.searchParams.set('countrycodes', 'jp'); u.searchParams.set('accept-language', 'en');
  const m = near.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (m) { const la = +m[1], lo = +m[2]; u.searchParams.set('viewbox', `${lo - 0.4},${la + 0.4},${lo + 0.4},${la - 0.4}`); }
  const r = await getJSON(u.href, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok || !Array.isArray(r.json)) return null;
  const f = r.json[0];
  const out = f ? { found: true, lat: Math.round(+f.lat * 1e5) / 1e5, lng: Math.round(+f.lon * 1e5) / 1e5, name: f.display_name } : { found: false };
  await cacheSet(key, out, 30 * 86400);
  return out;
}

export default async function handler(req, res) {
  const q = String(query(req).q || '').trim().slice(0, 160);
  const near = String(query(req).near || '');
  if (q.length < 2) return fail(res, 400, 'invalid_argument', 'Type a place name.');
  try {
    const out = await geocode(q, near);
    if (!out) return fail(res, 502, 'unavailable', 'Geocoder unavailable.');
    send(res, 200, out);
  } catch (e) { console.error(e); fail(res, 502, 'unavailable', 'Geocoding failed.'); }
}
