/* Today: the phone-first travel-day view (next stop, walk, codes, tonight's hotel), plus quick expense logging. */
import { ctx } from './app.js';
import { GROUPS, GROUP_DATE, TRAVELERS, TRIP } from './trip.js';

const { $, el, icon, withIcon, extLink, toast } = ctx;
const DAYS = GROUPS.filter(g => GROUP_DATE[g.id]);
let pick = null;   // a day chosen with the arrows; null follows the calendar

function dayFor(now) {
  const g = DAYS.find(d => GROUP_DATE[d.id] === now.date);
  if (g) return { g, mode: 'live' };
  return now.date < TRIP.start ? { g: DAYS[0], mode: 'before' } : { g: DAYS[DAYS.length - 1], mode: 'after' };
}
function tonight(date) { // the stay whose nights cover this date
  return ctx.live().filter(i => i.cat === 'lodging' && GROUP_DATE[i.group] && i.nights > 0)
    .find(i => GROUP_DATE[i.group] <= date && date < ctx.addDaysISO(GROUP_DATE[i.group], i.nights));
}
function hoursNote(i) {
  try { const h = (JSON.parse(localStorage.getItem('trip:hours') || '{}').results || {})[i.id]; if (h && (h.state === 'closed' || h.state === 'partial')) return h; } catch (e) { /* none saved */ }
  return null;
}
function directions(i, mode) {
  const u = new URL('https://www.google.com/maps/dir/'); u.searchParams.set('api', '1');
  u.searchParams.set('destination', ctx.mapQuery(i)); u.searchParams.set('travelmode', mode);
  return u.href;
}
function codeChip(code) { const c = el('button', 'chip codechip'); c.type = 'button'; withIcon(c, 'copy', code); c.title = 'Copy'; c.onclick = () => ctx.copyText(code, 'Code copied.'); return c; }

function nextStopCard(i, list, state) {
  const card = el('section', 'card pad nextstop');
  card.append(el('p', 'kicker', state === 'now' ? 'Happening now' : state === 'preview' ? 'First stop' : 'Next stop'));
  if (i.start) card.append(el('p', 'bignum', ctx.timeRange(i)));
  card.append(el('h2', 'next-title', i.title || 'Untitled'));
  if (i.place) { const w = el('p', 'where'); w.append(icon('pin'), el('span', null, i.place)); card.append(w); }
  if (i.detail) card.append(el('p', 'detail', i.detail));
  const leg = ctx.walkLegFor(list, i);
  const pills = el('div', 'pills');
  if (leg) pills.append(withIcon(el('span', 'badge'), 'walk', 'About ' + Math.max(1, leg.minutes) + ' min on foot from ' + (leg.from.place || leg.from.title || 'the last stop').split(',')[0]));
  if (i.code) pills.append(codeChip(i.code));
  if (pills.childNodes.length) card.append(pills);
  const h = hoursNote(i);
  if (h) card.append(el('p', 'slab warning', (h.state === 'closed' ? 'May be closed then.' : 'May close before you leave.') + (h.hours ? ' OpenStreetMap hours: ' + h.hours : '')));
  const acts = el('div', 'add');
  if (i.kind !== 'travel' || i.place || ctx.hasPin(i)) {
    const a = el('a', 'btn'); a.href = directions(i, leg && leg.minutes > 25 ? 'transit' : 'walking'); a.target = '_blank'; a.rel = 'noopener noreferrer';
    withIcon(a, 'route', 'Directions'); acts.append(a);
  }
  ctx.linkList(i).forEach(l => { const a = extLink(l.url, l.label || 'Booking'); if (a) acts.append(a); });
  card.append(acts);
  return card;
}

