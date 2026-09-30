/* Explore: unusual places near your plan (OpenStreetMap + Wikidata), "fits your gap" suggestions, and taste learning. */
import { ctx } from './app.js';
import { GROUPS, GROUP_DATE, CH_CITY, groupCh, tasteProfile, links, stayLinks } from './trip.js';

const { $, el, icon, withIcon, extLink, toast } = ctx;
const API = window.TRIP_API;
const DAYS = GROUPS.filter(g => GROUP_DATE[g.id]);
const STAY_MIN = { museum: 60, gallery: 45, bathhouse: 60, garden: 45, temple: 40, shrine: 30, historic: 30 };
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (m) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const OPEN = { open: ['Open then', 'success'], partial: ['Closes during your visit', 'warning'], unknown: ['Hours unknown', ''] };

const state = { mode: 'nearby', day: DAYS[0].id, anchor: '', walk: 15, at: '', gap: null, results: null, loading: false, error: '', seq: 0, coords: null };
let taste = {}, tasteSubscribed = false;

function subscribeTaste() {
  if (tasteSubscribed || !ctx.db) return; tasteSubscribed = true;
  ctx.db.doc('settings/taste').onSnapshot(s => { taste = s.exists ? s.data() : {}; }, () => {});
}
function saveTaste(patch) { // merge server-side; the doc may not exist yet, so set the merged copy
  if (!ctx.db || !ctx.canWrite) return;
  const next = { picks: { ...(taste.picks || {}), ...(patch.picks || {}) }, dismissed: { ...(taste.dismissed || {}), ...(patch.dismissed || {}) }, updatedAt: Date.now() };
  taste = next;
  ctx.db.doc('settings/taste').set(next).catch(() => {});
}
function profile() { return tasteProfile(ctx.items, taste); }
function tasteLine() {
  const labels = { stationery: 'stationery', museum: 'museums', gallery: 'galleries', bathhouse: 'bathhouses', craft: 'craft workshops', tea: 'tea', sweets: 'sweets',
    books: 'bookshops', temple: 'temples', shrine: 'shrines', garden: 'gardens', historic: 'old streets and history', antiques: 'antiques' };
  const top = Object.entries(profile()).filter(([k, w]) => w > 2 && labels[k]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => labels[k]);
  return top.length ? 'Tuned to what you pick: ' + top.join(', ') + '.' : '';
}

function metres(a, b) { const k = 111320, dx = (a.lng - b.lng) * k * Math.cos(a.lat * Math.PI / 180), dy = (a.lat - b.lat) * k; return Math.hypot(dx, dy); }
function stopsFor(day) { return ctx.live().filter(i => i.group === day && ctx.hasPin(i) && i.kind !== 'travel').sort(ctx.byTime); }

/* Called from a free-time gap on the timeline. */
function openGap(gap) {
  state.day = gap.group.id; state.anchor = gap.anchor ? gap.anchor.id : ''; state.coords = null;
  state.walk = gap.minutes >= 90 ? 15 : 10;
  state.at = hhmm(gap.from);
  state.gap = { from: gap.from, to: gap.to, minutes: gap.minutes, near: gap.anchor ? (gap.anchor.place || gap.anchor.title || '').split(',')[0] : '' };
  state.results = null; state.mode = 'nearby';
  ctx.go('explore');
  search();
}
ctx.gapHooks.push((gap) => {
  if (!gap.anchor || !GROUP_DATE[gap.group.id]) return null;
  const b = el('button', 'chip'); b.type = 'button'; withIcon(b, 'compass', 'Find something nearby');
  b.onclick = () => openGap(gap);
  return b;
});

function anchorPoint() {
  if (state.coords) return state.coords;
  const stops = stopsFor(state.day);
  const a = stops.find(i => i.id === state.anchor) || stops[0];
  return a ? { lat: a.lat, lng: a.lng, name: (a.place || a.title || '').split(',')[0] } : null;
}

