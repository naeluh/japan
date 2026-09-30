// Live room prices from the Rakuten Travel API (free key: RAKUTEN_APP_ID + RAKUTEN_ACCESS_KEY).
// /api/hotel-price?q=<hotel name, Japanese works best>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&adults=2[&hotelNo=123]
import { send, fail, query } from './_lib/http.js';
import { priceStay, rakutenReady, RakutenError, ISO } from './_lib/rakuten.js';

export default async function handler(req, res) {
  if (!rakutenReady()) return fail(res, 501, 'not_configured', 'Add RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY to turn on live hotel prices.');
  const q = query(req);
  const name = String(q.q || '').trim().slice(0, 80);
  const { checkin, checkout } = q;
  const adults = Math.min(10, Math.max(1, Number(q.adults) || 2));
  if (!ISO.test(checkin || '') || !ISO.test(checkout || '') || checkout <= checkin) return fail(res, 400, 'invalid_argument', 'Need checkin and checkout dates.');
  if (!q.hotelNo && name.length < 2) return fail(res, 400, 'invalid_argument', 'Need a hotel name.');
  try {
    send(res, 200, await priceStay({ name, hotelNo: q.hotelNo, checkin, checkout, adults }));
  } catch (e) {
    console.error(e);
    fail(res, 502, 'unavailable', e instanceof RakutenError ? e.message : 'Hotel price lookup failed.');
  }
}
