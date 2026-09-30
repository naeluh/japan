// Live USD -> JPY rate. Frankfurter (ECB reference rates, no key), falling back to open.er-api.com.
import { send, fail, getJSON } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';

export default async function handler(req, res) {
  try {
    const hit = await cacheGet('fx:usdjpy');
    if (hit) return send(res, 200, { ...hit, cached: true });
    let out = null;
    const a = await getJSON('https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY');
    if (a.ok && a.json && a.json.rates && a.json.rates.JPY) out = { rate: a.json.rates.JPY, date: a.json.date, source: 'European Central Bank via Frankfurter' };
    if (!out) {
      const b = await getJSON('https://open.er-api.com/v6/latest/USD');
      if (b.ok && b.json && b.json.rates && b.json.rates.JPY) out = { rate: b.json.rates.JPY, date: (b.json.time_last_update_utc || '').slice(5, 16), source: 'ExchangeRate-API (open access)' };
    }
    if (!out) return fail(res, 502, 'unavailable', 'No exchange-rate source answered.');
    await cacheSet('fx:usdjpy', out, 6 * 3600);
    send(res, 200, out);
  } catch (e) { console.error(e); fail(res, 502, 'unavailable', 'Exchange-rate lookup failed.'); }
}
