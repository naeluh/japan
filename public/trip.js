// Trip facts and pure helpers shared by the page (app.js) and the server functions (api/*.js import this file).
export const TRIP = { title: 'Japan, April 2027', start: '2027-04-01', end: '2027-04-14', adults: 2 };
export const TRAVELERS = ['Kristin', 'Nick'];

export const CHAPTERS = [
  { id: 'book', name: 'Book ahead', place: 'Reservations with deadlines', dates: '', station: null },
  { id: 'c1', name: 'Neon Tokyo', place: 'Shibuya: Cerulean Tower, then Trunk', dates: 'Apr 1–4', station: 'Tokyo' },
  { id: 'c2', name: 'The old mountain road', place: 'Hakone: Matsuzakaya Honten', dates: 'Apr 4–6', station: 'Hakone' },
  { id: 'c3', name: 'Temples at the edges of the day', place: 'Kyoto: Higashiyama', dates: 'Apr 6–10', station: 'Kyoto' },
  { id: 'c4', name: 'The art islands', place: 'Naoshima and Teshima', dates: 'Apr 10–12', station: 'Naoshima' },
  { id: 'c5', name: 'Old Tokyo and home', place: 'Yanaka and Kuramae', dates: 'Apr 12–14', station: 'Tokyo' }
];
export const GROUPS = [
  { id: 'b-now', ch: 'book', when: 'Now', what: 'Hotels and bags' },
  { id: 'b-march', ch: 'book', when: 'Early March', what: 'About a month out' },
  { id: 'b-feb', ch: 'book', when: 'Feb 4, 5:00 PM Pacific', what: 'Naoshima timed tickets open' },
  { id: 'b-fly', ch: 'book', when: 'Before you fly', what: 'Last details' },
  { id: 'd01', ch: 'c1', when: 'Thu Apr 1', what: 'Land and look down on the city' },
  { id: 'd02', ch: 'c1', when: 'Fri Apr 2', what: 'Paper, fossils and a river of blossoms' },
  { id: 'd03', ch: 'c1', when: 'Sat Apr 3', what: 'Digital worlds and the parasite museum' },
  { id: 'd04', ch: 'c2', when: 'Sun Apr 4', what: 'Into the mountains' },
  { id: 'd05', ch: 'c2', when: 'Mon Apr 5', what: 'The Hakone loop, on foot and by boat' },
  { id: 'd06', ch: 'c3', when: 'Tue Apr 6', what: 'A thousand gates at dusk' },
  { id: 'd07', ch: 'c3', when: 'Wed Apr 7', what: 'The 6 AM city' },
  { id: 'd08', ch: 'c3', when: 'Thu Apr 8', what: 'Bamboo, stone monks and late cherries' },
  { id: 'd09', ch: 'c3', when: 'Fri Apr 9', what: 'Nara day trip' },
  { id: 'd10', ch: 'c4', when: 'Sat Apr 10', what: 'Underground Monet and the yellow pumpkin' },
  { id: 'd11', ch: 'c4', when: 'Sun Apr 11', what: 'Sit in the dark, then hear heartbeats' },
  { id: 'd12', ch: 'c5', when: 'Mon Apr 12', what: 'Leave by sea, sunset steps' },
  { id: 'd13', ch: 'c5', when: 'Tue Apr 13', what: 'Last full day' },
  { id: 'd14', ch: 'c5', when: 'Wed Apr 14', what: 'Fly home' }
];
export const GROUP_DATE = {
  d01: '2027-04-01', d02: '2027-04-02', d03: '2027-04-03', d04: '2027-04-04', d05: '2027-04-05', d06: '2027-04-06', d07: '2027-04-07',
  d08: '2027-04-08', d09: '2027-04-09', d10: '2027-04-10', d11: '2027-04-11', d12: '2027-04-12', d13: '2027-04-13', d14: '2027-04-14'
};
export const CH_COORD = { c1: [35.66, 139.70], c2: [35.23, 139.05], c3: [35.00, 135.77], c4: [34.46, 133.99], c5: [35.72, 139.77] };
export const CH_CITY = { c1: 'Tokyo', c2: 'Hakone', c3: 'Kyoto', c4: 'Naoshima', c5: 'Tokyo' };
export const groupCh = (g) => { const x = GROUPS.find(G => G.id === g); return x ? x.ch : null; };

/* Sale openings are stored as "YYYY-MM-DDTHH:MM" in Japan time, or "YYYY-MM-DD". Returns epoch ms. */
export function opensAt(s) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(String(s || ''));
  return m ? Date.parse(`${m[1]}T${m[2] || '00:00'}:00+09:00`) : null;
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
