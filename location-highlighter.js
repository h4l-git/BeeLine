// Highlights locations on job pages: UK postcodes, street addresses, UK
// towns and cities, US "City, ST" places, and wherever the job itself says it
// is. Clicking one opens the BeeLine panel with the route to it.
//
// Runs after job-detector.js and shares its scope: isJobPage() and
// currentJob come from there, and it calls onJobPageDetected() below.

// ---------------------------------------------------------------------------
// What counts as a location
// ---------------------------------------------------------------------------

// Full UK postcodes only (outward + inward code), uppercase as they appear in
// addresses. Outward-only codes like "SW1" are left alone: too many false hits.
const POSTCODE_RE =
  /\b(?:GIR ?0AA|[A-PR-UWYZ](?:\d{1,2}|[A-HK-Y]\d{1,2}|\d[A-HJKPS-UW]|[A-HK-Y]\d[ABEHMNPRV-Y]) ?\d[ABD-HJLNP-UW-Z]{2})\b/g;

// "10 Downing Street", "1 Canada Square", "221B Baker St".
const STREET_SUFFIXES =
  "Street|St|Road|Rd|Avenue|Ave|Lane|Drive|Way|Place|Square|Court|Crescent|Close|Terrace|Gardens|Grove|Parade|Row|Walk|Hill|Wharf|Quay|Boulevard|Blvd|Broadway|Highway|Mews|Yard|Embankment|Circus";
const STREET_RE = new RegExp(
  `(?<![\\d,.£$€])\\b\\d{1,4}[A-Za-z]?(?:-\\d{1,4})?,? (?:[A-Z][A-Za-z'’.-]+ ){1,3}(?:${STREET_SUFFIXES})\\b`,
  "g"
);
const STREET_AFTER_RE = new RegExp(`^ (?:${STREET_SUFFIXES})\\b`);

// "Austin, TX", "San Francisco, CA".
const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const US_CITY_RE = new RegExp(`\\b(?:[A-Z][a-z]+ ){0,2}[A-Z][a-z]+, (?:${US_STATES})\\b`, "g");

// UK cities, big towns and London areas people commute to. Names that are
// also common words, surnames or US cities are left out unless they're big
// enough to be worth the odd false hit.
const UK_PLACES = [
  "London", "City of London", "Birmingham", "Manchester", "Leeds", "Liverpool", "Sheffield", "Bristol",
  "Newcastle", "Newcastle upon Tyne", "Nottingham", "Leicester", "Coventry", "Bradford", "Hull",
  "Kingston upon Hull", "Stoke-on-Trent", "Wolverhampton", "Plymouth", "Southampton", "Portsmouth", "Derby",
  "Reading", "Milton Keynes", "Northampton", "Luton", "Brighton", "Hove", "Bournemouth", "Poole", "Swindon",
  "Oxford", "Cambridge", "Peterborough", "Norwich", "Ipswich", "Colchester", "Chelmsford", "Southend-on-Sea",
  "Basildon", "Slough", "Watford", "St Albans", "Stevenage", "Guildford", "Woking", "Crawley", "Maidstone",
  "Canterbury", "Exeter", "Gloucester", "Cheltenham", "Worcester", "Hereford", "Bath", "Salisbury",
  "Winchester", "Chichester", "Lincoln", "York", "Harrogate", "Wakefield", "Huddersfield", "Halifax",
  "Doncaster", "Rotherham", "Barnsley", "Middlesbrough", "Sunderland", "Durham", "Gateshead", "Darlington",
  "Carlisle", "Lancaster", "Preston", "Blackpool", "Blackburn", "Bolton", "Wigan", "Warrington", "Stockport",
  "Oldham", "Rochdale", "Salford", "Chester", "Crewe", "Telford", "Shrewsbury", "Stafford", "Walsall", "Dudley",
  "Solihull", "Worthing", "Eastbourne", "Hastings", "Basingstoke", "Farnborough", "Aldershot", "High Wycombe",
  "Aylesbury", "Bedford", "Hemel Hempstead", "Harlow", "Dartford", "Gravesend", "Tunbridge Wells",
  "Royal Tunbridge Wells", "Ashford", "Folkestone", "Dover", "Margate", "Torquay", "Taunton", "Yeovil", "Truro",
  "Newport", "Cardiff", "Swansea", "Wrexham", "Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness",
  "Stirling", "Belfast", "Londonderry", "Lisburn", "Newry", "Kendal", "Scunthorpe", "Grimsby", "Mansfield",
  "Chesterfield", "Burnley", "Loughborough", "Nuneaton", "Kettering", "Corby", "Wellingborough",
  "Stockton-on-Tees", "Hartlepool", "Grantham", "Bracknell", "Newbury", "Wokingham", "Maidenhead", "Staines",
  "Epsom", "Redhill", "Sevenoaks", "Tonbridge", "Horsham", "Bognor Regis", "Andover", "Weymouth", "Barnstaple",
  "Paignton", "Gillingham", "Chatham", "Rochester", "Warwick", "Leamington Spa", "Stratford-upon-Avon",
  "Kidderminster", "Redditch", "Bromsgrove", "Cannock", "Tamworth", "Lichfield", "Burton upon Trent",
  "Macclesfield", "Northwich", "Runcorn", "Widnes", "St Helens", "Southport", "Birkenhead", "Ellesmere Port",
  "Altrincham", "Accrington", "Hatfield", "Welwyn Garden City", "Hitchin", "Letchworth", "Enfield", "Barnet",
  "Harrow", "Ealing", "Hounslow", "Heathrow", "Gatwick", "Uxbridge", "Wembley", "Richmond",
  "Kingston upon Thames", "Wimbledon", "Croydon", "Bromley", "Greenwich", "Lewisham", "Stratford",
  "Canary Wharf", "Shoreditch", "Westminster", "Camden", "Islington", "Hackney", "Hammersmith", "Fulham",
  "Kensington", "Paddington", "King's Cross", "King’s Cross", "Kings Cross", "Holborn", "Farringdon",
  "Clerkenwell", "Southwark", "Battersea", "Brixton", "Clapham", "Soho", "Mayfair", "Waterloo", "Euston",
  "Liverpool Street", "London Bridge",
];

