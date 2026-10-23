const contentEl = document.getElementById("content");
const routeLabelEl = document.getElementById("routeLabel");
const sitePillEl = document.getElementById("sitePill");
const jobPillEl = document.getElementById("jobPill");
const jobPillTextEl = document.getElementById("jobPillText");

let reversed = false;
let useSavedInstead = false;

function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] && tabs[0].id);
    });
  });
}

function getJobForTab(tabId) {
  return new Promise((resolve) => {
    if (tabId === undefined) return resolve(null);
    const key = `job_${tabId}`;
    chrome.storage.session.get([key], (data) => resolve(data[key] || null));
  });
}

// A location the user clicked on the page (see location-highlighter.js).
function getPickForTab(tabId) {
  return new Promise((resolve) => {
    if (tabId === undefined) return resolve(null);
    const key = `pick_${tabId}`;
    chrome.storage.session.get([key], (data) => resolve(data[key] || null));
  });
}

// Routes to the clicked location, keeping the job's title and link so the
// history entry still says which job it was for.
function jobFromPick(pick, job) {
  return {
    status: "resolved",
    addresses: [pick.place],
    title: (job && job.title) || pick.title || "Job posting",
    company: (job && job.company) || pick.company || null,
    url: (job && job.url) || pick.url || null,
    pickLabel: pick.label,
  };
}

// Turns a job URL into its site name, e.g. "https://uk.indeed.com/viewjob" → "indeed.com".
function siteName(url) {
  try {
    const parts = new URL(url).hostname.split(".");
    // Keep three parts for domains like "reed.co.uk".
    const keep = parts.length > 2 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]) ? 3 : 2;
    return parts.slice(-keep).join(".");
  } catch {
    return null;
  }
}

function showSitePill(job) {
  const name = job && job.url ? siteName(job.url) : null;
  sitePillEl.hidden = !name;
  sitePillEl.textContent = name || "";
}

// Keeps a long street address from stretching the route pill.
function shortLabel(text, max = 26) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function askAiForLocation(aiApiKey, jobText) {
  const prompt = `You are extracting workplace location(s) from a job advertisement. Read the job posting text below and identify the physical work location(s) mentioned — a full street address where given, otherwise the most specific city/area mentioned. Some postings list more than one possible location (e.g. "based in London, Manchester, or remote from our Bristol office") — list every distinct one mentioned. If no location is mentioned anywhere, say so. Also give the job's title and the name of the hiring company, as written in the posting.

Respond with ONLY a JSON object and nothing else, in this exact shape:
{"addresses": ["<location string>", ...] or [], "title": "<job title>" or null, "company": "<company name>" or null, "confidence": "high" | "medium" | "low"}

Job posting text:
"""
${jobText}
"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": aiApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errJson = await res.json();
      detail = errJson.error && errJson.error.message;
    } catch (e) {
      // ignore
    }
    throw new Error(detail || `AI request failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  const raw = data.content && data.content[0] && data.content[0].text;
  if (!raw) throw new Error("AI returned no content");

  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Couldn't parse the AI's response");
  }
}

function setState({ spinner, icon, title, description, action }, variant) {
  contentEl.innerHTML = "";
  const state = document.createElement("div");
  state.className = "state" + (variant ? ` ${variant}` : "");

  if (spinner) {
    const spinnerEl = document.createElement("div");
    spinnerEl.className = "spinner";
    state.appendChild(spinnerEl);
  } else if (icon) {
    const iconEl = document.createElement("div");
    iconEl.className = "state-icon";
    iconEl.innerHTML = svgIcon(icon);
    state.appendChild(iconEl);
  }
  if (title) {
    const strong = document.createElement("strong");
    strong.textContent = title;
    state.appendChild(strong);
  }
  if (description) {
    const p = document.createElement("p");
    p.textContent = description;
    state.appendChild(p);
  }
  if (action) {
    const btn = document.createElement("button");
    btn.className = action.className || "btn";
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    state.appendChild(btn);
  }

  contentEl.appendChild(state);
}

