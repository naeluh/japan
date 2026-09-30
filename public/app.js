/* Japan trip planner: core (sync, plan, money, sheets, routing). Feature screens live in their own modules. */
import { TRIP, TRAVELERS, CHAPTERS, GROUPS, GROUP_DATE, CH_COORD, CH_CITY, groupCh, opensAt } from './trip.js';

const PRIOS = ['high', 'medium', 'low'];
const PLABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const API = window.TRIP_API;

let db = null, user = null, uid = null;
let canWrite = true;
let loaded = false;
let items = [];
let logRows = [];
let filter = 'all', statusF = 'all';
let showSkipped = false;
let editing = null;          // {id} or {group}: what the edit sheet is working on
const chains = new Map();    // one write at a time per doc
let pending = 0;             // writes in flight, for the sync pill
const live = () => items.filter(i => !i.disabled);

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, text) { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }

/* ---------- Icons (Lucide shapes, built with DOM APIs) ---------- */
const ICONS = {
  check: ['M20 6 9 17l-5-5'], plus: ['M5 12h14', 'M12 5v14'], x: ['M18 6 6 18', 'M6 6l12 12'], chevron: ['m6 9 6 6 6-6'],
  pin: ['M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0', { c: [12, 10, 3] }],
  pencil: ['M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z', 'm15 5 4 4'],
  ban: [{ c: [12, 12, 10] }, 'm4.9 4.9 14.2 14.2'], restore: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  map: ['M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z', 'M15 5.8v15', 'M9 3.2v15'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'm16 6-4-4-4 4', 'M12 2v13'],
  copy: [{ r: [8, 8, 14, 14, 2] }, 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  calendar: [{ r: [3, 4, 18, 18, 2] }, 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  tag: ['M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z', { c: [7.5, 7.5, 1] }],
  compass: [{ c: [12, 12, 10] }, 'm16.2 7.8-1.8 5.4a2 2 0 0 1-1.3 1.3l-5.3 1.7 1.8-5.4a2 2 0 0 1 1.3-1.3z'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  sun: [{ c: [12, 12, 4] }, 'M12 2v2', 'M12 20v2', 'm4.9 4.9 1.4 1.4', 'm17.7 17.7 1.4 1.4', 'M2 12h2', 'M20 12h2', 'm6.3 17.7-1.4 1.4', 'm19.1 4.9-1.4 1.4'],
  route: [{ c: [6, 19, 3] }, 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', { c: [18, 5, 3] }],
  walk: [{ c: [13, 4, 2] }, 'm9 20 3-6 3 2v6', 'm6 12 3-4 4 1 3 3 3 1', 'M12 14 11 9'],
  clock: [{ c: [12, 12, 10] }, 'M12 6v6l4 2'],
  bell: ['M10.3 21a2 2 0 0 0 3.4 0', 'M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z', { c: [12, 13, 3] }],
  send: ['M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1z', 'm21.9 2.1-11 11'],
  search: [{ c: [11, 11, 8] }, 'm21 21-4.3-4.3'], trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  alert: ['m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3', 'M12 9v4', 'M12 17h.01'],
  bed: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'],
  chat: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z'], arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  plane: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z']
};
function icon(name, cls) {
  const s = sv('svg', { class: 'i' + (cls ? ' ' + cls : ''), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  for (const p of ICONS[name] || []) {
    if (typeof p === 'string') s.append(sv('path', { d: p }));
    else if (p.c) s.append(sv('circle', { cx: p.c[0], cy: p.c[1], r: p.c[2] }));
    else if (p.r) s.append(sv('rect', { x: p.r[0], y: p.r[1], width: p.r[2], height: p.r[3], rx: p.r[4] }));
  }
  return s;
}
function withIcon(node, name, text) { node.append(icon(name)); if (text != null) node.append(document.createTextNode(text)); return node; }
function iconBtn(name, label, onclick, cls) {
  const b = el('button', 'iconbtn' + (cls ? ' ' + cls : '')); b.type = 'button';
  b.setAttribute('aria-label', label); b.title = label; b.append(icon(name)); if (onclick) b.onclick = onclick; return b;
}
function extLink(url, label, cls = 'chip') {
  const href = safeUrl(url); if (!href) return null;
  const a = el('a', cls); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.append(el('span', 't', label)); a.append(icon('external'));
  a.setAttribute('aria-label', label + ' (opens in a new tab)');
  return a;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), msg.length > 80 ? 5200 : 2800);
}
function setStatus(parts) {
  const s = $('#status'); s.textContent = '';
  parts.forEach(p => { if (typeof p === 'string') s.append(p); else s.append(el('strong', null, p.b)); });
}
function syncPill() {
  const p = $('#syncPill'); if (!db) { p.hidden = true; return; }
  p.hidden = false;
  const [cls, text] = !canWrite ? ['readonly', 'View only'] : !navigator.onLine ? ['offline', 'Offline'] : pending ? ['saving', 'Saving'] : ['', 'Saved'];
  p.className = 'pill-status' + (cls ? ' ' + cls : ''); p.textContent = text;
}
addEventListener('online', syncPill); addEventListener('offline', syncPill);

/* ---------- Sheet (one <dialog>, bottom sheet on phones) ---------- */
let sheetOnClose = null;   // settle the previous sheet's callback before replacing it (the name sheet has a promise waiting on it)
function openSheet({ title, body, foot, onClose }) {
  const d = $('#sheet');
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  d.textContent = '';
  const head = el('div', 'sheet-head'); const h = el('h2', null, title); h.id = 'sheetTitle';
  head.append(h, iconBtn('x', 'Close', () => d.close()));
  const b = el('div', 'sheet-body'); b.append(body);
  d.append(el('div', 'sheet-grab'), head, b);
  if (foot) { const f = el('div', 'sheet-foot'); f.append(...foot); d.append(f); }
  sheetOnClose = onClose || null;
  d.onclose = () => { const f = sheetOnClose; sheetOnClose = null; if (f) f(); };
  if (!d.open) d.showModal();
  if (!matchMedia('(pointer: coarse)').matches) { const f = b.querySelector('input,textarea,select'); if (f) f.focus(); }
  else d.focus();
  return d;
}
function closeSheet() { const d = $('#sheet'); if (d.open) d.close(); }
$('#sheet').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); }); // tap the scrim

/* Name for Recent changes, asked the first time someone edits. The shim calls this. */
API.askName = () => new Promise(resolve => {
  const f = el('form'); f.id = 'nameForm';
  const l = el('label', 'field'); l.append(el('span', null, 'Your name'));
  const inp = el('input'); inp.maxLength = 40; inp.autocomplete = 'given-name'; inp.placeholder = TRAVELERS[0]; l.append(inp);
  f.append(l, el('p', 'help', 'It shows next to the changes you make.'));
  let done = false;
  const ok = el('button', 'btn', 'Save'); ok.type = 'submit'; ok.setAttribute('form', 'nameForm');
  f.onsubmit = (ev) => { ev.preventDefault(); done = true; resolve(inp.value.trim().slice(0, 40)); closeSheet(); };
  openSheet({ title: 'What should we call you?', body: f, foot: [ok], onClose: () => { if (!done) resolve(''); } });
});

/* ---------- Routing: #/plan, #/money, ... (old #c1, #d03, #budget anchors still work) ---------- */
const SCREENS = [
  { id: 'plan', label: 'Plan', icon: 'route' },
  { id: 'today', label: 'Today', icon: 'sun' },
  { id: 'deals', label: 'Deals', icon: 'tag' },
  { id: 'explore', label: 'Explore', icon: 'compass' },
  { id: 'money', label: 'Money', icon: 'wallet' }
];
const modules = {};   // screen id -> { render() } registered by feature modules
let screen = 'plan';
function buildNav() {
  const top = $('#navTop'), dock = $('#navDock'); top.textContent = ''; dock.textContent = '';
  SCREENS.filter(s => document.querySelector(`[data-screen="${s.id}"]`)).forEach(s => {
    const a = el('button', null, s.label); a.type = 'button'; a.dataset.nav = s.id; top.append(a);
    const b = el('button'); b.type = 'button'; b.dataset.nav = s.id;
    const ic = el('span', 'ic'); ic.append(icon(s.icon)); b.append(ic, el('span', null, s.label)); dock.append(b);
  });
  for (const n of document.querySelectorAll('[data-nav]')) n.onclick = () => go(n.dataset.nav);
}
function go(id, anchor) {
  if (location.hash !== '#/' + id || anchor) history.pushState(null, '', '#/' + id);
  show(id, anchor);
}
function show(id, anchor) {
  if (!document.querySelector(`[data-screen="${id}"]`)) id = 'plan';
  const changed = id !== screen; screen = id;
  document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== id; });
  document.querySelectorAll('[data-nav]').forEach(n => { if (n.dataset.nav === id) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); });
  if (modules[id] && modules[id].render) modules[id].render();
  if (anchor) { const t = document.getElementById(anchor); if (t) requestAnimationFrame(() => t.scrollIntoView({ block: 'start' })); }
  else if (changed) scrollTo(0, 0);
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h || h === '/') return show('plan');
  if (h.startsWith('/')) { const [id, anchor] = h.slice(1).split('/'); return show(id, anchor); }
  if (h === 'budget') return show('money', 'budget');
  if (document.getElementById(h)) return show('plan', h); // #c1, #d03
  show('plan');
}
addEventListener('popstate', route);
addEventListener('hashchange', route);