// Also everyday words: only counted when they don't start a sentence.
const AMBIGUOUS_PLACES = new Set(["Reading", "Bath"]);

const AREA_PREFIX =
  "(?:(?:Central|Greater|Inner|Outer|North|South|East|West|North East|North West|South East|South West) )?";

const NOT_PLACES =
  /^(remote|hybrid|on-?site|in office|uk|gb|us|usa|united kingdom|united states|england|scotland|wales|northern ireland|europe|emea|anywhere|worldwide)$/i;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Which country unlabelled addresses are in: the job's own address says, and
// failing that a .uk site means the UK.
function regionHint() {
  const text = currentJob && currentJob.addresses ? currentJob.addresses.join(" | ") : "";
  if (/\b(United States|USA|US)\b/.test(text)) return "USA";
  if (/\b(United Kingdom|UK|GB|England|Scotland|Wales|Northern Ireland)\b/.test(text)) return "UK";
  if (/\.uk$/.test(location.hostname)) return "UK";
  return "";
}

function withRegion(place) {
  const region = regionHint();
  const hasCountry = /\b(UK|GB|United Kingdom|USA|US|United States)$/.test(place);
  return region && !hasCountry ? `${place}, ${region}` : place;
}

// The job's own location, split into its parts: "Leeds, West Yorkshire, UK"
// makes "Leeds" route to the whole thing, so small towns missing from the
// list above still get picked up.
function jobPlaces() {
  const places = new Map();
  for (const address of (currentJob && currentJob.addresses) || []) {
    const parts = address.split(",").map((p) => p.trim());
    parts.forEach((part, i) => {
      if (part.length < 3 || /\d/.test(part) || NOT_PLACES.test(part)) return;
      if (!places.has(part)) places.set(part, parts.slice(i).join(", "));
    });
  }
  return places;
}

// name -> what to route to. Rebuilt whenever a new job is detected.
let placeRoutes = new Map();
let placeRe = null;
let placeAtStartRe = null;

