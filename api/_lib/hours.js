// OpenStreetMap opening_hours -> is it open for a visit? Handles the common forms:
//   "24/7", "Mo-Fr 09:00-17:00; Sa 10:00-16:00; Su off", "10:00-18:00", "Tu-Su 10:00-12:00,13:00-17:00", "Mar-Nov Mo-Su 09:00-17:00".
//   plus "Dec 31 10:00-17:30" date rules; PH/SH rules are skipped because no Japanese holiday falls on the trip (Apr 1-14).
// ponytail: subset of the spec; anything else (week numbers, sunrise, comments) answers "unknown" rather than guessing.
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

function range(list, a, b) {
  const i = list.indexOf(a), j = list.indexOf(b);
  if (i < 0 || j < 0) return null;
  const out = []; for (let k = i; ; k = (k + 1) % list.length) { out.push(k); if (k === j) break; }
  return out;
}
function selector(tok, list) { // "Mo-Fr,Su" -> [0,1,2,3,4,6]
  const out = [];
  for (const part of tok.split(',')) {
    const [a, b] = part.split('-');
    const r = b ? range(list, a, b) : (list.includes(a) ? [list.indexOf(a)] : null);
    if (!r) return null;
    out.push(...r);
  }
  return out;
}

/* Returns [{months, days, spans:[[from,to]] | 'off'}] in order, or null when the string uses syntax outside the subset. */
export function parseHours(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (s === '24/7') return [{ months: null, days: null, spans: [[0, 1440]] }];
  const rules = [];
  // "Mo-Sa 10:00-19:00, Su 10:00-18:00": a comma after a time starts another rule
  for (const raw of s.replace(/(\d:\d\d\+?),\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su)\b)/g, '$1;').split(';').map(x => x.trim()).filter(Boolean)) {
    const toks = raw.replace(/\s*,\s*/g, ',').split(/\s+/);
    let months = null, days = null, mday = null;
    if (toks[0] && MONTHS.includes(toks[0].split(/[-,]/)[0])) {
      months = selector(toks.shift(), MONTHS); if (!months) return null;
      if (/^\d{1,2}$/.test(toks[0] || '')) mday = Number(toks.shift()); // "Dec 31 10:00-17:30"
    }
    // Public/school holiday selectors: none fall inside this trip, so a holiday-only rule never applies and "Mo-Su,PH" means Mo-Su.
    if (toks[0] && /^(PH|SH)$/.test(toks[0])) continue;
    if (toks[0] && /^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(toks[0])) { days = selector(toks.shift().replace(/,?(PH|SH)\b/g, ''), DAYS); if (!days) return null; }
    const t = toks.join(' ');
    let spans;
    if (t === 'off' || t === 'closed') spans = 'off';
    else if (t === '' && (days || months)) spans = [[0, 1440]];
    else {
      spans = [];
      for (const p of t.split(',')) {
        const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\+?$/.exec(p) || /^(\d{1,2}:\d{2})\+$/.exec(p);
        if (!m) return null;
        const a = hm(m[1]); let b = m[2] ? hm(m[2]) : 1440;
        if (a == null || b == null) return null;
        if (b <= a) b += 1440; // past midnight
        spans.push([a, b]);
      }
    }
    rules.push({ months, days, mday, spans });
  }
  return rules.length ? rules : null;
}

/* 'open' | 'partial' (closes before the visit ends) | 'closed' | 'unknown' for a visit on dateISO from `from` to `to` minutes. */
export function openState(str, dateISO, from, to) {
  const rules = parseHours(str);
  if (!rules || from == null) return 'unknown';
  const d = new Date(dateISO + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7, mon = d.getUTCMonth();
  let spans = null; // later rules override earlier ones for the days they name
  for (const r of rules) {
    if (r.months && !r.months.includes(mon)) continue;
    if (r.mday && r.mday !== d.getUTCDate()) continue;
    if (r.days && !r.days.includes(dow)) continue;
    spans = r.spans;
  }
  if (!spans || spans === 'off') return 'closed';
  const end = to != null && to > from ? to : from + 1;
  if (spans.some(([a, b]) => a <= from && end <= b)) return 'open';
  if (spans.some(([a, b]) => a <= from && from < b)) return 'partial';
  return 'closed';
}