function render() {
  const root = $('#todayView'); if (!root) return;
  root.textContent = '';
  if (!ctx.loaded) return;
  const now = ctx.tokyoNow();
  const auto = dayFor(now);
  const g = pick ? DAYS.find(d => d.id === pick) : auto.g;
  const date = GROUP_DATE[g.id];
  const live = !pick && auto.mode === 'live';
  // Day switcher
  const nav = el('div', 'daynav');
  const k = DAYS.indexOf(g);
  const prev = ctx.iconBtn('arrow', 'Previous day', () => { pick = DAYS[Math.max(0, k - 1)].id; render(); }); prev.querySelector('svg').style.transform = 'rotate(180deg)'; prev.disabled = k === 0;
  const next = ctx.iconBtn('arrow', 'Next day', () => { pick = DAYS[Math.min(DAYS.length - 1, k + 1)].id; render(); }); next.disabled = k === DAYS.length - 1;
  const title = el('div', 'grow'); title.append(el('p', 'kicker', g.when), el('h1', 'today-title', g.what));
  nav.append(prev, title, next);
  root.append(nav);
  if (!navigator.onLine) root.append(el('p', 'slab', 'Offline. This is the plan as of your last sync; changes you make will send when you\'re back online.'));
  if (!live && !pick) {
    const days = Math.ceil((Date.parse(TRIP.start) - Date.parse(now.date)) / 86400e3);
    root.append(el('p', 'slab info', auto.mode === 'before' ? 'The trip starts in ' + days + (days === 1 ? ' day' : ' days') + '. This is how ' + g.when + ' will look.' : 'The trip is over. This was the last day.'));
  }
  if (pick && pick !== auto.g.id) { const b = el('button', 'linkbtn', 'Back to today'); b.type = 'button'; b.onclick = () => { pick = null; render(); }; root.append(b); }
  const w = ctx.wxText(g.id); if (w) { const p = el('p', 'wx'); p.append(el('b', null, w.lead), document.createTextNode(w.text)); root.append(p); }
  const list = ctx.live().filter(i => i.group === g.id).sort(ctx.byTime);
  // Next stop: in progress, else the next one after now (live), else the first not done
  let state = 'preview', nextItem = null;
  if (live) {
    nextItem = list.find(i => { const s = ctx.mins(i.start), e = ctx.mins(i.end); return s != null && now.min >= s && now.min < (e != null ? e : s + 30); });
    if (nextItem) state = 'now';
    else { nextItem = list.find(i => !i.done && ctx.mins(i.start) != null && ctx.mins(i.start) >= now.min); state = 'next'; }
  }
  if (!nextItem) { nextItem = list.find(i => !i.done && i.kind !== 'travel') || list[0]; state = live ? 'next' : 'preview'; }
  if (nextItem) root.append(nextStopCard(nextItem, list, state));
  else root.append(el('p', 'empty', 'Nothing planned for this day.'));
  // Tonight
  const stay = tonight(date);
  if (stay) {
    const c = el('section', 'card pad');
    c.append(el('p', 'kicker', 'Tonight'), el('h3', 'card-title', (stay.place || stay.title).split(',')[0]));
    const p = el('div', 'pills');
    if (stay.code) p.append(codeChip(stay.code));
    const a = extLink(ctx.mapsUrl(stay), 'Map'); if (a) p.append(a);
    ctx.linkList(stay).forEach(l => { const b = extLink(l.url, l.label || 'Booking'); if (b) p.append(b); });
    if (p.childNodes.length) c.append(p);
    root.append(c);
  }
  // Codes for the day
  const codes = list.filter(i => i.code && i !== nextItem && i !== stay);
  if (codes.length) {
    const c = el('section', 'card pad'); c.append(el('h3', 'card-title', 'Booking codes'));
    const ul = el('ul', 'sales'); codes.forEach(i => { const li = el('li'); li.append(el('span', 'grow', i.title), codeChip(i.code)); ul.append(li); });
    c.append(ul); root.append(c);
  }
  // The rest of the day
  const rest = el('section', 'card pad');
  rest.append(el('h3', 'card-title', 'The day'));
  const ul = el('ul', 'dayline');
  list.forEach(i => {
    const li = el('li' , i.done ? 'done' : '');
    if (i === nextItem) li.classList.add('current');
    const cb = el('input', 'check'); cb.type = 'checkbox'; cb.checked = !!i.done; cb.disabled = !ctx.canWrite;
    cb.setAttribute('aria-label', (i.done ? 'Mark not done: ' : 'Mark done: ') + (i.title || ''));
    cb.onchange = () => ctx.write(i.id, cb.checked ? { done: true, doneBy: ctx.uid || null, doneAt: Date.now() } : { done: false, doneBy: null, doneAt: null }, (cb.checked ? 'Marked ' : 'Marked not done: ') + ctx.q(i.title) + (cb.checked ? ' done' : ''));
    li.append(cb, el('span', 'num t', i.start ? ctx.fmt12(i.start) : ''), el('span', 'grow', i.title));
    ul.append(li);
  });
  rest.append(ul);
  root.append(rest);
  // Money on the go
  if (ctx.canWrite) {
    const m = el('section', 'card pad');
    m.append(el('h3', 'card-title', 'Spent something?'));
    const acts = el('div', 'add');
    const log = el('button', 'btn'); log.type = 'button'; withIcon(log, 'wallet', 'Log an expense'); log.onclick = () => openExpense({});
    acts.append(log);
    m.append(acts); root.append(m);
  }
}

