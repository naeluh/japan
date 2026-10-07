/* Plan: where to stay, how to get between cities, things to do, and the expected total for two.
   Choices are shared (settings/picks) and change only the estimate; "Put this stay on the plan" writes the hotel to-do,
   so Money and the price watch follow. Options and math live in catalog.js; nights always come from the route. */
import { ctx, docsOf } from './app.js';
import { ROUTE, CHAPTERS, TRIP, TRIP_END, GROUP_DATE, dayLabel, addDays, links } from './trip.js';
import { POOLS, LEGS, EXTRAS, CITY, GIANTS, GIANTS_LABEL, FOOD, FOOD_LABEL, TRANSIT, BAGS, BIKES, poolsFor, legKeys, readPicks, estimate, stayParts, findOpt, legOpt } from './catalog.js';

const { el, icon, withIcon, extLink, toast, fUSD } = ctx;
const VISIBLE = 6;
let typeFilter = 'all';            // per viewer: All / Hotels / Ryokan
const expanded = new Set();        // stops showing every option
let lastMid = null;

/* ---------- The route as the estimate sees it ---------- */
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/* A plan item that is one of the catalog's stays: put there by this page (stay), or named in its title, place or hotel name. */
function matchOpt(pool, i) {
  if (!pool) return null;
  if (i.stay) return findOpt(pool, i.stay);
  const t = norm((i.title || '') + ' ' + (i.place || '') + ' ' + (i.hotelQuery || ''));
  return POOLS[pool].find(o => t.includes(norm(o.name))) || null;
}
const itemName = (i, m) => m ? m.name : (i.place ? i.place.split(',')[0] : i.title || 'Hotel');
function stops() {
  const pools = poolsFor(ROUTE.stops);
  return ROUTE.stops.map((s, k) => {
    const pool = pools[k], ids = new Set(s.days.map(d => d.id));
    const items = ctx.live().filter(i => i.cat === 'lodging' && ids.has(i.group));
    let plan = null;
    if (items.length) {
      const matched = items.map(i => matchOpt(pool, i));
      plan = { items, matched, usd: items.reduce((n, i) => n + (typeof i.cost === 'number' ? ctx.toUSD(i.cost, i.cur) : 0), 0),
        name: items.map((i, j) => itemName(i, matched[j])).join(', then '), meals: items.length === 1 && matched[0] ? matched[0].meals : undefined };
    }
    return { id: s.id, city: s.city, pool, nights: s.days.length, island: !!s.island, plan, days: s.days };
  });
}
const picksNow = (st) => readPicks(docsOf('settings/picks'), st);

/* ---------- Writes: one shared doc, no log lines (exploring isn't a change to the plan) ---------- */
// ponytail: whole-doc set, so two people picking inside one 5-second sync window keep only the later pick; merge per field if that bites.
function save(patch) {
  if (!ctx.db) return;
  if (!ctx.canWrite) return ctx.needEdit();
  const raw = docsOf('settings/picks') || {};
  ctx.db.doc('settings/picks').set({ ...raw, ...patch, updatedAt: Date.now(), updatedBy: ctx.uid || null }).catch(ctx.handleErr);
}
function saveStay(id, v) { const raw = docsOf('settings/picks') || {}; save({ stays: { ...(raw.stays || {}), [id]: v } }); }
function saveIn(key, id, v) { const raw = docsOf('settings/picks') || {}; save({ [key]: { ...(raw[key] || {}), [id]: v } }); }

/* ---------- Small builders ---------- */
const nights = (n) => n + (n === 1 ? ' night' : ' nights');
const range = (o) => fUSD(o.lo) + '–' + fUSD(o.hi).slice(1) + ' a night';
function section(title, ...kids) { const s = el('section', 'pick-sec'); s.append(el('h3', null, title), ...kids.filter(Boolean)); return s; }
function tag(text, cls) { return el('span', 'pick-tag' + (cls ? ' ' + cls : ''), text); }
function tagsFor(pool, o) {
  const t = [];
  if (o.badge) t.push(tag(o.badge, 'line'));
  if (pool === 'tokyo2' && o.west) t.push(tag('West side'));
  if (o.type === 'ryokan') t.push(tag('Ryokan', 'line'));
  if (o.onsen) t.push(tag('Hot spring'));
  if (o.meals === 'db') t.push(tag('Dinner and breakfast'));
  if (o.meals === 'b') t.push(tag('Breakfast'));
  return t;
}
function bookLink(o, fallback) {
  if (!o.url) return null;
  const search = o.url.includes('google.com/search');
  const a = extLink(o.url, o.linkLabel || (search ? 'Search to book' : fallback || 'Book'), 'pick-link'); if (!a) return null;
  const w = el('span', 'pick-links'); w.append(a); if (o.how) w.append(el('span', 'pick-how', o.how)); return w;
}
/* One choice as a radio row: the whole row is the label. */
/* A catalog row's photo: free Wikipedia lead images, resolved once and stored in catalog.js (photo: [src, credit, page]).
   Decorative (the name sits beside it); the credit links to the file's license page. A file that stops loading just disappears. */