async function search() {
  const p = anchorPoint();
  if (!p) { state.error = 'This day has no stops with a map pin yet. Add a location to one, or use where you are.'; state.results = null; render(); return; }
  const seq = ++state.seq;
  state.loading = true; state.error = ''; render();
  const from = ctx.mins(state.at);
  const to = state.gap ? state.gap.to : (from != null ? from + 60 : null);
  const w = profile();
  const qs = new URLSearchParams({ lat: p.lat, lng: p.lng, walk: state.walk, date: GROUP_DATE[state.day] });
  if (from != null) { qs.set('from', hhmm(from)); qs.set('to', hhmm(to)); }
  const tw = Object.entries(w).filter(([, v]) => v).map(([k, v]) => k + ':' + Math.round(v)).join(','); if (tw) qs.set('taste', tw);
  const ex = Object.keys(taste.dismissed || {}).concat(ctx.items.filter(i => i.osm).map(i => i.osm)); if (ex.length) qs.set('exclude', ex.slice(0, 200).join(','));
  try {
    const r = await API.api('/api/discover?' + qs);
    if (seq !== state.seq) return;
    const planned = stopsFor(state.day);
    state.results = r.places.filter(x => !planned.some(i => metres(i, x) < 120)); // already on the plan
    state.count = r.count;
  } catch (e) { if (seq === state.seq) state.error = (e && e.message) || 'Discovery didn\'t answer. Try again in a minute.'; }
  finally { if (seq === state.seq) { state.loading = false; render(); } }
}

