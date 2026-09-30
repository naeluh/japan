// Discovery from open data: OpenStreetMap (Overpass API) for places, Wikidata for founding years, heritage and fame.
// The uniqueness score is a heuristic: old, designated, rare-here and little-known beats famous.
import { getJSON, UA } from './http.js';
import { cacheGet, cacheSet } from './store.js';
import { openState } from './hours.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// kind -> [label, base weight]. Small, specific, old things score above the big temples everyone visits.
export const KINDS = {
  bathhouse: ['Bathhouse', 12], stationery: ['Stationery', 10], craft: ['Craft workshop', 10], antiques: ['Antiques', 8],
  tea: ['Tea shop', 8], sweets: ['Sweets shop', 6], books: ['Bookshop', 6], museum: ['Museum', 8], gallery: ['Gallery', 6],
  garden: ['Garden', 6], historic: ['Historic site', 8], temple: ['Temple', 4], shrine: ['Shrine', 4], other: ['Place', 2]
};

export function classify(t) {
  if (t.amenity === 'public_bath') return 'bathhouse';
  if (t.shop === 'stationery') return 'stationery';
  if (t.craft || t.shop === 'craft') return 'craft';
  if (t.shop === 'antiques') return 'antiques';
  if (t.shop === 'tea') return 'tea';
  if (t.shop === 'confectionery') return 'sweets';
  if (t.shop === 'books') return 'books';
  if (t.tourism === 'museum') return 'museum';
  if (t.tourism === 'gallery' || t.shop === 'art') return 'gallery';
  if (t.leisure === 'garden') return 'garden';
  if (t.amenity === 'place_of_worship') return t.religion === 'shinto' ? 'shrine' : 'temple';
  if (t.historic) return 'historic';
  return 'other';
}

