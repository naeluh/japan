---
name: trip-planner
description: Run, check and deploy this Japan trip planner (vanilla page + Vercel functions). Use before changing the page, the API, the price watch, discovery, the assistant or the offline shim, and before deploying.
---

# Working on the trip planner

## Run it locally (never on port 3000: sibling projects use it)
```
node scripts/fakes.mjs &                     # fake Rakuten :3918 + fake Claude API :3919
PORT=3917 EDIT_KEY=devkey CRON_SECRET=cronsecret LOCAL_DB_FILE=/tmp/trip-dev.json \
  RAKUTEN_APP_ID=x RAKUTEN_ACCESS_KEY=y RAKUTEN_BASE=http://localhost:3918 \
  ANTHROPIC_API_KEY=fake ANTHROPIC_BASE_URL=http://localhost:3919 node dev-server.mjs &
```
- Record `$!` and stop servers by that PID, never `pkill -f dev-server.mjs` (other repos have one).
- The dev server caches imported modules: restart it after editing anything under `api/`.
- Delete `LOCAL_DB_FILE` to reseed after changing `api/_lib/seed.js`.
- `curl -H 'Authorization: Bearer cronsecret' localhost:3917/api/watch` runs the nightly price watch against the fake (DROP=4000 / REOPEN=1 on the fake trigger alerts).

## Check it
- `npm test` (node:test over `test/*.test.mjs`): opening hours, scoring, alerts, calendar, Rakuten parsing, settle-up, taste, and `/api/db` on a throwaway store.
- Screens: `node scripts/shots.mjs "http://localhost:3917/?k=devkey#/deals" /tmp/deals --w 390 --h 844 --wait 4000 [--full] [--eval "js"] [--script file.js]`, then Read the PNGs (light and dark). Check phone width for horizontal overflow (`scrollWidth > innerWidth`) and that `li.item` count is 166 on a fresh seed.
- Drive real flows with `--script`: check-off (answers the name sheet), edit sheet save, add item, skip, expense, budget save; then read `/api/db?since=0` to prove the server has it. UI state alone proves nothing.
- Offline: CDP `Network.emulateNetworkConditions({offline:true})`, check something off, reload, then go online and confirm the outbox empties and the server has the change.

## Traps this codebase has already hit
- Duplicate ids: `#today` was both the Plan toolbar button and the Today screen, so the screen rendered into a hidden button. Screen containers use `...View` ids; run `grep -o 'id="[^"]*"' public/index.html | sort | uniq -d`.
- One `<dialog>` serves every sheet: `openSheet` must settle the previous sheet's `onClose` before replacing it, or the name promise never resolves and every write waits forever.
- Writes must never wait on the name question (the name only labels Recent changes).
- CSS overrides for breakpoints must come after, or out-specify, the base rule (`.seg.navseg`).
- Don't animate rows on render: the page rebuilds the DOM on every sync.
- Overpass instances return 504 under load; `api/_lib/osm.js` tries several. Opening hours are matched to a stop by NAME only; never borrow the nearest shop's hours.
- Hobby plan: at most 12 functions in `api/` (now 11), cron once a day. Every `functions` entry in `vercel.json` must match an existing file or the deploy fails.
- `public/trip.js` is imported by the functions; `vercel build` then `ls .vercel/output/functions/api/watch.func/public/` proves it is bundled.
- Settings saves must spread the stored doc (`settingsRaw`), or fields the form doesn't show are dropped.

## Deploy
- Production deploys from `main` (Git integration, project `naeluhs-projects/japan`). Env changes need a new deployment.
- After deploying: anonymous `curl /api/config` (canView false when VIEW_KEY is set), with the edit key (canEdit true, storage `redis`), `vercel crons ls` or the project settings for the cron, and one `Bearer $CRON_SECRET` run of `/api/watch`.
