# Changelog

## 2.3.0 (2026-10-01)

### Change cities and nights
- A new **Change cities and nights** sheet: a − / + stepper for the nights in each city, add a city (found on OpenStreetMap for its pin, weather and Explore), remove a city (Undo until you save). It shows the trip length and end date as you go, warns when the plan stops ending on your flight home, and lists hotel check-ins whose date would move.
- The route now lives in the database (`settings/route`). Plans without one keep the original route; nothing to migrate.
- To-dos on days you remove are never deleted: they collect under **Not on a day yet**. The edit sheet has a new **Day** field to move any to-do to another day.
- Each city says when the hotels on the plan cover fewer nights than the stay. The price watch checks stays on their new dates and starts a fresh price history when the dates move; Deals hides prices checked for old dates.
- The trip map is drawn from the route: numbered pins, framed to fit any screen.

### Clearer sections
- Each city has a numbered bar (matching its map pin) that sticks to the top while you scroll through it, with its dates and nights. Day cards lead with the date and a "Day 6" label. **Book ahead** looks like a checklist of deadlines.

### Dollars first
- Every yen price also shows dollars, dollars first: plan items, hotel prices, Deals (the big number is now in dollars), the spending log, the fare table (new ≈ $ column), the edit sheet and price-alert emails.

### Phones
- The Money screen no longer scrolls sideways (it was 667 px wide on a 390 px phone).
- The filter bar wraps instead of hiding To do, Done, Skipped and Check opening hours off-screen; it no longer sticks to the top (the city bar does).
- To-do rows are shorter: the Maps, Edit and Skip buttons sit beside the time and title instead of on a line of their own, and phones change priority in Edit (the stripe still shows it).
- The trip map fits the screen instead of scrolling sideways.

## 2.2.0 (2026-09-30)

- One mode for everyone: whoever can see the plan can edit it, and every change saves to the database for everyone. The view-only key (`VIEW_KEY`) is gone.
- `EDIT_KEY` is now an optional lock: unset (the default now), anyone who opens the site can view and edit; set, the whole site needs the link with `?k=`.
- Share copies the plain site address when the site is open; the sale-date calendar needs no token when open.

## 2.1.1 (2026-09-30)

- Checkboxes and priority dots on the view-only link no longer do nothing: a tap explains that this browser has the view-only link and offers a box to paste the edit link.
- Checkboxes get a 44 px tap area on phones; the check no longer replays its pop animation on every refresh.

## 2.1.0 (2026-09-30)

Everything now runs on free plans.

- Storage moves to Postgres on Neon's free plan (`DATABASE_URL`) instead of Upstash Redis. The app creates its tables and loads the plan on first run; revisions commit in order so no client misses a write; deleted docs keep a tombstone so every browser syncs the delete.
- The Claude assistant and receipt scanning are removed (they needed paid API credit), along with `ANTHROPIC_API_KEY` and the Anthropic SDK.
- In their place, free prefilled searches: **Explore → Search** opens Google Maps near the stop you pick (presets or anything you type), Tabelog, events and cherry-blossom forecasts for the day, and hotel searches for that night; each stay on Deals gets **Compare elsewhere** (Booking.com with your dates, Google prices, Jalan, Ikyu, Rakuten).
- The fare table stays as a place to keep fares by hand.

## 2.0.1 (2026-09-30)

- Opening the site without a key now shows a "private plan" card on every screen, with a box to paste your link, instead of blank screens. The Share button hides until a key is present.

## 2.0.0 (2026-09-30)

A redesign on the Kuzic design system, and the four-phase roadmap built out: the planner now goes looking for better prices and unusual places on its own, and works as an offline travel app.

### Design
- Kuzic tokens for light and dark (following the system setting), Geist and Geist Mono, Shippori Mincho for city and chapter names, a sakura route line.
- Sticky glass header with section navigation on desktop; bottom dock on phones; screens for Plan, Today, Deals, Explore and Money (`#/plan` style links; old `#d03` and `#budget` links still work).
- Day cards, a custom check, priority dots, icon actions, status badges; editing, sharing and the name question move into a sheet (bottom sheet on phones).

### Phase 1: never overpay for what you've already picked
- Nightly price watch (`/api/watch`, Vercel Cron at 06:00 Japan time) over every stay, with 120 checks of history.
- Alerts for your alert price, rooms reappearing on sold-out dates, and new lows; shown on Deals and in Recent changes, and emailed through Resend when configured.
- Flexible dates: the same stay a day earlier and later.
- Meals included compared with room-only plus eating out, using meal costs you set.
- Sale dates on items, with countdowns, a calendar feed (`/api/calendar`, read-only token) and a reminder email the day before.

### Phase 2: find unique places, not just famous ones
- Discovery from OpenStreetMap (Overpass, with fallback instances) and Wikidata (`/api/discover`), chains filtered.
- Uniqueness score from age, heritage status, rarity nearby and how little-known a place is, with the reasons shown.
- "Find something nearby" on free gaps of 45 minutes or more; adding a place fills the gap with times.
- Taste learning from priorities, check-offs, skips, picks and dismissals.

### Phase 3: a trip assistant that does the legwork
- Explore → Ask: Claude (`claude-opus-5-5`) with tools over the plan, places, Rakuten hotel search and prices, walking times, place lookup and the fare table (`/api/assistant`).
- Whole-trip optimizer ("Find savings across the trip") over a fare table you keep on the Money screen.
- Opening-hours clash check on the Plan toolbar, matching OpenStreetMap features by name.

### Phase 4: travel mode
- Installable app: manifest, icons and a service worker; the last synced plan is kept on the phone and edits made offline sync in order when you're back.
- Today screen: next stop, walking time, directions, booking codes, tonight's hotel, the day's checklist.
- Receipt scanning into a prefilled expense; expenses and paid items record who paid and who for; Money shows who owes whom.

### Under the hood
- Shared `public/trip.js` for trip facts and pure helpers used by the page and the server.
- One Rakuten client with a request queue; store epoch so a reset store forces a full reload; budget saves keep fields the form doesn't edit.
- New item fields (all optional): confirmation code, sale opening date, alert price, paid by, discovery provenance.
- `npm test` (node:test) for the server logic and the database API; `scripts/fakes.mjs` for keyless local checks.
- New settings: `CRON_SECRET`, `RESEND_API_KEY`, `ALERT_EMAIL`, `ALERT_FROM`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. The Anthropic SDK is the first dependency (`npm install`).

## 1.0.0

- First Vercel version: the shared plan and budget from the Claude version, with live exchange rate, weather, walking times, map pins and Rakuten hotel prices.
