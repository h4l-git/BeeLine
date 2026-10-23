// Draws a route (summary card, map, steps and Maps link). Shared by the
// popup and the history page so a saved route looks just like a live one.

// Lucide-style line icons (24px grid), drawn with the .icon stroke styles.
const ICON_PATHS = {
  walk: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4M4 13h4"/>',
  bus: '<path d="M8 6v6M16 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  train: '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1M9 15l-1-1M15 15l1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3M16 19l2 3"/>',
  tram: '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M18 22l-2-3M8 15h.01M16 15h.01"/>',
  ferry: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6M12 10v4M12 2v3"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
  searchX: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M13.5 8.5l-5 5M8.5 8.5l5 5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  external: '<path d="M7 7h10v10M7 17 17 7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

function svgIcon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const VEHICLE_ICONS = {
  BUS: "bus",
  SUBWAY: "train",
  METRO_RAIL: "train",
  HEAVY_RAIL: "train",
  COMMUTER_TRAIN: "train",
  HIGH_SPEED_TRAIN: "train",
  RAIL: "train",
  LONG_DISTANCE_TRAIN: "train",
  MONORAIL: "train",
  TRAM: "tram",
  FERRY: "ferry",
  CABLE_CAR: "tram",
  GONDOLA_LIFT: "tram",
  FUNICULAR: "tram",
  WALK: "walk",
};

const VEHICLE_COLORS = {
  BUS: "#f59e0b",
  SUBWAY: "#2563eb",
  METRO_RAIL: "#2563eb",
  HEAVY_RAIL: "#7c3aed",
  COMMUTER_TRAIN: "#7c3aed",
  HIGH_SPEED_TRAIN: "#7c3aed",
  RAIL: "#7c3aed",
  LONG_DISTANCE_TRAIN: "#7c3aed",
  MONORAIL: "#2563eb",
  TRAM: "#16a34a",
  FERRY: "#0891b2",
  CABLE_CAR: "#db2777",
  GONDOLA_LIFT: "#db2777",
  FUNICULAR: "#db2777",
  WALK: "#64748b",
};

function directionsUrl(origin, destination) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function embedMapUrl(apiKey, origin, destination) {
  const params = new URLSearchParams({
    key: apiKey,
    origin,
    destination,
    mode: "transit",
  });
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

function renderStep(step) {
  const isTransit = step.mode === "TRANSIT";
  const wrap = document.createElement("div");
  wrap.className = "step";

  const icon = document.createElement("div");
  icon.className = "step-icon";
  const body = document.createElement("div");
  body.className = "step-body";

  const vehicleType = isTransit ? step.vehicle : "WALK";
  icon.innerHTML = svgIcon(VEHICLE_ICONS[vehicleType] || "bus");
  icon.style.background = VEHICLE_COLORS[vehicleType] || "#64748b";

  const strong = document.createElement("strong");
  const meta = document.createElement("div");
  meta.className = "step-meta";
  if (isTransit) {
    strong.textContent = `${step.line}${step.headsign ? " → " + step.headsign : ""}`;
    meta.textContent = `${step.from} → ${step.to} · ${step.duration} (${step.stops} stop${step.stops === 1 ? "" : "s"})`;
  } else {
    strong.textContent = "Walk";
    meta.textContent = step.instructions ? `${step.instructions} · ${step.duration}` : step.duration;
  }
  body.appendChild(strong);
  body.appendChild(meta);

  wrap.appendChild(icon);
  wrap.appendChild(body);
  return wrap;
}

// summaryMeta overrides the line under the journey time (the history page
// uses it to say when the route was checked, since its times are old).
function renderRoute(container, leg, origin, destination, apiKey, summaryMeta) {
  const summaryCard = document.createElement("div");
  summaryCard.className = "summary-card";

  const time = document.createElement("div");
  time.className = "summary-time";
  time.textContent = leg.duration;

  const meta = document.createElement("div");
  meta.className = "summary-meta";
  meta.textContent =
    summaryMeta ||
    (leg.departure && leg.arrival ? `Depart ${leg.departure} · Arrive ${leg.arrival}` : leg.distance);

  summaryCard.appendChild(time);
  summaryCard.appendChild(meta);
  container.appendChild(summaryCard);

  const embedKey = apiKey || EMBED_API_KEY;
  if (embedKey) {
    const mapWrap = document.createElement("div");
    mapWrap.className = "map-frame";
    const iframe = document.createElement("iframe");
    iframe.src = embedMapUrl(embedKey, origin, destination);
    iframe.width = "100%";
    iframe.height = "170";
    iframe.style.border = "0";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    mapWrap.appendChild(iframe);
    container.appendChild(mapWrap);
  }

  const steps = document.createElement("div");
  steps.className = "steps";
  leg.parts.forEach((step) => steps.appendChild(renderStep(step)));
  container.appendChild(steps);

  const link = document.createElement("a");
  link.className = "link-out";
  link.href = directionsUrl(origin, destination);
  link.target = "_blank";
  link.textContent = "Open full route in Google Maps";
  link.insertAdjacentHTML("beforeend", svgIcon("external"));
  container.appendChild(link);
}
