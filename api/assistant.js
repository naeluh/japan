// The trip assistant: Claude with tools that call this site's own data and lookups.
// POST { messages: [{ role: 'user'|'assistant', text }] }             -> { text, trace, model }
// POST { mode: 'receipt', image: <base64 JPEG>, mediaType }            -> { receipt: { amount, currency, merchant, category, date } }
// Needs the edit key (it spends API credit) and ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { send, fail, access, body } from './_lib/http.js';
import { readAll, cacheGet } from './_lib/store.js';
import { priceStay, searchArea, rakutenReady, addDays, ISO } from './_lib/rakuten.js';
import { nearby, rank } from './_lib/osm.js';
import { walkLegs } from './walk.js';
import { geocode } from './geocode.js';
import { TRIP, TRAVELERS, CHAPTERS, GROUPS, GROUP_DATE, CH_CITY, groupCh } from '../public/trip.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const BETAS = ['server-side-fallback-2026-07-01'];
const BUDGET_MS = 240e3, MAX_ROUNDS = 8;
const num = (v, d) => (isFinite(+v) && v !== null && v !== '' ? +v : d);
const inJapan = (lat, lng) => lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;

const SYSTEM = `You are the trip assistant inside a shared planner for ${TRAVELERS.join(' and ')}'s trip to Japan, ${TRIP.start} to ${TRIP.end} (two adults).
Use the tools for every fact about the plan, prices, places, opening hours and walking times; never invent a price, an opening time or a place.
Prices: Rakuten quotes the first night only, so stay totals are estimates; say "live" only for figures a tool just returned. Show yen, with dollars in parentheses at the plan's exchange rate.
Name your sources with the links the tools return (Rakuten, OpenStreetMap, Wikidata, the hotel's own site). Booking.com, Expedia, Agoda, Google Hotels, Ikyu and Jalan have no open data here; mention them only as places to compare by hand, and remind them small ryokan are often cheapest booked direct.
For savings or swaps, give concrete changes (which night, which item, how much, what it costs in time) using the plan, price-watch results and the fare table; say which numbers are estimates.
Write plainly and briefly: a one-line answer, then up to five options as a short list. No emoji. No tables.`;

