---
name: trip-planner
description: Run, check and deploy this Japan trip planner (vanilla page + Vercel functions). Use before changing the page, the API, the price watch, discovery, the assistant or the offline shim, and before deploying.
---

# Working on the trip planner

## Run it locally (never on port 3000: sibling projects use it)
```
node scripts/fakes.mjs &                     # fake Rakuten on :3918
PORT=3917 EDIT_KEY=devkey CRON_SECRET=cronsecret LOCAL_DB_FILE=/tmp/trip-dev.json \
  RAKUTEN_APP_ID=x RAKUTEN_ACCESS_KEY=y RAKUTEN_BASE=http://localhost:3918 node dev-server.mjs &
```
- Record `$!` and stop servers by that PID, never `pkill -f dev-server.mjs` (other repos have one).
- The dev server caches imported modules: restart it after editing anything under `api/`.
- Delete `LOCAL_DB_FILE` to reseed after changing `api/_lib/seed.js`.
- Real Postgres: set `DATABASE_URL` to the Neon **dev** branch (project `japan-trip`, org `nick`), never the main branch, which is production. `node --test test/db.test.mjs` with that URL proves the Postgres store (schema, seed, deltas, tombstones).
- `curl -H 'Authorization: Bearer cronsecret' localhost:3917/api/watch` runs the nightly price watch against the fake (DROP=4000 / REOPEN=1 on the fake trigger alerts).

