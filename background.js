importScripts("palettes.js");

// BeeLine lives in Chrome's side panel rather than a popup, so it stays open
// while the user clicks around the page. The toolbar icon opens and closes it.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// The badge colour follows the colour theme picked in settings. It's set once
// for every tab, so badgeFound only has to set the text.
function applyBadgeColour(paletteId) {
  chrome.action.setBadgeBackgroundColor({ color: findBeelinePalette(paletteId).accent });
}

chrome.storage.sync.get(["palette"], (data) => applyBadgeColour(data.palette));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.palette) applyBadgeColour(changes.palette.newValue);
});

function jobKey(tabId) {
  return `job_${tabId}`;
}

function badgeFound(tabId) {
  chrome.action.setBadgeText({ tabId, text: "\u{1F4CD}" });
  chrome.action.setTitle({
    tabId,
    title: "Job location detected — click to see your commute",
  });
}

// A location the user clicked on the page. It takes priority over the job's
// detected location until the tab navigates or a different job is detected.
function pickKey(tabId) {
  return `pick_${tabId}`;
}

function openRouteToLocation(tab, { place, label, title, company, url, source }) {
  // Chrome only lets the panel open straight from the user's click, so open
  // it before anything is awaited. The panel picks up the location from
  // storage as soon as it's saved.
  const opened = chrome.sidePanel.open({ windowId: tab.windowId }).then(
    () => true,
    // The badge and the page's toast point the user at the toolbar icon instead.
    () => false
  );
  const saved = chrome.storage.session.set({
    [pickKey(tab.id)]: { place, label, title, company, url: url || tab.url, source: source || "highlight" },
  });
  badgeFound(tab.id);
  return Promise.all([opened, saved]).then(([ok]) => ok);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;
  const tabId = sender.tab.id;

  if (message.type === "LOCATION_CLICKED") {
    openRouteToLocation(sender.tab, message).then((opened) => sendResponse({ opened }));
    return true; // keep the channel open for the async reply
  }

  if (message.type === "JOB_DETECTED" || message.type === "JOB_TEXT_ONLY") {
    chrome.storage.session.remove(pickKey(tabId));
  }

  if (message.type === "JOB_DETECTED") {
    chrome.storage.session.set({
      [jobKey(tabId)]: {
        status: "resolved",
        addresses: message.addresses,
        title: message.title,
        company: message.company,
        salary: message.salary || null,
        url: message.url || sender.url,
      },
    });
    badgeFound(tabId);
  } else if (message.type === "JOB_TEXT_ONLY") {
    chrome.storage.session.set({
      [jobKey(tabId)]: {
        status: "unresolved",
        text: message.text,
        title: message.title,
        company: message.company || null,
        salary: message.salary || null,
        url: message.url || sender.url,
      },
    });
    badgeFound(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove([jobKey(tabId), pickKey(tabId)]);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  chrome.storage.session.remove([jobKey(tabId), pickKey(tabId)]);
  chrome.action.setBadgeText({ tabId, text: "" });
  chrome.action.setTitle({ tabId, title: "" });
});

// ---------------------------------------------------------------------------
// Route to highlighted text (selection-router.js)
// ---------------------------------------------------------------------------

// Works on any site, so it needs access to every site. That access is
// optional: settings asks for it when the user turns this on, and gives it
// back when they turn it off.
const SELECTION_ORIGINS = ["https://*/*", "http://*/*"];
const SELECTION_SCRIPT_ID = "beeline-selection";
const SELECTION_FILES = ["palettes.js", "selection-router.js"];

// Tabs opened before the setting was turned on don't have the script yet.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: SELECTION_ORIGINS });
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: SELECTION_FILES }).catch(() => {
        // Some pages (the Web Store, error pages) can't be scripted.
      })
    )
  );
}

async function syncSelectionScript() {
  const { routeSelection } = await chrome.storage.sync.get(["routeSelection"]);
  const allowed = await chrome.permissions.contains({ origins: SELECTION_ORIGINS });
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SELECTION_SCRIPT_ID] });

  if (routeSelection === true && !allowed) {
    // Site access was removed from Chrome's extension page: switch it off.
    await chrome.storage.sync.set({ routeSelection: false });
  }
  const want = routeSelection === true && allowed;

  if (want && !registered.length) {
    await chrome.scripting.registerContentScripts([
      { id: SELECTION_SCRIPT_ID, js: SELECTION_FILES, matches: SELECTION_ORIGINS, runAt: "document_idle" },
    ]);
    await injectIntoOpenTabs();
  } else if (!want && registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [SELECTION_SCRIPT_ID] });
  }
}

// One at a time, so two quick toggles can't both try to register.
let selectionSync = Promise.resolve();
function queueSelectionSync() {
  selectionSync = selectionSync.then(syncSelectionScript).catch(() => {});
}

chrome.runtime.onInstalled.addListener(queueSelectionSync);
chrome.runtime.onStartup.addListener(queueSelectionSync);
chrome.permissions.onAdded.addListener(queueSelectionSync);
chrome.permissions.onRemoved.addListener(queueSelectionSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.routeSelection) queueSelectionSync();
});
