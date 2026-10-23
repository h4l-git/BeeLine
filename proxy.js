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
  if (!res.ok) {
    const err = new Error((data && data.error) || `BeeLine's route service failed (HTTP ${res.status})`);
    err.limited = res.status === 429;
    throw err;
  }
  return data;
}
