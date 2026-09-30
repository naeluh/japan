/* Deals: the nightly price watch on every stay, flexible dates, meals-included comparison, and sale-date reminders. */
import { ctx, watchDoc } from './app.js';
import { GROUP_DATE, TRIP, CH_CITY, groupCh, opensAt, stayLinks } from './trip.js';

const { $, el, icon, withIcon, extLink, toast } = ctx;
const API = window.TRIP_API;
let busy = false;
let calToken = '';
API.config.then(c => { calToken = c.calToken || ''; }).catch(() => {});

const isStay = (i) => !i.disabled && i.cat === 'lodging' && !!i.hotelQuery && i.nights > 0 && !!GROUP_DATE[i.group];
const md = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const signed = (n) => (n < 0 ? '−' : '+') + ctx.fJPY(Math.abs(n));
const toJPY = (amount, cur) => cur === 'USD' ? amount * ctx.rate() : amount;

async function checkNow(itemId, btn) {
  if (busy) return; busy = true;
  const label = btn.textContent; btn.disabled = true; btn.textContent = itemId ? 'Checking…' : 'Checking every stay…';
  try {
    const r = await API.api('/api/watch', { method: 'POST', body: JSON.stringify(itemId ? { itemId } : {}) });
    toast(r.checked ? `Checked ${r.checked} ${r.checked === 1 ? 'stay' : 'stays'}. ${r.alerts ? r.alerts + ' worth a look.' : 'Nothing new.'}` : r.rakuten ? 'No stays to check.' : 'Live prices need the Rakuten key.');
    if (API.pull) await API.pull();
  } catch (e) { toast((e && e.message) || 'The check didn\'t run. Try again in a minute.'); }
  finally { busy = false; btn.disabled = false; btn.textContent = label; ctx.render(); }
}

function setupNotes() {
  const f = ctx.features, notes = [];
  if (!f.hotels) notes.push('Live prices turn on with a free Rakuten Travel key (RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY).');
  else if (!f.watch) notes.push('Nightly checks need CRON_SECRET in the Vercel settings. You can still check by hand.');
  if (f.hotels && !f.mail) notes.push('Email alerts turn on with RESEND_API_KEY and ALERT_EMAIL. Until then, alerts collect here.');
  return notes;
}