/* ---------- Route line + overview map ---------- */
let mapCentered = false;
function renderRoute() {
  renderMap();
  const ms = $('.mapscroll'); // phones see a slice of the map: start it centered on the route
  if (!mapCentered && ms && ms.scrollWidth > ms.clientWidth) { ms.scrollLeft = (ms.scrollWidth - ms.clientWidth) * 0.85; mapCentered = true; }
  const ol = $('#route'); ol.textContent = '';
  CHAPTERS.filter(c => c.station).forEach(c => {
    const li = el('li'); const a = el('a'); a.href = '#' + c.id;
    a.onclick = (ev) => { ev.preventDefault(); scrollToId(c.id); };
    const mine = live().filter(i => groupCh(i.group) === c.id);
    const open = mine.filter(i => i.priority === 'high' && !i.done).length;
    const dn = mine.filter(i => i.done).length;
    a.append(el('span', 'name', c.station), el('span', 'dates', c.dates),
      el('span', 'prog', loaded && mine.length ? dn + ' of ' + mine.length + ' done' : ''),
      el('span', 'open', loaded && open ? open + ' high open' : ''));
    a.setAttribute('aria-label', c.station + ', ' + c.dates + (open ? ', ' + open + ' high-priority items open' : ''));
    li.append(a); ol.append(li);
  });
}
function scrollToId(id) { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
const PINS = [
  { ch: 'c1', name: 'Shibuya', x: 656, y: 178, lx: 668, ly: 204, anchor: 'start' },
  { ch: 'c5', name: 'Yanaka', x: 672, y: 148, lx: 686, ly: 106, anchor: 'start' },
  { ch: 'c2', name: 'Hakone', x: 600, y: 220, lx: 600, ly: 252, anchor: 'middle' },
  { ch: 'c3', name: 'Kyoto', x: 292, y: 245, lx: 292, ly: 186, anchor: 'middle' },
  { ch: 'c4', name: 'Naoshima', x: 123, y: 308, lx: 123, ly: 340, anchor: 'middle' }
];
function chStatus(chId) {
  const mine = live().filter(i => groupCh(i.group) === chId);
  const open = mine.filter(i => !i.done);
  let st = 'none';
  if (open.some(i => i.priority === 'high')) st = 'high';
  else if (open.some(i => i.priority === 'medium')) st = 'medium';
  else if (open.length) st = 'low';
  else if (mine.length) st = 'done';
  return { st, mine, open, high: open.filter(i => i.priority === 'high').length, done: mine.length - open.length };
}
function renderMap() {
  const g = $('#pins'); if (!g) return; g.textContent = '';
  PINS.forEach(p => {
    const c = CHAPTERS.find(x => x.id === p.ch);
    const s = loaded ? chStatus(p.ch) : { st: 'none', mine: [], open: [], high: 0, done: 0 };
    const pin = sv('g', { class: 'pin' });
    const a = sv('a', { href: '#' + p.ch, tabindex: '0' });
    const desc = p.name + ', ' + c.dates + (loaded ? ': ' + s.done + ' of ' + s.mine.length + ' done' + (s.high ? ', ' + s.high + ' high-priority open' : '') : '');
    a.setAttribute('aria-label', desc);
    a.append(sv('title', {}, desc));
    a.append(sv('circle', { class: 'ring ' + s.st, cx: p.x, cy: p.y, r: 10 }));
    if (s.st === 'done') a.append(sv('path', { class: 'tick', d: 'M' + (p.x - 4.5) + ',' + p.y + ' l3,3.5 l6,-7' }));
    a.append(sv('text', { class: 'nm', x: p.lx, y: p.ly, 'text-anchor': p.anchor }, p.name));
    a.append(sv('text', { class: 'dt', x: p.lx, y: p.ly + 16, 'text-anchor': p.anchor }, c.dates));
    if (loaded && s.mine.length) {
      const label = s.st === 'done' ? 'All done' : s.high ? s.high + ' high open' : s.done + ' of ' + s.mine.length + ' done';
      a.append(sv('text', { class: 'st ' + s.st, x: p.lx, y: p.ly + 31, 'text-anchor': p.anchor }, label));
    }
    a.addEventListener('click', ev => { ev.preventDefault(); scrollToId(p.ch); });
    a.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); scrollToId(p.ch); } });
    pin.append(a); g.append(pin);
  });
}

