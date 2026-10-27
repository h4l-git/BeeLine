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

function jobName(entry) {
  return entry.company ? `${entry.title} at ${entry.company}` : entry.title;
}

// The job title, linking to its advert in a new tab when there is one.
function titleElement(entry) {
  let url = null;
  try {
    if (entry.url && /^https?:$/.test(new URL(entry.url).protocol)) url = entry.url;
  } catch (e) {
    // No usable link; show plain text.
  }
  const title = document.createElement(url ? "a" : "div");
  title.className = "history-title";
  title.textContent = entry.title;
  if (url) {
    title.href = url;
    title.target = "_blank";
    title.rel = "noopener";
    title.title = `${entry.title} — open the job advert`;
  } else {
    title.title = entry.title;
  }
  return title;
}

// Hourly pay reads "£12.50/hour" however the advert worded it
// ("an hour", "per hour", "/hr", "ph", "hourly").
const HOURLY_PATTERN = /\s*(?:(?:\/\s*|per\s+|an?\s+)(?:hour|hr)s?|p\/?h|hourly)\b/gi;

function formatSalary(salary) {
  return salary.replace(HOURLY_PATTERN, "/hour");
}

// The pay the advert listed, if BeeLine found one.
function salaryElement(salary) {
  if (!salary) return null;
  salary = formatSalary(salary);
  const el = document.createElement("div");
  el.className = "history-salary";
  el.innerHTML = svgIcon("banknote");
  el.appendChild(document.createTextNode(salary));
  el.title = salary;
  return el;
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
  text.appendChild(titleElement(entry));
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
  const salary = salaryElement(entry.salary);
  if (salary) text.appendChild(salary);

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
