# Changelog

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