/* ---------- Money ---------- */
export const CATS = [
  { id: 'flights', name: 'Flights' }, { id: 'lodging', name: 'Lodging' }, { id: 'transit', name: 'Trains and transit' },
  { id: 'tickets', name: 'Museums and tickets' }, { id: 'food', name: 'Food and drink' }, { id: 'other', name: 'Other' }
];
const DEFAULT_SETTINGS = { rate: 155, useLive: true, cats: { flights: 2200, lodging: 3900, transit: 1000, tickets: 600, food: 1400, other: 200 }, meals: { dinner: 6000, breakfast: 1500 } };
let settingsRaw = {};   // the stored doc, so saving never drops fields this page doesn't edit
let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let expenses = [];
function rate() { const l = liveRate(); if (l) return Math.round(l * 100) / 100; const r = Number(settings.rate); return r > 0 ? r : 155; }
function toUSD(amount, cur) { const a = Number(amount) || 0; return cur === 'USD' ? a : a / rate(); }
function fUSD(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function fJPY(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }
function fAmt(a, cur) { return cur === 'USD' ? fUSD(a) : fJPY(a); }
function hasCost(i) { return typeof i.cost === 'number' && i.cat; }
function totals() {
  const t = {}; CATS.forEach(c => t[c.id] = { budget: Number((settings.cats || {})[c.id]) || 0, est: 0, paid: 0 });
  live().forEach(i => { if (!hasCost(i) || !t[i.cat]) return; const u = toUSD(i.cost, i.cur); if (i.paid) t[i.cat].paid += u; else t[i.cat].est += u; });
  expenses.forEach(e => { if (t[e.cat]) t[e.cat].paid += toUSD(e.amount, e.cur); });
  const all = { budget: 0, est: 0, paid: 0 };
  CATS.forEach(c => { all.budget += t[c.id].budget; all.est += t[c.id].est; all.paid += t[c.id].paid; });
  return { t, all };
}
function stackBar(budget, paid, est) {
  const max = Math.max(budget, paid + est, 1);
  const w = el('div', 'stackbar');
  const p = el('span', 'paid'); p.style.width = (100 * paid / max) + '%';
  const e = el('span', 'est'); e.style.left = (100 * paid / max) + '%'; e.style.width = (100 * est / max) + '%';
  const cap = el('span', 'cap'); cap.style.left = 'calc(' + (100 * budget / max) + '% - 1px)';
  w.append(p, e, cap);
  w.setAttribute('role', 'img');
  w.setAttribute('aria-label', 'Paid ' + fUSD(paid) + ', estimated ' + fUSD(est) + ' more, budget ' + fUSD(budget));
  return w;
}
function renderMoney() {
  const { t, all } = totals();
  const proj = all.paid + all.est, left = all.budget - proj;
  const strip = $('#moneyStrip');
  if (loaded) {
    strip.hidden = false; strip.textContent = '';
    const add = (label, val, cls) => { const s = el('span', cls || null); s.append(document.createTextNode(label), el('b', null, val)); strip.append(s); };
    add('Budget', fUSD(all.budget)); add('Projected', fUSD(proj)); add('Paid so far', fUSD(all.paid));
    add(left >= 0 ? 'Left over' : 'Over by', fUSD(Math.abs(left)), left < 0 ? 'over' : '');
  }
  $('#bigProj').textContent = loaded ? fUSD(proj) : '';
  $('#bigProj').classList.toggle('over', left < 0);
  $('#bigBar').textContent = ''; if (loaded) $('#bigBar').append(stackBar(all.budget, all.paid, all.est));
  $('#budgetLead').textContent = loaded ? (left >= 0
    ? fUSD(left) + ' under your ' + fUSD(all.budget) + ' budget if the estimates hold. ' + fUSD(all.paid) + ' paid so far.'
    : fUSD(-left) + ' over your ' + fUSD(all.budget) + ' budget if the estimates hold. ' + fUSD(all.paid) + ' paid so far.')
    : 'Loading the budget…';
  const tb = $('#btable'); tb.textContent = '';
  const head = el('tr'); ['Category', 'Budget', 'Paid', 'To pay', 'Projected', 'Left', ''].forEach((h, k) => { const th = el('th', k === 6 ? 'barcell' : null, h); th.scope = 'col'; head.append(th); });
  const thead = el('thead'); thead.append(head); tb.append(thead);
  const tbody = el('tbody');
  const row = (name, r, cls) => {
    const pj = r.paid + r.est, lf = r.budget - pj; const tr = el('tr', cls || null);
    tr.append(el('td', null, name), el('td', null, fUSD(r.budget)), el('td', null, fUSD(r.paid)), el('td', null, fUSD(r.est)), el('td', null, fUSD(pj)),
      el('td', lf < 0 ? 'over' : null, (lf < 0 ? '−' : '') + fUSD(Math.abs(lf))));
    const bc = el('td', 'barcell'); bc.append(stackBar(r.budget, r.paid, r.est)); tr.append(bc);
    tbody.append(tr);
  };
  CATS.forEach(c => row(c.name, t[c.id]));
  row('Total', all, 'total');
  tb.append(tbody);
  $('#pricingNote').textContent = 'Every price is for both of you together. ' +
    (liveRate() ? 'Yen converts at today\'s rate of ¥' + rate() + ' to $1 (' + liveFx.source + ', ' + liveFx.date + '); you can switch to a fixed rate below. '
      : 'Yen converts at ¥' + rate() + ' to $1, which you can change below. ') +
    'Amounts marked est. are planning numbers from published fares and typical prices; tap one to mark it paid once you\'ve booked, and edit it to the real amount. ' +
    'Ryokan dinners and breakfasts at Matsuzakaya are part of the room rate, so those meals show as included.';
  const big = $('#bigCosts'); big.textContent = '';
  live().filter(i => hasCost(i) && i.cost > 0).map(i => ({ i, u: toUSD(i.cost, i.cur) })).sort((a, b) => b.u - a.u).slice(0, 8).forEach(({ i, u }) => {
    const li = el('li'); const g = GROUPS.find(G => G.id === i.group);
    const tx = el('span', 't', (g && g.ch !== 'book' ? g.when + ': ' : '') + (i.title || 'Untitled'));
    li.append(tx, el('span', 'amt', fUSD(u)), el('span', 'meta', (i.cur !== 'USD' ? fJPY(i.cost) + ', ' : '') + (i.paid ? 'paid' : 'est.')));
    big.append(li);
  });
  renderExpenses();
  renderFares(false);
  for (const m of Object.values(modules)) if (m.onMoney) m.onMoney();
}
let expSeq = 0;
async function renderExpenses() {
  const seq = ++expSeq;
  const ul = $('#expList');
  $('#expEmpty').hidden = expenses.length > 0;
  let names = {};
  const ids = [...new Set(expenses.map(e => e.by).filter(Boolean))];
  if (user && ids.length) { try { names = await user.profiles(ids); } catch (e) { /* names are optional */ } }
  if (seq !== expSeq) return;
  ul.textContent = '';
  expenses.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).forEach(e => {
    const li = el('li');
    li.append(el('span', 'amt', fAmt(e.amount, e.cur)));
    if (e.cur !== 'USD') li.append(el('span', 'meta', '≈ ' + fUSD(toUSD(e.amount, e.cur))));
    li.append(el('span', 'grow', e.note || 'Expense'));
    const cat = CATS.find(c => c.id === e.cat);
    const p = e.by && names[e.by];
    const who = e.paidBy || (p ? (p.isMe ? 'you' : (p.name || 'someone')) : 'someone');
    li.append(el('span', 'meta', (cat ? cat.name : 'Other') + ', ' + who + ', ' + ago(e.at || 0)));
    if (canWrite) li.append(iconBtn('trash', 'Remove expense', () => {
      if (!db) return;
      db.collection('expenses').doc(e.id).delete().then(() => addLog('Removed expense ' + q(e.note || fAmt(e.amount, e.cur)))).catch(handleErr);
    }, 'danger'));
    ul.append(li);
  });
}
let setDirty = false;
function renderSettingsForm(force) {
  const grid = $('#setGrid');
  if (setDirty && !force) return;
  grid.textContent = '';
  const mk = (label, name, val) => {
    const l = el('label', 'field'); l.append(el('span', null, label));
    const inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.step = 'any'; inp.name = name; inp.value = val; inp.inputMode = 'decimal';
    inp.oninput = () => { setDirty = true; }; l.append(inp); grid.append(l);
  };
  mk('Fixed yen per $1', 'rate', Number(settings.rate) || 155);
  const l = el('label', 'switch'); l.style.gridColumn = '1 / -1';
  const cb = el('input'); cb.type = 'checkbox'; cb.name = 'useLive'; cb.checked = settings.useLive !== false; cb.onchange = () => { setDirty = true; };
  l.append(cb, document.createTextNode('Use today\'s exchange rate' + (liveFx ? ' (¥' + (Math.round(liveFx.rate * 100) / 100) + ')' : '') + ' instead of the fixed rate'));
  grid.append(l);
  CATS.forEach(c => mk(c.name + ' ($)', 'cat_' + c.id, Number((settings.cats || {})[c.id]) || 0));
  mk('Dinner out, per person (¥)', 'meal_dinner', settings.meals.dinner);
  mk('Breakfast out, per person (¥)', 'meal_breakfast', settings.meals.breakfast);
}
function setupBudgetForms() {
  const sel = $('#expForm select[name=cat]');
  CATS.forEach(c => { const o = el('option', null, c.name); o.value = c.id; sel.append(o); });
  sel.value = 'food';
  $('#expForm').onsubmit = (ev) => {
    ev.preventDefault();
    if (!db || !canWrite) return;
    const f = ev.target; const amount = Number(f.amount.value);
    if (!(amount > 0)) { toast('Enter an amount above zero.'); f.amount.classList.add('shake'); setTimeout(() => f.amount.classList.remove('shake'), 300); return; }
    const data = { amount, cur: f.cur.value, cat: f.cat.value, note: f.note.value.trim().slice(0, 120), at: Date.now(), by: uid || null };
    if (f.paidBy && f.paidBy.value) data.paidBy = f.paidBy.value;
    if (f.split && f.split.value) data.split = f.split.value;
    db.collection('expenses').add(data).then(() => addLog('Logged ' + fAmt(amount, data.cur) + (data.note ? ' for ' + q(data.note) : ''))).catch(handleErr);
    f.amount.value = ''; f.note.value = '';
  };
  $('#setForm').onsubmit = (ev) => {
    ev.preventDefault();
    if (!db || !canWrite) return;
    const f = ev.target; const r = Number(f.rate.value);
    if (!(r > 0)) { toast('The exchange rate needs to be above zero.'); return; }
    const cats = {}; CATS.forEach(c => cats[c.id] = Math.max(0, Number(f['cat_' + c.id].value) || 0));
    const meals = { dinner: Math.max(0, Number(f.meal_dinner.value) || 0), breakfast: Math.max(0, Number(f.meal_breakfast.value) || 0) };
    setDirty = false;
    db.doc('settings/budget').set({ ...settingsRaw, rate: r, useLive: f.useLive.checked, cats, meals, updatedAt: Date.now(), updatedBy: uid || null })
      .then(() => { addLog('Updated the budget'); toast('Budget saved.'); }).catch(handleErr);
  };
}

/* ---------- Fare table (settings/fares): hand-kept fares the assistant uses; defaults to the plan's transit costs ---------- */
let fares = null, faresDirty = false;
function fareRows() {
  if (fares && Array.isArray(fares.rows)) return fares.rows;
  return live().filter(i => i.cat === 'transit' && typeof i.cost === 'number' && i.cost > 0 && i.cur !== 'USD')
    .map(i => ({ leg: i.title, mode: '', jpy: i.cost, note: (GROUPS.find(g => g.id === i.group) || {}).when || '' }));
}
function renderFares(force) {
  const t = $('#fareTable'), acts = $('#fareActions'); if (!t || (faresDirty && !force)) return;
  t.textContent = ''; acts.textContent = '';
  const head = el('tr'); ['Leg', 'Mode', '¥ for both', 'Note', ''].forEach(h => head.append(el('th', null, h))); t.append(head);
  const rows = fareRows().map(r => ({ ...r }));
  const draw = () => {
    t.querySelectorAll('tr.r').forEach(r => r.remove());
    rows.forEach((r, k) => {
      const tr = el('tr', 'r');
      const cell = (key, cls, type) => { const td = el('td', cls || null); const inp = el('input'); inp.value = r[key] == null ? '' : r[key]; if (type) inp.type = type; inp.disabled = !canWrite; inp.setAttribute('aria-label', key); inp.oninput = () => { r[key] = type === 'number' ? Number(inp.value) || 0 : inp.value; faresDirty = true; }; td.append(inp); tr.append(td); };
      cell('leg'); cell('mode'); cell('jpy', 'n', 'number'); cell('note');
      const x = el('td', 'x'); if (canWrite) x.append(iconBtn('trash', 'Remove fare', () => { rows.splice(k, 1); faresDirty = true; draw(); }, 'danger')); tr.append(x);
      t.append(tr);
    });
  };
  draw();
  if (canWrite) {
    const add = el('button', 'chip plus'); add.type = 'button'; withIcon(add, 'plus', 'Add fare'); add.onclick = () => { rows.push({ leg: '', mode: '', jpy: 0, note: '' }); faresDirty = true; draw(); };
    const save = el('button', 'btn sm', 'Save fares'); save.type = 'button';
    save.onclick = () => { faresDirty = false; db.doc('settings/fares').set({ rows: rows.filter(r => r.leg.trim()).map(r => ({ leg: String(r.leg).slice(0, 120), mode: String(r.mode || '').slice(0, 60), jpy: Math.max(0, Math.round(Number(r.jpy) || 0)), note: String(r.note || '').slice(0, 120) })), updatedAt: Date.now() }).then(() => { addLog('Updated the fare table'); toast('Fares saved.'); }).catch(handleErr); };
    acts.append(add, save);
  }
  if (features.assistant && canWrite) {
    const opt = el('button', 'btn secondary sm'); opt.type = 'button'; withIcon(opt, 'chat', 'Find savings across the trip');
    opt.onclick = () => modules.explore && modules.explore.ask('Find savings across the whole trip: nights to move between cities, day trips to swap (for example Nara for Himeji), and whether a regional rail pass beats the fares in my fare table. Give concrete changes with the money and time each saves.');
    acts.append(opt);
  }
}

/* ---------- Locations ---------- */
const PK = 5409.290985086038, PTX = -12527.080745341626, PTY = 3776.9995940401345;
function proj(lat, lng) { return [PK * lng * Math.PI / 180 + PTX, -PK * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) + PTY]; }
function hasPin(i) { return typeof i.lat === 'number' && typeof i.lng === 'number' && isFinite(i.lat) && isFinite(i.lng); }
function parsePin(str) {
  if (!str) return null;
  const t = String(str).trim();
  const m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || t.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || t.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!(lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154)) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