function setLoading(message) {
  setState({ spinner: true, description: message || "Finding your route…" });
}

function openOptions() {
  window.location.href = "options.html";
}

const WEBSITE_URL = "https://h4l-git.github.io/BeeLine/";

document.getElementById("website").addEventListener("click", () => {
  chrome.tabs.create({ url: WEBSITE_URL });
});

// Opens this extension's own Web Store reviews page; the installed ID matches the listing.
document.getElementById("rate").addEventListener("click", () => {
  chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
});
document.getElementById("settings").addEventListener("click", openOptions);
document.getElementById("history").addEventListener("click", () => {
  window.location.href = "history.html";
});
document.getElementById("refresh").addEventListener("click", () => load());
document.getElementById("swap").addEventListener("click", () => {
  reversed = !reversed;
  load();
});

// Same request the proxy makes (proxy/worker.js), for users with their own
// key. Only what we draw is requested, which keeps calls on the Compute
// Routes Essentials SKU.
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

// Saved homes can be raw "lat,lng" coordinates, which the Routes API wants
// as a location rather than an address.
function waypoint(place) {
  const compact = place.replace(/\s+/g, "");
  if (/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(compact)) {
    const [latitude, longitude] = compact.split(",").map(Number);
    return { location: { latLng: { latitude, longitude } } };
  }
  return { address: place };
}

async function fetchRoutesApi(apiKey, origin, destination) {
  // Without a key of their own, lookups go through BeeLine's proxy, which
  // adds the shared key on the server and enforces the daily limits.
  if (!apiKey) return callProxy("route", { origin, destination });

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": ROUTE_FIELDS,
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: "TRANSIT",
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // ignore
  }
  if (!res.ok) {
    throw new Error(
      (data && data.error && data.error.message) || `Routes request failed (HTTP ${res.status})`
    );
  }
  return data || {};
}

// Routes API durations are strings like "754s".
function seconds(duration) {
  return parseFloat(duration) || 0;
}