export function overpassQuery(lat, lng, r) {
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:25];(
nwr${a}["amenity"="public_bath"];
nwr${a}["shop"~"^(stationery|craft|antiques|tea|books|art|confectionery)$"]["name"];
nwr${a}["craft"]["name"];
nwr${a}["tourism"~"^(museum|gallery)$"]["name"];
nwr${a}["leisure"="garden"]["name"];
nwr${a}["historic"]["name"]["historic"!~"^(memorial|wayside_shrine|boundary_stone|milestone|wayside_cross)$"];
nwr${a}["amenity"="place_of_worship"]["name"]["heritage"];
nwr${a}["amenity"="place_of_worship"]["name"]["wikidata"];
nwr${a}["heritage"]["name"];
);out center tags 150;`;
}

async function overpass(q) {
  const r = await getJSON(OVERPASS, { method: 'POST', headers: { 'User-Agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }, 28000);
  if (!r.ok || !r.json || !Array.isArray(r.json.elements)) throw new Error('Overpass unavailable (' + r.status + ')');
  return r.json.elements;
}

export function yearOf(v) { const m = /^[+-]?(\d{3,4})/.exec(String(v || '').trim()); return m ? Number(m[1]) : null; }

async function wikidata(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(i, i + 50).join('|')}&props=claims|sitelinks|labels&languages=en&format=json`;
    const r = await getJSON(u, { headers: { 'User-Agent': UA } }, 12000);
    if (!r.ok || !r.json || !r.json.entities) continue;
    for (const [id, e] of Object.entries(r.json.entities)) {
      const c = e.claims || {};
      const val = (p) => (c[p] || []).map(x => x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value).filter(Boolean);
      out[id] = {
        year: yearOf((val('P571')[0] || {}).time),
        designations: val('P1435').map(v => v.id).filter(Boolean),
        sitelinks: Object.keys(e.sitelinks || {}).length,
        wikipedia: (e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title) || '',
        label: (e.labels && e.labels.en && e.labels.en.value) || ''
      };
    }
  }
  return out;
}
async function labels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(i, i + 50).join('|')}&props=labels&languages=en&format=json`, { headers: { 'User-Agent': UA } }, 12000);
    if (r.ok && r.json && r.json.entities) for (const [id, e] of Object.entries(r.json.entities)) out[id] = (e.labels && e.labels.en && e.labels.en.value) || '';
  }
  return out;
}

/* Places near a point with their open-data facts (cached a week). */
export async function nearby(lat, lng, r) {
  lat = Math.round(lat * 1e4) / 1e4; lng = Math.round(lng * 1e4) / 1e4; r = Math.min(2000, Math.max(200, Math.round(r / 50) * 50));
  const key = `disc:${lat},${lng}:${r}`;
  const hit = await cacheGet(key); if (hit) return hit;
  const els = await overpass(overpassQuery(lat, lng, r));
  const seen = new Set();
  const places = els.map(e => {
    const t = e.tags || {}; const c = e.center || e;
    return { osm: e.type + '/' + e.id, tags: t, lat: c.lat, lng: c.lon };
  }).filter(p => p.tags.name && isFinite(p.lat) && isFinite(p.lng) && !seen.has(p.tags.name) && seen.add(p.tags.name));
  const qids = [...new Set(places.map(p => p.tags.wikidata).filter(q => /^Q\d+$/.test(q || '')))].slice(0, 100);
  const wd = qids.length ? await wikidata(qids) : {};
  const desIds = [...new Set(Object.values(wd).flatMap(w => w.designations))].slice(0, 100);
  const desLabels = desIds.length ? await labels(desIds) : {};
  const out = places.map(p => {
    const t = p.tags, w = wd[t.wikidata] || null;
    return {
      osm: p.osm, lat: p.lat, lng: p.lng, kind: classify(t),
      name: t['name:en'] || (w && w.label) || t.name, nameJa: t.name,
      year: yearOf(t.start_date) || (w && w.year) || null,
      heritage: [t['heritage:operator'] === 'whc' || (w && w.designations.includes('Q9259')) ? 'UNESCO World Heritage' : '',
        ...(w ? w.designations.filter(d => d !== 'Q9259').map(d => desLabels[d]).filter(Boolean) : []),
        t.heritage && !w ? 'Heritage site' : ''].filter(Boolean).slice(0, 2),
      sitelinks: w ? w.sitelinks : null, wikipedia: w && w.wikipedia ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(w.wikipedia.replace(/ /g, '_')) : '',
      attraction: t.tourism === 'attraction', hours: t.opening_hours || '', website: t.website || t['contact:website'] || '',
      wikidata: t.wikidata || ''
    };
  });
  await cacheSet(key, out, 7 * 86400);
  return out;
}

export function distanceM(a, b) {
  const R = 6371e3, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// ponytail: straight line x 1.3 at 80 m/min; the timeline's real foot routing replaces it once the stop is added.
export const walkMinutes = (m) => Math.max(1, Math.round(m * 1.3 / 80));

/* 0-100 plus the reasons, highest first. `taste` is {kind: weight}. */
export function score(places, { taste = {}, now = new Date().getUTCFullYear() } = {}) {
  const counts = {}; places.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
  return places.map(p => {
    const reasons = []; let s = 0;
    const years = p.year ? now - p.year : 0;
    if (years >= 30) { s += Math.min(35, 12 + 23 * Math.log(years / 30) / Math.log(20)); reasons.push('Since ' + p.year); }
    if (p.heritage.length) { s += p.heritage.some(h => h.startsWith('UNESCO')) ? 25 : 20; reasons.push(p.heritage[0]); }
    const [label, base] = KINDS[p.kind] || KINDS.other;
    s += base;
    const share = counts[p.kind] / places.length;
    s += 15 * (1 - share);
    if (counts[p.kind] === 1 && places.length > 5) reasons.push('Only ' + label.toLowerCase() + ' nearby');
    if (p.sitelinks == null) s += 5;
    else if (p.sitelinks <= 5) { s += 8; reasons.push('Little-known'); }
    else if (p.sitelinks <= 20) s += 4;
    else if (p.sitelinks > 40) s -= 5;
    if (p.attraction) s -= 4;
    const tw = Number(taste[p.kind]) || 0;
    if (tw) { s += Math.max(-10, Math.min(10, tw * 1.5)); if (tw > 0) reasons.push('You like ' + label.toLowerCase() + 's'); }
    return { ...p, label, score: Math.max(0, Math.min(100, Math.round(s))), reasons };
  }).sort((a, b) => b.score - a.score);
}

/* Filter + rank for one request: walking range, visit window, dismissed places. */
export function rank(places, { lat, lng, maxWalk = 15, date = '', from = null, to = null, taste = {}, exclude = [] }) {
  const ex = new Set(exclude);
  const near = places.filter(p => !ex.has(p.osm)).map(p => ({ ...p, walkMin: walkMinutes(distanceM({ lat, lng }, p)) })).filter(p => p.walkMin <= maxWalk);
  return score(near, { taste }).map(p => ({ ...p, open: date && from != null ? openState(p.hours, date, from + p.walkMin, to) : 'unknown' }))
    .filter(p => p.open !== 'closed');
}

/* Opening-hours clash check: for each stop, the nearest OSM feature with opening_hours (by name, else within 30 m). */
export async function hoursFor(stops) {
  const q = `[out:json][timeout:25];(${stops.map(s => `nwr(around:80,${s.lat},${s.lng})["opening_hours"];`).join('')});out center tags 400;`;
  const els = (await overpass(q)).map(e => ({ tags: e.tags || {}, lat: (e.center || e).lat, lng: (e.center || e).lon }));
  const norm = (x) => String(x || '').toLowerCase().replace(/[\s\-・'’().,]/g, '');
  const out = {};
  for (const s of stops) {
    const cands = els.map(e => ({ e, d: distanceM(s, e) })).filter(x => x.d <= 80);
    const n = norm(s.name);
    const byName = n.length >= 3 && cands.find(({ e }) => [e.tags.name, e.tags['name:en'], e.tags['name:ja']].map(norm).some(v => v && (v.includes(n) || n.includes(v))));
    const pick = byName || cands.filter(x => x.d <= 30).sort((a, b) => a.d - b.d)[0];
    if (!pick) { out[s.id] = { state: 'unknown' }; continue; }
    const hours = pick.e.tags.opening_hours;
    out[s.id] = { state: openState(hours, s.date, s.from, s.to), hours, matched: pick.e.tags['name:en'] || pick.e.tags.name || '' };
  }
  return out;
}