const cityFor = (i) => CH_CITY[groupCh(i.group)] || '';
function mapQuery(i) {
  if (i.place) return i.place + (/japan/i.test(i.place) ? '' : ', Japan');
  if (hasPin(i)) return i.lat + ',' + i.lng;
  return (i.title || '') + ', ' + cityFor(i) + ', Japan';
}
function mapsUrl(i) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery(i)); }
function routeUrl(stops, mode) {
  const pts = stops.slice(0, 10).map(mapQuery);
  if (pts.length < 2) return pts.length ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(pts[0]) : null;
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', pts[0]);
  u.searchParams.set('destination', pts[pts.length - 1]);
  if (mode) u.searchParams.set('travelmode', mode);
  if (pts.length > 2) u.searchParams.set('waypoints', pts.slice(1, -1).join('|'));
  return u.href;
}
const openMaps = new Set();
function renderDayMap(g, list) {
  const stops = list.filter(i => hasPin(i) && i.kind !== 'travel');
  const box = el('div', 'daymap');
  if (!stops.length) { box.append(el('div', 'dm-foot', 'No stops have a map pin yet. Edit an item and add a location to place it here.')); return box; }
  const P = stops.map(i => proj(i.lat, i.lng));
  const x0 = Math.min(...P.map(p => p[0])), x1 = Math.max(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), y1 = Math.max(...P.map(p => p[1]));
  const W = 640, H = 380, minW = 2.2;
  let w = Math.max(x1 - x0, minW), h = Math.max(y1 - y0, minW * H / W);
  w *= 1.35; h *= 1.45;
  if (w / h > W / H) h = w * H / W; else w = h * W / H;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = [cx - w / 2, cy - h / 2, w, h];
  const sc = w / W;
  const svg = sv('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': 'Map of ' + g.when + ' with ' + stops.length + ' stops; positions are approximate' });
  // The coastline data is too coarse for the small art islands, so they get a plain land background.
  const island = groupCh(g.id) === 'c4';
  svg.append(sv('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: island ? 'var(--land)' : 'var(--sea)' }));
  if (!island) svg.append(sv('use', { href: '#jpLand', class: 'map-land' }));
  const placed = P.map(([x, y]) => ({ x0: x - 12 * sc, y0: y - 12 * sc, x1: x + 12 * sc, y1: y + 12 * sc }));
  const hit = (b) => placed.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < vb[0] || b.x1 > vb[0] + vb[2] || b.y0 < vb[1] || b.y1 > vb[1] + vb[3];
  if (P.length > 1) svg.append(sv('polyline', { class: 'dm-route', points: P.map(p => p.join(',')).join(' ') }));
  stops.forEach((i, k) => {
    const [x, y] = P[k];
    const gp = sv('g', { class: 'dm-pin p-' + (i.priority || 'medium'), tabindex: '0', role: 'button', 'aria-label': (k + 1) + '. ' + (i.title || '') + ', show on timeline' });
    gp.append(sv('title', {}, (k + 1) + '. ' + (i.title || '') + (i.start ? ' at ' + fmt12(i.start) : '')));
    gp.append(sv('circle', { cx: x, cy: y, r: 11 * sc }));
    const n = sv('text', { class: 'n', x, y }, String(k + 1)); n.setAttribute('font-size', 12 * sc); gp.append(n);
    const lab = (i.place || i.title || '').split(',')[0].slice(0, 28);
    const tw = lab.length * 6.6 * sc, th = 14 * sc;
    const opts = [
      { x: x + 15 * sc, y: y + 4 * sc, a: 'start', b: { x0: x + 14 * sc, y0: y - 8 * sc, x1: x + 14 * sc + tw, y1: y + 6 * sc } },
      { x: x - 15 * sc, y: y + 4 * sc, a: 'end', b: { x0: x - 14 * sc - tw, y0: y - 8 * sc, x1: x - 14 * sc, y1: y + 6 * sc } },
      { x, y: y - 16 * sc, a: 'middle', b: { x0: x - tw / 2, y0: y - 16 * sc - th + 3 * sc, x1: x + tw / 2, y1: y - 14 * sc } },
      { x, y: y + 26 * sc, a: 'middle', b: { x0: x - tw / 2, y0: y + 14 * sc, x1: x + tw / 2, y1: y + 28 * sc } }
    ];
    const pick = opts.find(o => !hit(o.b)) || opts[0];
    placed.push(pick.b);
    const l = sv('text', { class: 'l', x: pick.x, y: pick.y, 'text-anchor': pick.a }, lab); l.setAttribute('font-size', 12 * sc); l.setAttribute('stroke-width', 3.5 * sc); gp.append(l);
    const goTo = () => flashItem(i.id);
    gp.addEventListener('click', goTo);
    gp.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(); } });
    svg.append(gp);
  });
  box.append(svg);
  const f = el('div', 'dm-foot');
  f.append(document.createTextNode('Numbers follow the day\'s order. Positions are approximate.'));
  const ru = routeUrl(stops); const a = ru && extLink(ru, 'Route in Google Maps'); if (a) f.append(a);
  box.append(f);
  return box;
}
function flashItem(id) {
  const li = document.querySelector('li.item[data-id="' + CSS.escape(id) + '"]');
  if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600); }
}