function buildPlaceMatcher() {
  placeRoutes = new Map();
  if (regionHint() !== "USA") {
    UK_PLACES.forEach((name) => placeRoutes.set(name, `${name}, UK`));
  }
  jobPlaces().forEach((route, name) => placeRoutes.set(name, route));

  const names = [...placeRoutes.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (!names.length) {
    placeRe = placeAtStartRe = null;
    return;
  }
  const source = `${AREA_PREFIX}(?:${names.join("|")})`;
  placeRe = new RegExp(`\\b${source}\\b`, "g");
  placeAtStartRe = new RegExp(`^,? (${source})\\b`);
}

function routeForPlace(text) {
  const bare = text.replace(new RegExp(`^${AREA_PREFIX}`), "");
  return placeRoutes.get(bare) || placeRoutes.get(text) || `${text}, UK`;
}

function findAll(re, text, toMatch) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const match = toMatch(m);
    if (match) out.push(match);
  }
  return out;
}

function placeMatch(m, text) {
  const name = m[0];
  const start = m.index;
  const end = start + name.length;
  const before = text.slice(0, start);
  const after = text.slice(end);

  // "New York", "Manchester Road", "John Preston".
  if (/\bNew $/.test(before)) return null;
  if (STREET_AFTER_RE.test(after)) return null;
  if (/[A-Z][a-z]+ $/.test(before)) return null;
  // "Reading and writing…" at the start of a sentence.
  if (AMBIGUOUS_PLACES.has(name) && /(^|[.!?:•]\s*)$/.test(before.trimEnd()) && /^ [a-z]/.test(after)) {
    return null;
  }
  return { start, end, place: routeForPlace(name), label: name };
}

// A street address can carry on with known places: "1 Canada Square, Canary
// Wharf, London".
function streetMatch(m, text) {
  let end = m.index + m[0].length;
  let joinedPlace = false;
  for (let i = 0; i < 2 && placeAtStartRe; i++) {
    const next = placeAtStartRe.exec(text.slice(end));
    if (!next) break;
    end += next[0].length;
    joinedPlace = true;
  }
  const label = text.slice(m.index, end);
  let place = label;
  if (!joinedPlace) {
    const town = [...jobPlaces().values()][0];
    if (town) place = `${label}, ${town}`;
  }
  return { start: m.index, end, place: withRegion(place), label };
}

// "sw1a1aa" -> "SW1A 1AA"
function normalisePostcode(raw) {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

function findLocations(text) {
  const candidates = [
    ...findAll(POSTCODE_RE, text, (m) => {
      const postcode = normalisePostcode(m[0]);
      return { start: m.index, end: m.index + m[0].length, place: `${postcode}, UK`, label: postcode };
    }),
    ...findAll(STREET_RE, text, (m) => streetMatch(m, text)),
    ...findAll(US_CITY_RE, text, (m) => ({
      start: m.index,
      end: m.index + m[0].length,
      place: `${m[0]}, USA`,
      label: m[0],
    })),
    ...(placeRe ? findAll(placeRe, text, (m) => placeMatch(m, text)) : []),
  ];

  // Earliest first, longest first when two start together; drop overlaps.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start >= lastEnd) {
      kept.push(c);
      lastEnd = c.end;
    }
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Marking up the page
// ---------------------------------------------------------------------------

const HIGHLIGHT_CLASS = "beeline-place";
const STYLE_ID = "beeline-place-style";
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "SVG"]);

// The highlight colour follows the colour theme picked in BeeLine's settings.
let accent = findBeelinePalette().accent;

function styleText() {
  return `
    .${HIGHLIGHT_CLASS} {
      background: ${accent} !important;
      color: #1b1b1b !important;
      border-radius: 4px !important;
      padding: 0 3px !important;
      box-shadow: 0 0 0 1.5px #1b1b1b !important;
      cursor: pointer !important;
      font-weight: 700 !important;
      text-decoration: none !important;
      white-space: nowrap !important;
      transition: transform 0.12s ease, box-shadow 0.12s ease !important;
      display: inline-block !important;
      line-height: 1.3 !important;
    }
    .${HIGHLIGHT_CLASS}:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 0 0 1.5px #1b1b1b, 2px 2px 0 #1b1b1b !important;
    }
    .${HIGHLIGHT_CLASS}::before {
      content: "\\1F4CD" !important;
      font-size: 0.85em !important;
      margin-right: 2px !important;
    }
    .beeline-toast {
      position: fixed !important;
      z-index: 2147483647 !important;
      right: 20px !important;
      bottom: 20px !important;
      max-width: 300px !important;
      background: ${accent} !important;
      color: #1b1b1b !important;
      border: 2px solid #1b1b1b !important;
      box-shadow: 3px 3px 0 #1b1b1b !important;
      border-radius: 12px !important;
      padding: 10px 14px !important;
      font: 600 13px/1.4 system-ui, sans-serif !important;
    }
  `;
}

