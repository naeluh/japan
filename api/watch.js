// Price watch. Vercel Cron calls GET nightly (06:00 Japan time) with `Authorization: Bearer $CRON_SECRET`;
// POST {itemId?} with the edit key checks now. Results go to watch/<itemId> docs, which sync to every open page.
import crypto from 'node:crypto';
import { send, fail, access, body, same } from './_lib/http.js';
import { readAll, writeDoc, cacheGet } from './_lib/store.js';
import { priceStay, rakutenReady, addDays, RakutenError } from './_lib/rakuten.js';
import { applyCheck, flexFrom, dueReminders } from './_lib/alerts.js';
import { sendMail } from './_lib/mail.js';
import { TRIP, buildTrip, isStay } from '../public/trip.js';

const BUDGET_MS = 240e3; // stop starting new checks before the 300 s function limit; the rest run tomorrow
const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const jst = (ms, timed = true) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', ...(timed ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(ms)) + (timed ? ' Japan time' : '');

export default async function handler(req, res) {
  const cron = req.method === 'GET';
  if (cron) {
    const secret = process.env.CRON_SECRET || '';
    if (!secret || !same(req.headers.authorization || '', 'Bearer ' + secret)) return fail(res, 401, 'not_granted', 'This runs on a schedule.');
  } else if (req.method === 'POST') {
    if (!access(req).canEdit) return fail(res, 403, 'not_granted', 'Checking prices needs the edit link.');
  } else return fail(res, 405, 'invalid_argument', 'Method not allowed.');
  const opts = cron ? {} : await body(req).catch(() => ({}));
  const started = Date.now();
  const day = new Date(started + 9 * 3600e3).toISOString().slice(0, 10);
  try {
    const { docs } = await readAll();
    const items = Object.entries(docs).filter(([p]) => p.startsWith('items/')).map(([p, v]) => ({ id: p.slice(6), ...v }));
    const { groupDate } = buildTrip(docs['settings/route']);   // the route as saved, so a changed stay is checked on its new dates
    const stays = items.filter(i => isStay(i, groupDate) && (!opts.itemId || i.id === opts.itemId));
    const alerts = [], checked = [], skipped = [], failed = [];
    // Dollars in alert texts at the rate the page uses: today's (if cached) unless the budget says fixed, else the fixed one.
    // ponytail: the fx cache lives 6 h, so at 06:00 JST this is usually the fixed rate; fetch fx here if the gap matters.
    const budget = docs['settings/budget'] || {};
    const fx = budget.useLive !== false ? await cacheGet('fx:usdjpy').catch(() => null) : null;
    const rate = (fx && fx.rate) || Number(budget.rate) || 155;
    if (rakutenReady()) for (const i of stays) {
      if (Date.now() - started > BUDGET_MS) { skipped.push(i.id); continue; }
      const checkin = groupDate[i.group], checkout = addDays(checkin, i.nights);
      const stored = docs['watch/' + i.id] || null;
      // Dates moved (route or nights changed): start the history fresh, keeping only which hotel it is.
      const prev = stored && stored.checkin && (stored.checkin !== checkin || stored.nights !== i.nights) ? { hotelNo: stored.hotelNo || '', hotelName: stored.hotelName || '' } : stored;
      const hotelNo = (prev && prev.hotelNo) || (i.live && i.live.hotelNo) || '';
      try {
        const base = await priceStay({ name: i.hotelQuery, hotelNo, checkin, checkout, adults: TRIP.adults, fresh: true });
        const title = base.hotelName || (prev && prev.hotelName) || i.title;
        const { doc, alerts: found } = applyCheck(prev, base, { title, target: i.target ?? null, day, rate });
        Object.assign(doc, { itemId: i.id, checkin, nights: i.nights });
        if (base.found && base.hotelNo) {
          const shift = (n) => priceStay({ hotelNo: base.hotelNo, checkin: addDays(checkin, n), checkout: addDays(checkout, n), adults: TRIP.adults, fresh: true }).catch(() => null);
          doc.flex = flexFrom(base, await shift(-1), await shift(1));
        }
        await writeDoc('watch/' + i.id, doc);
        alerts.push(...found); checked.push(i.id);
      } catch (e) {
        console.error(e); failed.push(i.id);
        await writeDoc('watch/' + i.id, { ...(prev || {}), itemId: i.id, checkin, nights: i.nights, error: e instanceof RakutenError ? e.message : 'The check failed; it runs again tomorrow.', checkedAt: Date.now() });
      }
    }
    const meta = docs['watch/_meta'] || {};
    const reminded = { ...(meta.reminded || {}) };
    if (cron) for (const { i, at } of dueReminders(items, reminded)) {
      alerts.push({ kind: 'sale', text: `${i.title}: sales open ${jst(at, /T/.test(i.opens))}.` });
      reminded[i.id] = new Date().toISOString();
    }
    let mail = { sent: false, reason: 'nothing new' };
    if (alerts.length) {
      const link = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/#/deals' : '';
      mail = await sendMail(`Japan trip: ${alerts.length === 1 ? alerts[0].text.split(':')[0] : alerts.length + ' updates'}`, alerts.map(a => a.text), link).catch(e => ({ sent: false, reason: e.message }));
      for (const a of alerts) await writeDoc('log/' + newId(), { at: Date.now(), by: 'watch', text: 'flagged ' + a.text });
    }
    const result = { checked: checked.length, failed: failed.length, skipped: skipped.length, alerts: alerts.length, mail: mail.sent ? 'sent' : mail.reason, rakuten: rakutenReady() };
    await writeDoc('watch/_meta', { ...meta, reminded, lastRun: Date.now(), lastResult: result });
    send(res, 200, { ...result, alertTexts: alerts.map(a => a.text) });
  } catch (e) { console.error(e); fail(res, 503, 'unavailable', 'Storage is unavailable.'); }
}