/* ---------- Live data ---------- */
let features = {};
let liveFx = null;
function liveRate() { return liveFx && settings.useLive !== false ? liveFx.rate : null; }
function rerender() { render(); }
const wx = {}; let wxStarted = false;
function fToF(c) { return Math.round(c * 9 / 5 + 32); }
function dayCoord(gid) {
  const p = live().filter(i => i.group === gid && hasPin(i) && i.kind !== 'travel').sort(byTime)[0];
  return p ? [p.lat, p.lng] : (CH_COORD[groupCh(gid)] || CH_COORD.c1);
}
async function loadWeather() {
  if (wxStarted || !loaded) return; wxStarted = true;
  const byLoc = {};
  Object.keys(GROUP_DATE).forEach(gid => {
    const [la, lo] = dayCoord(gid); const k = (Math.round(la * 10) / 10) + ',' + (Math.round(lo * 10) / 10);
    (byLoc[k] = byLoc[k] || { lat: la, lng: lo, gids: [] }).gids.push(gid);
  });
  for (const k of Object.keys(byLoc)) {
    const L = byLoc[k]; const dates = L.gids.map(g => GROUP_DATE[g]).sort();
    try {
      const r = await API.api('/api/weather?lat=' + L.lat + '&lng=' + L.lng + '&start=' + dates[0] + '&end=' + dates[dates.length - 1]);
      L.gids.forEach(g => { const d = r.days[GROUP_DATE[g]]; if (d) wx[g] = d; });
      rerender();
    } catch (e) { /* weather is optional */ }
  }
}
function wxText(gid) {
  const d = wx[gid]; if (!d) return null;
  const t = (d.tmax != null) ? fToF(d.tmax) + '°F high, ' + fToF(d.tmin) + '°F low' : '';
  const lead = d.source === 'forecast' ? ['Forecast: ', t + (d.rainChance != null ? ', ' + d.rainChance + '% chance of rain' : '') + '. ']
    : ['Typical: ', t + '; rain on ' + d.rainyYears + ' of the last ' + d.years + ' years on this date. '];
  return { lead: lead[0], text: lead[1] + (d.sunrise && d.sunset ? 'Sunrise ' + fmt12(d.sunrise) + ', sunset ' + fmt12(d.sunset) + '.' : '') };
}
function wxLine(gid) {
  const w = wxText(gid); if (!w) return null;
  const line = el('div', 'wx'); line.append(el('b', null, w.lead), document.createTextNode(w.text)); return line;
}
const walks = {}; const walkQueue = []; let walkBusy = false;
function walkRuns(list) {
  const runs = []; let cur = [];
  list.forEach(i => {
    if (i.disabled) return;
    if (i.kind === 'travel') { if (cur.length > 1) runs.push(cur); cur = []; return; }
    if (hasPin(i)) cur.push(i);
  });
  if (cur.length > 1) runs.push(cur);
  return runs;
}
function runKey(run) { return run.map(i => i.lng.toFixed(4) + ',' + i.lat.toFixed(4)).join(';'); }
function queueWalk(run) {
  const k = runKey(run); if (walks[k]) return; walks[k] = 'pending'; walkQueue.push({ k, pts: run.slice(0, 12).map(i => i.lng + ',' + i.lat).join(';') });
  pumpWalks();
}
async function pumpWalks() {
  if (walkBusy) return; walkBusy = true;
  while (walkQueue.length) {
    const job = walkQueue.shift();
    try { const r = await API.api('/api/walk?pts=' + encodeURIComponent(job.pts)); walks[job.k] = r; rerender(); }
    catch (e) { walks[job.k] = 'error'; }
    await new Promise(r => setTimeout(r, 1200));
  }
  walkBusy = false;
}
function walkLegFor(list, item) {
  if (!hasPin(item) || item.kind === 'travel') return null;
  for (const run of walkRuns(list)) {
    const idx = run.indexOf(item);
    if (idx > 0) {
      const w = walks[runKey(run)];
      if (!w) { queueWalk(run); return null; }
      if (typeof w !== 'object' || !w.legs) return null;
      const leg = w.legs[idx - 1]; return leg ? Object.assign({ from: run[idx - 1] }, leg) : null;
    }
  }
  return null;
}
function addDaysISO(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
const hotelMem = {};
/* The price line under a hotel check-in: the nightly watch result when there is one, else the last manual check. */
function hotelBox(i) {
  if (!features.hotels || i.cat !== 'lodging' || !i.hotelQuery || !(i.nights > 0) || !GROUP_DATE[i.group]) return null;
  const box = el('div', 'livebox');
  const wdoc = watchDoc(i.id);
  const r = wdoc && wdoc.latest ? { ...wdoc.latest, hotelName: wdoc.hotelName, checkedAt: wdoc.checkedAt } : (i.live || hotelMem[i.id]);
  const check = el('button', 'linkbtn', r ? 'Check again' : 'Check live price'); check.type = 'button';
  check.onclick = async () => {
    check.disabled = true; check.textContent = 'Checking Rakuten…';
    const ci = GROUP_DATE[i.group], co = addDaysISO(ci, i.nights);
    try {
      const res = await API.api('/api/hotel-price?q=' + encodeURIComponent(i.hotelQuery) + '&checkin=' + ci + '&checkout=' + co + '&adults=' + TRIP.adults + (i.live && i.live.hotelNo ? '&hotelNo=' + i.live.hotelNo : ''));
      const keep = { found: !!res.found, available: !!res.available, hotelNo: res.hotelNo || '', hotelName: res.hotelName || '', firstNight: res.firstNight || null, estimateTotal: res.estimateTotal || null, nights: i.nights, url: res.planListUrl || '', message: res.message || '', checkedAt: Date.now() };
      if (canWrite) write(i.id, { live: keep }, 'Checked the live price for ' + q(i.title)); else { hotelMem[i.id] = keep; rerender(); }
    } catch (e) { toast(e && e.message ? e.message : 'The price check didn\'t work. Try again later.'); check.disabled = false; check.textContent = 'Check live price'; }
  };
  if (!r) { box.append(el('span', 'src', 'Live price from Rakuten Travel for these dates:'), check); return box; }
  const when = new Date(r.checkedAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!r.found) box.append(el('span', null, r.message || 'Not found on Rakuten Travel.'));
  else if (!r.available) box.append(el('span', null, (r.hotelName ? r.hotelName + ': ' : '') + (r.message || 'No rooms listed for these dates yet.')));
  else {
    box.append(el('span', null, (r.hotelName ? r.hotelName + ': ' : '') + 'from ' + fJPY(r.firstNight) + ' a night, about ' + fJPY(r.estimateTotal) + ' for ' + r.nights + (r.nights === 1 ? ' night' : ' nights') + ' (≈ ' + fUSD(toUSD(r.estimateTotal, 'JPY')) + ')'));
    if (canWrite && r.estimateTotal) {
      const use = el('button', 'linkbtn', 'Use this price'); use.type = 'button';
      use.onclick = () => write(i.id, { cost: r.estimateTotal, cur: 'JPY', cat: 'lodging' }, 'Set ' + q(i.title) + ' to the live price');
      box.append(use);
    }
    const href = safeUrl(r.url); if (href) { const a = el('a', 'linkbtn', 'See rooms'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a); }
  }
  box.append(el('span', 'src', 'Checked ' + when), check);
  return box;
}
async function loadLive() {
  try { const c = await API.config; features = c.features || {}; } catch (e) { /* offline or no config */ }
  API.api('/api/fx').then(r => { liveFx = r; renderSettingsForm(false); rerender(); }).catch(() => {});
  rerender();
}

/* ---------- Time helpers ---------- */
function mins(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmt12(t, withSuffix) {
  const m = mins(t); if (m == null) return '';
  let h = Math.floor(m / 60) % 24; const mm = m % 60; const suf = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12;
  return h + ':' + String(mm).padStart(2, '0') + (withSuffix === false ? '' : ' ' + suf);
}
function timeRange(i) {
  if (!i.start) return i.time || '';
  if (!i.end) return fmt12(i.start);
  const a = mins(i.start), b = mins(i.end);
  const same = (a < 720) === (b < 720);
  return fmt12(i.start, !same) + '–' + fmt12(i.end);
}
function dur(a, b) {
  const d = b - a; if (d <= 0) return '';
  const h = Math.floor(d / 60), m = d % 60;
  return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
}
function byTime(a, b) {
  const x = mins(a.start), y = mins(b.start);
  if (x != null && y != null && x !== y) return x - y;
  if (x != null && y == null) return -1;
  if (x == null && y != null) return 1;
  return (a.sort || 0) - (b.sort || 0);
}
function tokyoNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = k => (parts.find(p => p.type === k) || {}).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), min: Number(g('hour')) * 60 + Number(g('minute')) };
}
function safeUrl(u) { try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null; } catch (e) { return null; } }
function linkList(i) { return Array.isArray(i.links) ? i.links.filter(l => l && safeUrl(l.url)) : []; }

