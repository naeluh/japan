# Japan trip planner

Kristin and Nick's shared plan for Japan, April 1–14, 2027, running as a small web app on Vercel. It keeps the plan and the budget, pulls live data from free, open APIs, and goes looking for things on its own: better prices on the stays you've picked, and unusual places that fit the gaps in your days. It installs on a phone and keeps working without signal.

The look and interactions follow the Kuzic design system (Geist type, warm light and dark themes, sheets, segmented controls, a bottom dock on phones), with two trip touches: Shippori Mincho for city and chapter names, and a sakura route line.

## Screens

| Screen | What it does |
| --- | --- |
| **Plan** | The timeline: chapters, day cards with weather, walking times between stops (red when a walk is longer than the gap), day maps, priorities, costs, booking links and confirmation codes. Free gaps of 45 minutes or more offer **Find something nearby**. **Check opening hours** flags stops that may be closed when you plan to be there. |
| **Today** | Phone-first travel-day view: the next stop with walking time, directions and booking code, tonight's hotel, the day's checklist, and quick expense logging or receipt scanning. Before the trip it previews April 1. |
| **Deals** | The price watch on every stay: live Rakuten price against the plan, lowest price seen, your alert price, what shifting the stay a day earlier or later would cost, meals-included compared fairly with eating out, links to book direct, check history, and sale dates with calendar reminders. |
| **Explore** | **Nearby**: unusual places near any stop (old shops, small museums, bathhouses, heritage sites) ranked by a uniqueness score, open at the time you pick, within a short walk. **Ask**: the trip assistant, in plain English. |
| **Money** | Budget by category, biggest costs, spending log (who paid, who it was for), who owes whom, the fare table, and budget, exchange-rate and meal-cost settings. |

## Live data and where it comes from