const TOOLS = [
  { name: 'get_plan', description: 'The whole trip: days with items (times, places, pins, costs, priorities, done/skipped), booking tasks, stays with the nightly price-watch results, budget and exchange rate. Call this first for anything about the plan.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'search_places', description: 'Unusual places near a point from OpenStreetMap and Wikidata, ranked by a uniqueness score (age, heritage status, rarity nearby, how little-known). Optionally checks they are open at a time on a date.', input_schema: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' }, walk_minutes: { type: 'integer', description: '5-30' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM, 24h' } }, required: ['lat', 'lng'], additionalProperties: false } },
  { name: 'search_hotels', description: 'Hotels and ryokan with rooms near a point on Rakuten Travel for given dates, cheapest first, with their cheapest plans (plan names show private baths, open-air baths, meals). Filters: max yen per night for the room, onsen, big public bath, breakfast, dinner.', input_schema: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' }, radius_km: { type: 'number', description: '0.1-3' }, checkin: { type: 'string', description: 'YYYY-MM-DD' }, nights: { type: 'integer' }, max_yen_per_night: { type: 'integer' }, onsen: { type: 'boolean' }, public_bath: { type: 'boolean' }, breakfast: { type: 'boolean' }, dinner: { type: 'boolean' } }, required: ['lat', 'lng', 'checkin', 'nights'], additionalProperties: false } },
  { name: 'hotel_price', description: 'Live Rakuten price for one named hotel (Japanese name works best) for a check-in date and nights, including the cheapest plan with dinner and breakfast and the cheapest without dinner.', input_schema: { type: 'object', properties: { name: { type: 'string' }, checkin: { type: 'string', description: 'YYYY-MM-DD' }, nights: { type: 'integer' } }, required: ['name', 'checkin', 'nights'], additionalProperties: false } },
  { name: 'walking_time', description: 'Walking minutes and kilometres between two points (OpenStreetMap foot routing).', input_schema: { type: 'object', properties: { from_lat: { type: 'number' }, from_lng: { type: 'number' }, to_lat: { type: 'number' }, to_lng: { type: 'number' } }, required: ['from_lat', 'from_lng', 'to_lat', 'to_lng'], additionalProperties: false } },
  { name: 'find_place', description: 'Coordinates for a place name in Japan (OpenStreetMap), e.g. a neighbourhood like Gion or a station.', input_schema: { type: 'object', properties: { query: { type: 'string' }, near_lat: { type: 'number' }, near_lng: { type: 'number' } }, required: ['query'], additionalProperties: false } },
  { name: 'fare_table', description: 'The train and transport fares the travelers keep up to date (there is no live fare API), for comparing routes and passes.', input_schema: { type: 'object', properties: {}, additionalProperties: false } }
];

async function loadDocs() {
  const { docs } = await readAll();
  const items = Object.entries(docs).filter(([p]) => p.startsWith('items/')).map(([p, v]) => ({ id: p.slice(6), ...v }));
  return { docs, items };
}

const RUN = {
  async get_plan() {
    const { docs, items } = await loadDocs();
    const fx = await cacheGet('fx:usdjpy').catch(() => null);
    const s = docs['settings/budget'] || {};
    const rate = s.useLive !== false && fx && fx.rate ? fx.rate : (s.rate || 155);
    const slim = (i) => ({ id: i.id, time: i.start ? i.start + (i.end ? '-' + i.end : '') : (i.time || ''), title: i.title, place: i.place || undefined,
      pin: typeof i.lat === 'number' ? [i.lat, i.lng] : undefined, cost: typeof i.cost === 'number' ? i.cost + ' ' + (i.cur || 'JPY') + (i.paid ? ' paid' : ' est.') : undefined,
      category: i.cat || undefined, priority: i.priority, done: i.done || undefined, skipped: i.disabled || undefined, transit: i.kind === 'travel' || undefined,
      nights: i.nights || undefined, sale_opens_jst: i.opens || undefined });
    const byTime = (a, b) => (a.start || '99').localeCompare(b.start || '99') || (a.sort || 0) - (b.sort || 0);
    return {
      travelers: TRAVELERS, dates: [TRIP.start, TRIP.end], yen_per_dollar: Math.round(rate * 100) / 100,
      budget_usd: s.cats || null,
      chapters: CHAPTERS.filter(c => c.station).map(c => ({ name: c.name, city: c.station, dates: c.dates, base: c.place })),
      booking_tasks: GROUPS.filter(g => g.ch === 'book').map(g => ({ when: g.when, items: items.filter(i => i.group === g.id).sort(byTime).map(slim) })),
      days: GROUPS.filter(g => GROUP_DATE[g.id]).map(g => ({ date: GROUP_DATE[g.id], title: g.what, city: CH_CITY[groupCh(g.id)], items: items.filter(i => i.group === g.id).sort(byTime).map(slim) })),
      price_watch: items.filter(i => docs['watch/' + i.id]).map(i => { const w = docs['watch/' + i.id]; return { item: i.id, hotel: w.hotelName, checkin: w.checkin, nights: w.nights, latest: w.latest, lowest: w.low, shift_a_day: w.flex, meals: w.meals }; })
    };
  },
  async search_places(a) {
    const lat = num(a.lat), lng = num(a.lng);
    if (!inJapan(lat, lng)) throw new Error('Point is not in Japan.');
    const walk = Math.min(30, Math.max(5, num(a.walk_minutes, 15)));
    const hm = /^(\d{1,2}):(\d{2})$/.exec(a.time || ''); const from = hm ? +hm[1] * 60 + +hm[2] : null;
    const places = await nearby(lat, lng, Math.round(walk * 80 / 1.3));
    return rank(places, { lat, lng, maxWalk: walk, date: ISO.test(a.date || '') ? a.date : '', from, to: from != null ? from + 60 : null }).slice(0, 8)
      .map(p => ({ name: p.name, japanese: p.nameJa, kind: p.label, score: p.score, reasons: p.reasons, walk_min: p.walkMin, open_then: p.open, hours: p.hours || undefined, lat: p.lat, lng: p.lng, link: p.website || p.wikipedia || 'https://www.openstreetmap.org/' + p.osm }));
  },
  async search_hotels(a) {
    if (!rakutenReady()) throw new Error('Rakuten is not configured on this site.');
    const lat = num(a.lat), lng = num(a.lng), nights = Math.min(14, Math.max(1, num(a.nights, 1)));
    if (!inJapan(lat, lng) || !ISO.test(a.checkin || '')) throw new Error('Need a point in Japan and a YYYY-MM-DD check-in.');
    const squeeze = [a.onsen && 'onsen', a.public_bath && 'daiyoku', a.breakfast && 'breakfast', a.dinner && 'dinner'].filter(Boolean);
    const hotels = await searchArea({ lat, lng, radiusKm: num(a.radius_km, 1), checkin: a.checkin, checkout: addDays(a.checkin, nights), adults: TRIP.adults, maxCharge: num(a.max_yen_per_night, 0), squeeze });
    return { source: 'Rakuten Travel, live, first-night prices', nights, hotels };
  },
  async hotel_price(a) {
    if (!rakutenReady()) throw new Error('Rakuten is not configured on this site.');
    if (!ISO.test(a.checkin || '')) throw new Error('Need a YYYY-MM-DD check-in.');
    const nights = Math.min(14, Math.max(1, num(a.nights, 1)));
    return priceStay({ name: String(a.name || '').slice(0, 80), checkin: a.checkin, checkout: addDays(a.checkin, nights), adults: TRIP.adults });
  },
  async walking_time(a) {
    const r = await walkLegs([[num(a.from_lng), num(a.from_lat)], [num(a.to_lng), num(a.to_lat)]]);
    if (!r) throw new Error('The walking router is down.');
    return { ...r.legs[0], source: 'OpenStreetMap foot routing' };
  },
  async find_place(a) {
    const near = isFinite(+a.near_lat) && isFinite(+a.near_lng) ? a.near_lat + ',' + a.near_lng : '';
    return (await geocode(String(a.query || '').slice(0, 160), near)) || { found: false };
  },
  async fare_table() {
    const { docs, items } = await loadDocs();
    const f = docs['settings/fares'];
    if (f && Array.isArray(f.rows) && f.rows.length) return { rows: f.rows, note: 'Kept by hand; per person unless the note says otherwise.' };
    return { rows: items.filter(i => i.cat === 'transit' && typeof i.cost === 'number' && i.cost > 0).map(i => ({ leg: i.title, yen_for_both: i.cur === 'USD' ? undefined : i.cost, usd_for_both: i.cur === 'USD' ? i.cost : undefined })), note: 'No fare table yet; these are the transit costs already in the plan (for both).' };
  }
};

function traceOf(name, input, out) {
  const n = Array.isArray(out) ? out.length : out && Array.isArray(out.hotels) ? out.hotels.length : null;
  const labels = { get_plan: 'Read the plan', search_places: 'Searched OpenStreetMap and Wikidata', search_hotels: 'Searched Rakuten Travel', hotel_price: 'Checked a Rakuten price', walking_time: 'Measured a walk', find_place: 'Looked up a place', fare_table: 'Read the fare table' };
  return { tool: name, label: labels[name] + (n != null ? ` (${n} results)` : '') + (input && (input.name || input.query) ? ': ' + (input.name || input.query) : '') };
}

async function chat(client, history) {
  const messages = history.map(m => ({ role: m.role, content: m.text }));
  const trace = []; const t0 = Date.now(); let model = MODEL;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (Date.now() - t0 > BUDGET_MS) break;
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, betas: BETAS, fallbacks: 'default', output_config: { effort: 'medium' },
      system: SYSTEM, tools: TOOLS, messages
    });
    model = r.model;
    if (r.stop_reason === 'refusal') return { text: 'I can\'t help with that one. Try asking it another way.', trace, model };
    messages.push({ role: 'assistant', content: r.content }); // unchanged, so thinking blocks stay valid
    if (r.stop_reason === 'pause_turn') continue;
    const uses = r.content.filter(b => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !uses.length) {
      const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();
      return { text: text || (r.stop_reason === 'max_tokens' ? 'That answer ran too long. Ask for less at once.' : 'No answer came back. Try again.'), trace, model };
    }
    const results = await Promise.all(uses.map(async (u) => {
      try {
        const fn = RUN[u.name]; if (!fn) throw new Error('Unknown tool');
        const out = await fn(u.input || {});
        trace.push(traceOf(u.name, u.input, out));
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 60000) };
      } catch (e) { trace.push({ tool: u.name, label: 'Failed: ' + e.message }); return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + e.message, is_error: true }; }
    }));
    messages.push({ role: 'user', content: results });
  }
  return { text: 'That took too many steps. Try a narrower question.', trace, model };
}

