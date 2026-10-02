// Pure-logic checks for the server libraries. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { openState, parseHours } from '../api/_lib/hours.js';
import { score, rank, classify, yearOf, isChain } from '../api/_lib/osm.js';
import { applyCheck, flexFrom, opensAt, dueReminders } from '../api/_lib/alerts.js';
import { toICS } from '../api/_lib/ics.js';
import { summarizePlans } from '../api/_lib/rakuten.js';
import { buildTrip, cleanRoute, isStay, DEFAULT_ROUTE } from '../public/trip.js';

test('opening hours: common forms', () => {
  // 2027-04-06 is a Tuesday
  assert.equal(openState('24/7', '2027-04-06', 600, 660), 'open');
  assert.equal(openState('Mo-Su 10:00-18:00; Tu off', '2027-04-06', 600, 660), 'closed');
  assert.equal(openState('Mo-Su 10:00-18:00; Tu off', '2027-04-07', 600, 660), 'open');
  assert.equal(openState('Tu-Su 10:00-12:00,13:00-17:00', '2027-04-06', 690, 750), 'partial');
  assert.equal(openState('Mo-Fr 09:00-17:00', '2027-04-10', 600, 660), 'closed'); // Saturday not listed
  assert.equal(openState('10:00-18:00', '2027-04-10', 1050, 1110), 'partial');
  assert.equal(openState('Mo-Sa 10:00-19:00, Su 10:00-18:00', '2027-04-11', 1065, 1100), 'partial');
  assert.equal(openState('Mar-Nov Mo-Su 09:00-17:00', '2027-04-06', 600, 660), 'open');
  assert.equal(openState('Mar-Nov Mo-Su 09:00-17:00', '2027-12-06', 600, 660), 'closed');
  assert.equal(openState('18:00-02:00', '2027-04-06', 1380, 1440), 'open');
  assert.equal(openState('Mo-Fr 09:00-17:00; PH off', '2027-04-06', 600, 660), 'open', 'no public holidays during the trip');
  assert.equal(openState('Mo-Su,PH 10:00-19:00; Dec 31 10:00-17:30', '2027-04-06', 600, 660), 'open');
  assert.equal(openState('Mo-Su,PH 10:00-19:00; Dec 31 10:00-17:30', '2027-12-31', 1050, 1100), 'closed');
  assert.equal(openState('sunrise-sunset', '2027-04-06', 600, 660), 'unknown');
  assert.equal(openState('', '2027-04-06', 600, 660), 'unknown');
  assert.equal(parseHours('by appointment'), null);
});

test('discovery: classify, chains and year parsing', () => {
  assert.equal(classify({ amenity: 'place_of_worship', religion: 'christian' }), 'worship');
  assert.equal(isChain({ shop: 'stationery', brand: 'Loft' }), true);
  assert.equal(isChain({ shop: 'stationery' }), false);
  assert.equal(classify({ amenity: 'public_bath' }), 'bathhouse');
  assert.equal(classify({ amenity: 'place_of_worship', religion: 'shinto' }), 'shrine');
  assert.equal(classify({ shop: 'stationery' }), 'stationery');
  assert.equal(yearOf('+1716-00-00T00:00:00Z'), 1716);
  assert.equal(yearOf('1905-04'), 1905);
  assert.equal(yearOf('c. 1900'), null);
});

const P = (o) => ({ osm: 'node/' + Math.random(), lat: 35.68, lng: 139.77, kind: 'temple', name: 'x', heritage: [], year: null, sitelinks: null, attraction: false, hours: '', ...o });
test('discovery: old, designated, little-known and rare-here outrank the famous temple', () => {
  const famous = P({ name: 'Famous temple', sitelinks: 60, attraction: true, heritage: ['UNESCO World Heritage'] });
  const teahouse = P({ name: 'Old teahouse', kind: 'tea', year: 1716, sitelinks: 2 });
  const temples = [1, 2, 3, 4, 5].map(n => P({ name: 'Temple ' + n }));
  const ranked = score([famous, teahouse, ...temples], { now: 2027 });
  assert.equal(ranked[0].name, 'Old teahouse');
  assert.ok(ranked[0].reasons.includes('Since 1716'));
  assert.ok(ranked[0].reasons.includes('Only tea shop nearby'));
  assert.ok(ranked.every(p => p.score >= 0 && p.score <= 100));
  const liked = score([P({ name: 'a', kind: 'stationery' }), P({ name: 'b', kind: 'museum' })], { taste: { museum: 6 } });
  assert.equal(liked[0].name, 'b');
  assert.ok(liked[0].reasons.includes('You like museums'));
  assert.ok(score([P({ name: 's', kind: 'stationery' })], { taste: { stationery: 3 } })[0].reasons.includes('You like stationery'));
});

