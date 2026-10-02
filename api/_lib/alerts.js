// Price-watch bookkeeping: fold one fresh Rakuten check into a stay's watch doc and decide what's worth an alert.
import { opensAt } from '../../public/trip.js';
export { opensAt };
const fmtYen = (n) => '¥' + Math.round(n).toLocaleString('en-US');

/* prev: the stay's previous watch doc (or null). r: priceStay() result. rate: yen per dollar, to lead alert texts with dollars.
   Returns { doc, alerts }. */
export function applyCheck(prev, r, { title = 'A stay', target = null, day, at = Date.now(), rate = null }) {
  prev = prev || {};
  const yen = (n) => rate > 0 ? '$' + Math.round(n / rate).toLocaleString('en-US') + ' (' + fmtYen(n) + ')' : fmtYen(n);
  const total = r.found && r.available && r.estimateTotal != null ? r.estimateTotal : null;
  const last = prev.latest || null;
  const alerts = [];
  if (last && last.found && !last.available && total != null)
    alerts.push({ kind: 'open', text: `${title}: rooms are listed again for your dates, from ${yen(total)} for ${r.nights} ${r.nights === 1 ? 'night' : 'nights'}.` });
  const wasUnder = last && last.estimateTotal != null && target != null && last.estimateTotal <= target;
  if (target != null && total != null && total <= target && !wasUnder)
    alerts.push({ kind: 'target', text: `${title}: ${yen(total)} is at or under your ${yen(target)} target.` });
  if (total != null && prev.low && total <= prev.low.total * 0.97)
    alerts.push({ kind: 'low', text: `${title}: new low of ${yen(total)}, down from ${yen(prev.low.total)}.` });
  const doc = {
    ...prev,
    hotelNo: r.hotelNo || prev.hotelNo || '', hotelName: r.hotelName || prev.hotelName || '',
    latest: { found: !!r.found, available: !!r.available, firstNight: r.firstNight ?? null, estimateTotal: total, nights: r.nights ?? null, url: r.planListUrl || '', message: r.message || '' },
    meals: r.meals || null,
    history: [...(prev.history || []), { d: day, total, avail: !!r.available }].slice(-120),
    low: total != null && (!prev.low || total < prev.low.total) ? { total, d: day } : (prev.low || null),
    alerts: [...alerts.map(a => ({ ...a, at })), ...(prev.alerts || [])].slice(0, 20),
    checkedAt: at, error: ''
  };
  return { doc, alerts };
}

/* Shifting the stay one day either way: what it would cost relative to the dates you have. */
export function flexFrom(base, earlier, later) {
  // A shifted date can have rooms when yours are sold out: keep its price, with no difference to compare against.
  const one = (r, dir) => r && r.found && r.available && r.estimateTotal != null
    ? { dir, total: r.estimateTotal, diff: base.estimateTotal != null ? r.estimateTotal - base.estimateTotal : null } : { dir, total: null, diff: null, available: false };
  return { earlier: one(earlier, -1), later: one(later, 1) };
}

export function dueReminders(items, reminded, now = Date.now(), windowMs = 36 * 3600e3) {
  return items.filter(i => !i.disabled && !i.done && i.opens && !reminded[i.id]).map(i => ({ i, at: opensAt(i.opens) }))
    .filter(x => x.at && x.at > now && x.at - now <= windowMs);
}