function photoOf(row, ph, main) {
  if (!ph) return null;
  const img = el('img', 'pick-photo'); img.src = ph[0]; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 104; img.height = 78;
  const credit = extLink(ph[2], 'Photo: ' + ph[1], 'pick-credit');
  img.onerror = () => { img.remove(); if (credit) credit.remove(); row.classList.remove('has-photo'); };
  row.classList.add('has-photo'); if (credit) main.append(credit);
  return img;
}
function optRow({ name, id, value, checked, title, area, blurb, tags, link, price, per, onPick, photo }) {
  const l = el('label', 'pick-opt' + (checked ? ' is-on' : '')); l.htmlFor = id;
  const r = el('input'); r.type = 'radio'; r.name = name; r.id = id; r.value = value; r.checked = checked;
  r.disabled = !ctx.canWrite; r.onchange = () => { if (r.checked) onPick(value); };
  const main = el('span', 'pick-main'); main.append(el('b', 'pick-name', title));
  if (area) main.append(el('span', 'pick-area', area));
  if (blurb) main.append(el('span', 'pick-blurb', blurb));
  if (tags && tags.length) { const t = el('span', 'pick-tags'); t.append(...tags); main.append(t); }
  if (link) main.append(link);
  const pr = el('span', 'pick-price'); pr.append(el('b', null, price)); if (per) pr.append(el('small', null, per));
  const ph = photoOf(l, photo, main);
  l.append(r, main, ...(ph ? [ph] : []), pr);
  return l;
}
function checkRow({ id, checked, disabled, title, when, link, cost, onToggle, photo }) {
  const row = el('div', 'pick-check');
  const c = el('input'); c.type = 'checkbox'; c.id = id; c.checked = checked; c.disabled = disabled || !ctx.canWrite;
  c.onchange = () => onToggle(c.checked);
  const main = el('span', 'pick-main'); const l = el('label', 'pick-name', title); l.htmlFor = id; main.append(l);
  if (when) main.append(el('span', 'pick-blurb', when));
  if (link) main.append(link);
  const ph = photoOf(row, photo, main);
  row.append(c, main, ...(ph ? [ph] : []), el('b', 'pick-cost', cost)); return row;
}
function linkList(pairs) { const w = el('span', 'pick-links'); pairs.forEach(([t, u]) => { const a = extLink(u, t, 'pick-link'); if (a) w.append(a); }); return w; }

