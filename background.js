importScripts("palettes.js");

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

async function openRouteToLocation(tab, { place, label, title, company, url }) {
  await chrome.storage.session.set({
    [pickKey(tab.id)]: { place, label, title, company, url: url || tab.url },
  });
  badgeFound(tab.id);
  try {
    await chrome.action.openPopup({ windowId: tab.windowId });
    return true;
  } catch (e) {
    // openPopup needs Chrome 127+ and a focused window. The badge and the
    // page's toast point the user at the toolbar icon instead.
    return false;
  }
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
