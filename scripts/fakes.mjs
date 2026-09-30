// Local stand-ins for Rakuten Travel (port 3918) and the Claude API (port 3919), for checking the price watch and the assistant without keys.
//   node scripts/fakes.mjs                      then start the dev server with
//   RAKUTEN_APP_ID=x RAKUTEN_ACCESS_KEY=y RAKUTEN_BASE=http://localhost:3918 ANTHROPIC_API_KEY=fake ANTHROPIC_BASE_URL=http://localhost:3919 npm run dev
// DROP=4000 lowers every price (to trigger "new low" and target alerts); REOPEN=1 ends the sold-out case.
import http from 'node:http';

const room = (name, total, d, b) => ({ roomInfo: [{ roomBasicInfo: { planName: name, withDinnerFlag: d, withBreakfastFlag: b, reserveUrl: 'https://travel.rakuten.co.jp/' } }, { dailyCharge: { total } }] });
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.searchParams;
  res.setHeader('content-type', 'application/json');
  if (u.pathname.includes('KeywordHotelSearch')) {
    const no = /澤の屋/.test(p.get('keyword')) ? 222 : 100 + (p.get('keyword').length % 50); // Sawanoya is the sold-out example
    return res.end(JSON.stringify({ hotels: [[{ hotelBasicInfo: { hotelNo: no, hotelName: 'Fake ' + p.get('keyword') } }]] }));
  }
  if (u.pathname.includes('VacantHotelSearch')) {
    const ci = p.get('checkinDate');
    if (!process.env.REOPEN && p.get('hotelNo') === '222' && ci === '2027-04-12') { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
    const base = 30000 + (Number(ci.slice(-2)) % 3) * 6000 - Number(process.env.DROP || 0);
    return res.end(JSON.stringify({ hotels: [[{ hotelBasicInfo: { hotelNo: p.get('hotelNo') || 1, hotelName: 'Fake hotel ' + (p.get('hotelNo') || 1), planListUrl: 'https://travel.rakuten.co.jp/' } }, room('Room only', base, 0, 0), room('Two meals', base + 14000, 1, 1)]] }));
  }
  res.statusCode = 404; res.end('{}');
}).listen(3918, () => console.log('fake Rakuten on :3918'));

// Answers the first turn with two tool calls (get_plan, search_places), then a text answer; receipts get fixed JSON.
http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
    const j = JSON.parse(b || '{}'); const last = j.messages[j.messages.length - 1];
    const base = { id: 'msg_fake', type: 'message', role: 'assistant', model: j.model, usage: { input_tokens: 1, output_tokens: 1 } };
    res.setHeader('content-type', 'application/json');
    if (j.output_config && j.output_config.format) return res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ amount: 1280, currency: 'JPY', merchant: 'Lawson', category: 'food', date: '2027-04-02', readable: true }) }] }));
    if (typeof last.content === 'string') return res.end(JSON.stringify({ ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_plan', input: {} }, { type: 'tool_use', id: 't2', name: 'search_places', input: { lat: 35.6717, lng: 139.765, walk_minutes: 10 } }] }));
    const n = last.content.filter(c => c.type === 'tool_result').length;
    res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: `Fake answer after ${n} tool results.\n- **Itoya**, https://www.ito-ya.co.jp` }] }));
  });
}).listen(3919, () => console.log('fake Claude API on :3919'));