/* ---------- Plan render ---------- */
function visible(i) {
  if (statusF === 'todo' && i.done) return false;
  if (statusF === 'done' && !i.done) return false;
  if (filter !== 'all' && i.priority !== filter) return false;
  return true;
}
function counts(list) { return { done: list.filter(i => i.done).length, total: list.length }; }
const gapHooks = [];     // feature modules add controls to free-time gaps: fn(gapInfo) -> node|null
const itemHooks = [];    // and extra lines under items: fn(item) -> node|null
function renderGroup(g) {
  const wrap = el('div', 'day card'); wrap.id = g.id;
  const every = items.filter(i => i.group === g.id).sort(byTime);
  const list = every.filter(i => !i.disabled);
  const skipped = every.length - list.length;
  const gc = counts(list);
  const h = el('h3', 'day-head');
  h.append(el('span', 'when', g.when), el('span', 'what', g.what));
  const dayUSD = list.filter(hasCost).reduce((s, i) => s + toUSD(i.cost, i.cur), 0);
  if (dayUSD > 0) h.append(el('span', 'daycost', '≈ ' + fUSD(dayUSD)));
  if (gc.total) h.append(el('span', 'count' + (gc.done === gc.total ? ' all' : ''), gc.done === gc.total ? 'All done' : gc.done + ' of ' + gc.total + ' done'));
  wrap.append(h);
  if (GROUP_DATE[g.id]) { const w = wxLine(g.id); if (w) wrap.append(w); }
  const tools = el('div', 'day-tools');
  if (GROUP_DATE[g.id]) {
    const pinned = list.filter(i => hasPin(i) && i.kind !== 'travel').length;
    const open = openMaps.has(g.id);
    const mb = el('button', 'chip'); mb.type = 'button';
    withIcon(mb, 'map', open ? 'Hide the day map' : 'Day map' + (pinned ? ' (' + pinned + ' stops)' : ''));
    mb.setAttribute('aria-expanded', String(open));
    mb.onclick = () => { if (openMaps.has(g.id)) openMaps.delete(g.id); else openMaps.add(g.id); render(); };
    tools.append(mb);
  }
  if (tools.childNodes.length) wrap.append(tools);
  if (GROUP_DATE[g.id] && openMaps.has(g.id)) wrap.append(renderDayMap(g, list));
  const ul = el('ul', 'items');
  const shown = (showSkipped ? every : list).filter(visible);
  const full = filter === 'all' && statusF === 'all';
  const now = tokyoNow();
  const isToday = GROUP_DATE[g.id] === now.date;
  let prevEnd = null, prevStop = null;
  shown.forEach(i => {
    if (i.disabled) { ul.append(renderItem(i, '')); return; }
    const s = mins(i.start), e = mins(i.end);
    if (full) {
      const leg = walkLegFor(list, i);
      const avail = (prevEnd != null && s != null) ? s - prevEnd : null;
      const li = el('li', 'gap'); let warn = false; let any = false;
      const txt = (ic, text) => { const t = el('span', 'txt'); t.append(icon(ic), document.createTextNode(text)); li.append(t); any = true; };
      if (avail != null && avail >= 30) txt('clock', 'Free time, ' + dur(prevEnd, s) + '.');
      else if (avail != null && avail < 0) { txt('alert', 'Overlaps the item above by ' + dur(s, prevEnd) + '.'); warn = true; }
      if (leg) {
        const walkTxt = 'About ' + (leg.minutes < 1 ? 1 : leg.minutes) + ' min on foot (' + leg.km + ' km) from ' + ((leg.from.place || leg.from.title || 'the last stop').split(',')[0]) + '.';
        if (avail != null && avail >= 0 && leg.minutes > avail + 5) { txt('alert', walkTxt + ' That\'s longer than the ' + avail + ' min you have; take a taxi or leave earlier.'); warn = true; }
        else if (leg.minutes > 40) txt('walk', walkTxt + ' A train or taxi is quicker.');
        else txt('walk', walkTxt);
      }
      if (avail != null && avail >= 45) for (const hook of gapHooks) { const n = hook({ group: g, from: prevEnd, to: s, minutes: avail, anchor: prevStop || (hasPin(i) ? i : null), leg }); if (n) { li.append(n); any = true; } }
      if (warn) li.classList.add('warn');
      if (any) ul.append(li);
    }
    let state = '';
    if (isToday && s != null) { const end = e != null ? e : s + 30; if (now.min >= s && now.min < end) state = 'now'; }
    ul.append(renderItem(i, state));
    if (s != null) prevEnd = Math.max(prevEnd == null ? 0 : prevEnd, e != null ? e : s);
    if (hasPin(i) && i.kind !== 'travel') prevStop = i;
  });
  wrap.append(ul);
  if (!shown.length) wrap.append(el('p', 'empty', list.length ? (statusF === 'done' ? 'Nothing done here yet.' : statusF === 'todo' ? 'Everything here is done.' : 'Nothing matches the current filter.') : 'Nothing planned yet.'));
  const add = el('div', 'add');
  if (skipped && !showSkipped) {
    const sk = el('button', 'skiplink', skipped === 1 ? '1 skipped item, show it' : skipped + ' skipped items, show them'); sk.type = 'button';
    sk.onclick = () => setShowSkipped(true); add.append(sk);
  }
  if (canWrite) {
    const b = el('button', 'chip plus'); b.type = 'button'; withIcon(b, 'plus', 'Add item');
    b.setAttribute('aria-label', 'Add item to ' + g.when);
    b.onclick = () => openEditor(null, g.id);
    add.prepend(b);
  }
  if (add.childNodes.length) wrap.append(add);
  return wrap;
}
function renderItem(i, state) {
  const li = el('li', 'item p-' + (i.priority || 'medium') + (i.done ? ' done' : '') + (i.kind === 'travel' ? ' travel' : '') + (state === 'now' ? ' now' : '') + (i.disabled ? ' skipped' : ''));
  li.dataset.id = i.id;
  li.append(el('span', 'stripe'));
  const cb = el('input', 'check'); cb.type = 'checkbox'; cb.checked = !!i.done; cb.disabled = !canWrite;
  cb.setAttribute('aria-label', (i.done ? 'Mark not done: ' : 'Mark done: ') + (i.title || ''));
  cb.onchange = () => write(i.id,
    cb.checked ? { done: true, doneBy: uid || null, doneAt: Date.now() } : { done: false, doneBy: null, doneAt: null },
    (cb.checked ? 'Marked ' + q(i.title) + ' done' : 'Marked ' + q(i.title) + ' not done'));
  li.append(cb);
  const body = el('div', 'body');
  const tr = timeRange(i);
  if (tr || i.kind === 'travel' || state || i.disabled) {
    const t = el('div', 'time');
    if (tr) t.append(el('span', 'clock', tr));
    const s = mins(i.start), e = mins(i.end);
    if (s != null && e != null && e > s) t.append(el('span', null, dur(s, e)));
    if (i.kind === 'travel') t.append(el('span', 'badge', 'Transit'));
    if (state === 'now') t.append(el('span', 'badge now', 'Now'));
    if (i.disabled) t.append(el('span', 'badge', 'Skipped'));
    body.append(t);
  }
  body.append(el('div', 'title', i.title || 'Untitled'));
  if (i.place) { const w = el('div', 'where'); w.append(icon('pin'), el('span', null, i.place)); body.append(w); }
  if (i.detail) body.append(el('div', 'detail', i.detail));
  const pills = el('div', 'pills');
  if (hasCost(i)) {
    let label;
    if (i.cost === 0) label = i.cat === 'tickets' ? 'Free' : i.cat === 'transit' ? 'Covered by pass' : 'Included';
    else label = (i.paid ? 'Paid ' : 'est. ') + fAmt(i.cost, i.cur);
    const pill = el(canWrite && i.cost > 0 ? 'button' : 'span', 'costpill' + (i.paid ? ' paid' : ''));
    if (i.paid && i.cost > 0) pill.append(icon('check'));
    pill.append(document.createTextNode(label));
    if (i.cost > 0 && i.cur !== 'USD') pill.append(el('span', 'conv', '≈ ' + fUSD(toUSD(i.cost, i.cur))));
    if (pill.tagName === 'BUTTON') {
      pill.type = 'button';
      pill.setAttribute('aria-pressed', String(!!i.paid));
      pill.title = i.paid ? 'Paid. Tap to mark as not paid.' : 'Estimate. Tap once you\'ve paid.';
      pill.onclick = () => write(i.id, { paid: !i.paid }, (i.paid ? 'Marked ' + q(i.title) + ' not paid' : 'Marked ' + q(i.title) + ' paid'));
    }
    pills.append(pill);
  }
  if (i.code) {
    const c = el('button', 'chip codechip'); c.type = 'button'; c.title = 'Copy confirmation code';
    withIcon(c, 'copy', i.code); c.onclick = () => copyText(i.code, 'Code copied.'); pills.append(c);
  }
  if (i.opens && !i.done && opensAt(i.opens)) pills.append(withIcon(el('span', 'chip'), 'bell', 'Sale opens ' + fmtOpens(i.opens)));
  linkList(i).forEach(l => { const a = extLink(l.url, l.label || 'Book'); if (a) pills.append(a); });
  if (pills.childNodes.length) body.append(pills);
  const hb = hotelBox(i); if (hb) body.append(hb);
  for (const hook of itemHooks) { const n = hook(i); if (n) body.append(n); }
  if (i.done) {
    const bd = el('div', 'done-row');
    bd.append(withIcon(el('span', 'badge success'), 'check', 'Done'));
    const when = i.doneAt ? new Date(i.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const by = el('span', 'done-by', when);
    if (i.doneBy) { by.dataset.uid = i.doneBy; by.dataset.at = when; }
    bd.append(by); body.append(bd);
  }
  li.append(body);
  const side = el('div', 'side');
  const pr = el('div', 'prio'); pr.setAttribute('role', 'group'); pr.setAttribute('aria-label', 'Priority');
  PRIOS.forEach(p => {
    const b = el('button', p); b.type = 'button'; b.disabled = !canWrite;
    b.setAttribute('aria-pressed', String(i.priority === p));
    b.setAttribute('aria-label', PLABEL[p] + ' priority'); b.title = PLABEL[p];
    b.append(el('span', 'sw ' + p));
    b.onclick = () => { if (i.priority !== p) write(i.id, { priority: p }, 'Set ' + q(i.title) + ' to ' + PLABEL[p]); };
    pr.append(b);
  });
  side.append(pr);
  const acts = el('div', 'acts');
  const ch = CHAPTERS.find(c => c.id === groupCh(i.group));
  if (ch && ch.station && (i.kind !== 'travel' || i.place || hasPin(i))) {
    const m = el('a', 'iconbtn'); m.href = mapsUrl(i); m.target = '_blank'; m.rel = 'noopener noreferrer';
    m.setAttribute('aria-label', 'Open ' + (i.title || 'item') + ' in Google Maps'); m.title = 'Google Maps'; m.append(icon('map'));
    acts.append(m);
  }
  if (canWrite) {
    acts.append(iconBtn('pencil', 'Edit ' + (i.title || 'item'), () => openEditor(i)));
    acts.append(iconBtn(i.disabled ? 'restore' : 'ban', i.disabled ? 'Put back on the timeline' : 'Skip (keeps it, off the timeline)',
      () => write(i.id, { disabled: !i.disabled }, (i.disabled ? 'Restored ' : 'Skipped ') + q(i.title)), i.disabled ? '' : 'danger'));
  }
  if (acts.childNodes.length) side.append(acts);
  li.append(side);
  return li;
}
function fmtOpens(s) {
  const at = opensAt(s); if (!at) return s;
  const timed = /T/.test(s);
  const d = new Date(at);
  const jst = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', ...(timed ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(d);
  return jst + (timed ? ' Japan time' : '');
}
async function copyText(text, msg) {
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* fall through */ }
  toast(ok ? msg : 'Copy didn\'t work here. Select the text and copy it.');
  return ok;
}

