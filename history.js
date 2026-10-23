const contentEl = document.getElementById("content");
const routeLabelEl = document.getElementById("routeLabel");
const jobPillEl = document.getElementById("jobPill");
const jobPillTextEl = document.getElementById("jobPillText");
const backEl = document.getElementById("back");

const WEBSITE_URL = "https://h4l-git.github.io/BeeLine/";
const TAB_KEY = "historyTab";

const SECTIONS = {
  recent: {
    label: "Recent",
    load: getHistory,
    limit: HISTORY_LIMIT,
    clear: clearHistory,
    clearLabel: "Clear recent",
    emptyIcon: "clock",
    emptyTitle: "No jobs yet",
    emptyText: "Open BeeLine on a job listing and its route will be saved here.",
  },
  saved: {
    label: "Saved",
    load: getSaved,
    limit: SAVED_LIMIT,
    clear: clearSaved,
    clearLabel: "Clear saved",
    emptyIcon: "bookmark",
    emptyTitle: "No saved jobs yet",
    emptyText: "Tap the bookmark on a job to keep it here. Saved jobs stay until you remove them.",
  },
};

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY) === "saved" ? "saved" : "recent";
  } catch (e) {
    return "recent";
  }
}

let currentTab = readTab();
// The header back key steps out of a route to the list, then back to the popup.
let showingRoute = false;

backEl.addEventListener("click", () => {
  if (showingRoute) {
    showList();
  } else {
    window.location.href = "popup.html";
  }
});

document.getElementById("website").addEventListener("click", () => {
  chrome.tabs.create({ url: WEBSITE_URL });
});

// Opens this extension's own Web Store reviews page; the installed ID matches the listing.
document.getElementById("rate").addEventListener("click", () => {
  chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
});

function timeAgo(timestamp) {
  const mins = Math.round((Date.now() - timestamp) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(timestamp);
}

function checkedAt(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function jobName(entry) {
  return entry.company ? `${entry.title} at ${entry.company}` : entry.title;
}

// "View advert on linkedin.com", opening the job listing in a new tab.
function advertLink(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return null;
  }
  const link = document.createElement("a");
  link.className = "history-advert";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.title = url;
  link.innerHTML = svgIcon("external");
  link.appendChild(document.createTextNode(`View advert on ${host}`));
  return link;
}

function renderTabs(counts) {
  const tabs = document.createElement("div");
  tabs.className = "section-tabs";
  tabs.setAttribute("role", "tablist");
  Object.entries(SECTIONS).forEach(([key, section]) => {
    const tab = document.createElement("button");
    tab.className = "section-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(key === currentTab));
    tab.innerHTML = svgIcon(section.emptyIcon);
    tab.appendChild(document.createTextNode(section.label));
    const count = document.createElement("span");
    count.className = "section-count";
    count.textContent = counts[key];
    tab.appendChild(count);
    tab.addEventListener("click", () => {
      if (key === currentTab) return;
      currentTab = key;
      try {
        localStorage.setItem(TAB_KEY, key);
      } catch (e) {
        // Not remembered; fine.
      }
      showList();
    });
    tabs.appendChild(tab);
  });
  return tabs;
}

function renderEmpty(section) {
  const state = document.createElement("div");
  state.className = "state";
  state.innerHTML = `
    <div class="state-icon">${svgIcon(section.emptyIcon)}</div>
    <strong></strong>
    <p></p>`;
  state.querySelector("strong").textContent = section.emptyTitle;
  state.querySelector("p").textContent = section.emptyText;
  return state;
}

function renderItem(entry) {
  const item = document.createElement("div");
  item.className = "history-item";

  const top = document.createElement("div");
  top.className = "history-top";

  const text = document.createElement("div");
  text.className = "history-text";
  const title = document.createElement("div");
  title.className = "history-title";
  title.textContent = entry.title;
  title.title = entry.title;
  text.appendChild(title);
  if (entry.company) {
    const company = document.createElement("div");
    company.className = "history-company";
    company.textContent = entry.company;
    text.appendChild(company);
  }
  const place = document.createElement("div");
  place.className = "history-place";
  place.innerHTML = svgIcon("pin");
  place.appendChild(document.createTextNode(entry.jobPlace));
  place.title = entry.jobPlace;
  text.appendChild(place);
  const advert = advertLink(entry.url);
  if (advert) text.appendChild(advert);

  const tools = document.createElement("div");
  tools.className = "history-tools";
  // In Saved, un-saving takes the card off the list; refresh to show that
  // (and keep the tab counts right) either way.
  tools.appendChild(makeSaveButton(entry, { compact: true, onChange: () => showList() }));
  if (currentTab === "recent") {
    const remove = document.createElement("button");
    remove.className = "history-remove";
    remove.title = "Remove from recent";
    remove.setAttribute("aria-label", "Remove from recent");
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      await removeFromHistory(entry.id);
      showList();
    });
    tools.appendChild(remove);
  }

  top.appendChild(text);
  top.appendChild(tools);

  const bottom = document.createElement("div");
  bottom.className = "history-bottom";
  const stats = document.createElement("div");
  stats.className = "history-stats";
  stats.innerHTML = svgIcon("clock");
  const duration = document.createElement("strong");
  duration.textContent = entry.leg.duration;
  stats.appendChild(duration);
  const ago = document.createElement("span");
  ago.className = "history-ago";
  ago.textContent = `· ${timeAgo(entry.savedAt)}`;
  stats.appendChild(ago);

  const show = document.createElement("button");
  show.className = "btn btn-small";
  show.innerHTML = svgIcon("route");
  show.appendChild(document.createTextNode("Show route"));
  show.addEventListener("click", () => showRoute(entry));

  bottom.appendChild(stats);
  bottom.appendChild(show);

  item.appendChild(top);
  item.appendChild(bottom);
  return item;
}