function stayCard(i) {
  const w = watchDoc(i.id) || null;
  const latest = w && w.latest ? w.latest : (i.live ? { ...i.live, estimateTotal: i.live.estimateTotal } : null);
  const card = el('article', 'card pad stay');
  const head = el('div', 'stay-head');
  const ci = GROUP_DATE[i.group], co = ctx.addDaysISO(ci, i.nights);
  const t = el('div'); t.append(el('h3', 'card-title', (w && w.hotelName) || (latest && latest.hotelName) || i.title),
    el('p', 'kicker', md(ci) + ' → ' + md(co) + ' · ' + i.nights + (i.nights === 1 ? ' night' : ' nights')));
  head.append(t);
  if (ctx.canWrite && ctx.features.hotels) {
    const b = el('button', 'btn secondary sm'); b.type = 'button'; withIcon(b, 'refresh', 'Check'); b.onclick = () => checkNow(i.id, b);
    head.append(b);
  }
  card.append(head);
  // Price, against the plan
  const planned = ctx.hasCost(i) && i.cost > 0 ? toJPY(i.cost, i.cur) : null;
  const priceRow = el('div', 'stay-price');
  if (w && w.error) card.append(el('p', 'slab danger', w.error));
  if (!latest) priceRow.append(el('p', 'muted', ctx.features.hotels ? 'Not checked yet.' : 'No live price yet.'));
  else if (!latest.found) priceRow.append(el('p', 'slab', latest.message || 'Not on Rakuten Travel. Try the Japanese name in Edit.'));
  else if (!latest.available) priceRow.append(el('p', 'slab warning', 'Sold out on Rakuten for your dates, or not on sale yet. You\'ll get an alert if rooms appear.'));
  else {
    const big = el('p', 'bignum', ctx.fJPY(latest.estimateTotal));
    const sub = el('p', 'stay-sub');
    sub.append(el('span', 'badge info', 'Live'), document.createTextNode(' Rakuten, from ' + ctx.fJPY(latest.firstNight) + ' a night, ≈ ' + ctx.fUSD(ctx.toUSD(latest.estimateTotal, 'JPY')) + ' for both'));
    priceRow.append(big, sub);
    if (planned != null) {
      const diff = latest.estimateTotal - planned;
      priceRow.append(el('p', diff <= 0 ? 'delta good' : 'delta bad', (diff <= 0 ? ctx.fJPY(-diff) + ' under' : ctx.fJPY(diff) + ' over') + ' the ' + ctx.fJPY(planned) + ' in the plan (est.)'));
    }
  }
  card.append(priceRow);
  // Facts row: lowest seen, alert price
  const facts = el('div', 'pills');
  if (w && w.low) facts.append(el('span', 'chip', 'Lowest seen ' + ctx.fJPY(w.low.total) + ', ' + md(w.low.d)));
  const tgt = el('button', 'chip'); tgt.type = 'button'; withIcon(tgt, 'bell', i.target ? 'Alert under ' + ctx.fJPY(i.target) : 'Set an alert price');
  tgt.disabled = !ctx.canWrite; tgt.onclick = () => ctx.openEditor(i);
  facts.append(tgt);
  card.append(facts);
  // Flexible dates
  if (w && w.flex) {
    const fx = el('div', 'flexrow');
    for (const [key, name] of [['earlier', 'A day earlier'], ['later', 'A day later']]) {
      const f = w.flex[key]; if (!f) continue;
      let text, cls = 'chip';
      if (f.total == null) text = name + ': no rooms';
      else if (f.diff == null) text = name + ' has rooms: ' + ctx.fJPY(f.total);
      else if (f.diff < 0) { text = name + ': save ' + ctx.fJPY(-f.diff); cls += ' good'; }
      else if (f.diff === 0) text = name + ': same price';
      else text = name + ': ' + signed(f.diff);
      fx.append(el('span', cls, text));
    }
    card.append(el('p', 'kicker', 'Shift the stay'), fx);
  }
  // Meals included vs eating out
  const m = w && w.meals;
  if (m && m.withMeals && m.roomOnly) {
    const n = i.nights, pp = TRIP.adults, meals = ctx.settings.meals || { dinner: 6000, breakfast: 1500 };
    const withMeals = m.withMeals.firstNight * n;
    const out = n * pp * (meals.dinner + (m.roomOnly.breakfast ? 0 : meals.breakfast));
    const roomOnly = m.roomOnly.firstNight * n;
    const cmp = el('div', 'mealcmp');
    const row = (label, value, note) => { const r = el('div', 'mrow'); r.append(el('span', null, label), el('span', 'num', ctx.fJPY(value))); if (note) r.append(el('span', 'muted', note)); return r; };
    cmp.append(row('Dinner and breakfast included', withMeals, m.withMeals.plan),
      row(m.roomOnly.breakfast ? 'Breakfast only, dinners out' : 'Room only, meals out', roomOnly + out, ctx.fJPY(roomOnly) + ' + ≈ ' + ctx.fJPY(out) + ' eating out'));
    const d = withMeals - (roomOnly + out);
    cmp.append(el('p', 'delta ' + (d <= 0 ? 'good' : ''), Math.abs(d) < 1000 ? 'About the same either way.' : d < 0 ? 'Meals included saves ≈ ' + ctx.fJPY(-d) + '.' : 'Eating out saves ≈ ' + ctx.fJPY(d) + '.'));
    card.append(el('p', 'kicker', 'With meals, compared fairly'), cmp);
  }
  // Where to book
  const links = el('div', 'pills');
  const direct = ctx.linkList(i)[0];
  const a1 = direct ? extLink(direct.url, 'Book direct') : extLink('https://www.google.com/search?q=' + encodeURIComponent(i.hotelQuery + ' 公式サイト'), 'Find the hotel\'s own site');
  if (a1) links.append(a1);
  if (latest && latest.url) { const a2 = extLink(latest.url, 'Rakuten rooms'); if (a2) links.append(a2); }
  card.append(links);
  const cmp = el('div', 'pills');
  stayLinks(i, (i.place || (w && w.hotelName) || i.title).split(',')[0].replace(/^Check in (at )?/i, ''), CH_CITY[groupCh(i.group)] || 'Japan', ci, co)
    .forEach(([l, u]) => { const a = extLink(u, l); if (a) cmp.append(a); });
  card.append(el('p', 'kicker', 'Compare elsewhere'), cmp);
  // History
  if (w && Array.isArray(w.history) && w.history.length > 1) {
    const det = el('details', 'disclose'); const sum = el('summary', null, w.history.length + ' checks'); sum.append(icon('chevron')); det.append(sum);
    const ol = el('ol', 'hist');
    w.history.slice(-14).reverse().forEach(h => { const li = el('li'); li.append(el('span', 'num', md(h.d)), el('span', 'num', h.total != null ? ctx.fJPY(h.total) : 'sold out')); ol.append(li); });
    det.append(ol); card.append(det);
  }
  if (w && w.checkedAt) card.append(el('p', 'help', 'Checked ' + ctx.ago(w.checkedAt) + '. Rakuten quotes the first night; the stay total is an estimate.'));
  return card;
}