/* ---------- Edit sheet ---------- */
function field(label, tag, value, key, draft, type, attrs) {
  const l = el('label', 'field'); l.append(el('span', null, label));
  const f = document.createElement(tag); f.value = value == null ? '' : value; f.name = key;
  if (type) f.type = type;
  Object.assign(f, attrs || {});
  f.oninput = () => { draft[key] = f.value; };
  l.append(f); return l;
}
function select(label, key, value, options, draft, onchange) {
  const l = el('label', 'field'); l.append(el('span', null, label));
  const s = el('select'); s.name = key;
  options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.append(o); });
  s.value = value || ''; s.onchange = () => { draft[key] = s.value; if (onchange) onchange(s.value); };
  l.append(s); return l;
}
function switchField(label, key, draft, onchange) {
  const l = el('label', 'switch'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!draft[key];
  cb.onchange = () => { draft[key] = cb.checked; if (onchange) onchange(cb.checked); };
  l.append(cb, document.createTextNode(label)); return l;
}
function fieldset(kicker, ...kids) { const f = el('div', 'fieldset'); if (kicker) f.append(el('p', 'kicker', kicker)); f.append(...kids.filter(Boolean)); return f; }
function editingItem() { return editing && editing.id ? items.find(x => x.id === editing.id) || {} : { group: editing ? editing.group : '' }; }
function draftFrom(i) {
  const l0 = linkList(i)[0] || {};
  return {
    start: i.start || '', end: i.end || '', title: i.title || '', detail: i.detail || '', transit: i.kind === 'travel', priority: i.priority || 'medium',
    linkLabel: l0.label || '', linkUrl: l0.url || '', cost: typeof i.cost === 'number' ? i.cost : '', cur: i.cur || 'JPY', cat: i.cat || '', paid: !!i.paid,
    paidBy: i.paidBy || '', place: i.place || '', pin: hasPin(i) ? i.lat + ', ' + i.lng : '', hotelQuery: i.hotelQuery || '', nights: i.nights == null ? '' : i.nights,
    target: i.target == null ? '' : i.target, code: i.code || '', opens: i.opens || ''
  };
}
function openEditor(item, groupId) {
  const isNew = !item;
  editing = isNew ? { group: groupId } : { id: item.id };
  const d = draftFrom(item || { group: groupId });
  const g = GROUPS.find(G => G.id === (isNew ? groupId : item.group));
  const f = el('form'); f.id = 'editForm'; f.noValidate = true;
  const pr = el('div', 'seg'); pr.setAttribute('role', 'group'); pr.setAttribute('aria-label', 'Priority');
  PRIOS.forEach(p => {
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(d.priority === p));
    b.append(el('span', 'sw ' + p), document.createTextNode(PLABEL[p]));
    b.onclick = () => { d.priority = p; pr.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    pr.append(b);
  });
  const lodging = el('div', 'fieldset');
  const showLodging = () => { lodging.hidden = d.cat !== 'lodging'; };
  const times = el('div', 'row3');
  times.append(field('Starts', 'input', d.start, 'start', d, 'time'), field('Ends', 'input', d.end, 'end', d, 'time'));
  const tr = el('div', 'field'); tr.append(el('span', null, 'Kind'), switchField('Transit', 'transit', d)); times.append(tr);
  // Location + pin finder
  const pinWrap = el('div'); pinWrap.style.display = 'flex'; pinWrap.style.gap = '8px';
  const pin = el('input'); pin.name = 'pin'; pin.value = d.pin; pin.placeholder = '35.6717, 139.7662 or a Google Maps link'; pin.oninput = () => { d.pin = pin.value; };
  const fb = el('button', 'btn secondary', 'Find'); fb.type = 'button';
  fb.onclick = async () => {
    const qy = (d.place || d.title || '').trim();
    if (!qy) { toast('Type a location first.'); return; }
    fb.disabled = true; fb.textContent = 'Finding…';
    try {
      const near = CH_COORD[groupCh(editingItem().group)] || null;
      const r = await API.api('/api/geocode?q=' + encodeURIComponent(qy) + (near ? '&near=' + near.join(',') : ''));
      if (r.found) { d.pin = r.lat + ', ' + r.lng; pin.value = d.pin; toast('Pin found on OpenStreetMap. Check it on the day map.'); }
      else toast('OpenStreetMap couldn\'t find that. Try a simpler name or paste a Google Maps link.');
    } catch (e) { toast('Pin lookup didn\'t work. Paste a Google Maps link instead.'); }
    finally { fb.disabled = false; fb.textContent = 'Find'; }
  };
  pinWrap.append(pin, fb);
  const pinL = el('label', 'field'); pinL.append(el('span', null, 'Map pin'), pinWrap);
  const catOpts = [['', 'Not counted'], ...CATS.map(c => [c.id, c.name])];
  lodging.append(el('p', 'kicker', 'Hotel'));
  if (features.hotels) {
    const r = el('div', 'row2'); r.append(field('Name for live prices (Japanese works best)', 'input', d.hotelQuery, 'hotelQuery', d), field('Nights', 'input', d.nights, 'nights', d, 'number', { min: 1, max: 30, inputMode: 'numeric' }));
    lodging.append(r);
  }
  lodging.append(field('Alert me under (¥, whole stay)', 'input', d.target, 'target', d, 'number', { min: 0, inputMode: 'numeric', placeholder: 'e.g. 50000' }),
    el('p', 'help', 'The nightly price watch emails you when the stay drops to this or a sold-out date opens up.'));
  showLodging();
  const money = el('div', 'row3');
  money.append(field('Cost for both', 'input', d.cost, 'cost', d, 'number', { min: 0, step: 'any', inputMode: 'decimal' }),
    select('Currency', 'cur', d.cur, [['JPY', '¥ yen'], ['USD', '$ dollars']], d),
    select('Budget category', 'cat', d.cat, catOpts, d, showLodging));
  const paidRow = el('div', 'row2');
  const pf = el('div', 'field'); pf.append(el('span', null, 'Status'), switchField('Paid', 'paid', d));
  paidRow.append(pf, select('Paid by', 'paidBy', d.paidBy, [['', 'Not set'], ...TRAVELERS.map(t => [t, t])], d));
  const opensL = field('Sale opens (Japan time)', 'input', d.opens.length === 10 ? d.opens + 'T00:00' : d.opens, 'opens', d, 'datetime-local');
  f.append(
    fieldset(null, field('What', 'input', d.title, 'title', d, 'text', { maxLength: 200, required: true }), times, (() => { const p = el('div', 'field'); p.append(el('span', null, 'Priority'), pr); return p; })()),
    fieldset('Where', field('Location (place name or address)', 'input', d.place, 'place', d), pinL, el('p', 'help', 'In Google Maps, long-press the spot and copy the coordinates, or paste the place\'s share link.')),
    fieldset('Notes', field('Details', 'textarea', d.detail, 'detail', d)),
    fieldset('Money', money, paidRow),
    lodging,
    fieldset('Booking', (() => { const r = el('div', 'row2'); r.append(field('Link label', 'input', d.linkLabel, 'linkLabel', d), field('Link (https://…)', 'input', d.linkUrl, 'linkUrl', d, 'url')); return r; })(),
      (() => { const r = el('div', 'row2'); r.append(field('Confirmation code', 'input', d.code, 'code', d, 'text', { maxLength: 40, autocapitalize: 'characters' }), opensL); return r; })())
  );
  const save = el('button', 'btn', isNew ? 'Add item' : 'Save changes'); save.type = 'submit'; save.setAttribute('form', 'editForm');
  const cancel = el('button', 'btn secondary', 'Cancel'); cancel.type = 'button'; cancel.onclick = closeSheet;
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const title = d.title.trim();
    if (!title) { toast('Give the item a name first.'); const t = f.querySelector('[name=title]'); t.classList.add('shake'); t.focus(); setTimeout(() => t.classList.remove('shake'), 300); return; }
    if (!checkTimes(d)) return;
    const cur = isNew ? null : items.find(x => x.id === item.id); // re-read: a sync may have replaced the item while the sheet was open
    const lp = linksPatch(d, cur ? linkList(cur) : []); if (!lp) return;
    const cp = costPatch(d); if (!cp) return;
    const lo = locPatch(d); if (!lo) return;
    const extra = bookingPatch(d); if (!extra) return;
    if (features.hotels) { extra.hotelQuery = String(d.hotelQuery || '').trim().slice(0, 80); const n = Number(d.nights); extra.nights = n > 0 ? Math.min(30, Math.round(n)) : null; }
    const base = { title, detail: d.detail.trim(), priority: d.priority };
    editing = null; closeSheet();
    if (isNew) {
      const sorts = items.filter(x => x.group === groupId).map(x => x.sort || 0);
      create(Object.assign({ group: groupId, sort: (sorts.length ? Math.max(...sorts) : 0) + 10, done: false }, base, timePatch(d), lp, cp, lo, extra), 'Added ' + q(title) + ' to ' + g.when);
    } else write(item.id, Object.assign(base, timePatch(d), lp, cp, lo, extra), 'Edited ' + q(title));
  };
  openSheet({ title: isNew ? 'Add to ' + g.when : 'Edit item', body: f, foot: [cancel, save], onClose: () => { editing = null; } });
}
function costPatch(d) {
  const raw = d.cost == null ? '' : String(d.cost).trim();
  const who = TRAVELERS.includes(d.paidBy) ? d.paidBy : null;
  if (raw === '' || !d.cat) return { cost: null, cur: d.cur || 'JPY', cat: d.cat || '', paid: !!d.paid, paidBy: who };
  const n = Number(raw);
  if (!(n >= 0)) { toast('Enter the cost as a number.'); return null; }
  return { cost: n, cur: d.cur || 'JPY', cat: d.cat, paid: !!d.paid, paidBy: who };
}
function bookingPatch(d) {
  const out = { code: String(d.code || '').trim().slice(0, 40) };
  const o = String(d.opens || '').trim();
  out.opens = !o ? '' : /T00:00$/.test(o) ? o.slice(0, 10) : o.slice(0, 16);
  if (out.opens && !opensAt(out.opens)) { toast('Couldn\'t read the sale date.'); return null; }
  const t = String(d.target == null ? '' : d.target).trim();
  out.target = t === '' ? null : Math.round(Number(t));
  if (out.target != null && !(out.target > 0)) { toast('The alert price needs to be a number above zero.'); return null; }
  return out;
}
function locPatch(d) {
  const place = (d.place || '').trim().slice(0, 160);
  const raw = (d.pin || '').trim();
  if (!raw) return { place, lat: null, lng: null };
  const pp = parsePin(raw);
  if (!pp) { toast('Couldn\'t read that map pin. Use numbers like 35.6717, 139.7662 or a Google Maps link.'); return null; }
  return { place, lat: pp.lat, lng: pp.lng };
}
function linksPatch(d, existing) {
  const url = (d.linkUrl || '').trim();
  const rest = (existing || []).slice(1);
  if (!url) return { links: rest };
  if (!safeUrl(url)) { toast('Links need to start with https://'); return null; }
  return { links: [{ label: (d.linkLabel || '').trim() || 'Book', url: safeUrl(url) }].concat(rest) };
}
function checkTimes(d) {
  const s = mins(d.start), e = mins(d.end);
  if (d.end && !d.start) { toast('Add a start time, or clear the end time.'); return false; }
  if (s != null && e != null && e <= s) { toast('The end time needs to be after the start time.'); return false; }
  return true;
}
function timePatch(d) { return { start: d.start || '', end: d.start ? (d.end || '') : '', kind: d.transit ? 'travel' : 'activity' }; }

/* ---------- Share sheet ---------- */
function openShare() {
  const b = el('div');
  const row = el('div'); row.style.display = 'flex'; row.style.gap = '8px';
  const inp = el('input', 'input'); inp.readOnly = true; inp.value = location.origin + '/?k=' + encodeURIComponent(API.key()); inp.setAttribute('aria-label', 'Link to this plan');
  const c = el('button', 'btn'); c.type = 'button'; withIcon(c, 'copy', 'Copy'); c.onclick = () => copyText(inp.value, 'Link copied.');
  row.append(inp, c);
  b.append(row, el('p', 'help', canWrite
    ? 'Anyone with this link can see and edit the plan. For someone who should only look, send the view-only link instead (see the README).'
    : 'Anyone with this link can see the plan but not change it.'));
  b.lastChild.style.marginTop = '10px';
  openSheet({ title: 'Share this plan', body: b });
  inp.select();
}
$('#shareBtn').addEventListener('click', openShare);