/* ---------- City tab: where to stay ---------- */
function stayPicker(s, c, p) {
  const v = p.stays[s.id], box = el('div');
  const rows = el('div', 'pick-opts');
  const hidden = new Set(s.plan ? s.plan.matched.filter(Boolean).map(o => o.id) : []);
  const pick = (a) => saveStay(s.id, { ...v, a, b: v.b === a ? null : v.b });
  if (s.plan) {
    const pl = s.plan, m = pl.matched.find(Boolean);
    const blurb = pl.items.map(i => (i.title || 'Hotel') + ' · ' + (i.nights > 0 ? nights(i.nights) : 'nights not set') + (typeof i.cost === 'number' ? ' · ' + fUSD(ctx.toUSD(i.cost, i.cur)) : '')).join('. ');
    const tags = [tag('On the plan', 'plan')];
    if (pl.items.some(i => i.paid)) tags.push(tag('Paid'));
    if (pl.matched.length === 1 && m) tags.push(...tagsFor(s.pool, m));
    rows.append(optRow({ name: 'pk-' + s.id, id: 'pk-' + s.id + '-plan', value: 'plan', checked: v.a === 'plan', title: pl.name, area: pl.items.length > 1 ? 'Split across ' + pl.items.length + ' places' : (pl.items[0].place || '').split(',').slice(1).join(',').trim(),
      blurb, tags, link: null, price: fUSD(pl.usd), per: fUSD(pl.usd / s.nights) + ' a night', onPick: pick, photo: pl.matched.length === 1 && m ? m.photo : null }));
  }
  const all = s.pool ? POOLS[s.pool].filter(o => !hidden.has(o.id)) : [];
  all.sort((x, y) => (y.id === v.a) - (x.id === v.a));
  const fit = all.filter(o => typeFilter === 'all' || o.type === typeFilter || o.id === v.a);
  const open = expanded.has(s.id), shown = open ? fit : fit.filter((o, k) => k < VISIBLE || o.id === v.a);
  const parts = stayParts(s, v), aN = parts.length && v.a !== 'plan' ? parts[0].n : s.nights;
  shown.forEach(o => rows.append(optRow({ name: 'pk-' + s.id, id: 'pk-' + s.id + '-' + o.id, value: o.id, checked: o.id === v.a, title: o.name, area: o.area, blurb: o.blurb,
    tags: tagsFor(s.pool, o), link: bookLink(o), price: fUSD((o.lo + o.hi) / 2 * (o.id === v.a ? aN : s.nights)), per: range(o), onPick: pick, photo: o.photo })));
  if (s.pool) {
    const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Show stays');
    [['all', 'All stays'], ['hotel', 'Hotels'], ['ryokan', 'Ryokan']].forEach(([k, t]) => {
      const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', String(typeFilter === k)); b.id = 'pk-type-' + k;
      b.onclick = () => { typeFilter = k; ctx.render(); }; seg.append(b);
    });
    box.append(seg);
  }
  if (CITY[s.pool] && CITY[s.pool].note) box.append(el('p', 'pick-note', CITY[s.pool].note));
  box.append(rows);
  const foot = el('div', 'pick-foot');
  const more = fit.length - shown.length;
  if (more > 0 || open) {
    const b = el('button', 'linkbtn', open ? 'Show fewer' : 'Show ' + more + ' more'); b.type = 'button'; b.id = 'pk-more-' + s.id;
    b.onclick = () => { if (expanded.has(s.id)) expanded.delete(s.id); else expanded.add(s.id); ctx.render(); }; foot.append(b);
  }
  if (!s.pool) {   // a city the catalog doesn't know: search the sites for its dates
    const ci = GROUP_DATE[s.days[0].id], co = addDays(ci, s.nights);
    foot.append(linkList([['Booking.com', links.booking(s.city + ' Japan', ci, co)], ['Google hotels', links.google('hotels in ' + s.city + ' Japan')]]));
  }
  if (foot.childNodes.length) box.append(foot);
  if (v.a && v.a !== 'plan' && s.plan) {
    const booked = s.plan.items.filter(i => i.paid || i.code);
    if (booked.length) box.append(el('p', 'slab warning', booked.map(i => itemName(i)).join(' and ') + (booked.length === 1 ? ' is' : ' are') + ' already booked. Cancel before booking somewhere else.'));
  }
  if (v.a && v.a !== 'plan' && s.nights > 1) box.append(splitBox(s, v));
  if (v.a && v.a !== 'plan' && ctx.canWrite) {
    const put = el('button', 'btn'); put.type = 'button'; put.id = 'pk-put-' + s.id;
    withIcon(put, 'bed', 'Put this stay on the plan'); put.onclick = () => putOnPlan(s, c, v);
    const row = el('div', 'pick-put'); row.append(put, el('span', 'help', s.plan ? 'Replaces ' + s.plan.name + ' on the plan.' : 'Adds the check-in to ' + dayLabel(GROUP_DATE[s.days[0].id]) + '.'));
    box.append(row);
  }
  return section('Where to stay', box);
}
function splitBox(s, v) {
  const box = el('div', 'pick-split');
  const l = el('label', 'switch'); const cb = el('input'); cb.type = 'checkbox'; cb.id = 'pk-split-' + s.id; cb.checked = v.split; cb.disabled = !ctx.canWrite;
  cb.onchange = () => saveStay(s.id, { ...v, split: cb.checked }); l.append(cb, document.createTextNode('Split this stay between two places')); box.append(l);
  if (!v.split) return box;
  const row = el('div', 'pick-split-row');
  const n = el('select'); n.id = 'pk-splitn-' + s.id; n.setAttribute('aria-label', 'Nights at the second place'); n.disabled = !ctx.canWrite;
  for (let k = 1; k < s.nights; k++) { const o = el('option', null, nights(k)); o.value = String(k); n.append(o); }
  n.value = String(v.bn); n.onchange = () => saveStay(s.id, { ...v, bn: Number(n.value) });
  const b = el('select'); b.id = 'pk-splitb-' + s.id; b.setAttribute('aria-label', 'The second place'); b.disabled = !ctx.canWrite;
  const none = el('option', null, 'Choose a place'); none.value = ''; b.append(none);
  POOLS[s.pool].filter(o => o.id !== v.a).forEach(o => { const x = el('option', null, o.name + (o.type === 'ryokan' ? ' (ryokan)' : '') + ', ' + fUSD((o.lo + o.hi) / 2) + ' a night'); x.value = o.id; b.append(x); });
  b.value = v.b || ''; b.onchange = () => saveStay(s.id, { ...v, b: b.value || null });
  row.append(el('span', null, 'Last'), n, el('span', null, 'at'), b); box.append(row);
  return box;
}

