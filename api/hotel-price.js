// Live room prices from the Rakuten Travel API (free key: RAKUTEN_APP_ID + RAKUTEN_ACCESS_KEY).
// /api/hotel-price?q=<hotel name, Japanese works best>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=2[&hotelNo=123]
import { send, fail, query, getJSON, sleep } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';

const BASE = 'https://openapi.rakuten.co.jp/engine/api/Travel';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function walk(o, fn) { if (Array.isArray(o)) o.forEach(x => walk(x, fn)); else if (o && typeof o === 'object') { fn(o); Object.values(o).forEach(x => walk(x, fn)); } }
function creds() { return `applicationId=${encodeURIComponent(process.env.RAKUTEN_APP_ID)}&accessKey=${encodeURIComponent(process.env.RAKUTEN_ACCESS_KEY)}&format=json&formatVersion=2`; }
function headers() { return process.env.PUBLIC_URL ? { Referer: process.env.PUBLIC_URL, Origin: process.env.PUBLIC_URL } : {}; }

export default async function handler(req, res) {
  if (!process.env.RAKUTEN_APP_ID || !process.env.RAKUTEN_ACCESS_KEY) return fail(res, 501, 'not_configured', 'Add RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY to turn on live hotel prices.');
  const q = query(req);
  const name = String(q.q || '').trim().slice(0, 80);
  const { checkin, checkout } = q;
  const adults = Math.min(10, Math.max(1, Number(q.adults) || 2));
  if (!ISO.test(checkin || '') || !ISO.test(checkout || '') || checkout <= checkin) return fail(res, 400, 'invalid_argument', 'Need checkin and checkout dates.');
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400e3);
  const key = `hotel:${q.hotelNo || name}:${checkin}:${checkout}:${adults}`;
  try {
    const hit = await cacheGet(key); if (hit) return send(res, 200, hit);
    let hotelNo = String(q.hotelNo || '').replace(/\D/g, '');
    let hotelName = '';
    if (!hotelNo) {
      if (name.length < 2) return fail(res, 400, 'invalid_argument', 'Need a hotel name.');
      const k = await getJSON(`${BASE}/KeywordHotelSearch/20260731?${creds()}&keyword=${encodeURIComponent(name)}&hits=5`, { headers: headers() });
      if (k.status === 404) return send(res, 200, { found: false, message: 'Rakuten Travel has no hotel matching that name. Try the Japanese name.' });
      if (!k.ok) return fail(res, 502, 'unavailable', (k.json && k.json.error_description) || 'Rakuten keyword search failed.');
      walk(k.json, o => { if (!hotelNo && o.hotelNo) { hotelNo = String(o.hotelNo); hotelName = o.hotelName || ''; } });
      if (!hotelNo) return send(res, 200, { found: false, message: 'No match on Rakuten Travel.' });
      await sleep(1100); // Rakuten allows about 1 request per second
    }
    const v = await getJSON(`${BASE}/VacantHotelSearch/20170426?${creds()}&hotelNo=${hotelNo}&checkinDate=${checkin}&checkoutDate=${checkout}&adultNum=${adults}&searchPattern=1&hits=30&sort=%2BroomCharge`, { headers: headers() });
    if (v.status === 404) {
      const out = { found: true, available: false, hotelNo, hotelName, nights, checkedAt: Date.now(), message: 'No rooms listed on Rakuten Travel for these dates (sold out, or not on sale yet).' };
      await cacheSet(key, out, 3 * 3600); return send(res, 200, out);
    }
    if (!v.ok) return fail(res, 502, 'unavailable', (v.json && v.json.error_description) || 'Rakuten vacancy search failed.');
    const plans = []; let info = {};
    walk(v.json, o => {
      if (o.hotelBasicInfo) info = o.hotelBasicInfo;
      if (o.hotelNo && o.hotelName && !info.hotelName) info = o;
      if (o.roomInfo && Array.isArray(o.roomInfo)) {
        let basic = {}, charge = null;
        o.roomInfo.forEach(x => { if (x.roomBasicInfo) basic = x.roomBasicInfo; if (x.dailyCharge) charge = x.dailyCharge; });
        if (charge && charge.total) plans.push({ plan: basic.planName || '', room: basic.roomName || '', firstNight: charge.total, dinner: basic.withDinnerFlag === 1, breakfast: basic.withBreakfastFlag === 1, url: basic.reserveUrl || '' });
      }
    });
    if (!plans.length) walk(v.json, o => { if (o.dailyCharge && o.dailyCharge.total) plans.push({ plan: '', room: '', firstNight: o.dailyCharge.total }); });
    plans.sort((a, b) => a.firstNight - b.firstNight);
    const cheapest = plans[0];
    const out = {
      found: true, available: !!cheapest, hotelNo, nights, adults, checkedAt: Date.now(),
      hotelName: info.hotelName || hotelName,
      firstNight: cheapest ? cheapest.firstNight : null,
      estimateTotal: cheapest ? cheapest.firstNight * nights : null,
      planListUrl: info.planListUrl || info.hotelInformationUrl || '',
      plans: plans.slice(0, 5),
      note: 'Rakuten returns the first night\'s price; the total assumes every night costs the same. Taxes and service are included; local accommodation tax may be extra.'
    };
    await cacheSet(key, out, 6 * 3600);
    send(res, 200, out);
  } catch (e) { console.error(e); fail(res, 502, 'unavailable', 'Hotel price lookup failed.'); }
}