function injectStyles() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = styleText();
}

function shouldSkip(textNode) {
  for (let el = textNode.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
    if (el.isContentEditable) return true;
    if (el.classList.contains(HIGHLIGHT_CLASS) || el.classList.contains("beeline-toast")) return true;
  }
  return false;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "beeline-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function onLocationClick(event) {
  // Locations often sit inside links; don't let the page navigate away.
  event.preventDefault();
  event.stopPropagation();
  const { place, label } = event.currentTarget.dataset;
  const { title, company } = currentJob || jobNameFromPage();
  const message = { type: "LOCATION_CLICKED", place, label, title, company, url: advertUrl() };
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError || !response || !response.opened) {
      showToast(`Route to ${label} is ready — click the BeeLine icon in your toolbar to see it.`);
    }
  });
}

function makeHighlight(text, { place, label }) {
  const span = document.createElement("span");
  span.className = HIGHLIGHT_CLASS;
  span.textContent = text;
  span.dataset.place = place;
  span.dataset.label = label;
  span.title = `Show the route to ${label} in BeeLine`;
  span.setAttribute("role", "button");
  span.tabIndex = 0;
  span.addEventListener("click", onLocationClick, true);
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") onLocationClick(e);
  });
  return span;
}

function highlightTextNode(node) {
  const text = node.nodeValue;
  if (!text || text.trim().length < 3) return;
  const matches = findLocations(text);
  if (!matches.length || shouldSkip(node)) return;

  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const m of matches) {
    if (m.start > last) fragment.appendChild(document.createTextNode(text.slice(last, m.start)));
    fragment.appendChild(makeHighlight(text.slice(m.start, m.end), m));
    last = m.end;
  }
  if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(fragment, node);
}

function highlightWithin(root) {
  if (!root || !isJobPage()) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.isConnected && root.parentNode) highlightTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || !root.isConnected) return;

  // Collect first: replacing nodes mid-walk would confuse the walker.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(highlightTextNode);
}

// Job boards swap content in place as you click through results, so new
// text keeps arriving. Only re-scan what changed, batched every 100ms.
const pending = new Set();
let scheduled = false;
let enabled = false;

function flush() {
  scheduled = false;
  const roots = [...pending];
  pending.clear();
  roots.forEach(highlightWithin);
}

const highlightObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "characterData") pending.add(m.target);
    else m.addedNodes.forEach((node) => pending.add(node));
  }
  if (pending.size && !scheduled) {
    scheduled = true;
    setTimeout(flush, 100);
  }
});

function enable() {
  enabled = true;
  injectStyles();
  buildPlaceMatcher();
  highlightWithin(document.body);
  highlightObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// Puts the page's original text back.
function disable() {
  enabled = false;
  highlightObserver.disconnect();
  pending.clear();
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((span) => {
    const parent = span.parentNode;
    parent.replaceChild(document.createTextNode(span.textContent), span);
    parent.normalize();
  });
}

// Called by job-detector.js when it finds a job on the page (including after
// the board swaps to a different job in place).
function onJobPageDetected() {
  if (!enabled) return;
  buildPlaceMatcher();
  highlightWithin(document.body);
}

// Toggled from BeeLine's settings; on unless the user has turned it off.
// (The setting is still stored as highlightPostcodes from when it only
// covered postcodes.)
chrome.storage.sync.get(["highlightPostcodes", "palette"], (data) => {
  accent = findBeelinePalette(data.palette).accent;
  if (data.highlightPostcodes !== false) enable();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.palette) {
    accent = findBeelinePalette(changes.palette.newValue).accent;
    if (document.getElementById(STYLE_ID)) injectStyles();
  }
  if (changes.highlightPostcodes) {
    if (changes.highlightPostcodes.newValue === false) disable();
    else enable();
  }
});