/* ---------- City tab: getting here, things to do ---------- */
function legInfo(st, k) {
  const keys = legKeys(st.map(x => x.pool)), key = keys[k];
  const c = CHAPTERS.find(x => x.id === st[k].id), prev = k ? st[k - 1] : null;
  const when = k ? dayLabel(c.first) : 'Arriving ' + dayLabel(TRIP.start) + ', leaving ' + dayLabel(TRIP_END);
  const title = k ? prev.city + ' to ' + st[k].city : TRIP.airport.name + ' Airport and ' + st[k].city;
  return { key, title, when, note: key && LEGS[key].note, prev };
}
function legPicker(st, k, p) {
  const L = legInfo(st, k), box = el('div');
  box.append(el('p', 'pick-note', L.title + ' · ' + L.when + (L.note ? '. ' + L.note : '')));
  if (!L.key) {
    const u = new URL('https://www.google.com/maps/dir/'); u.searchParams.set('api', '1');
    u.searchParams.set('origin', (L.prev ? L.prev.city : 'Narita Airport') + ', Japan'); u.searchParams.set('destination', st[k].city + ', Japan'); u.searchParams.set('travelmode', 'transit');
    box.append(linkList([['Trains in Google Maps', u.href]]));
    return section('Getting here', box);
  }
  const rows = el('div', 'pick-opts'), cur = p.legs[L.key];
  LEGS[L.key].options.forEach(o => rows.append(optRow({ name: 'pk-leg-' + k, id: 'pk-leg-' + k + '-' + o.id, value: o.id, checked: o.id === cur, title: o.name, blurb: o.d,
    link: bookLink(o, 'Book tickets'), price: (o.approx ? 'about ' : '') + fUSD(o.cost), onPick: (id) => saveIn('legs', L.key, id), photo: o.photo })));
  box.append(rows);
  return section('Getting here', box);
}
function thingsToDo(s, p) {
  const box = el('div', 'pick-checks');
  EXTRAS.filter(e => e.pool === s.pool).forEach(e => box.append(checkRow({ id: 'pk-x-' + e.id, checked: p.extras[e.id], title: e.name, when: e.when, link: linkList(e.links), cost: fUSD(e.cost),
    onToggle: (on) => saveIn('extras', e.id, on), photo: e.photo })));
  if (s.pool === 'tokyo') {
    const row = el('div', 'pick-check pick-select');
    const main = el('span', 'pick-main'); const l = el('label', 'pick-name', 'Giants game at Tokyo Dome'); l.htmlFor = 'pk-giants'; main.append(l,
      el('span', 'pick-blurb', 'Date set once the 2027 schedule is out. Seats from ¥2,000 each; prices here include stadium food and drinks.'), linkList([['Giants tickets in English', 'https://www.giants.jp/en/']]));
    const sel = el('select'); sel.id = 'pk-giants'; sel.disabled = !ctx.canWrite;
    Object.keys(GIANTS).forEach(k => { const o = el('option', null, GIANTS_LABEL[k] + (GIANTS[k] ? ', ' + fUSD(GIANTS[k]) : '')); o.value = k; sel.append(o); });
    sel.value = p.giants; sel.onchange = () => save({ giants: sel.value });
    row.append(main, sel); box.append(row);
  }
  if (s.island) box.append(checkRow({ id: 'pk-bikes', checked: p.bikes, title: 'E-bikes for the island, 2 days', when: 'Rent at Miyanoura Port when you arrive.', cost: fUSD(BIKES), onToggle: (on) => save({ bikes: on }) }));
  return box.childNodes.length ? section('Things to do here', el('p', 'pick-note', 'Costs are for both of you.'), box) : null;
}
function city(c) {
  const st = stops(), k = st.findIndex(s => s.id === c.id); if (k < 0) return null;
  const s = st[k], p = picksNow(st), wrap = el('div', 'picks');
  wrap.style.setProperty('--line', ctx.cityInfo(c.id).line);
  wrap.append(stayPicker(s, c, p), legPicker(st, k, p));
  const t = thingsToDo(s, p); if (t) wrap.append(t);
  wrap.append(el('h3', 'pick-days', 'Day by day'));
  return wrap;
}