## Check it
- `npm test` (node:test over `test/*.test.mjs`): opening hours, scoring, alerts, calendar, Rakuten parsing, settle-up, taste, the stays catalog and estimate (`readPicks`, `estimate`), Plan tab links (`planTarget`), and `/api/db` on a throwaway store.
- Everything must stay on free plans (the user can't pay for services): no paid APIs, no paid storage. Sites without open data get prefilled search links (`links` in `public/trip.js`), not scrapers or paid APIs.
- Screens: `node scripts/shots.mjs "http://localhost:3917/?k=devkey#/deals" /tmp/deals --w 390 --h 844 --wait 4000 [--full] [--eval "js"] [--script file.js]`, then Read the PNGs (light and dark). Check phone width for horizontal overflow (`scrollWidth > innerWidth`) on every screen and every Plan tab, Money included. Plan renders only the open tab: on a fresh seed the `li.item` counts over all tabs (`#/plan/<chapter id>`) add up to 166; the Overview has none.
- Route editor flow (`#routeBtn`): minus then plus on a city restores the same day (no to-dos move); Cancel saves nothing; +1 night lists hotel check-ins that move; add a city (live Nominatim lookup), remove one, Save; then read `/api/db?since=0`: `settings/route` changed and no `items/*` doc did. The removed days' to-dos show on the **Not on a day yet** tab (`#/plan/unplaced`).
- Drive real flows with `--script`: check-off (answers the name sheet), edit sheet save, add item, skip, expense, budget save; then read `/api/db?since=0` to prove the server has it. UI state alone proves nothing. Set `localStorage['trip:name']` first so the name sheet doesn't cover the sheet you're testing.
- Stays flow (city tab): click a stay (`#pk-c3-ace`), a train (`#pk-leg-2-green`), food on the Overview (`#pk-food-treat`): `settings/picks` changes and no `items/*` or `log/*` doc does. Put on plan (`#pk-put-c5`, then the sheet's "Put on the plan"): one new lodging item with `stay`, nights from the route and cost in USD, the old lodging items `disabled: true`, `settings/picks.stays.c5` gone, and the plan row checked with no Put button left.
- Offline: CDP `Network.emulateNetworkConditions({offline:true})`, check something off, reload, then go online and confirm the outbox empties and the server has the change.

## Traps this codebase has already hit
- The route (cities, nights, days, dates) is data: `settings/route`, absent = `DEFAULT_ROUTE` in `public/trip.js`. `CHAPTERS`, `GROUPS`, `GROUP_DATE`, `CH_COORD`, `CH_CITY` are live bindings reassigned by `useRoute()`: never copy them into module-level constants (compute day lists inside functions), and never hardcode a chapter id like `c4` (use a stop flag such as `island`). The server calls `buildTrip(docs['settings/route'])` per run.
- `cleanRoute` is the trust boundary for the route: ids must match `c\d+|city-…` and `d\d+|day-…`, because stop and day ids become element ids.
- Items point at a day id; an item whose day is gone shows under "Not on a day yet". Removing days never rewrites items.
- `isStay(i, groupDate)` takes the dates map as its second argument: call it as `filter(i => isStay(i))`, never point-free (`filter(isStay)` passes the index).
- Duplicate ids: `#today` was both the Plan toolbar button and the Today screen, so the screen rendered into a hidden button. Screen containers use `...View` ids; run `grep -o 'id="[^"]*"' public/index.html | sort | uniq -d`.
- One `<dialog>` serves every sheet: `openSheet` must settle the previous sheet's `onClose` before replacing it, or the name promise never resolves and every write waits forever.
- Writes must never wait on the name question (the name only labels Recent changes).
- CSS overrides for breakpoints must come after, or out-specify, the base rule (`.seg.navseg`).
- Don't animate rows on render: the page rebuilds the DOM on every sync. Anything that must outlive a re-render (an item flash, a scroll target) is state read by the renderer or re-found inside `requestAnimationFrame`, never a captured node: walk and weather results re-render the tab a moment later.
- Plan targets (`#/plan/x`, old `#c1`/`#d03`, map pins, Jump to today, `flashItem`) resolve through `planTarget(x, items)` from data, never `getElementById`: only the open tab is in the DOM.
- Inputs that hold typing or a drag carry `data-hold` + `data-v` (the committed value): `render()` waits while one is focused and dirty. Set `dataset.v` before saving, or the save's own render waits for blur.
- `settings/picks` (stays.js) is read with `docsOf` at render time, never subscribed: the shim fires listeners in order and the items listener already re-renders. Saves spread the stored doc; `readPicks` in `catalog.js` is its trust boundary (use `Object.hasOwn`, `FOOD['constructor']` is truthy).
- `.leg` is the map's SVG route class; `.stay`, `.stay-head`, `.delta`, `.est`, `.big` belong to Deals and Money. New Plan classes use `rail-`, `pick-`, `sum-`, `citytabs`.
- New page modules go in `public/sw.js` `SHELL`, or the installed app starts offline without them.
- Overpass instances return 504 under load; `api/_lib/osm.js` tries several. Opening hours are matched to a stop by NAME only; never borrow the nearest shop's hours.
- Hobby plan: at most 12 functions in `api/` (now 10), cron once a day. Every `functions` entry in `vercel.json` must match an existing file or the deploy fails.
- `public/trip.js` is imported by the functions; `vercel build` then `ls .vercel/output/functions/api/watch.func/public/` proves it is bundled.
- Settings saves must spread the stored doc (`settingsRaw`), or fields the form doesn't show are dropped.

## Deploy
- Production deploys from `main` (Git integration, project `naeluhs-projects/japan`). Env changes need a new deployment.
- Vercel env: `DATABASE_URL` is the Neon main branch for Production and the dev branch for Preview.
- Access is one mode (the user's choice): no `EDIT_KEY` = anyone can view and edit; `EDIT_KEY` set = everything needs `?k=`. There is no view-only key any more; don't reintroduce one.
- After deploying: anonymous `curl /api/config` (canEdit true and locked false while open; storage `postgres`), `vercel crons ls` or the project settings for the cron, and one `Bearer $CRON_SECRET` run of `/api/watch`.
- Testing on the live site writes to the real plan: use a throwaway doc (`items/zz-smoke`, then delete it) and remove any log entries a test creates.
