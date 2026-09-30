// Sale openings as an iCalendar feed: /api/calendar?t=<token from /api/config>. Subscribe in Apple, Google or Outlook calendars.
import { access, query, calToken, same, fail } from './_lib/http.js';
import { readAll } from './_lib/store.js';
import { toICS } from './_lib/ics.js';

export default async function handler(req, res) {
  const t = String(query(req).t || '');
  const tok = calToken();
  if (!access(req).canView && !(tok && t && same(t, tok))) return fail(res, 403, 'not_granted', 'This calendar link is missing its token.');
  try {
    const { docs } = await readAll();
    const events = Object.entries(docs).filter(([p, v]) => p.startsWith('items/') && v && v.opens && !v.disabled)
      .map(([p, v]) => ({ uid: p.slice(6), title: v.title || 'Tickets', opens: v.opens, detail: v.detail || '', url: (Array.isArray(v.links) && v.links[0] && v.links[0].url) || '' }));
    res.statusCode = 200;
    res.setHeader('content-type', 'text/calendar; charset=utf-8');
    res.setHeader('content-disposition', 'inline; filename="japan-2027-sale-dates.ics"');
    res.setHeader('cache-control', 'no-store');
    res.end(toICS(events, { name: 'Japan 2027: sale dates' }));
  } catch (e) { console.error(e); fail(res, 503, 'unavailable', 'Storage is unavailable.'); }
}
