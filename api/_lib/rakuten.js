// Rakuten Travel API (free key: RAKUTEN_APP_ID + RAKUTEN_ACCESS_KEY). Every Rakuten call goes through here.
// Rakuten quotes the FIRST NIGHT only; stay totals are that price times the nights, and are labeled estimates.
import { getJSON, sleep } from './http.js';
import { cacheGet, cacheSet } from './store.js';

const BASE = 'https://openapi.rakuten.co.jp/engine/api/Travel';
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const rakutenReady = () => !!(process.env.RAKUTEN_APP_ID && process.env.RAKUTEN_ACCESS_KEY);
export const NOTE = 'Rakuten returns the first night\'s price; the total assumes every night costs the same. Taxes and service are included; local accommodation tax may be extra.';

export class RakutenError extends Error {}

function walk(o, fn) { if (Array.isArray(o)) o.forEach(x => walk(x, fn)); else if (o && typeof o === 'object') { fn(o); Object.values(o).forEach(x => walk(x, fn)); } }
function creds() { return `applicationId=${encodeURIComponent(process.env.RAKUTEN_APP_ID)}&accessKey=${encodeURIComponent(process.env.RAKUTEN_ACCESS_KEY)}&format=json&formatVersion=2`; }
function headers() { return process.env.PUBLIC_URL ? { Referer: process.env.PUBLIC_URL, Origin: process.env.PUBLIC_URL } : {}; }
export function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// Rakuten allows about one request per second. ponytail: per-instance gate, a shared lock if several instances ever run at once.
let last = 0;
async function call(path, params) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  return getJSON(`${BASE}/${path}?${creds()}&${params}`, { headers: headers() });
}

/* Plans inside one hotel's vacancy result: cheapest first, plus the cheapest with dinner and breakfast and the cheapest without dinner. */
export function summarizePlans(json) {
  const plans = []; let info = {};
  walk(json, o => {
    if (o.hotelBasicInfo) info = o.hotelBasicInfo;
    if (o.roomInfo && Array.isArray(o.roomInfo)) {
      let basic = {}, charge = null;
      o.roomInfo.forEach(x => { if (x.roomBasicInfo) basic = x.roomBasicInfo; if (x.dailyCharge) charge = x.dailyCharge; });
      if (charge && charge.total) plans.push({ plan: basic.planName || '', room: basic.roomName || '', firstNight: charge.total, dinner: basic.withDinnerFlag === 1, breakfast: basic.withBreakfastFlag === 1, url: basic.reserveUrl || '' });
    }
  });
  plans.sort((a, b) => a.firstNight - b.firstNight);
  const pick = (f) => { const p = plans.find(f); return p ? { firstNight: p.firstNight, plan: p.plan, breakfast: p.breakfast } : null; };
  return {
    info, plans,
    meals: { withMeals: pick(p => p.dinner && p.breakfast), roomOnly: pick(p => !p.dinner) }
  };
}

export async function findHotel(name) {
  const k = await call('KeywordHotelSearch/20260731', `keyword=${encodeURIComponent(name)}&hits=5`);
  if (k.status === 404) return null;
  if (!k.ok) throw new RakutenError((k.json && k.json.error_description) || 'Rakuten keyword search failed.');
  let hit = null;
  walk(k.json, o => { if (!hit && o.hotelNo) hit = { hotelNo: String(o.hotelNo), hotelName: o.hotelName || '' }; });
  return hit;
}

/* One stay's price. Same result shape /api/hotel-price has always returned, plus `meals`. */
export async function priceStay({ name = '', hotelNo = '', checkin, checkout, adults = 2, fresh = false }) {
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400e3);
  hotelNo = String(hotelNo || '').replace(/\D/g, '');
  const key = `hotel:${hotelNo || name}:${checkin}:${checkout}:${adults}`;
  if (!fresh) { const hit = await cacheGet(key); if (hit) return hit; }
  let hotelName = '';
  if (!hotelNo) {
    const h = await findHotel(name);
    if (!h) return { found: false, message: 'Rakuten Travel has no hotel matching that name. Try the Japanese name.' };
    ({ hotelNo, hotelName } = h);
  }
  const v = await call('VacantHotelSearch/20170426', `hotelNo=${hotelNo}&checkinDate=${checkin}&checkoutDate=${checkout}&adultNum=${adults}&searchPattern=1&hits=30&sort=%2BroomCharge`);
  if (v.status === 404) {
    const out = { found: true, available: false, hotelNo, hotelName, nights, checkedAt: Date.now(), message: 'No rooms listed on Rakuten Travel for these dates (sold out, or not on sale yet).' };
    await cacheSet(key, out, 3 * 3600); return out;
  }
  if (!v.ok) throw new RakutenError((v.json && v.json.error_description) || 'Rakuten vacancy search failed.');
  const { info, plans, meals } = summarizePlans(v.json);
  const cheapest = plans[0];
  const out = {
    found: true, available: !!cheapest, hotelNo, nights, adults, checkedAt: Date.now(),
    hotelName: info.hotelName || hotelName,
    firstNight: cheapest ? cheapest.firstNight : null,
    estimateTotal: cheapest ? cheapest.firstNight * nights : null,
    planListUrl: info.planListUrl || info.hotelInformationUrl || '',
    plans: plans.slice(0, 5), meals, note: NOTE
  };
  await cacheSet(key, out, 6 * 3600);
  return out;
}

/* Hotels with rooms near a point, for the assistant. */
export async function searchArea({ lat, lng, radiusKm = 1, checkin, checkout, adults = 2, maxCharge = 0, squeeze = [] }) {
  const r = Math.min(3, Math.max(0.1, Math.round(Number(radiusKm) * 10) / 10));
  const sq = squeeze.filter(s => ['kinen', 'internet', 'daiyoku', 'onsen', 'breakfast', 'dinner'].includes(s)).join(',');
  const params = `latitude=${lat}&longitude=${lng}&searchRadius=${r}&datumType=1&checkinDate=${checkin}&checkoutDate=${checkout}&adultNum=${adults}&hits=15&sort=%2BroomCharge&responseType=middle`
    + (maxCharge > 0 ? `&maxCharge=${Math.round(maxCharge)}` : '') + (sq ? `&squeezeCondition=${sq}` : '');
  const key = 'area:' + params;
  const hit = await cacheGet(key); if (hit) return hit;
  const v = await call('VacantHotelSearch/20170426', params);
  if (v.status === 404) { await cacheSet(key, [], 3 * 3600); return []; }
  if (!v.ok) throw new RakutenError((v.json && v.json.error_description) || 'Rakuten area search failed.');
  const out = ((v.json && v.json.hotels) || []).map(h => {
    const { info, plans } = summarizePlans(h);
    return {
      hotelNo: String(info.hotelNo || ''), name: info.hotelName || '', lat: info.latitude, lng: info.longitude,
      station: info.nearestStation || '', access: info.access || '', review: info.reviewAverage || null,
      special: String(info.hotelSpecial || '').slice(0, 200), url: info.planListUrl || info.hotelInformationUrl || '',
      plans: plans.slice(0, 3).map(p => ({ plan: p.plan, room: p.room, firstNight: p.firstNight, dinner: p.dinner, breakfast: p.breakfast }))
    };
  }).filter(h => h.name);
  await cacheSet(key, out, 6 * 3600);
  return out;
}