test('discovery: rank filters by walking range, closed places and dismissals', () => {
  const near = P({ name: 'near', lat: 35.6801, lng: 139.7701, hours: 'Mo-Su 10:00-18:00' });
  const closed = P({ name: 'closed', lat: 35.6802, lng: 139.7702, hours: 'Tu off' });
  const far = P({ name: 'far', lat: 35.70, lng: 139.80 });
  const gone = P({ osm: 'node/9', name: 'dismissed', lat: 35.6801, lng: 139.7701 });
  const r = rank([near, closed, far, gone], { lat: 35.68, lng: 139.77, maxWalk: 10, date: '2027-04-06', from: 660, to: 720, exclude: ['node/9'] });
  assert.deepEqual(r.map(p => p.name), ['near']);
  assert.equal(r[0].open, 'open');
  assert.ok(r[0].walkMin >= 1);
});

test('opening-hours clash check matches by name only', async () => {
  const { matchHours } = await import('../api/_lib/osm.js');
  const els = [{ tags: { name: 'FamilyMart', brand: 'FamilyMart', opening_hours: '24/7' }, lat: 35.0001, lng: 135.0001 },
    { tags: { name: '伊東屋', 'name:en': 'Itoya', opening_hours: 'Mo-Su 10:00-20:00' }, lat: 35.0003, lng: 135.0003 }];
  const r = matchHours([{ id: 'a', name: 'Itoya', lat: 35, lng: 135, date: '2027-04-06', from: 600, to: 660 },
    { id: 'b', name: 'Ramen Nagi', lat: 35, lng: 135, date: '2027-04-06', from: 600, to: 660 }], els);
  assert.equal(r.a.state, 'open'); assert.equal(r.a.matched, 'Itoya');
  assert.equal(r.b.state, 'unknown', 'no borrowed hours from the FamilyMart next door');
});

test('price watch: alerts for target crossing, reopening and a new low', () => {
  const base = { found: true, available: true, estimateTotal: 60000, firstNight: 30000, nights: 2, hotelNo: '1', hotelName: 'H' };
  const first = applyCheck(null, base, { title: 'Ryokan', target: 50000, day: '2026-10-01' });
  assert.equal(first.alerts.length, 0);
  assert.deepEqual(first.doc.low, { total: 60000, d: '2026-10-01' });
  const sold = applyCheck(first.doc, { found: true, available: false, nights: 2 }, { title: 'Ryokan', target: 50000, day: '2026-10-02' });
  assert.equal(sold.alerts.length, 0);
  assert.equal(sold.doc.latest.available, false);
  const back = applyCheck(sold.doc, { ...base, estimateTotal: 48000 }, { title: 'Ryokan', target: 50000, day: '2026-10-03' });
  assert.deepEqual(back.alerts.map(a => a.kind).sort(), ['low', 'open', 'target']);
  const again = applyCheck(back.doc, { ...base, estimateTotal: 47500 }, { title: 'Ryokan', target: 50000, day: '2026-10-04' });
  assert.equal(again.alerts.length, 0, 'still under target and under 3% lower: no repeat alert');
  assert.equal(again.doc.history.length, 4);
  assert.equal(again.doc.alerts.length, 3);
  const usd = applyCheck(first.doc, { ...base, estimateTotal: 46500 }, { title: 'Ryokan', target: 50000, day: '2026-10-05', rate: 155 });
  assert.equal(usd.alerts.find(a => a.kind === 'target').text, 'Ryokan: $300 (¥46,500) is at or under your $323 (¥50,000) target.');
});

