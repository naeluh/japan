# Japan trip planner (Vercel version)

Your shared Kristin & Nick plan, running on your own Vercel site. It starts with everything that was in the Claude version when you downloaded it (166 items plus the budget), and adds live data from free, open APIs.

## What's live

| What | Where it shows | Source | Key needed |
| --- | --- | --- | --- |
| Dollar-to-yen rate | Budget totals and every "≈ $" figure | [Frankfurter](https://frankfurter.dev) (European Central Bank rates), falling back to [ExchangeRate-API open access](https://www.exchangerate-api.com/docs/free) | No |
| Weather and daylight | A line under each day: sunrise, sunset, high/low, rain | [Open-Meteo](https://open-meteo.com). More than 15 days out it shows what the same dates were like in each of the last 3 years; inside 15 days it switches to the real forecast automatically | No |
| Walking times | Between stops in the timeline, with a red warning when the walk is longer than the gap you've planned | OpenStreetMap foot routing by [FOSSGIS](https://routing.openstreetmap.de/about.html) | No |
| Map pins | "Find pin" in the edit form | OpenStreetMap [Nominatim](https://nominatim.org) | No |
| Hotel prices | "Check live price" on each hotel check-in, with "Use this price" to update the budget | [Rakuten Travel API](https://webservice.rakuten.co.jp/documentation/vacant-hotel-search) | Yes, free |

Every lookup is cached in your database (exchange rate 6 hours, weather 3 hours or 30 days, walking and pins 30 days, hotels 6 hours), so the free services are called rarely.

Not automated: train fares and timetables. There's no free open API for Shinkansen fares or times. The timeline keeps the fares already entered, and the "Open the day's route in Google Maps" links give live transit directions on the day.

## Deploy (about 10 minutes)

1. **Put the code on GitHub.** Create a new private repository and upload this folder. Or, with the Vercel CLI installed, run `npx vercel` inside the folder and skip to step 3.
2. **Create the project.** In Vercel choose **Add New → Project**, import the repository, leave the framework as **Other**, and leave the build command empty.
3. **Add storage.** In the project, open **Storage → Create Database → Upstash (Redis)**, pick the free plan and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
4. **Add settings** under **Settings → Environment Variables** (see `.env.example`):
   - `EDIT_KEY`: a long random string. This is the password in your edit link.
   - `VIEW_KEY` (optional): a second random string for view-only links. Without it, anyone who has the site address can read the plan (but not change it).
   - `CONTACT_EMAIL`: your email. OpenStreetMap's services ask apps to identify themselves.
   - For hotel prices: `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY` and `PUBLIC_URL` (your site address). See below.
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the settings take effect.
6. **Open** `https://YOUR-SITE.vercel.app/?k=YOUR_EDIT_KEY`. The key is saved in that browser and removed from the address bar. The first time you change something it asks your name, which appears in Recent changes.

## Sharing

- **Editors (Nick):** use the page's **Share** button, which copies `https://YOUR-SITE.vercel.app/?k=YOUR_EDIT_KEY`.
- **View-only:** send `https://YOUR-SITE.vercel.app/?k=YOUR_VIEW_KEY` by hand.
- To cut off a link, change the key in Vercel and redeploy.

Anyone with the edit link can change the plan, so send it privately.

## Live hotel prices (Rakuten Travel)

1. Sign in at https://webservice.rakuten.co.jp/app/create (a free Rakuten account works) and register an app. Add your Vercel site address as the app's website.
2. Copy the **Application ID** and **Access Key** into `RAKUTEN_APP_ID` and `RAKUTEN_ACCESS_KEY`, set `PUBLIC_URL` to your site address, and redeploy.
3. On each hotel check-in, tap **Check live price**. It searches Rakuten for the hotel name stored on that item (the Japanese name works best; edit it under **Edit → Hotel name for live prices**), then asks for rooms for two on your dates.

Notes: Rakuten quotes the first night's price, so the total assumes every night costs the same. If it says no rooms are listed, the hotel may be sold out, not on Rakuten, or not selling those dates yet (many open 6–12 months ahead). Rakuten allows about one request per second, so a check takes a couple of seconds.

## Run it on your computer

```
cp .env.example .env      # set EDIT_KEY at least
npm run dev               # http://localhost:3000/?k=YOUR_EDIT_KEY
```

No installs are needed (Node 18 or newer). Without Redis settings it keeps data in `.local-db.json`. `npx vercel dev` also works.

## Files

- `public/index.html`: the planner page.
- `public/shim.js`: connects the page to this site's API. It saves the key, syncs changes every 5 seconds and fills in names.
- `api/db.js`: stores the plan in Redis. Reads need the view or edit key if `VIEW_KEY` is set; writes need the edit key.
- `api/fx.js`, `api/weather.js`, `api/walk.js`, `api/geocode.js` and `api/hotel-price.js`: the live-data lookups.
- `api/_lib/seed.js`: your plan as exported, loaded into storage the first time the site runs.

The Claude version and this one don't sync. After you switch, make changes here.
