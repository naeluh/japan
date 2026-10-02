// Trip facts and pure helpers shared by the page (app.js) and the server functions (api/*.js import this file).
export const TRIP = { title: 'Japan, April 2027', start: '2027-04-01', end: '2027-04-14', adults: 2, airport: { name: 'Narita', lat: 35.772, lng: 140.393 } };
// start and end are the booked flights: the route editor warns when the plan's last day moves off TRIP.end.
export const TRAVELERS = ['Kristin', 'Nick'];

/* ---------- Route: cities, nights and days. Stored in settings/route; a database without one uses DEFAULT_ROUTE. ----------
   Nights in a city = its number of days. The fly-home day (home) always comes last, inside the last city.
   Items point at a day id (item.group); an item whose day is gone shows under "Not on a day yet". */
export const BOOK_CHAPTER = { id: 'book', name: 'Book ahead', place: 'Reservations with deadlines', dates: '', station: null };
export const BOOK_GROUPS = [
  { id: 'b-now', ch: 'book', when: 'Now', what: 'Hotels and bags' },
  { id: 'b-march', ch: 'book', when: 'Early March', what: 'About a month out' },
  { id: 'b-feb', ch: 'book', when: 'Feb 4, 5:00 PM Pacific', what: 'Naoshima timed tickets open' },
  { id: 'b-fly', ch: 'book', when: 'Before you fly', what: 'Last details' }
];
export const DEFAULT_ROUTE = {
  stops: [
    { id: 'c1', city: 'Tokyo', area: 'Shibuya', name: 'Neon Tokyo', place: 'Shibuya: Cerulean Tower, then Trunk', lat: 35.66, lng: 139.70,
      days: [{ id: 'd01', what: 'Land and look down on the city' }, { id: 'd02', what: 'Paper, fossils and a river of blossoms' }, { id: 'd03', what: 'Digital worlds and the parasite museum' }] },
    { id: 'c2', city: 'Hakone', name: 'The old mountain road', place: 'Hakone: Matsuzakaya Honten', lat: 35.23, lng: 139.05,
      days: [{ id: 'd04', what: 'Into the mountains' }, { id: 'd05', what: 'The Hakone loop, on foot and by boat' }] },
    { id: 'c3', city: 'Kyoto', name: 'Temples at the edges of the day', place: 'Kyoto: Higashiyama', lat: 35.00, lng: 135.77,
      days: [{ id: 'd06', what: 'A thousand gates at dusk' }, { id: 'd07', what: 'The 6 AM city' }, { id: 'd08', what: 'Bamboo, stone monks and late cherries' }, { id: 'd09', what: 'Nara day trip' }] },
    { id: 'c4', city: 'Naoshima', name: 'The art islands', place: 'Naoshima and Teshima', lat: 34.46, lng: 133.99, island: true,
      days: [{ id: 'd10', what: 'Underground Monet and the yellow pumpkin' }, { id: 'd11', what: 'Sit in the dark, then hear heartbeats' }] },
    { id: 'c5', city: 'Tokyo', area: 'Yanaka', name: 'Old Tokyo and home', place: 'Yanaka and Kuramae', lat: 35.72, lng: 139.77,
      days: [{ id: 'd12', what: 'Leave by sea, sunset steps' }, { id: 'd13', what: 'Last full day' }] }
  ],
  home: { id: 'd14', what: 'Fly home' }
};

/* The trust boundary for settings/route (the page and the price watch both read it). Never mutates its input.
   Ids come in fixed shapes so a stop or day id can't collide with Book ahead ids or the page's element ids. */
