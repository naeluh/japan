// Local stand-in for Rakuten Travel (port 3918), for checking the price watch without a key.
//   node scripts/fakes.mjs                      then start the dev server with
//   RAKUTEN_APP_ID=x RAKUTEN_ACCESS_KEY=y RAKUTEN_BASE=http://localhost:3918 npm run dev
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
