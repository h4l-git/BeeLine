// Recently viewed jobs and the jobs the user has saved, each with the route
// found for it, kept on this device only. Recent is newest first and drops
// its oldest job when full; saved jobs only go when the user removes them.
const HISTORY_KEY = "jobHistory";
const SAVED_KEY = "jobSaved";
const HISTORY_LIMIT = 50;
const SAVED_LIMIT = 50;

function readList(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => resolve(data[key] || []));
  });
}

function writeList(key, entries) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: entries }, resolve);
  });
}

function getHistory() {
  return readList(HISTORY_KEY);
}

function getSaved() {
  return readList(SAVED_KEY);
}

// Storage only keeps plain JSON, so the leg is cut down to what the route
// view draws (the live Date objects would be lost anyway).
function storableLeg(leg) {
  return {
    duration: leg.duration,
    distance: leg.distance,
    departure: leg.departure,
    arrival: leg.arrival,
    parts: leg.parts.map((p) =>
      p.mode === "TRANSIT"
        ? {
            mode: p.mode,
            vehicle: p.vehicle,
            line: p.line,
            headsign: p.headsign,
            from: p.from,
            to: p.to,
            stops: p.stops,
            duration: p.duration,
          }
        : { mode: p.mode, instructions: p.instructions, duration: p.duration }
    ),
  };
}

function historyId(job, jobPlace) {
  return job.url || `${job.title || ""}|${jobPlace}`;
}

// Adds the job to Recent (moving it to the top if it's already there). If
// it's also saved, the saved copy gets the fresh route but keeps its place.
async function saveToHistory({ job, origin, destination, jobPlace, label, leg }) {
  const id = historyId(job, jobPlace);
  const entry = {
    id,
    title: job.title || "Job posting",
    company: job.company || null,
    salary: job.salary || null,
    url: job.url || null,
    jobPlace,
    origin,
    destination,
    label,
    leg: storableLeg(leg),
    savedAt: Date.now(),
  };

  const recent = (await getHistory()).filter((e) => e.id !== id);
  recent.unshift(entry);
  await writeList(HISTORY_KEY, recent.slice(0, HISTORY_LIMIT));

  const saved = await getSaved();
  const index = saved.findIndex((e) => e.id === id);
  if (index !== -1) {
    saved[index] = entry;
    await writeList(SAVED_KEY, saved);
  }
  return entry;
}

async function isSaved(id) {
  return (await getSaved()).some((e) => e.id === id);
}

// Returns false when the saved list is already full.
async function saveJob(entry) {
  const saved = await getSaved();
  if (saved.some((e) => e.id === entry.id)) return true;
  if (saved.length >= SAVED_LIMIT) return false;
  saved.unshift(entry);
  await writeList(SAVED_KEY, saved);
  return true;
}

async function unsaveJob(id) {
  await writeList(SAVED_KEY, (await getSaved()).filter((e) => e.id !== id));
}

async function removeFromHistory(id) {
  await writeList(HISTORY_KEY, (await getHistory()).filter((e) => e.id !== id));
}

function clearHistory() {
  return writeList(HISTORY_KEY, []);
}

function clearSaved() {
  return writeList(SAVED_KEY, []);
}

// A brief message pinned to the bottom of the page.
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

const BOOKMARK_PATH = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>';

// A save/unsave toggle for a job. "compact" is the icon-only version used on
// list cards; otherwise it's a labelled pill button for route views.
function makeSaveButton(entry, { compact = false, onChange } = {}) {
  const btn = document.createElement("button");
  btn.className = compact ? "save-toggle" : "use-saved-link save-pill";
  let saved = false;

  function paint() {
    btn.classList.toggle("is-saved", saved);
    btn.title = saved ? "Remove from saved jobs" : "Save this job";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", String(saved));
    btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${BOOKMARK_PATH}</svg>`;
    if (!compact) btn.appendChild(document.createTextNode(saved ? "Saved" : "Save job"));
  }

  btn.addEventListener("click", async () => {
    if (saved) {
      await unsaveJob(entry.id);
      saved = false;
    } else if (await saveJob(entry)) {
      saved = true;
    } else {
      showToast(`Saved jobs are full (${SAVED_LIMIT}). Remove one to save another.`);
      return;
    }
    paint();
    if (onChange) onChange(saved);
  });

  paint();
  isSaved(entry.id).then((value) => {
    saved = value;
    paint();
  });
  return btn;
}
