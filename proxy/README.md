# BeeLine proxy

A Cloudflare Worker that holds BeeLine's Google Maps key, so users don't need
their own. It answers two fixed lookups, `/route` (transit directions via the
Routes API) and `/geocode` (coordinates to an address). It caps them per
install, per IP and in total each day so the key stays inside Google's free
allowance.

Everything here runs on free tiers: Workers Free and SQLite-backed Durable
Objects on Cloudflare, and the 10,000 free requests a month per API on Google.

## 1. Google Cloud

1. In your Maps project, enable the **Routes API**, **Geocoding API** and **Maps
   Embed API**. Then create a **server key** and, under *API restrictions*,
   allow only **Routes API** and **Geocoding API**.
2. Create a second **embed key** that allows only the **Maps Embed API**. This one
   ships in the extension and is visible to users, which is fine because Maps
   Embed is free.
3. Cap usage so Google can never bill you, even if something goes wrong.
   Go to *APIs & Services → Routes API → Quotas*, set the per-day limit for
   **ComputeRoutes** requests to `320`, then set **Requests per day** on the
   Geocoding API to `320` too.
4. Under *Billing → Budgets & alerts*, add a budget of 1 (in your currency) with
   an email alert.

## 2. Deploy the Worker

Needs Node.js and a free Cloudflare account.

```bash
cd proxy
npx wrangler login
npx wrangler secret put GOOGLE_MAPS_KEY
npx wrangler deploy
```

Paste the server key when `secret put` asks for it. `deploy` prints the URL,
for example `https://beeline-proxy.<you>.workers.dev`.

## 3. Point the extension at it

In `../proxy.js`, set `PROXY_URL` to the Worker URL and `EMBED_API_KEY` to the
embed key.

When the Web Store listing exists, set `ALLOWED_ORIGINS` in `wrangler.toml` to
`chrome-extension://<store extension id>` and deploy again. This blocks casual
reuse of the service from websites. It isn't a real lock, because scripts can
fake the header.

## Limits

They are set in `wrangler.toml` under `[vars]` and reset at midnight UTC.

| | Per install | Per IP | Total |
|---|---|---|---|
| Route lookups | 100 | 150 | 300 |
| Location lookups | 5 | 15 | 300 |

Each candidate address on a job counts as one route lookup. The popup tries at
most 3 per job when it uses the shared service. Users who add their own key in
settings skip the proxy and the limits entirely.