test('price watch: flexible dates and sale reminders', () => {
  const f = flexFrom({ estimateTotal: 60000 }, { found: true, available: true, estimateTotal: 42000 }, { found: true, available: false });
  assert.equal(f.earlier.diff, -18000);
  assert.equal(f.later.total, null);
  const sold = flexFrom({ estimateTotal: null }, { found: true, available: true, estimateTotal: 50000 }, null);
  assert.deepEqual(sold.earlier, { dir: -1, total: 50000, diff: null });
  assert.equal(opensAt('2027-02-05T10:00'), Date.parse('2027-02-05T01:00:00Z'));
  assert.equal(opensAt('2027-03-15'), Date.parse('2027-03-14T15:00:00Z'));
  assert.equal(opensAt('Feb 5'), null);
  const now = Date.parse('2027-02-04T12:00:00Z');
  const due = dueReminders([{ id: 'a', opens: '2027-02-05T10:00' }, { id: 'b', opens: '2027-02-05T10:00', done: true }, { id: 'c', opens: '2027-03-15' }, { id: 'd', opens: '2027-02-05T10:00' }], { d: 1 }, now);
  assert.deepEqual(due.map(x => x.i.id), ['a']);
});

test('calendar: valid ICS with escaping, timed and all-day events', () => {
  const s = toICS([{ uid: 'b09', title: 'Chichu Art Museum, Sat Apr 10', opens: '2027-02-05T10:00', detail: 'No refunds; be on time', url: 'https://example.com' },
    { uid: 'b16', title: 'Skyliner', opens: '2027-03-15' }], { now: Date.parse('2026-10-01T00:00:00Z') });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(s.includes('DTSTART:20270205T010000Z'));
  assert.ok(s.includes('DTSTART;VALUE=DATE:20270315\r\nDTEND;VALUE=DATE:20270316'));
  assert.ok(s.includes('SUMMARY:Sale opens: Chichu Art Museum\\, Sat Apr 10'));
  assert.ok(s.includes('No refunds\\; be on time'));
  assert.ok(s.split('\r\n').every(l => l.length <= 75));
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 2);
});

test('rakuten: plan summary picks cheapest, with-meals and room-only plans', () => {
  const room = (name, total, dinner, breakfast) => ({ roomInfo: [{ roomBasicInfo: { planName: name, withDinnerFlag: dinner, withBreakfastFlag: breakfast } }, { dailyCharge: { total } }] });
  const json = { hotels: [[{ hotelBasicInfo: { hotelName: 'Ryokan', planListUrl: 'https://x' } }, room('2 meals', 58000, 1, 1), room('Room only', 35000, 0, 0), room('Breakfast', 39000, 0, 1)]] };
  const s = summarizePlans(json);
  assert.equal(s.info.hotelName, 'Ryokan');
  assert.deepEqual(s.plans.map(p => p.firstNight), [35000, 39000, 58000]);
  assert.equal(s.meals.withMeals.firstNight, 58000);
  assert.equal(s.meals.roomOnly.firstNight, 35000);
});

test('split: settle-up between two travelers', async () => {
  const { settle } = await import('../public/trip.js');
  const r = settle([{ usd: 100, paidBy: 'Kristin' }, { usd: 40, paidBy: 'Nick', split: 'Nick' }, { usd: 60, paidBy: 'Nick' }, { usd: 30 }], ['Kristin', 'Nick']);
  assert.deepEqual(r.paid, { Kristin: 100, Nick: 100 });
  assert.deepEqual(r.share, { Kristin: 80, Nick: 120 });
  assert.deepEqual(r.owes, [{ from: 'Nick', to: 'Kristin', usd: 20 }]);
  assert.deepEqual(settle([{ usd: 50, paidBy: 'Kristin' }, { usd: 50, paidBy: 'Nick' }], ['Kristin', 'Nick']).owes, []);
});

test('taste: priorities, check-offs, skips, picks and dismissals', async () => {
  const { tasteProfile } = await import('../public/trip.js');
  const w = tasteProfile([{ title: 'Itoya stationery', priority: 'high', done: true }, { title: 'Temple walk', disabled: true }, { title: 'x', category: 'bathhouse', priority: 'low' }],
    { picks: { museum: 2 }, dismissed: { 'node/1': 'bathhouse' } });
  assert.equal(w.stationery, 4); assert.equal(w.temple, -2); assert.equal(w.museum, 4); assert.equal(w.bathhouse, 0);
});