function formatDuration(totalSeconds) {
  const mins = Math.max(1, Math.round(totalSeconds / 60));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${rest ? ` ${rest} min${rest === 1 ? "" : "s"}` : ""}`;
}

function formatClock(date, timeZone) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  } catch (e) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
}

// The Routes API splits each walk into turn-by-turn steps. Its
// multi-modal segments group those back into one "walk" or "ride" each,
// which is what the popup lists.
function toLeg(apiLeg) {
  const steps = apiLeg.steps || [];
  const segments =
    (apiLeg.stepsOverview && apiLeg.stepsOverview.multiModalSegments) ||
    steps.map((step, i) => ({ travelMode: step.travelMode, stepStartIndex: i, stepEndIndex: i }));

  const parts = segments.map((segment) => {
    // Zero-valued indexes are left out of the JSON.
    const start = segment.stepStartIndex || 0;
    const end = segment.stepEndIndex === undefined ? start : segment.stepEndIndex;
    const group = steps.slice(start, end + 1);
    const secs = group.reduce((sum, step) => sum + seconds(step.staticDuration), 0);
    const ride = group.find((step) => step.transitDetails);

    if (segment.travelMode === "TRANSIT" && ride) {
      const td = ride.transitDetails;
      const line = td.transitLine || {};
      const stops = td.stopDetails || {};
      const times = td.localizedValues || {};
      return {
        mode: "TRANSIT",
        vehicle: (line.vehicle && line.vehicle.type) || "BUS",
        line: line.nameShort || line.name || "Transit",
        headsign: td.headsign || "",
        from: (stops.departureStop && stops.departureStop.name) || "",
        to: (stops.arrivalStop && stops.arrivalStop.name) || "",
        stops: td.stopCount || 0,
        departsAt: stops.departureTime ? new Date(stops.departureTime) : null,
        arrivesAt: stops.arrivalTime ? new Date(stops.arrivalTime) : null,
        departZone: times.departureTime && times.departureTime.timeZone,
        arriveZone: times.arrivalTime && times.arrivalTime.timeZone,
        secs,
        duration: formatDuration(secs),
      };
    }
    return {
      mode: "WALK",
      instructions: (segment.navigationInstruction && segment.navigationInstruction.instructions) || "",
      secs,
      duration: formatDuration(secs),
    };
  });

  // Departure and arrival include the walks either side of the rides.
  const rides = parts.filter((part) => part.mode === "TRANSIT");
  const first = rides[0];
  const last = rides[rides.length - 1];
  let departure = null;
  let arrival = null;
  if (first && first.departsAt && last.arrivesAt) {
    const walkBefore = parts.slice(0, parts.indexOf(first)).reduce((sum, p) => sum + p.secs, 0);
    const walkAfter = parts.slice(parts.indexOf(last) + 1).reduce((sum, p) => sum + p.secs, 0);
    departure = formatClock(new Date(first.departsAt - walkBefore * 1000), first.departZone);
    arrival = formatClock(new Date(last.arrivesAt.getTime() + walkAfter * 1000), last.arriveZone);
  }

  const text = apiLeg.localizedValues || {};
  const distanceMeters = apiLeg.distanceMeters || 0;
  return {
    duration: (text.duration && text.duration.text) || formatDuration(seconds(apiLeg.duration)),
    distance: (text.distance && text.distance.text) || `${(distanceMeters / 1000).toFixed(1)} km`,
    distanceMeters,
    departure,
    arrival,
    parts,
  };
}

async function fetchRoute(apiKey, origin, destination) {
  const data = await fetchRoutesApi(apiKey, origin, destination);
  const route = data.routes && data.routes[0];
  if (!route || !route.legs || !route.legs.length) {
    throw new Error("No transit route found between these places.");
  }
  return toLeg(route.legs[0]);
}

function swapForDirection(reversed, home, other) {
  return reversed ? [other, home] : [home, other];
}

// A job can list several candidate work locations. Route to each from home
// and keep whichever comes back with the shortest travel distance, so we
// only ever end up rendering one final route. Each candidate costs a lookup,
// so on the shared service only the first few are tried.
const MAX_SHARED_CANDIDATES = 3;

async function resolveClosestRoute(apiKey, home, addresses, reversed) {
  const candidates = apiKey ? addresses : addresses.slice(0, MAX_SHARED_CANDIDATES);
  const attempts = await Promise.all(
    candidates.map(async (addr) => {
      const [origin, destination] = swapForDirection(reversed, home, addr);
      try {
        const result = await fetchRoute(apiKey, origin, destination);
        return { result, origin, destination, distance: result.distanceMeters };
      } catch (e) {
        return { error: e };
      }
    })
  );

  const valid = attempts.filter((a) => !a.error);
  if (!valid.length) {
    // With just one candidate, or when the daily limit is what stopped
    // them, surface the actual error instead of the generic message.
    throw candidates.length === 1 || attempts.some((a) => a.error.limited)
      ? attempts.find((a) => a.error.limited) || attempts[0].error
      : new Error("Couldn't find a route to any of the listed locations.");
  }
  valid.sort((a, b) => a.distance - b.distance);
  return valid[0];
}

function render(leg, origin, destination, jobActive, apiKey) {
  contentEl.innerHTML = "";
  renderRoute(contentEl, leg, origin, destination, apiKey);

  if (!jobActive) return null;

  // The save-job button joins this row once the route is in history.
  const actions = document.createElement("div");
  actions.className = "route-actions";
  const useSaved = document.createElement("button");
  useSaved.className = "use-saved-link";
  useSaved.textContent = "Use my saved work address instead";
  useSaved.addEventListener("click", () => {
    useSavedInstead = true;
    load();
  });
  actions.appendChild(useSaved);
  contentEl.appendChild(actions);
  return actions;
}

async function runAi(tabId, job, aiApiKey) {
  setLoading("Asking AI to read the job description…");
  try {
    const result = await askAiForLocation(aiApiKey, job.text);
    const addresses = (result && result.addresses) || [];
    if (!addresses.length) {
      setState({
        icon: "searchX",
        title: "AI couldn't find a location either",
        description: "This posting doesn't seem to mention a specific workplace location.",
      });
      return;
    }
    chrome.storage.session.set(
      {
        [`job_${tabId}`]: {
          status: "resolved",
          addresses,
          // The job card's name (read on the page) beats the AI's reading.
          title: job.title || result.title || "Job posting",
          company: job.company || result.company || null,
          url: job.url,
        },
      },
      () => load()
    );
  } catch (err) {
    setState({ icon: "alert", title: "AI lookup failed", description: err.message }, "error");
  }
}

function getSyncSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey", "home", "work", "aiApiKey"], resolve);
  });
}

async function load() {
  jobPillEl.hidden = true;
  sitePillEl.hidden = true;

  const [data, tabId] = await Promise.all([getSyncSettings(), getActiveTabId()]);

  if (!data.home) {
    routeLabelEl.textContent = "Set up required";
    setState({
      icon: "home",
      title: "Set up your commute",
      description: "Add your home and work address to get started.",
      action: { label: "Open settings", onClick: openOptions },
    });
    return;
  }

  const [detectedJob, pick] = useSavedInstead
    ? [null, null]
    : await Promise.all([getJobForTab(tabId), getPickForTab(tabId)]);
  const job = pick ? jobFromPick(pick, detectedJob) : detectedJob;

  if (job && job.addresses && job.addresses.length) {
    const place = job.pickLabel ? shortLabel(job.pickLabel) : "Job";
    routeLabelEl.textContent = reversed ? `${place} → Home` : `Home → ${place}`;
    jobPillEl.hidden = false;
    jobPillTextEl.textContent = job.company ? `${job.title} at ${job.company}` : job.title;

    setLoading();
    try {
      const { result, origin, destination } = await resolveClosestRoute(
        data.apiKey,
        data.home,
        job.addresses,
        reversed
      );
      const actions = render(result, origin, destination, true, data.apiKey);
      saveToHistory({
        job,
        origin,
        destination,
        jobPlace: reversed ? origin : destination,
        label: routeLabelEl.textContent,
        leg: result,
      })
        .then((entry) => {
          // Skip if the view changed (swap, refresh) while saving.
          if (actions.isConnected) actions.prepend(makeSaveButton(entry));
        })
        .catch(() => {
          // History is a convenience; never let it break the route view.
        });
    } catch (err) {
      setState({ icon: "alert", title: "Couldn't load route", description: err.message }, "error");
    }
    return;
  }

  if (job && job.status === "unresolved") {
    routeLabelEl.textContent = "Job detected";
    showSitePill(job);
    jobPillEl.hidden = false;
    jobPillTextEl.textContent = job.title || "Job posting";

    const description = data.aiApiKey
      ? "Want AI to read the job description and look for a location? This makes a small billed API call."
      : "Add an Anthropic API key in settings to let AI read the job description instead.";
    const action = data.aiApiKey
      ? { label: "Use AI", className: "btn btn-outline", onClick: () => runAi(tabId, job, data.aiApiKey) }
      : { label: "Open settings", onClick: openOptions };

    setState({ icon: "sparkles", title: "No address found automatically", description, action });
    return;
  }

  if (!data.work) {
    routeLabelEl.textContent = "Ready when you are";
    setState({
      icon: "briefcase",
      title: "Nothing to route to yet",
      description:
        "Visit a job listing to see its commute, or add a work address in settings to check your regular commute anytime.",
      action: { label: "Open settings", onClick: openOptions },
    });
    return;
  }

  const [origin, destination] = swapForDirection(reversed, data.home, data.work);
  routeLabelEl.textContent = reversed ? "Work → Home" : "Home → Work";

  setLoading();
  try {
    const result = await fetchRoute(data.apiKey, origin, destination);
    render(result, origin, destination, false, data.apiKey);
  } catch (err) {
    setState({ icon: "alert", title: "Couldn't load route", description: err.message }, "error");
  }
}

load();
