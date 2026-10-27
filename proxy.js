// BeeLine's shared Maps service (the Worker in proxy/). Used whenever the
// user hasn't added a Google Maps key of their own, so nobody needs one to
// get started.
const PROXY_URL = "https://beeline-proxy.rjlharrylees.workers.dev";

// Key for the map preview iframe. It ends up in the page, so it isn't
// secret: restrict it to the Maps Embed API only, which Google doesn't
// charge for. Leave empty to hide the map for users without their own key.
const EMBED_API_KEY = "AIzaSyAvTwmhmwABq-agjtP-B0eeVQbkCEPZkhg";

let installIdPromise = null;

// A random ID, kept on this device only, so the proxy can count each
// install's daily lookups without knowing who anyone is.
function getInstallId() {
  if (!installIdPromise) {
    installIdPromise = new Promise((resolve) => {
      chrome.storage.local.get(["installId"], ({ installId }) => {
        if (installId) return resolve(installId);
        const id = crypto.randomUUID();
        chrome.storage.local.set({ installId: id }, () => resolve(id));
      });
    });
  }
  return installIdPromise;
}

// Each install's daily allowance of shared route lookups. Matches
// ROUTES_PER_USER_PER_DAY in proxy/wrangler.toml; the proxy resets it at
// midnight UTC.
const FREE_ROUTE_LOOKUPS = 100;
const LOOKUPS_KEY = "routeLookups";

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

// Today's route lookups left on the shared service, as last seen here.
function getRemainingLookups() {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOOKUPS_KEY], (data) => {
      const saved = data[LOOKUPS_KEY];
      resolve(saved && saved.day === utcDay() ? saved.remaining : FREE_ROUTE_LOOKUPS);
    });
  });
}

// The proxy says how many are left with each answer. Where that header can't
// be read, count locally instead: the proxy counts every lookup that reaches
// it, including ones Google then fails (502), but not malformed ones. One at
// a time, since the popup looks up several candidates at once.
let lookupsWrite = Promise.resolve();
function noteRouteLookup(res, data) {
  lookupsWrite = lookupsWrite.then(async () => {
    const header = res.headers.get("x-beeline-remaining");
    let remaining;
    if (res.ok && header !== null && !Number.isNaN(Number(header))) {
      remaining = Number(header);
    } else if (res.ok || res.status === 502) {
      remaining = Math.max(0, (await getRemainingLookups()) - 1);
    } else if (res.status === 429 && data && /^You've used today's/.test(data.error || "")) {
      remaining = 0;
    } else {
      return;
    }
    await chrome.storage.local.set({ [LOOKUPS_KEY]: { day: utcDay(), remaining } });
  });
  return lookupsWrite.catch(() => {});
}

async function callProxy(path, params) {
  const res = await fetch(`${PROXY_URL}/${path}?${new URLSearchParams(params).toString()}`, {
    headers: { "x-beeline-install": await getInstallId() },
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // ignore
  }
  if (path === "route") noteRouteLookup(res, data);
  if (!res.ok) {
    const err = new Error((data && data.error) || `BeeLine's route service failed (HTTP ${res.status})`);
    err.limited = res.status === 429;
    throw err;
  }
  return data;
}