/* ---------- Overview: the rail's stay and train lines, then trip-wide choices ---------- */
function station(c) {
  const st = stops(), s = st.find(x => x.id === c.id); if (!s) return null;
  const v = picksNow(st).stays[s.id], parts = stayParts(s, v), line = el('p', 'rail-stay');
  line.append(icon('bed'));
  if (!parts.length) { line.append(el('span', 'muted', 'No stay picked yet')); return line; }
  const name = v.a === 'plan' ? s.plan.name : parts.map(x => x.o.name + (parts.length > 1 ? ' (' + nights(x.n) + ')' : '')).join(', then ');
  const t = el('span', 'nm', name); t.append(el('span', 'amt', fUSD(parts.reduce((n, x) => n + (x.lo + x.hi) / 2, 0))));
  if (v.a !== 'plan') t.append(el('span', 'pick-tag', 'Picked here, not on the plan yet'));   // only the exception gets a label
  line.append(t);
  return line;
}
function leg(prev, c) {
  const st = stops(), k = st.findIndex(s => s.id === c.id); if (k < 0) return null;
  const L = legInfo(st, k), box = el('div');
  if (L.key) { const o = legOpt(L.key, picksNow(st).legs[L.key]); const n = el('p', 'rail-legname'); n.append(el('span', null, o.name), el('span', 'amt', (o.approx ? 'about ' : '') + fUSD(o.cost))); box.append(n); }
  box.append(el('p', 'rail-when', L.title + ' · ' + (k ? L.when : dayLabel(TRIP.start))));
  return box;
}
function overview() {
  const st = stops(), p = picksNow(st), wrap = el('div', 'picks');
  const food = el('div', 'pick-food'); food.setAttribute('role', 'radiogroup'); food.setAttribute('aria-label', 'Food style');
  Object.keys(FOOD).forEach(k => {
    const l = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'pk-food'; r.id = 'pk-food-' + k; r.value = k; r.checked = p.food === k; r.disabled = !ctx.canWrite;
    r.onchange = () => { if (r.checked) save({ food: k }); };
    const t = el('span', 'lbl'); t.append(el('b', null, FOOD_LABEL[k]), document.createTextNode(fUSD(FOOD[k]) + ' per person a day')); l.append(r, t); food.append(l);
  });
  const rows = el('div', 'pick-checks');
  rows.append(checkRow({ id: 'pk-transit', checked: true, disabled: true, title: 'City trains, subways and buses', when: 'On a Suica card in your phone\'s wallet, about ¥1,000–1,500 each a day.', cost: fUSD(TRANSIT), onToggle: () => {} }),
    checkRow({ id: 'pk-bags', checked: p.bags, title: 'Ship your suitcases ahead, twice', when: 'Hotel to hotel, so you ride the Shinkansen light. The front desk arranges it.', cost: fUSD(BAGS), onToggle: (on) => save({ bags: on }) }));
  // Typing and dragging hold re-renders (data-hold) until the value is committed; see render() in app.js.
  const shop = el('div', 'pick-check pick-field');
  const sm = el('span', 'pick-main'); const sl = el('label', 'pick-name', 'Shopping and souvenirs'); sl.htmlFor = 'pk-shopping'; const out = el('span', 'pick-blurb', fUSD(p.shopping) + ' for the trip'); sm.append(sl, out);
  const rg = el('input'); rg.type = 'range'; rg.id = 'pk-shopping'; rg.min = '0'; rg.max = '2000'; rg.step = '50'; rg.value = String(p.shopping); rg.dataset.hold = ''; rg.dataset.v = rg.value; rg.disabled = !ctx.canWrite;
  rg.oninput = () => { out.textContent = fUSD(Number(rg.value)) + ' for the trip'; };
  rg.onchange = () => { rg.dataset.v = rg.value; save({ shopping: Number(rg.value) }); };
  shop.append(sm, rg);
  const fl = el('div', 'pick-check pick-field');
  const fm = el('span', 'pick-main'); const flb = el('label', 'pick-name', 'Flights, if you want them in the total'); flb.htmlFor = 'pk-flights'; fm.append(flb, el('span', 'pick-blurb', 'Your ZIPAIR tickets for both of you, in dollars.'));
  const fi = el('input'); fi.type = 'number'; fi.id = 'pk-flights'; fi.min = '0'; fi.step = '10'; fi.inputMode = 'numeric'; fi.value = p.flights ? String(p.flights) : ''; fi.dataset.hold = ''; fi.dataset.v = fi.value; fi.disabled = !ctx.canWrite;
  fi.onchange = () => { const n = Number(fi.value); fi.dataset.v = fi.value; save({ flights: n > 0 ? n : 0 }); };
  fl.append(fm, fi);
  rows.append(shop, fl);
  wrap.append(section('Food, bags and spending', el('p', 'pick-note', 'For the whole trip, both of you. Each city\'s stays, trains and things to do are on its tab.'), food,
    el('p', 'pick-note', 'Ryokan stays with dinner and breakfast come off the food budget.'), rows));
  return wrap;
}