test('route: the default route reproduces the original trip', () => {
  const t = buildTrip(null);
  assert.deepEqual(Object.values(t.groupDate), Array.from({ length: 14 }, (_, k) => '2027-04-' + String(k + 1).padStart(2, '0')));
  assert.deepEqual(t.chapters.filter(c => c.station).map(c => c.dates), ['Apr 1–4', 'Apr 4–6', 'Apr 6–10', 'Apr 10–12', 'Apr 12–14']);
  assert.deepEqual(t.chapters.filter(c => c.station).map(c => c.nights), [3, 2, 4, 2, 2]);
  const g = Object.fromEntries(t.groups.map(x => [x.id, x]));
  assert.equal(g.d01.when, 'Thu Apr 1'); assert.equal(g.d14.when, 'Wed Apr 14');
  assert.equal(g.d14.ch, 'c5'); assert.equal(g.d14.home, true);
  assert.equal(t.nights, 13); assert.equal(t.end, '2027-04-14');
  assert.deepEqual(t.groups.slice(0, 4).map(x => x.id + ':' + x.ch), ['b-now:book', 'b-march:book', 'b-feb:book', 'b-fly:book']);
  assert.equal(t.chapters.find(c => c.id === 'c4').island, true);
});

test('route: more nights shift later cities; a removed city frees its days', () => {
  const longer = structuredClone(DEFAULT_ROUTE);
  longer.stops[0].days.push({ id: 'day-extra1', what: '' });
  const t = buildTrip(longer);
  assert.equal(t.groupDate.d04, '2027-04-05');
  assert.equal(t.chapters.find(c => c.id === 'c2').dates, 'Apr 5–7');
  assert.equal(t.end, '2027-04-15'); assert.equal(t.nights, 14);
  const shorter = structuredClone(DEFAULT_ROUTE);
  shorter.stops.splice(1, 1);
  const u = buildTrip(shorter);
  assert.equal(u.groupDate.d04, undefined); assert.equal(u.groupDate.d05, undefined);
  assert.equal(u.groupDate.d06, '2027-04-04');
  assert.equal(u.chapters.find(c => c.id === 'c3').dates, 'Apr 4–8');
  const may = structuredClone(DEFAULT_ROUTE);
  for (let k = 0; k < 20; k++) may.stops[2].days.push({ id: 'day-x' + String(k).padStart(3, '0'), what: '' });
  assert.equal(buildTrip(may).chapters.find(c => c.id === 'c4').dates, 'Apr 30–May 2', 'across a month');
});

test('route: cleanRoute is the trust boundary', () => {
  for (const junk of [null, 'x', 7, {}, { stops: 'no' }, { stops: [] }, { stops: [{ id: 'map', city: 'X', days: [{ id: 'd01' }] }] }]) assert.equal(cleanRoute(junk), DEFAULT_ROUTE);
  const doc = { stops: [
    { id: 'c1', city: ' Tokyo ', lat: 99, lng: 139, days: [{ id: 'd01', what: 'a' }, { id: 'd01', what: 'dup' }, { id: 'b-now' }, { id: 'book' }, { id: 'map' }, { id: 'day-abcd', what: 'b' }] },
    { id: 'c1', city: 'Again', days: [{ id: 'd02' }] },
    { id: 'city-osaka1', city: 'Osaka', lat: 34.69, lng: 135.5, island: 'yes', days: Array.from({ length: 31 }, (_, k) => ({ id: 'day-o' + String(k).padStart(3, '0') })) },
    { id: 'city-kobe01', city: 'Kobe', lat: 34.69, lng: 135.19, island: true, days: [{ id: 'd03', what: 'x'.repeat(500) }] }
  ], home: { id: 'd01', what: 'taken' } };
  const before = JSON.stringify(doc);
  const r = cleanRoute(doc);
  assert.equal(JSON.stringify(doc), before, 'input untouched');
  assert.deepEqual(r.stops.map(s => s.id), ['c1', 'city-kobe01'], 'duplicate stop id and the 31-day stop dropped');
  assert.deepEqual(r.stops[0].days.map(d => d.id), ['d01', 'day-abcd']);
  assert.equal(r.stops[0].city, 'Tokyo');
  assert.equal(r.stops[0].lat, null, 'outside Japan');
  assert.equal(r.stops[1].island, true);
  assert.equal(r.stops[1].days[0].what.length, 120);
  assert.equal(r.home.id, 'd14', 'a taken home id falls back to the default');
});

test('route: a stay on a removed day is not watched', () => {
  const stay = { cat: 'lodging', hotelQuery: '松坂屋本店', nights: 2, group: 'd04' };
  assert.equal(isStay(stay, buildTrip(null).groupDate), true);
  const r = structuredClone(DEFAULT_ROUTE); r.stops.splice(1, 1);
  assert.equal(isStay(stay, buildTrip(r).groupDate), false);
  assert.equal(isStay({ ...stay, disabled: true }, buildTrip(null).groupDate), false);
});