/* ---------- Expense sheet (Today and Money) ---------- */
function openExpense(pre) {
  const f = el('form'); f.id = 'expSheet';
  const row = el('div', 'row2');
  const amt = el('label', 'field'); amt.append(el('span', null, 'Amount')); const a = el('input'); a.type = 'number'; a.min = '0'; a.step = 'any'; a.inputMode = 'decimal'; a.value = pre.amount || ''; amt.append(a);
  const curL = el('label', 'field'); curL.append(el('span', null, 'Currency')); const cur = el('select'); [['JPY', '¥ yen'], ['USD', '$ dollars']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; cur.append(o); }); cur.value = pre.currency || 'JPY'; curL.append(cur);
  row.append(amt, curL);
  const noteL = el('label', 'field'); noteL.append(el('span', null, 'What for')); const note = el('input'); note.maxLength = 120; note.value = pre.merchant || ''; note.placeholder = 'Lunch, Nishiki'; noteL.append(note);
  const row2 = el('div', 'row3');
  const catL = el('label', 'field'); catL.append(el('span', null, 'Category')); const cat = el('select'); ctx.CATS.forEach(c => { const o = el('option', null, c.name); o.value = c.id; cat.append(o); }); cat.value = pre.category && ctx.CATS.some(c => c.id === pre.category) ? pre.category : 'food'; catL.append(cat);
  const pbL = el('label', 'field'); pbL.append(el('span', null, 'Paid by')); const pb = el('select'); [['', 'Not set'], ...TRAVELERS.map(t => [t, t])].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; pb.append(o); });
  try { const me = localStorage.getItem('trip:name') || ''; if (TRAVELERS.includes(me)) pb.value = me; } catch (e) { /* none */ }
  pbL.append(pb);
  const spL = el('label', 'field'); spL.append(el('span', null, 'For')); const sp = el('select'); [['even', 'Both of us'], ...TRAVELERS.map(t => [t, 'Only ' + t])].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sp.append(o); }); spL.append(sp);
  row2.append(catL, pbL, spL);
  f.append(row, noteL, row2);
  const save = el('button', 'btn', 'Log it'); save.type = 'submit'; save.setAttribute('form', 'expSheet');
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const amount = Number(a.value);
    if (!(amount > 0)) { toast('Enter an amount above zero.'); a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), 300); return; }
    const data = { amount, cur: cur.value, cat: cat.value, note: note.value.trim().slice(0, 120), at: Date.now(), by: ctx.uid || null, split: sp.value };
    if (TRAVELERS.includes(pb.value)) data.paidBy = pb.value;
    ctx.db.collection('expenses').add(data).then(() => ctx.addLog('Logged ' + ctx.fAmt(amount, data.cur) + (data.note ? ' for ' + ctx.q(data.note) : ''))).catch(ctx.handleErr);
    ctx.closeSheet(); toast('Logged.');
  };
  ctx.openSheet({ title: 'Log an expense', body: f, foot: [save] });
}

ctx.register('today', { render, openExpense });
