// Daylight and weather for a place and a date range, from Open-Meteo (no key).
// Within 15 days: the real forecast. Further out: the same dates in each of the last 3 years.
import { send, fail, query, getJSON } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/store.js';

const DAILY_F = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,weather_code';
const DAILY_H = 'temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function tokyoToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function hm(s) { return typeof s === 'string' ? s.slice(11, 16) : null; }

export default async function handler(req, res) {
  const q = query(req);
  const lat = Math.round(Number(q.lat) * 100) / 100, lng = Math.round(Number(q.lng) * 100) / 100;
  const { start, end } = q;
  if (!isFinite(lat) || !isFinite(lng) || !ISO.test(start || '') || !ISO.test(end || '') || end < start) return fail(res, 400, 'invalid_argument', 'Need lat, lng, start and end (YYYY-MM-DD).');
  const forecast = end <= addDays(tokyoToday(), 15);
  const key = `wx:${forecast ? 'f' : 'h'}:${lat},${lng}:${start}:${end}`;
  try {
    const hit = await cacheGet(key); if (hit) return send(res, 200, hit);
    const base = `latitude=${lat}&longitude=${lng}&timezone=Asia%2FTokyo`;
    const days = {};
    if (forecast) {
      const r = await getJSON(`https://api.open-meteo.com/v1/forecast?${base}&daily=${DAILY_F}&start_date=${start}&end_date=${end}`);
      if (!r.ok || !r.json || !r.json.daily) return fail(res, 502, 'unavailable', 'Forecast unavailable.');
      const d = r.json.daily;
      d.time.forEach((t, i) => { days[t] = { source: 'forecast', tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], rainChance: d.precipitation_probability_max[i], rainMm: d.precipitation_sum[i], sunrise: hm(d.sunrise[i]), sunset: hm(d.sunset[i]), code: d.weather_code[i] }; });
    } else {
      const thisYear = Number(tokyoToday().slice(0, 4));
      const years = [thisYear - 1, thisYear - 2, thisYear - 3];
      const results = [];
      for (const y of years) {
        const s = y + start.slice(4), e = y + end.slice(4);
        const r = await getJSON(`https://archive-api.open-meteo.com/v1/archive?${base}&daily=${DAILY_H}&start_date=${s}&end_date=${e}`);
        if (r.ok && r.json && r.json.daily) results.push({ y, d: r.json.daily });
      }
      if (!results.length) return fail(res, 502, 'unavailable', 'Weather history unavailable.');
      let cur = start;
      for (let i = 0; cur <= end; i++, cur = addDays(cur, 1)) {
        const vals = results.map(({ d }) => ({ tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], p: d.precipitation_sum[i], sr: hm(d.sunrise[i]), ss: hm(d.sunset[i]) })).filter(v => v.tmax != null);
        if (!vals.length) continue;
        const avg = (k) => Math.round(vals.reduce((s, v) => s + v[k], 0) / vals.length * 10) / 10;
        days[cur] = { source: 'history', years: vals.length, tmax: avg('tmax'), tmin: avg('tmin'), rainyYears: vals.filter(v => v.p >= 1).length, sunrise: vals[0].sr, sunset: vals[0].ss };
      }
    }
    const out = { lat, lng, forecast, days };
    await cacheSet(key, out, forecast ? 3 * 3600 : 30 * 86400);
    send(res, 200, out);
  } catch (e) { console.error(e); fail(res, 502, 'unavailable', 'Weather lookup failed.'); }
}