const STOP_ID = /^(c\d{1,3}|city-[a-z0-9]{4,20})$/, DAY_ID = /^(d\d{1,3}|day-[a-z0-9]{4,20})$/;
const txt = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const inJapan = (la, lo) => typeof la === 'number' && typeof lo === 'number' && la >= 20 && la <= 46 && lo >= 122 && lo <= 154;
export function cleanRoute(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.stops)) return DEFAULT_ROUTE;
  const seen = new Set(); let total = 0;
  const day = (d) => d && typeof d === 'object' && typeof d.id === 'string' && DAY_ID.test(d.id) && !seen.has(d.id) ? (seen.add(d.id), { id: d.id, what: txt(d.what, 120) }) : null;
  const stops = [];
  for (const s of doc.stops.slice(0, 12)) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !STOP_ID.test(s.id) || seen.has(s.id) || !txt(s.city, 60)) continue;
    if (!Array.isArray(s.days) || s.days.length > 30) continue;
    seen.add(s.id);
    const days = s.days.map(day).filter(Boolean);
    if (!days.length || total + days.length > 90) continue;
    total += days.length;
    const out = { id: s.id, city: txt(s.city, 60), name: txt(s.name, 120), place: txt(s.place, 120), lat: null, lng: null, days };
    if (txt(s.area, 60)) out.area = txt(s.area, 60);
    if (inJapan(s.lat, s.lng)) { out.lat = s.lat; out.lng = s.lng; }
    if (s.island === true) out.island = true;
    stops.push(out);
  }
  if (!stops.length) return DEFAULT_ROUTE;
  const home = day(doc.home) || day(DEFAULT_ROUTE.home) || { id: 'day-home', what: 'Fly home' };
  return { stops, home };
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (iso) => new Date(iso + 'T00:00:00Z');
export function addDays(iso, n) { const t = utc(iso); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
export function dayLabel(iso) { const t = utc(iso); return DOW[t.getUTCDay()] + ' ' + MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); }   // Thu Apr 1
export function monthDay(iso) { const t = utc(iso); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); }                          // Apr 1
export function dateRange(a, b) { return utc(a).getUTCMonth() === utc(b).getUTCMonth() ? monthDay(a) + '–' + utc(b).getUTCDate() : monthDay(a) + '–' + monthDay(b); }

/* Route doc -> everything the page and the price watch derive from it. Pure: the server calls it per run. */
export function buildTrip(doc) {
  const route = cleanRoute(doc);
  const chapters = [BOOK_CHAPTER], groups = [...BOOK_GROUPS], groupDate = {}, chCoord = {}, chCity = {};
  let k = 0;
  route.stops.forEach((s, si) => {
    const first = addDays(TRIP.start, k);
    for (const d of s.days) { const date = addDays(TRIP.start, k); groupDate[d.id] = date; groups.push({ id: d.id, ch: s.id, when: dayLabel(date), what: d.what, date, n: k + 1 }); k++; }
    chapters.push({ id: s.id, name: s.name, place: s.place, station: s.city, area: s.area || '', n: si + 1, nights: s.days.length,
      first, dates: dateRange(first, addDays(TRIP.start, k)), lat: s.lat, lng: s.lng, island: !!s.island });
    if (s.lat != null) chCoord[s.id] = [s.lat, s.lng];
    chCity[s.id] = s.city;
  });
  const end = addDays(TRIP.start, k);
  groupDate[route.home.id] = end;
  groups.push({ id: route.home.id, ch: route.stops[route.stops.length - 1].id, when: dayLabel(end), what: route.home.what, date: end, n: k + 1, home: true });
  return { route, chapters, groups, groupDate, chCoord, chCity, start: TRIP.start, end, nights: k };
}

/* The page's current route, as live bindings: modules that import these see every useRoute() at once.
   Never copy them into module-level constants; derive lists inside functions. */
export let CHAPTERS, GROUPS, GROUP_DATE, CH_COORD, CH_CITY, ROUTE, TRIP_END, TRIP_NIGHTS;
export function useRoute(doc) {
  const t = buildTrip(doc);
  CHAPTERS = t.chapters; GROUPS = t.groups; GROUP_DATE = t.groupDate; CH_COORD = t.chCoord; CH_CITY = t.chCity;
  ROUTE = t.route; TRIP_END = t.end; TRIP_NIGHTS = t.nights;
  return t;
}
useRoute(null);
export const groupCh = (g) => { const x = GROUPS.find(G => G.id === g); return x ? x.ch : null; };
/* A hotel the price watch follows: lodging with a hotel name, nights, and a day that still exists. */
export function isStay(i, gd = GROUP_DATE) { return !i.disabled && i.cat === 'lodging' && !!i.hotelQuery && i.nights > 0 && !!gd[i.group]; }

/* Sale openings are stored as "YYYY-MM-DDTHH:MM" in Japan time, or "YYYY-MM-DD". Returns epoch ms. */
export function opensAt(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(String(s || ''));
  return m ? Date.parse(`${m[1]}T${m[2] || '00:00'}:00+09:00`) : null;
}