/* ---------- The estimate ---------- */
function aside() {
  const st = stops(), p = picksNow(st), e = estimate(p, st), base = estimate(readPicks(null, st), st).mid;
  const box = el('div', 'sum');
  box.append(el('h2', 'sum-h', 'Expected total for two'));
  box.lastChild.id = 'sumh';
  const big = el('p', 'sum-big', fUSD(e.mid));
  if (lastMid != null && Math.round(lastMid) !== Math.round(e.mid) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    big.classList.add('flash'); requestAnimationFrame(() => requestAnimationFrame(() => big.classList.remove('flash')));
  }
  lastMid = e.mid;
  const d = Math.round((e.mid - base) / 10) * 10;
  box.append(big, Math.round(e.hi - e.lo) > 0 ? el('p', 'sum-range', 'Likely between ' + fUSD(e.lo) + ' and ' + fUSD(e.hi)) : '', el('p', 'sum-perday', 'About ' + fUSD(e.mid / (e.nights || 1)) + ' a day'),
    el('p', 'sum-delta', d === 0 ? 'Same as the plan' : fUSD(Math.abs(d)) + (d > 0 ? ' more' : ' less') + ' than the plan'));
  const dl = el('dl', 'sum-dl');
  [['Places to stay', e.staysMid], ['Food and drink' + (e.credit ? ' (after ryokan meals)' : ''), e.food], ['Getting around (trains, ferries, bags)', e.transport],
    ['Things to do', e.activities], ['Data, taxes and shopping', e.other], ...(e.flights ? [['Flights', e.flights]] : [])]
    .forEach(([t, n]) => dl.append(el('dt', null, t), el('dd', null, fUSD(n))));
  box.append(dl);
  const ul = el('ul', 'sum-stays');
  e.stays.forEach(x => { const li = el('li'); li.style.setProperty('--line', ctx.cityInfo(x.stop).line); li.append(el('i'), el('span', null, x.o.name + ', ' + nights(x.n))); ul.append(li); });
  box.append(ul);
  if (ctx.canWrite && docsOf('settings/picks')) {
    const r = el('button', 'btn secondary sm', 'Reset to the plan'); r.type = 'button'; r.id = 'pk-reset';
    r.onclick = () => ctx.db.doc('settings/picks').set({ updatedAt: Date.now(), updatedBy: ctx.uid || null }).catch(ctx.handleErr);
    box.append(r);
  }
  const t = ctx.totals(), money = el('p', 'sum-fine'); const a = el('a', null, fUSD(t.all.paid + t.all.est) + ' projected'); a.href = '#/money';
  money.append(document.createTextNode('Money tracks what\'s on the plan: '), a, document.createTextNode('.'));
  box.append(money, el('p', 'sum-fine', 'Estimates in US dollars for sakura season, April 2027. Option prices use ¥155 to $1, from recent published rates and 2026 fares; the stays on the plan use what the plan says. Check live prices before booking.'));
  const chip = document.getElementById('estChip');
  chip.textContent = ''; chip.append(el('small', null, 'Estimate'), el('b', null, fUSD(e.mid))); chip.hidden = false;
  chip.setAttribute('aria-label', 'Expected total ' + fUSD(e.mid) + ', show the breakdown');
  return box;
}
document.getElementById('estChip').onclick = () => document.getElementById('estimate').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