const RECEIPT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['amount', 'currency', 'merchant', 'category', 'date', 'readable'],
  properties: {
    amount: { type: 'number', description: 'Total paid, tax included' }, currency: { type: 'string', enum: ['JPY', 'USD'] },
    merchant: { type: 'string' }, category: { type: 'string', enum: ['food', 'transit', 'tickets', 'lodging', 'other'] },
    date: { type: 'string', description: 'YYYY-MM-DD, or empty' }, readable: { type: 'boolean', description: 'false if the image is not a legible receipt' }
  }
};
async function readReceipt(client, image, mediaType) {
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 2000, betas: BETAS, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
      { type: 'text', text: 'Read this receipt from a trip in Japan. Give the total actually paid (tax included), its currency, the shop or merchant name in English if printed (else romanized), a budget category, and the date.' }
    ] }]
  });
  if (r.stop_reason === 'refusal') throw new Error('The receipt couldn\'t be read.');
  const t = r.content.find(b => b.type === 'text');
  return JSON.parse(t ? t.text : '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'invalid_argument', 'Method not allowed.');
  if (!access(req).canEdit) return fail(res, 403, 'not_granted', 'The assistant needs the edit link.');
  if (!process.env.ANTHROPIC_API_KEY) return fail(res, 501, 'not_configured', 'Add ANTHROPIC_API_KEY in the Vercel settings to turn on the assistant.');
  let b; try { b = await body(req); } catch { return fail(res, 400, 'invalid_argument', 'Bad request body.'); }
  const client = new Anthropic();
  try {
    if (b.mode === 'receipt') {
      const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(b.mediaType) ? b.mediaType : 'image/jpeg';
      const image = String(b.image || '');
      if (!image || image.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return fail(res, 400, 'invalid_argument', 'Send a JPEG under 3 MB.');
      return send(res, 200, { receipt: await readReceipt(client, image, mediaType) });
    }
    const history = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .map(m => ({ role: m.role, text: m.text.slice(0, 4000) }));
    while (history.length && history[0].role !== 'user') history.shift();
    if (!history.length || history[history.length - 1].role !== 'user') return fail(res, 400, 'invalid_argument', 'Ask a question.');
    send(res, 200, await chat(client, history));
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return fail(res, 502, 'unavailable', 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.');
    if (e instanceof Anthropic.RateLimitError) return fail(res, 503, 'unavailable', 'The assistant is busy right now. Try again in a minute.');
    if (e instanceof Anthropic.APIError) return fail(res, 502, 'unavailable', 'The assistant had a problem (' + (e.status || 'network') + '). Try again.');
    fail(res, 502, 'unavailable', 'The assistant didn\'t answer. Try again.');
  }
}