function renderClearButton(section) {
  const clear = document.createElement("button");
  clear.className = "use-saved-link";
  clear.textContent = section.clearLabel;
  // Popups can't show confirm() dialogs, so the button asks for a second click.
  let armed = false;
  clear.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      clear.textContent = "Click again to clear all";
      setTimeout(() => {
        armed = false;
        clear.textContent = section.clearLabel;
      }, 3000);
      return;
    }
    await section.clear();
    showList();
  });
  return clear;
}

async function showList() {
  showingRoute = false;
  routeLabelEl.textContent = "Your jobs";
  jobPillEl.hidden = true;
  backEl.title = "Back";

  const [recent, saved] = await Promise.all([getHistory(), getSaved()]);
  const lists = { recent, saved };
  const section = SECTIONS[currentTab];
  const entries = lists[currentTab];

  const scroll = contentEl.scrollTop;
  contentEl.innerHTML = "";
  contentEl.appendChild(renderTabs({ recent: recent.length, saved: saved.length }));

  if (!entries.length) {
    contentEl.appendChild(renderEmpty(section));
    return;
  }

  const intro = document.createElement("p");
  intro.className = "history-intro";
  intro.textContent =
    currentTab === "recent"
      ? `Last ${entries.length} of up to ${section.limit} jobs viewed`
      : `${entries.length} of ${section.limit} saved`;
  contentEl.appendChild(intro);

  const list = document.createElement("div");
  list.className = "history-list";
  entries.forEach((entry) => list.appendChild(renderItem(entry)));
  contentEl.appendChild(list);
  contentEl.appendChild(renderClearButton(section));
  contentEl.scrollTop = scroll;
}

async function showRoute(entry) {
  showingRoute = true;
  routeLabelEl.textContent = entry.label || "Home → Job";
  jobPillEl.hidden = false;
  jobPillTextEl.textContent = jobName(entry);
  backEl.title = `Back to ${SECTIONS[currentTab].label.toLowerCase()} jobs`;

  const { apiKey } = await new Promise((resolve) => chrome.storage.sync.get(["apiKey"], resolve));

  contentEl.innerHTML = "";
  contentEl.scrollTop = 0;
  // Saved departure times are long gone, so say when the route was checked instead.
  renderRoute(
    contentEl,
    entry.leg,
    entry.origin,
    entry.destination,
    apiKey,
    `${entry.leg.distance} · Checked ${checkedAt(entry.savedAt)}`
  );

  const actions = document.createElement("div");
  actions.className = "route-actions";
  actions.appendChild(makeSaveButton(entry));
  if (entry.url) {
    const posting = document.createElement("a");
    posting.className = "use-saved-link";
    posting.href = entry.url;
    posting.target = "_blank";
    posting.textContent = "Open job listing";
    actions.appendChild(posting);
  }
  contentEl.appendChild(actions);
}

showList();