/* ---------- Put this stay on the plan: add the new check-in(s), skip the old ones (restorable) ---------- */
function putOnPlan(s, c, v) {
  if (!ctx.canWrite) return ctx.needEdit();
  const parts = stayParts(s, v); if (!parts.length) return;
  let k = 0;
  const adds = parts.map(x => { const day = s.days[k].id; k += x.n; return { o: x.o, n: x.n, day, usd: Math.round((x.lo + x.hi) / 2) }; });
  const old = s.plan ? s.plan.items : [];
  const body = el('div', 'pick-confirm');
  const ul = el('ul'); adds.forEach(a => ul.append(el('li', null, 'Check in at ' + a.o.name + ' · ' + dayLabel(GROUP_DATE[a.day]) + ' · ' + nights(a.n) + ' · about ' + fUSD(a.usd))));
  body.append(el('p', null, 'Adds to the plan:'), ul);
  if (old.length) {
    const sk = el('ul'); old.forEach(i => sk.append(el('li', null, '“' + (i.title || 'Untitled') + '”' + (typeof i.cost === 'number' ? ' · ' + fUSD(ctx.toUSD(i.cost, i.cur)) : ''))));
    body.append(el('p', null, 'Skips (they stay in the plan; turn on Skipped to bring one back):'), sk);
    const booked = old.filter(i => i.paid || i.code);
    if (booked.length) body.append(el('p', 'slab warning', booked.map(i => itemName(i) + (i.code ? ' (code ' + i.code + ')' : ' (paid)')).join(', ') + ': cancel that booking first.'));
  }
  body.append(el('p', 'help', 'Costs go to Money as estimates. For live prices, add the hotel\'s Japanese name in Edit.'));
  const ok = el('button', 'btn'); ok.type = 'button'; withIcon(ok, 'bed', 'Put on the plan');
  const cancel = el('button', 'btn secondary', 'Cancel'); cancel.type = 'button'; cancel.onclick = ctx.closeSheet;
  ok.onclick = () => {
    ctx.closeSheet();
    const nextSort = (gid) => Math.max(0, ...ctx.items.filter(x => x.group === gid).map(x => x.sort || 0)) + 10;
    adds.forEach(a => ctx.create({ group: a.day, sort: nextSort(a.day), done: false, title: 'Check in at ' + a.o.name, detail: a.o.blurb, priority: 'high', start: '', end: '', kind: 'activity',
      place: a.o.name + ', ' + a.o.area, lat: null, lng: null, cost: a.usd, cur: 'USD', cat: 'lodging', paid: false, paidBy: null, nights: a.n,
      links: a.o.url ? [{ label: a.o.linkLabel || 'Book', url: a.o.url }] : [], code: '', opens: '', target: null, stay: a.o.id }, 'Put ' + ctx.q(a.o.name) + ' on the plan for ' + s.city));
    old.forEach(i => ctx.write(i.id, { disabled: true }, 'Skipped ' + ctx.q(i.title) + ' for ' + adds[0].o.name));
    const raw = docsOf('settings/picks') || {}, stays = { ...(raw.stays || {}) }; delete stays[s.id];   // the new stay is now "On the plan"
    save({ stays });
    toast(adds.map(a => a.o.name).join(' and ') + ' is on the plan.');
  };
  ctx.openSheet({ title: 'Put this stay on the plan?', body, foot: [cancel, ok] });
}

ctx.register('plan', { station, leg, city, overview, aside });