/* ---------- Render ---------- */
function render() {
  renderRoute();
  const main = $('#main'); main.textContent = '';
  if (loaded) {
    const all = counts(live());
    $('#progress').hidden = !all.total;
    $('#meterFill').style.width = (all.total ? Math.round(100 * all.done / all.total) : 0) + '%';
    $('#progText').textContent = all.done + ' of ' + all.total + ' done';
    CHAPTERS.forEach(c => {
      const sec = el('section', 'chapter'); sec.id = c.id;
      const head = el('div', 'chapter-head');
      if (c.station) head.append(el('span', 'kicker', c.station + ' · ' + c.dates));
      head.append(el('h2', null, c.name));
      const meta = el('p', 'meta'); meta.style.margin = '0';
      const cc = counts(live().filter(i => groupCh(i.group) === c.id));
      meta.append(document.createTextNode(c.place + '. '), el('span', 'ok', cc.done + ' of ' + cc.total + ' done'));
      head.append(meta); sec.append(head);
      GROUPS.filter(g => g.ch === c.id).forEach(g => sec.append(renderGroup(g)));
      main.append(sec);
    });
    fillNames();
  }
  renderMoney();
  if (modules[screen] && modules[screen].render && screen !== 'plan' && screen !== 'money') modules[screen].render();
}
async function fillNames() {
  const spans = [...document.querySelectorAll('.done-by[data-uid]')];
  if (!user || !spans.length) return;
  let ps = {};
  try { ps = await user.profiles([...new Set(spans.map(s => s.dataset.uid))]); } catch (e) { return; }
  spans.forEach(sp => {
    const p = ps[sp.dataset.uid]; if (!p || !sp.isConnected) return;
    const who = p.isMe ? 'you' : (p.name || 'someone');
    sp.textContent = 'by ' + who + (sp.dataset.at ? ', ' + sp.dataset.at : '');
  });
}
function q(s) { return '“' + (s || 'Untitled') + '”'; }

/* ---------- Writes ---------- */
function stamp() { return { updatedAt: Date.now(), updatedBy: uid || null }; }
function chain(id, fn) {
  const prev = chains.get(id) || Promise.resolve();
  pending++; syncPill();
  const next = prev.catch(() => {}).then(fn).finally(() => { pending--; syncPill(); });
  chains.set(id, next);
  return next;
}
function handleErr(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' || code === 'not_granted') {
    canWrite = false; render(); setAccessStatus(); syncPill();
    toast('This view is read-only. Ask Kristin for the edit link.');
  } else if (code === 'quota_exceeded') toast('The plan is full. Delete a few items, then try again.');
  else toast('That change didn\'t save. Check your connection and try again.');
}
function write(id, patch, logText) {
  if (!db || !canWrite) return;
  const it = items.find(x => x.id === id); if (it) Object.assign(it, patch); render();
  chain(id, () => db.collection('items').doc(id).update(Object.assign({}, patch, stamp())))
    .then(() => addLog(logText)).catch(handleErr);
}
function create(data, logText) {
  if (!db || !canWrite) return;
  const ref = db.collection('items').doc();
  items.push(Object.assign({ id: ref.id }, data)); render();
  chain(ref.id, () => ref.set(Object.assign({}, data, stamp()))).then(() => addLog(logText)).catch(handleErr);
  return ref.id;
}
function addLog(text) {
  if (!db) return Promise.resolve();
  return db.collection('log').add({ at: Date.now(), by: uid || null, text: String(text).slice(0, 300) }).catch(() => {});
}

/* ---------- Log ---------- */
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
let logSeq = 0;
async function renderLog() {
  const seq = ++logSeq;
  const ol = $('#log');
  $('#logEmpty').hidden = logRows.length > 0;
  let names = {};
  const ids = [...new Set(logRows.map(r => r.by).filter(b => b && b !== 'watch'))];
  if (user && ids.length) { try { names = await user.profiles(ids); } catch (e) { /* names are optional */ } }
  if (seq !== logSeq) return;
  ol.textContent = '';
  logRows.forEach(r => {
    const li = el('li');
    const p = r.by && names[r.by];
    const who = r.by === 'watch' ? 'Price watch' : p ? (p.isMe ? 'You' : (p.name || 'Someone')) : 'Someone';
    li.append(el('span', 'who', who), document.createTextNode(' ' + (r.text || 'made a change').replace(/^./, c => c.toLowerCase())));
    li.append(el('span', 'ago', ago(r.at || 0)));
    ol.append(li);
  });
}

/* ---------- Access ---------- */
function setAccessStatus() {
  if (!db) return;
  if (canWrite) setStatus(['Changes save for everyone who opens this page. ', { b: 'Tap a colored dot' }, ' to set priority: red high, yellow medium, green low.']);
  else setStatus(['You\'re viewing the live plan. ', { b: 'Read-only:' }, ' ask Kristin for the edit link to make changes.']);
}

/* ---------- Controls ---------- */
$('#filters').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-f]'); if (!b) return;
  filter = b.dataset.f;
  $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
});
$('#statusF').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-s]'); if (!b) return;
  statusF = b.dataset.s;
  $('#statusF').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
});
function updateToday() {
  const n = tokyoNow(); const g = Object.keys(GROUP_DATE).find(k => GROUP_DATE[k] === n.date);
  const b = $('#today'); b.hidden = !g;
  b.onclick = () => scrollToId(g);
}
setInterval(() => { updateToday(); if (loaded) render(); }, 5 * 60000);
updateToday();
function setShowSkipped(v) { showSkipped = v; $('#showSkipped').checked = v; render(); }
$('#showSkipped').addEventListener('change', ev => setShowSkipped(ev.target.checked));
document.querySelectorAll('[data-icon]').forEach(n => n.replaceWith(icon(n.dataset.icon)));

/* ---------- Context for feature modules ---------- */
export const ctx = {
  $, el, sv, icon, withIcon, iconBtn, extLink, toast, openSheet, closeSheet, copyText, safeUrl, q,
  get items() { return items; }, live, get db() { return db; }, get uid() { return uid; }, get canWrite() { return canWrite; }, get features() { return features; },
  get settings() { return settings; }, get expenses() { return expenses; }, get loaded() { return loaded; },
  write, create, addLog, handleErr, render, go, register: (id, m) => { modules[id] = m; buildNav(); route(); },
  gapHooks, itemHooks, openEditor, flashItem, hasPin, mins, fmt12, dur, byTime, tokyoNow, timeRange, mapsUrl, routeUrl, mapQuery,
  toUSD, fUSD, fJPY, fAmt, hasCost, rate, addDaysISO, fmtOpens, wxText, walkLegFor, linkList, ago, CATS
};
export function watchDoc(id) { return docsOf('watch/' + id); }
export function docsOf(path) { return window.TRIP_API && API.doc ? API.doc(path) : undefined; }

/* ---------- Boot ---------- */
buildNav();
route();
renderRoute();
async function boot() {
  if (!window.claude || typeof window.claude.use !== 'function') { setStatus(['The plan couldn\'t start. Reload the page to try again.']); return; }
  const [d, u] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  loadLive();
  db = d; user = u;
  if (!db) { setStatus(['This link doesn\'t include a valid trip key. Ask whoever shared the plan for the full link.']); return; }
  if (user) {
    try { uid = await user.id(); } catch (e) { /* anonymous */ }
    try { const c = await user.can('data.write'); if (c === false) canWrite = false; } catch (e) { /* assume editable until a write says otherwise */ }
  }
  setAccessStatus(); syncPill();
  setupBudgetForms();
  $('#expForm').hidden = !canWrite;
  $('#budgetSettings').hidden = !canWrite;
  renderSettingsForm(true);
  db.doc('settings/budget').onSnapshot(snap => {
    if (snap.exists) {
      const s = snap.data(); settingsRaw = s;
      settings = { rate: Number(s.rate) || DEFAULT_SETTINGS.rate, useLive: s.useLive !== false, cats: Object.assign({}, DEFAULT_SETTINGS.cats, s.cats || {}), meals: Object.assign({}, DEFAULT_SETTINGS.meals, s.meals || {}) };
    }
    renderSettingsForm(false);
    render();
  }, () => {});
  db.doc('settings/fares').onSnapshot(snap => { fares = snap.exists ? snap.data() : null; renderFares(false); }, () => {});
  db.collection('expenses').onSnapshot(snap => { expenses = snap.docs.map(s => Object.assign({ id: s.id }, s.data())); renderMoney(); }, () => {});
  db.collection('items').onSnapshot(snap => {
    items = snap.docs.map(s => Object.assign({ id: s.id }, s.data()));
    const first = !loaded;
    loaded = true;
    setTimeout(loadWeather, 50);
    if (!items.length) setStatus(['The plan is empty. Add items to any day below.']); else setAccessStatus();
    render();
    if (first && location.hash && !location.hash.startsWith('#/')) route(); // #d03-style anchors exist only after the first render
  }, () => { setStatus(['The plan couldn\'t load. Reload the page to try again.']); });
  db.collection('log').orderBy('at', 'desc').limit(25).onSnapshot(snap => { logRows = snap.docs.map(s => s.data()); renderLog(); }, () => {});
  db.collection('watch').onSnapshot(() => { if (loaded) render(); }, () => {});
  setInterval(() => { if (logRows.length) renderLog(); }, 60000);
}
boot();