/* ---------- Free search links: sites with no open data get a prefilled search instead (no key, no cost) ---------- */
export const links = {
  google: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q),
  maps: (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q),
  site: (host, q) => 'https://www.google.com/search?q=' + encodeURIComponent('site:' + host + ' ' + q),
  booking: (q, checkin, checkout, adults = TRIP.adults) => 'https://www.booking.com/searchresults.html?' +
    new URLSearchParams({ ss: q, checkin, checkout, group_adults: String(adults), no_rooms: '1', group_children: '0' })
};

/* A stay compared elsewhere: Booking.com with your dates, Google, and site searches on Japanese sites (Japanese name works best). */
export function stayLinks(stay, name, city, checkin, checkout) {
  const jp = stay.hotelQuery || name;
  return [['Booking.com', links.booking(name + ' ' + city, checkin, checkout)], ['Google prices', links.google(name + ' ' + city + ' hotel prices')],
    ['Jalan', links.site('jalan.net', jp)], ['Ikyu', links.site('ikyu.com', jp)], ['Rakuten Travel', links.site('travel.rakuten.co.jp', jp)]];
}

/* ---------- Taste: what the two of you keep choosing ---------- */
export const TASTE_WORDS = {
  stationery: /stationer|paper|washi|ink\b|pen\b|notebook|itoya|kakimori/i,
  museum: /museum|exhibit/i,
  gallery: /gallery|art house|art museum|art site/i,
  bathhouse: /sento|bathhouse|onsen|bath\b/i,
  craft: /craft|workshop|pottery|ceramic|lacquer|knife|knives|indigo|weav/i,
  tea: /\btea\b|matcha|teahouse/i,
  sweets: /wagashi|mochi|sweets|confection|dango/i,
  books: /book/i,
  temple: /temple|-ji\b|dera\b/i,
  shrine: /shrine|jinja|taisha|torii|inari/i,
  garden: /garden|teien/i,
  historic: /historic|old |lane|alley|machiya|castle|edo/i,
  antiques: /antique|flea/i
};
/* {kind: weight}. Items you rank high or check off count up, skipped ones count down; picks and dismissals from Explore adjust it. */
export function tasteProfile(items, taste = {}) {
  const w = {};
  const add = (k, n) => { w[k] = (w[k] || 0) + n; };
  for (const i of items) {
    const text = (i.title || '') + ' ' + (i.detail || '');
    const kinds = i.category ? [i.category] : Object.keys(TASTE_WORDS).filter(k => TASTE_WORDS[k].test(text));
    for (const k of kinds) add(k, i.disabled ? -2 : 1 + (i.priority === 'high' ? 2 : i.priority === 'medium' ? 1 : 0) + (i.done ? 1 : 0));
  }
  for (const [k, n] of Object.entries(taste.picks || {})) add(k, 2 * n);
  for (const k of Object.values(taste.dismissed || {})) add(k, -1);
  return w;
}

/* ---------- Split: who paid, who owes whom ---------- */
/* entries: [{usd, paidBy, split}] where split is 'even' (default) or one traveler's name (it was only for them). */
export function settle(entries, travelers = TRAVELERS) {
  const paid = {}, share = {};
  travelers.forEach(t => { paid[t] = 0; share[t] = 0; });
  for (const e of entries) {
    if (!(e.usd > 0) || !travelers.includes(e.paidBy)) continue;
    paid[e.paidBy] += e.usd;
    if (travelers.includes(e.split)) share[e.split] += e.usd;
    else travelers.forEach(t => { share[t] += e.usd / travelers.length; });
  }
  const bal = travelers.map(t => ({ t, v: paid[t] - share[t] })); // positive: others owe them
  const owes = [];
  const debt = bal.filter(b => b.v < -0.5).sort((a, b) => a.v - b.v), cred = bal.filter(b => b.v > 0.5).sort((a, b) => b.v - a.v);
  while (debt.length && cred.length) {
    const d = debt[0], c = cred[0], x = Math.min(-d.v, c.v);
    owes.push({ from: d.t, to: c.t, usd: Math.round(x * 100) / 100 });
    d.v += x; c.v -= x;
    if (d.v > -0.5) debt.shift(); if (c.v < 0.5) cred.shift();
  }
  return { paid, share, owes };
}
