// A minimal iCalendar (RFC 5545) writer for sale-opening reminders.
import { opensAt } from './alerts.js';

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line) { // lines longer than 75 chars continue on the next line after a space
  const out = []; let s = line;
  while (s.length > 75) { out.push(s.slice(0, 75)); s = ' ' + s.slice(75); }
  out.push(s); return out.join('\r\n');
}

/* events: [{ uid, title, opens, detail, url }] */
export function toICS(events, { name = 'Trip sale dates', now = Date.now() } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//japan-trip-planner//sale dates//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc(name)];
  for (const e of events) {
    const at = opensAt(e.opens); if (!at) continue;
    const allDay = !/T/.test(e.opens);
    L.push('BEGIN:VEVENT', 'UID:' + esc(e.uid) + '@japan-trip-planner', 'DTSTAMP:' + utc(now), 'SUMMARY:' + esc('Sale opens: ' + e.title));
    if (allDay) { const d = e.opens.replace(/-/g, ''); const n = new Date(Date.parse(e.opens + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10).replace(/-/g, ''); L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + n); }
    else L.push('DTSTART:' + utc(at), 'DTEND:' + utc(at + 30 * 60e3));
    if (e.detail || e.url) L.push('DESCRIPTION:' + esc([e.detail, e.url].filter(Boolean).join('\n')));
    if (e.url) L.push('URL:' + esc(e.url));
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-P1D', 'END:VALARM');
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), allDay ? 'TRIGGER:PT9H' : 'TRIGGER:-PT15M', 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