function saleCard() {
  const rows = ctx.live().filter(i => i.opens && opensAt(i.opens)).sort((a, b) => opensAt(a.opens) - opensAt(b.opens));
  const card = el('section', 'card pad');
  const h = el('div', 'stay-head'); h.append(el('h2', 'card-title', 'Sale dates'));
  card.append(h);
  if (!rows.length) { card.append(el('p', 'empty', 'No sale dates yet. Add one under Edit → Sale opens.')); return card; }
  const ul = el('ul', 'sales');
  const now = Date.now();
  rows.forEach(i => {
    const at = opensAt(i.opens), days = Math.ceil((at - now) / 86400e3);
    const li = el('li'); const t = el('div', 'grow');
    t.append(el('div', 'title', i.title), el('div', 'muted', ctx.fmtOpens(i.opens) + (/T/.test(i.opens) ? ' · ' + new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' your time' : '')));
    li.append(t);
    li.append(i.done ? withIcon(el('span', 'badge success'), 'check', 'Booked') : days > 0 ? el('span', 'badge', days === 1 ? 'Tomorrow' : 'In ' + days + ' days') : el('span', 'badge warning', 'On sale now'));
    ul.append(li);
  });
  card.append(ul);
  if (calToken) {
    const https = location.origin + '/api/calendar?t=' + calToken;
    const acts = el('div', 'pills');
    const sub = el('a', 'chip'); sub.href = 'webcal://' + location.host + '/api/calendar?t=' + calToken; withIcon(sub, 'calendar', 'Subscribe in your calendar');
    const cp = el('button', 'chip'); cp.type = 'button'; withIcon(cp, 'copy', 'Copy calendar link'); cp.onclick = () => ctx.copyText(https, 'Calendar link copied. Paste it into Google Calendar under Other calendars → From URL.');
    acts.append(sub, cp); card.append(acts);
  }
  card.append(el('p', 'help', ctx.features.mail ? 'You\'ll also get an email the day before each sale opens.' : 'Each event reminds you a day before and 15 minutes before.'));
  return card;
}

function alertsCard(stays) {
  const all = stays.flatMap(i => { const w = watchDoc(i.id); return w && Array.isArray(w.alerts) ? w.alerts : []; }).sort((a, b) => b.at - a.at).slice(0, 8);
  if (!all.length) return null;
  const card = el('section', 'card pad'); card.append(el('h2', 'card-title', 'Recent alerts'));
  const ul = el('ul', 'sales alerts');
  const label = { low: ['New low', 'success'], target: ['Under target', 'success'], open: ['Rooms back', 'info'] };
  all.forEach(a => { const li = el('li'); const [t, c] = label[a.kind] || ['Update', '']; const tx = el('div', 'grow'); tx.append(el('div', null, a.text), el('div', 'muted', ctx.ago(a.at))); li.append(el('span', 'badge ' + c, t), tx); ul.append(li); });
  card.append(ul); return card;
}

function render() {
  const root = $('#deals'); if (!root) return;
  root.textContent = '';
  if (!ctx.loaded) return;
  const stays = ctx.items.filter(isStay).sort((a, b) => GROUP_DATE[a.group].localeCompare(GROUP_DATE[b.group]));
  const meta = watchDoc('_meta');
  const top = el('div', 'deals-top');
  const last = el('p', 'muted', meta && meta.lastRun ? 'Last check ' + ctx.ago(meta.lastRun) + (meta.lastResult ? ', ' + meta.lastResult.checked + ' stays, ' + meta.lastResult.alerts + ' alerts.' : '.') : 'Checks run every night around 6 AM Japan time.');
  top.append(last);
  if (ctx.canWrite && ctx.features.hotels && stays.length) { const b = el('button', 'btn sm'); b.type = 'button'; withIcon(b, 'refresh', 'Check every stay now'); b.onclick = () => checkNow(null, b); top.append(b); }
  root.append(top);
  setupNotes().forEach(n => root.append(el('p', 'slab info', n)));
  const a = alertsCard(stays); if (a) root.append(a);
  if (!stays.length) root.append(el('p', 'empty', 'No stays to watch. Give a hotel check-in a hotel name and nights under Edit.'));
  stays.forEach(i => root.append(stayCard(i)));
  root.append(saleCard());
  const lim = el('section', 'card pad');
  lim.append(el('h2', 'card-title', 'What "best deal" can and can\'t see'),
    el('p', 'lead', 'Rakuten Travel is the only live price source. Booking.com, Expedia and Agoda share prices only through partner programs, and Google Hotels, Ikyu and Jalan have no open API, so each stay has prefilled searches on them under Compare elsewhere. Small ryokan are often cheapest booked direct. Live figures are marked Live; everything else is an estimate.'));
  root.append(lim);
}

ctx.register('deals', { render });