function addPlace(p) {
  if (!ctx.canWrite) return;
  const g = GROUPS.find(G => G.id === state.day);
  const data = {
    group: state.day, title: p.name + (p.nameJa && p.nameJa !== p.name ? ' (' + p.nameJa + ')' : ''), detail: [p.label, ...p.reasons].join('. ') + '.' + (p.hours ? '\nHours (OpenStreetMap): ' + p.hours : ''),
    place: p.name + ', ' + (CH_CITY[groupCh(state.day)] || 'Japan'), lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5,
    priority: 'medium', done: false, kind: 'activity', category: p.kind, source: 'discover', osm: p.osm,
    links: [ctx.safeUrl(p.website) ? { label: 'Website', url: p.website } : { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' + p.osm }],
    sort: Math.max(0, ...ctx.items.filter(x => x.group === state.day).map(x => x.sort || 0)) + 10
  };
  const from = ctx.mins(state.at);
  if (from != null) {
    const start = Math.ceil((from + p.walkMin) / 5) * 5;
    let end = start + (STAY_MIN[p.kind] || 30);
    if (state.gap && state.gap.to != null) end = Math.min(end, state.gap.to - 5);
    if (end > start) { data.start = hhmm(start); data.end = hhmm(end); }
  }
  const id = ctx.create(data, 'Added ' + ctx.q(data.title) + ' to ' + g.when + ' from Explore');
  saveTaste({ picks: { [p.kind]: ((taste.picks || {})[p.kind] || 0) + 1 } });
  toast('Added to ' + g.when + '.');
  state.results = (state.results || []).filter(x => x.osm !== p.osm);
  if (id) { ctx.go('plan'); setTimeout(() => ctx.flashItem(id), 120); }
}
function dismiss(p) {
  saveTaste({ dismissed: { [p.osm]: p.kind } });
  state.results = (state.results || []).filter(x => x.osm !== p.osm);
  render();
}

function placeCard(p) {
  const c = el('article', 'card pad place');
  const head = el('div', 'stay-head');
  const t = el('div');
  t.append(el('h3', 'card-title', p.name));
  if (p.nameJa && p.nameJa !== p.name) t.append(el('p', 'muted', p.nameJa));
  const score = el('span', 'score'); score.append(el('b', 'num', String(p.score)), el('span', null, 'unusual'));
  score.title = 'Uniqueness score: age, heritage, how rare it is nearby and how little-known';
  head.append(t, score);
  c.append(head);
  const facts = el('div', 'pills');
  facts.append(el('span', 'badge', p.label), withIcon(el('span', 'badge'), 'walk', 'About ' + p.walkMin + ' min walk'));
  const [ol, oc] = OPEN[p.open] || OPEN.unknown; if (state.at) facts.append(el('span', 'badge ' + oc, ol));
  c.append(facts);
  if (p.reasons.length) { const r = el('ul', 'reasons'); p.reasons.forEach(x => r.append(el('li', null, x))); c.append(r); }
  if (p.hours) c.append(el('p', 'help', 'Hours: ' + p.hours));
  const links = el('div', 'pills');
  [[p.website, 'Website'], [p.wikipedia, 'Wikipedia'], ['https://www.openstreetmap.org/' + p.osm, 'Map']].forEach(([u, l]) => { const a = u && extLink(u, l); if (a) links.append(a); });
  c.append(links);
  if (ctx.canWrite) {
    const acts = el('div', 'add');
    const g = GROUPS.find(G => G.id === state.day);
    const add = el('button', 'btn sm'); add.type = 'button'; withIcon(add, 'plus', 'Add to ' + g.when); add.onclick = () => addPlace(p);
    const no = el('button', 'btn ghost sm', 'Not for us'); no.type = 'button'; no.onclick = () => dismiss(p);
    acts.append(add, no); c.append(acts);
  }
  return c;
}

function controls() {
  const card = el('section', 'card pad');
  const row = el('div', 'row3 explore-controls');
  const dayL = el('label', 'field'); dayL.append(el('span', null, 'Day'));
  const daySel = el('select'); DAYS.forEach(g => { const o = el('option', null, g.when); o.value = g.id; daySel.append(o); }); daySel.value = state.day;
  daySel.onchange = () => { state.day = daySel.value; state.anchor = ''; state.coords = null; state.gap = null; state.results = null; render(); };
  dayL.append(daySel);
  const nearL = el('label', 'field'); nearL.append(el('span', null, 'Near'));
  const nearSel = el('select');
  stopsFor(state.day).forEach(i => { const o = el('option', null, (i.start ? ctx.fmt12(i.start) + ' · ' : '') + (i.place || i.title).split(',')[0].slice(0, 40)); o.value = i.id; nearSel.append(o); });
  const me = el('option', null, 'Where I am now'); me.value = '__me'; nearSel.append(me);
  nearSel.value = state.coords ? '__me' : (state.anchor || (nearSel.options[0] ? nearSel.options[0].value : ''));
  nearSel.onchange = () => {
    if (nearSel.value !== '__me') { state.anchor = nearSel.value; state.coords = null; return; }
    navigator.geolocation.getCurrentPosition(pos => { state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'you' }; search(); },
      () => { toast('Location is off for this site. Pick a stop instead.'); nearSel.value = state.anchor || ''; }, { timeout: 10000, maximumAge: 60000 });
  };
  nearL.append(nearSel);
  const atL = el('label', 'field'); atL.append(el('span', null, 'Open at (optional)'));
  const at = el('input'); at.type = 'time'; at.value = state.at; at.oninput = () => { state.at = at.value; state.gap = null; };
  atL.append(at);
  row.append(dayL, nearL, atL);
  const walk = el('div', 'seg'); walk.setAttribute('role', 'group'); walk.setAttribute('aria-label', 'Walking distance');
  [5, 10, 15, 20].forEach(n => { const b = el('button', null, n + ' min'); b.type = 'button'; b.setAttribute('aria-pressed', String(state.walk === n)); b.onclick = () => { state.walk = n; walk.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }; walk.append(b); });
  const go = el('button', 'btn'); go.type = 'button'; withIcon(go, 'search', state.loading ? 'Looking…' : 'Find places'); go.disabled = state.loading; go.onclick = search;
  const bar = el('div', 'add'); bar.append(walk, go);
  card.append(row, bar);
  return card;
}

/* ---------- Search: prefilled searches on Google Maps, Google, Tabelog and hotel sites (free, no key) ---------- */
function linkChips(title, pairs) {
  const sec = el('div', 'linkgroup'); sec.append(el('p', 'kicker', title));
  const p = el('div', 'pills'); pairs.forEach(([label, url]) => { const a = extLink(url, label); if (a) p.append(a); });
  sec.append(p); return sec;
}
function tonightStay(date) {
  return ctx.live().find(i => i.cat === 'lodging' && GROUP_DATE[i.group] && i.nights > 0 && GROUP_DATE[i.group] <= date && date < ctx.addDaysISO(GROUP_DATE[i.group], i.nights));
}
function searchPanel(root) {
  const g = GROUPS.find(G => G.id === state.day), date = GROUP_DATE[state.day], city = CH_CITY[groupCh(state.day)] || 'Japan';
  const card = el('section', 'card pad');
  const row = el('div', 'row2');
  const dayL = el('label', 'field'); dayL.append(el('span', null, 'Day'));
  const daySel = el('select'); DAYS.forEach(d => { const o = el('option', null, d.when); o.value = d.id; daySel.append(o); }); daySel.value = state.day;
  daySel.onchange = () => { state.day = daySel.value; state.anchor = ''; render(); };
  dayL.append(daySel);
  const nearL = el('label', 'field'); nearL.append(el('span', null, 'Near'));
  const nearSel = el('select'); const stops = stopsFor(state.day);
  stops.forEach(i => { const o = el('option', null, (i.start ? ctx.fmt12(i.start) + ' · ' : '') + (i.place || i.title).split(',')[0].slice(0, 40)); o.value = i.id; nearSel.append(o); });
  const cityOpt = el('option', null, 'Anywhere in ' + city); cityOpt.value = ''; nearSel.append(cityOpt);
  nearSel.value = stops.some(i => i.id === state.anchor) ? state.anchor : (stops[0] ? stops[0].id : '');
  nearSel.onchange = () => { state.anchor = nearSel.value || '__city'; render(); };
  nearL.append(nearSel);
  row.append(dayL, nearL);
  const stop = state.anchor === '__city' ? null : (stops.find(i => i.id === state.anchor) || stops[0]);
  const near = stop ? (stop.place || stop.title).split(',')[0] : city;
  const where = stop ? near + ', ' + city : city;
  const f = el('form', 'lock-form');
  const q = el('input', 'input'); q.placeholder = 'Matcha, a quiet bar, a kintsugi class…'; q.setAttribute('aria-label', 'What are you looking for?');
  const go = el('button', 'btn'); go.type = 'submit'; withIcon(go, 'search', 'Search Maps');
  f.append(q, go);
  f.onsubmit = (ev) => { ev.preventDefault(); const t = q.value.trim(); if (!t) return; window.open(links.maps(t + ' near ' + where), '_blank', 'noopener'); };
  card.append(row, f, el('p', 'help', 'Opens Google Maps searching near ' + where + '.'));
  root.append(card);
  const res = el('section', 'card pad stack-v');
  res.append(linkChips('Around ' + near, [
    ['Things to do', links.maps('things to do near ' + where)], ['Cafés', links.maps('cafe near ' + where)],
    ['Restaurants', links.maps('restaurants near ' + where)], ['Tabelog ratings', links.google('tabelog ' + where)],
    ['Old shops', links.maps('traditional shop near ' + where)], ['Bathhouses', links.maps('sento near ' + where)],
    ['Stationery', links.maps('stationery near ' + where)], ['Museums', links.maps('museum near ' + where)]
  ]));
  const long = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  res.append(linkChips(g.when + ' in ' + city, [
    ['Events that day', links.google(city + ' events ' + long)], ['Cherry blossom forecast', links.google('sakura forecast ' + city + ' 2027')],
    ['Festivals', links.google(city + ' matsuri April 2027')], ['Rainy-day ideas', links.google('rainy day things to do ' + city)]
  ]));
  const stay = tonightStay(date);
  if (stay) {
    const name = (stay.place || stay.title).split(',')[0], ci = GROUP_DATE[stay.group], co = ctx.addDaysISO(ci, stay.nights);
    res.append(linkChips('Tonight\'s stay: ' + name, stayLinks(stay, name, city, ci, co)));
    res.append(linkChips('Other places to stay in ' + city, [['Booking.com, your dates', links.booking(city, ci, co)], ['Ryokan in ' + city, links.google('best ryokan ' + city + ' private onsen')], ['Google Hotels', links.google('hotels in ' + city + ' ' + long)]]));
  }
  res.append(el('p', 'help', 'Each link opens that site\'s own search. Nothing here needs a key or costs anything.'));
  root.append(res);
}

function render() {
  const root = $('#explore'); if (!root) return;
  subscribeTaste();
  root.textContent = '';
  if (!ctx.loaded) return;
  const modes = el('div', 'seg'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Explore mode');
  [['nearby', 'Nearby'], ['search', 'Search']].forEach(([id, label]) => { const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', String(state.mode === id)); b.onclick = () => { state.mode = id; render(); }; modes.append(b); });
  root.append(modes);
  if (state.mode === 'search') { searchPanel(root); return; }
  root.append(controls());
  if (state.gap) {
    const g = state.gap; const s = el('div', 'slab info gapnote');
    s.append(document.createTextNode('You have ' + ctx.dur(g.from, g.to) + (g.near ? ' near ' + g.near : '') + ' from ' + ctx.fmt12(hhmm(g.from)) + '. These are open then, within a ' + state.walk + '-minute walk.'));
    const x = el('button', 'linkbtn', 'Clear'); x.type = 'button'; x.onclick = () => { state.gap = null; render(); }; s.append(' ', x);
    root.append(s);
  }
  const tl = tasteLine(); if (tl) root.append(el('p', 'muted', tl));
  if (state.error) root.append(el('p', 'slab danger', state.error));
  if (state.loading) root.append(el('p', 'muted', 'Asking OpenStreetMap and Wikidata…'));
  else if (state.results) {
    if (!state.results.length) root.append(el('p', 'empty', 'Nothing unusual and open within that walk. Try a longer walk or another stop.'));
    state.results.forEach(p => root.append(placeCard(p)));
    if (state.results.length) root.append(el('p', 'help', 'Places and hours from OpenStreetMap contributors; founding years and heritage from Wikidata. Hours can be out of date.'));
  } else root.append(el('p', 'empty', 'Pick a day and a stop to see old shops, small museums, bathhouses and quiet shrines within a short walk.'));
}

/* ---------- Opening-hours clash check (Plan toolbar) ---------- */
let hours = {};
try { hours = JSON.parse(localStorage.getItem('trip:hours') || '{}').results || {}; } catch (e) { hours = {}; }
async function checkHours(btn) {
  const stops = ctx.live().filter(i => GROUP_DATE[i.group] && i.kind !== 'travel' && ctx.hasPin(i) && i.start)
    .map(i => ({ id: i.id, name: (i.place || i.title || '').split(',')[0], alt: (i.title || '').split(/[,(]/)[0], lat: i.lat, lng: i.lng, date: GROUP_DATE[i.group], from: i.start, to: i.end || '' }));
  if (!stops.length) { toast('No stops with a time and a map pin to check.'); return; }
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Checking ' + stops.length + ' stops…';
  const out = {};
  try {
    for (let k = 0; k < stops.length; k += 20) Object.assign(out, (await API.api('/api/discover', { method: 'POST', body: JSON.stringify({ stops: stops.slice(k, k + 20) }) })).hours);
    hours = out;
    try { localStorage.setItem('trip:hours', JSON.stringify({ at: Date.now(), results: out })); } catch (e) { /* offline copy is optional */ }
    const bad = Object.values(out).filter(h => h.state === 'closed' || h.state === 'partial').length;
    const known = Object.values(out).filter(h => h.state !== 'unknown').length;
    toast(bad ? bad + (bad === 1 ? ' stop may be closed' : ' stops may be closed') + ' when you plan to be there. They\'re marked on the plan.' : 'No clashes among the ' + known + ' stops OpenStreetMap has hours for.');
  } catch (e) { toast((e && e.message) || 'The hours check didn\'t run. Try again.'); }
  finally { btn.disabled = false; btn.textContent = label; ctx.render(); }
}
ctx.itemHooks.push((i) => {
  const h = hours[i.id]; if (!h || !(h.state === 'closed' || h.state === 'partial') || i.done || i.disabled) return null;
  const s = el('p', 'slab warning hoursnote');
  s.append(icon('clock'), document.createTextNode((h.state === 'closed' ? ' May be closed then.' : ' May close before you leave.') + (h.hours ? ' OpenStreetMap hours: ' + h.hours + (h.matched ? ' (' + h.matched + ')' : '') + '.' : '')));
  return s;
});
{
  const tb = document.querySelector('.toolbar');
  const b = el('button', 'chip'); b.type = 'button'; withIcon(b, 'clock', 'Check opening hours'); b.onclick = () => checkHours(b);
  if (tb) tb.append(b);
}

ctx.register('explore', { render });