| What | Source | Key needed |
| --- | --- | --- |
| Dollar-to-yen rate | [Frankfurter](https://frankfurter.dev) (ECB rates), falling back to [ExchangeRate-API open access](https://www.exchangerate-api.com/docs/free) | No |
| Weather and daylight | [Open-Meteo](https://open-meteo.com): the real forecast inside 15 days, otherwise the same dates in each of the last 3 years | No |
| Walking times | OpenStreetMap foot routing by [FOSSGIS](https://routing.openstreetmap.de/about.html) | No |
| Map pins | OpenStreetMap [Nominatim](https://nominatim.org) | No |
| Places, opening hours | OpenStreetMap through the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (several public instances, tried in turn) | No |
| Founding years, heritage status, fame | [Wikidata](https://www.wikidata.org) | No |
| Hotel prices, vacancy, meal plans | [Rakuten Travel API](https://webservice.rakuten.co.jp/documentation/vacant-hotel-search) | Yes, free |
| Alert emails | [Resend](https://resend.com) | Yes, free tier |
| Trip assistant, receipt reading | [Claude API](https://platform.claude.com) (`claude-opus-5-5`) | Yes, paid per use |

Lookups are cached in the database (exchange rate 6 hours, weather 3 hours or 30 days, walking and pins 30 days, hotels 6 hours, places 7 days, opening hours 1 day), so the free services are called rarely.

Not automated: train fares and timetables. There's no free fare API for the Shinkansen or rail passes, so fares live in the **fare table** you keep on the Money screen, and the day maps link to Google Maps for live transit directions.

## Deploy (about 15 minutes)

1. **Code on GitHub, project on Vercel.** Import the repository in Vercel (**Add New → Project**), framework **Other**, no build command. Pushes to `main` deploy to production.
2. **Storage.** In the project, open **Storage → Create Database → Upstash for Redis** (this is what Vercel KV became), pick the free plan and connect it. It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. From a terminal: `vercel integration add upstash/upstash-kv` (it opens the browser once to accept Upstash's terms).
3. **Settings** under **Settings → Environment Variables** (see `.env.example`):
   - `EDIT_KEY`: a long random string, the password in your edit link.
   - `VIEW_KEY`: a second random string for view-only links. With it set, the plan is private; without it, anyone with the site address can read it (not change it). The plan now holds confirmation codes and who paid what, so set it.
   - `CRON_SECRET`: a long random string. Vercel sends it with the nightly price-watch run; nothing else can trigger that run without the edit key.
   - `PUBLIC_URL`: your site address. Rakuten wants it as the referring site, and alert emails link back to it.
   - Optional: `RAKUTEN_APP_ID` + `RAKUTEN_ACCESS_KEY` (live prices), `RESEND_API_KEY` + `ALERT_EMAIL` (email alerts), `ANTHROPIC_API_KEY` (assistant and receipts), `CONTACT_EMAIL` (OpenStreetMap services ask apps to identify themselves).
4. **Redeploy** so the settings take effect.
5. **Open** `https://YOUR-SITE.vercel.app/?k=YOUR_EDIT_KEY`. The key is saved in that browser and removed from the address bar. The first edit asks your name for Recent changes.

## Price watch and alerts

- **Rakuten key.** Register a free app at https://webservice.rakuten.co.jp/app/create with your site address as its website, then set `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY` and `PUBLIC_URL`.
- **Stays.** Any hotel check-in with a budget category of Lodging, a **hotel name for live prices** (the Japanese name works best) and a number of nights is watched. Set **Alert me under** in the edit sheet to get an alert when the whole stay drops to that price.
- **Nightly run.** `vercel.json` schedules `/api/watch` at 21:00 UTC (06:00 Japan time; Hobby plans run it within that hour). For each stay it checks your dates plus one day earlier and later, splits plans with dinner and breakfast from room-only ones, keeps 120 checks of history, and records alerts for: a price at or under your alert price, rooms reappearing on sold-out dates, and a new low at least 3% under the previous low. Ryokan often release rooms 30–60 days out when tour groups cancel. **Check every stay now** on the Deals screen runs the same check on demand.
- **Email.** Create a Resend account, set `RESEND_API_KEY` and `ALERT_EMAIL` (comma-separated for both of you). Without a verified domain Resend sends from `onboarding@resend.dev`, which only delivers to your own Resend address; set `ALERT_FROM` once you verify a domain. Without email, alerts still show on Deals and in Recent changes.
- **Sale dates.** Items with **Sale opens** (Japan time) show countdowns on Deals. **Subscribe in your calendar** adds them to Apple, Google or Outlook calendars with reminders a day and 15 minutes before; the nightly run also emails the day before. The calendar link carries a read-only token, never your key.
- **Meals compared fairly.** A ryokan with dinner and breakfast is compared with room-only plus eating out, using the meal costs in Money settings (defaults: ¥6,000 dinner and ¥1,500 breakfast per person).

Rakuten quotes the first night only, so stay totals are estimates and marked as such.

## Discovery

**Explore → Nearby** finds places within a 5–20 minute walk of any stop, or of where you are. It scores them 0–100 on age (from OpenStreetMap `start_date` or Wikidata founding year), heritage designation (UNESCO counts most), how rare that kind of place is nearby, and how little-known it is (Wikipedia coverage), tuned by your taste, and hides chain stores. Pick a time and it keeps only places that are open then.

From a free gap on the timeline, **Find something nearby** fills in the day, stop and time window. **Add** drops the place into the gap with a start and end time; **Not for us** hides it. Your taste comes from what you rank high, check off or skip, plus what you add or dismiss in Explore.

## The assistant

Set `ANTHROPIC_API_KEY` to turn on **Explore → Ask** and receipt scanning. It uses `claude-opus-5-5` (override with `ANTHROPIC_MODEL`) with tools that call this site's own data: read the plan, search places, search hotels near a point on Rakuten, price a named hotel, measure a walk, find a place, and read the fare table. It names its sources and marks estimates. **Find savings across the trip** on the Money screen asks it for concrete swaps using the plan, the price watch and the fare table. Requests use Anthropic's server-side fallback for declined requests. Only the edit link can use it, since each question costs API credit.

**Scan a receipt** (Today or Money) downsizes the photo on the phone, reads the total, currency, merchant and category, and opens a prefilled expense to confirm.

## Travel mode

Open the site on your phone and use **Add to Home Screen**. The app shell is cached by a service worker and the last synced plan is kept on the phone, so Today, codes and the timeline work without signal. Changes made offline wait in a queue (the header shows **Offline · N to sync**) and send in order when you're back online.

## What limits "best deal"

- Rakuten Travel is the only live price source. Booking.com, Expedia and Agoda share data mainly through partner or affiliate programs; Google Hotels has no public API; Ikyu and Jalan don't offer open ones. Those stay as links.
- In Japan, booking direct is often cheapest, especially for small ryokan, so every stay has a **Book direct** link.
- No scraping of sites that forbid it, and every figure is labeled live or estimated.

## Sharing

- **Editors:** the **Share** button copies `https://YOUR-SITE.vercel.app/?k=YOUR_EDIT_KEY`. Anyone with it can edit, so send it privately.
- **View-only:** send `https://YOUR-SITE.vercel.app/?k=YOUR_VIEW_KEY` by hand.
- To cut off a link, change the key in Vercel and redeploy.

## Run it on your computer

```
npm install               # the Anthropic SDK is the only dependency
cp .env.example .env      # set EDIT_KEY at least
npm run dev               # http://localhost:3000/?k=YOUR_EDIT_KEY
npm test                  # server logic and the database API (node:test)
```

Without Redis settings the dev server keeps data in `.local-db.json` (`LOCAL_DB_FILE` moves it). `scripts/fakes.mjs` runs stand-ins for Rakuten and the Claude API (`RAKUTEN_BASE`, `ANTHROPIC_BASE_URL`) so the price watch and the assistant can be exercised without keys; `.claude/skills/trip-planner/SKILL.md` has the full local check routine.

## Files

- `public/index.html`, `app.css`, `app.js`: the page, the design tokens and components, and the core (sync, Plan, Money, sheets, routing).
- `public/deals.js`, `explore.js`, `today.js`: the Deals, Explore (Nearby and Ask) and Today screens.
- `public/trip.js`: trip facts and pure helpers shared by the page and the server (days, dates, taste profile, settle-up, sale dates).
- `public/shim.js`: connects the page to the API: key handling, 5-second sync, offline copy and outbox.
- `public/sw.js`, `manifest.webmanifest`, icons: the installable offline app.
- `api/db.js`: stores the plan in Redis. Reads need the view or edit key when `VIEW_KEY` is set; writes need the edit key.
- `api/watch.js` (nightly price watch), `api/calendar.js` (sale-date feed), `api/discover.js` (places and opening hours), `api/assistant.js` (Claude), and `api/fx.js`, `weather.js`, `walk.js`, `geocode.js`, `hotel-price.js`, `config.js`.
- `api/_lib/`: storage, Rakuten client, OpenStreetMap and Wikidata discovery, opening-hours parser, alert rules, calendar writer, email, and your plan as first exported (`seed.js`, loaded the first time storage is empty).
- `test/`: `npm test` checks.

## Roadmap

All four phases of the plan are built:

1. **Never overpay for what you've already picked:** nightly price watch with history and alerts, flexible-date check, meals-included comparison, sale-date reminders.
2. **Find unique places, not just famous ones:** OpenStreetMap and Wikidata discovery, uniqueness score, fits-your-gap suggestions, taste learning.
3. **A trip assistant that does the legwork:** plain-English questions with real searches, whole-trip optimizer over a fare table you keep, opening-hours clash check.
4. **Travel mode:** installable offline app with a Today view, receipt scanning, Kristin/Nick split.

Next, if they earn it: more price sources once a partner program accepts the site, taste learning that weighs time of day, and push notifications instead of email.
