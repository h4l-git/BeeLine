// BeeLine's Maps proxy. It holds the shared Google Maps key so users don't
// need one of their own, and caps usage per user, per IP and in total so the
// shared key never leaves Google's free monthly allowance.

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

// Only what the popup draws. Requesting no traffic or waypoint features keeps
// every call on the Compute Routes Essentials SKU.
const ROUTE_FIELDS = [
  "routes.legs.distanceMeters",
  "routes.legs.duration",
  "routes.legs.localizedValues",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.transitDetails",
  "routes.legs.stepsOverview",
].join(",");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "x-beeline-install",
  "access-control-max-age": "86400",
};

const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAT_LNG = /^-?\d{1,2}(\.\d{1,8})?,-?\d{1,3}(\.\d{1,8})?$/;
const MAX_PLACE_LENGTH = 300;

// Google gives 10,000 free requests a month per SKU. 300 a day stays under
// that even in a 31-day month (9,300). Each value can be overridden in
// wrangler.toml.
const DEFAULT_LIMITS = {
  routes: { global: 300, install: 100, ip: 150 },
  geocoding: { global: 300, install: 5, ip: 15 },
};

const LIMIT_MESSAGES = {
  install: (limit, noun) =>
    `You've used today's ${limit} free ${noun}. They reset at midnight UTC, or add your own Google Maps key in settings for unlimited use.`,
  ip: (limit, noun) =>
    `Your network has used today's ${limit} free ${noun}. They reset at midnight UTC, or add your own Google Maps key in settings for unlimited use.`,
  global: (limit, noun) =>
    `BeeLine's free ${noun} are used up for today. They reset at midnight UTC, or add your own Google Maps key in settings to keep going.`,
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...headers },
  });
}

function fail(status, error) {
  return json({ error }, status);
}

function isPlace(value) {
  return typeof value === "string" && value.trim() && value.length <= MAX_PLACE_LENGTH;
}

// Saved homes can be raw "lat,lng" coordinates, which the Routes API wants
// as a location rather than an address.
function waypoint(place) {
  const compact = place.replace(/\s+/g, "");
  if (LAT_LNG.test(compact)) {
    const [latitude, longitude] = compact.split(",").map(Number);
    return { location: { latLng: { latitude, longitude } } };
  }
  return { address: place };
}

// Each endpoint is a fixed request shape. The proxy never forwards arbitrary
// parameters, so the shared key can't be used for anything else.
const ENDPOINTS = {
  "/route": {
    sku: "routes",
    noun: "route lookups",
    params(query) {
      const origin = query.get("origin");
      const destination = query.get("destination");
      if (!isPlace(origin) || !isPlace(destination)) return null;
      return { origin, destination };
    },
    request: ({ origin, destination }, key) =>
      fetch(ROUTES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
          "x-goog-fieldmask": ROUTE_FIELDS,
        },
        body: JSON.stringify({
          origin: waypoint(origin),
          destination: waypoint(destination),
          travelMode: "TRANSIT",
        }),
      }),
    shape: (data) => ({ routes: data.routes || [] }),
  },
  "/geocode": {
    sku: "geocoding",
    noun: "location lookups",
    params(query) {
      const latlng = query.get("latlng");
      return LAT_LNG.test(latlng || "") ? { latlng } : null;
    },
    request: ({ latlng }, key) =>
      fetch(`${GEOCODE_URL}?${new URLSearchParams({ latlng, key }).toString()}`),
    shape: (data) => ({
      status: data.status,
      address: (data.results && data.results[0] && data.results[0].formatted_address) || null,
    }),
  },
};

function limitsFor(sku, env) {
  const prefix = sku.toUpperCase();
  const read = (name, fallback) => Number(env[`${prefix}_${name}`]) || fallback;
  const defaults = DEFAULT_LIMITS[sku];
  return {
    global: read("PER_DAY", defaults.global),
    install: read("PER_USER_PER_DAY", defaults.install),
    ip: read("PER_IP_PER_DAY", defaults.ip),
  };
}

// Only a hash of the IP is stored, and the counters are wiped every day.
async function hashIp(ip) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest).slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return fail(405, "Method not allowed.");

    const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (allowedOrigins.length && !allowedOrigins.includes(request.headers.get("origin"))) {
      return fail(403, "This service only answers the BeeLine extension.");
    }

    const url = new URL(request.url);
    const endpoint = ENDPOINTS[url.pathname];
    if (!endpoint) return fail(404, "Not found.");

    const installId = request.headers.get("x-beeline-install") || "";
    if (!INSTALL_ID.test(installId)) return fail(400, "Missing BeeLine install ID.");

    const params = endpoint.params(url.searchParams);
    if (!params) return fail(400, "Invalid lookup.");

    const limits = limitsFor(endpoint.sku, env);
    const limiter = env.LIMITER.get(env.LIMITER.idFromName("global"));
    const verdict = await (
      await limiter.fetch("https://limiter/reserve", {
        method: "POST",
        body: JSON.stringify({
          sku: endpoint.sku,
          installId: installId.toLowerCase(),
          ip: await hashIp(request.headers.get("cf-connecting-ip") || "unknown"),
          limits,
        }),
      })
    ).json();
    if (!verdict.ok) {
      return fail(429, LIMIT_MESSAGES[verdict.scope](limits[verdict.scope], endpoint.noun));
    }

    const res = await endpoint.request(params, env.GOOGLE_MAPS_KEY);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // ignore
    }
    if (!res.ok) {
      const detail = data && data.error && data.error.message;
      return fail(502, detail || `Google Maps request failed (HTTP ${res.status}).`);
    }

    return json(endpoint.shape(data || {}), 200, {
      "x-beeline-remaining": String(verdict.remaining),
    });
  },
};

// One instance counts every lookup for the day. A Durable Object handles one
// request at a time, so two lookups can't both take the last free slot.
export class Limiter {
  constructor(state) {
    this.storage = state.storage;
  }

  async fetch(request) {
    const { sku, installId, ip, limits } = await request.json();

    const today = new Date().toISOString().slice(0, 10);
    if ((await this.storage.get("day")) !== today) {
      await this.storage.deleteAll();
      await this.storage.put("day", today);
    }

    const keys = {
      install: `${sku}:install:${installId}`,
      ip: `${sku}:ip:${ip}`,
      global: `${sku}:global`,
    };
    const counts = await this.storage.get(Object.values(keys));
    const used = (scope) => counts.get(keys[scope]) || 0;

    // Checked in this order so a user over their own allowance is told that,
    // rather than a less specific message.
    for (const scope of ["install", "ip", "global"]) {
      if (used(scope) >= limits[scope]) return Response.json({ ok: false, scope });
    }

    await this.storage.put(
      Object.fromEntries(Object.keys(keys).map((scope) => [keys[scope], used(scope) + 1]))
    );
    return Response.json({ ok: true, remaining: limits.install - used("install") - 1 });
  }
}
