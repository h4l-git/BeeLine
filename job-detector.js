function readJobPostings() {
  const blocks = document.querySelectorAll('script[type="application/ld+json"]');
  const postings = [];

  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block.textContent);
    } catch (e) {
      continue;
    }

    const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
    for (const item of items) {
      if (!item || !item["@type"]) continue;
      const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
      if (types.includes("JobPosting")) postings.push(item);
    }
  }

  return postings;
}

function formatOneAddress(loc) {
  const addr = loc && loc.address;
  if (!addr) return null;
  if (typeof addr === "string") return addr;

  const parts = [
    addr.streetAddress,
    addr.addressLocality,
    addr.addressRegion,
    addr.postalCode,
    addr.addressCountry,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

// A posting can list several possible work locations (jobLocation as an
// array) — return all of them so the popup can pick whichever is closest
// to the user's home instead of blindly taking the first.
function formatAddresses(jobLocation) {
  if (!jobLocation) return [];
  const locs = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  const addresses = locs.map(formatOneAddress).filter(Boolean);
  return [...new Set(addresses)];
}

function companyName(job) {
  const org = job.hiringOrganization;
  if (!org) return null;
  return (typeof org === "string" ? org : org.name) || null;
}

function detectJobFromSchema() {
  const postings = readJobPostings();
  if (!postings.length) return null;

  for (const job of postings) {
    const addresses = formatAddresses(job.jobLocation);
    if (addresses.length) {
      return {
        addresses,
        title: job.title || null,
        company: companyName(job),
      };
    }
  }
  return null;
}

// LinkedIn names the open job by id: ?currentJobId= on search pages, or the
// end of the path on /jobs/view/<slug>-<id> pages.
function linkedInJobId() {
  const param = new URLSearchParams(location.search).get("currentJobId");
  if (param) return param;
  const match = location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/);
  return match ? match[1] : null;
}

// Where each board shows the open job's title and company. The tab title is
// no use here: on search pages it describes the search ("Developer jobs in
// Manchester | Indeed"), not the job. Selectors are tried in order. Search
// pages list many jobs, so titles point at the open job's own header (scope
// narrows to it where the board has one) and the company is the one nearest
// that title. "{id}" is LinkedIn's job id.
const JOB_CARDS = [
  {
    host: "indeed.",
    scope: '[data-testid="desktop-job-header"]',
    title: ['[data-testid="vj-job-title"]', '[data-testid="jobsearch-JobInfoHeader-title"]'],
    company: [
      '[data-testid="vj-company-name"]',
      '[data-testid="company-name"]',
      '[data-testid="inlineHeader-companyName"]',
      'a[href*="/cmp/"]',
    ],
  },
  {
    host: "linkedin.com",
    title: [
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      ".top-card-layout__title",
      'a[href*="/jobs/view/"][href*="{id}"]',
    ],
    company: [
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name",
      ".topcard__org-name-link",
      'a[href*="/company/"]',
    ],
  },
  {
    host: "glassdoor.",
    title: ['h1[id^="jd-job-title"]'],
    company: ['[class*="EmployerProfile_employerName"]', '[data-test="employer-name"]'],
  },
  {
    host: "totaljobs.com",
    title: ['[data-at="header-job-title"]'],
    company: ['[data-at="metadata-company-name"]'],
  },
  {
    host: "reed.co.uk",
    title: ['[data-qa="job-title"]'],
    company: ['[data-qa="job-posted-by"] a'],
  },
  {
    host: "monster.com",
    title: ['[data-testid="jobTitle"]'],
    company: ['[data-testid="company"]'],
  },
  {
    host: "ziprecruiter.com",
    title: ["h1"],
    company: ['a[href*="/co/"]'],
  },
];

// First line only: Glassdoor puts the rating under the company name, and
// Indeed adds a hidden " - job post" to its titles.
function firstLine(el) {
  const line = (el.innerText || el.textContent || "").split("\n").map((s) => s.trim()).find(Boolean);
  return line ? line.replace(/\s+-\s+job post$/i, "") : null;
}

function matchesWithText(root, selectors) {
  const id = linkedInJobId();
  const found = [];
  for (const selector of selectors) {
    if (selector.includes("{id}") && !id) continue;
    for (const el of root.querySelectorAll(selector.replace("{id}", id))) {
      if (firstLine(el)) found.push(el);
    }
  }
  return found;
}

// The company shown closest to the title: climb a few levels from the title
// and take the first company element found, so a search page's other job
// cards are never reached first.
function companyNear(titleEl, selectors, root) {
  let cur = titleEl;
  for (let i = 0; i < 8 && cur && cur !== root.parentElement; i++) {
    const [el] = matchesWithText(cur, selectors);
    if (el) return firstLine(el);
    cur = cur.parentElement;
  }
  return null;
}

function jobNameFromCard() {
  const site = JOB_CARDS.find((s) => location.hostname.includes(s.host));
  if (!site) return null;
  const root = (site.scope && document.querySelector(site.scope)) || document.body;
  const titles = matchesWithText(root, site.title);
  if (!titles.length) return null;
  // Prefer a title that has its company beside it (LinkedIn's detail panel
  // over the matching list card, which may not link the company).
  for (const titleEl of titles) {
    const company = companyNear(titleEl, site.company, root);
    if (company) return { title: firstLine(titleEl), company };
  }
  return { title: firstLine(titles[0]), company: null };
}

// The open job's title and company: from its card on the page, else from the
// page's job schema. Either can be null; callers fall back to "Job posting".
function jobNameFromPage() {
  const card = jobNameFromCard();
  if (card && card.company) return card;
  for (const job of readJobPostings()) {
    if (job.title) {
      return { title: (card && card.title) || job.title, company: companyName(job) };
    }
  }
  return card || { title: null, company: null };
}

// A link to the advert itself. On search pages the address bar holds the
// results list (and may not name the open job at all), so find the open job's
// id on the page and build its own link from that.
function advertUrl() {
  const params = new URLSearchParams(location.search);
  const host = location.hostname;

  if (host.includes("linkedin.com") && params.get("currentJobId")) {
    return `https://www.linkedin.com/jobs/view/${params.get("currentJobId")}/`;
  }

  if (host.includes("indeed.") && !location.pathname.startsWith("/viewjob")) {
    const highlighted = document.querySelector(".vjs-highlight [data-jk]");
    const jk = params.get("vjk") || (highlighted && highlighted.dataset.jk);
    if (jk) return `${location.origin}/viewjob?jk=${jk}`;
  }

  if (host.includes("glassdoor.")) {
    const titleEl = document.querySelector('h1[id^="jd-job-title-"]');
    const jl = titleEl && titleEl.id.replace("jd-job-title-", "");
    const link = jl && document.querySelector(`a[href*="jl=${jl}"]`);
    if (link) return link.href;
  }

  return location.href;
}

// --- Salary ---------------------------------------------------------------

// Where boards show the open job's pay, tried before reading text.
const SALARY_SELECTORS = [
  '[data-testid="jobsearch-OtherJobDetailsContainer"] [data-testid*="salary" i]',
  "#salaryInfoAndJobType",
  '[data-test="detailSalary"]',
  '[data-at="metadata-salary"]',
  '[data-qa="salaryLbl"]',
  '[data-qa="job-salary"]',
  '[data-testid="jobDetailSalary"]',
];

// "£30,000 - £35,000 a year", "$25/hr", "€45k–55k per annum", "Up to £40K".
const MONEY = String.raw`[£$€]\s?\d[\d,]*(?:\.\d+)?\s?[kK]?`;
const SALARY_PATTERN = new RegExp(
  String.raw`(?:(?:up to|from)\s+)?${MONEY}` +
    String.raw`(?:\s?(?:-|–|—|to)\s?(?:[£$€]\s?)?\d[\d,]*(?:\.\d+)?\s?[kK]?)?` +
    String.raw`(?:\s?(?:\/\s?|per\s|an?\s)(?:year|yr|annum|hour|hr|day|week|wk|month|mo)\b)?`,
  "i"
);

function salaryInText(text) {
  const match = (text || "").match(SALARY_PATTERN);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
}

const SALARY_UNITS = {
  HOUR: "an hour",
  DAY: "a day",
  WEEK: "a week",
  MONTH: "a month",
  YEAR: "a year",
};

// Schema pay: baseSalary is a MonetaryAmount whose value is a number or a
// QuantitativeValue (value, or minValue/maxValue) with a unitText.
function salaryFromSchema() {
  for (const job of readJobPostings()) {
    const pay = job.baseSalary;
    if (!pay) continue;
    if (typeof pay === "string" || typeof pay === "number") return String(pay);

    const value = typeof pay.value === "object" && pay.value ? pay.value : { value: pay.value };
    const currency = pay.currency || pay.salaryCurrency || value.currency;
    const unit = SALARY_UNITS[String(value.unitText || pay.unitText || "").toUpperCase()];
    const numbers = [value.minValue, value.maxValue, value.value]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!numbers.length) continue;

    const format = (n) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: currency ? "currency" : "decimal",
          currency: currency || undefined,
          maximumFractionDigits: n < 100 ? 2 : 0,
        }).format(n);
      } catch (e) {
        return String(n);
      }
    };
    const low = Math.min(...numbers);
    const high = Math.max(...numbers);
    const amount = low === high ? format(low) : `${format(low)} – ${format(high)}`;
    return unit ? `${amount} ${unit}` : amount;
  }
  return null;
}

// Pay shown near the open job's title. Climbs from the title until a salary
// turns up, stopping before the block gets big enough to be a list of jobs.
function salaryNearTitle() {
  const site = JOB_CARDS.find((s) => location.hostname.includes(s.host));
  if (!site) return null;
  const root = (site.scope && document.querySelector(site.scope)) || document.body;
  const [titleEl] = matchesWithText(root, site.title);
  let cur = titleEl && titleEl.parentElement;
  for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
    const text = cur.innerText || "";
    if (text.length > 3000) break;
    const found = salaryInText(text);
    if (found) return found;
    cur = cur.parentElement;
  }
  return null;
}

// The open job's pay as the page shows it, or null when it isn't listed.
function jobSalary() {
  for (const selector of SALARY_SELECTORS) {
    const el = document.querySelector(selector);
    const found = el && salaryInText(el.innerText || el.textContent);
    if (found) return found;
  }
  return salaryFromSchema() || salaryNearTitle();
}

// LinkedIn's logged-in view doesn't embed JobPosting schema, so these fall
// back to reading visible page text. Fragile by nature (relies on text
// shape, not structured data) — LinkedIn's own class names are build-hashed
// and useless as selectors — so treat this as best-effort, not guaranteed.
function isNoise(line) {
  return /applicant|ago|promoted|viewed|easy apply|employee|response|verif/i.test(line);
}

function stripWorkMode(text) {
  return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function climbAncestors(el, levels = 6) {
  let cur = el;
  for (let i = 0; i < levels && cur.parentElement; i++) cur = cur.parentElement;
  return cur;
}

// Search-results layout: URL carries ?currentJobId=, list + detail pane both
// exist client-side. Anchor on the link matching that id so we always read
// the currently-selected card, not just whichever one happens to be first.
function extractFromSearchList() {
  const idParam = new URLSearchParams(location.search).get("currentJobId");
  if (!idParam) return null;

  const link = document.querySelector(`a[href*="${idParam}"]`);
  if (!link) return null;

  const container = climbAncestors(link);

  const lines = (container.innerText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const deduped = lines.filter((l, i) => l !== lines[i - 1]);

  const title = deduped[0] || "LinkedIn job";
  const rest = deduped.slice(1);
  const company = rest.find((l) => !l.includes(",") && !isNoise(l)) || null;
  const locationLine = rest.find((l) => l.includes(",") && !isNoise(l) && l.length < 100);

  if (!locationLine) return null;
  return { addresses: [stripWorkMode(locationLine)], title, company };
}

// Direct job-view page (/jobs/view/<id>/): document.title reliably reflects
// the job, so anchor on the element whose exact text matches it.
function extractFromViewPage() {
  const titleGuess = document.title.split(" | ")[0].trim();
  if (!titleGuess || /^\(\d+\)/.test(document.title)) return null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let titleEl = null;
  let n;
  while ((n = walker.nextNode())) {
    if (n.children.length === 0 && n.textContent.trim() === titleGuess) {
      titleEl = n;
      break;
    }
  }
  if (!titleEl) return null;

  const scope = climbAncestors(titleEl);

  // Candidates come out in document order, and the top-card location line
  // always precedes everything else in that scope, so the first one that
  // matches the shape we want is the right one — no need to score them all.
  let best = null;
  for (const el of scope.querySelectorAll("p, span, div, li")) {
    const text = (el.innerText || el.textContent || "").trim();
    if (!text || text.length > 150 || !text.includes("·")) continue;
    const first = text.split("·")[0].trim();
    if (!first || first.length > 60 || /\d/.test(first) || isNoise(first) || !first.includes(",")) continue;
    best = first;
    break;
  }
  if (!best) return null;

  const titleParts = document.title.split(" | ").map((s) => s.trim());
  return {
    addresses: [stripWorkMode(best)],
    title: titleGuess,
    company: titleParts.length >= 3 ? titleParts[1] : null,
  };
}

// Indeed no longer embeds JobPosting schema, and its job header doesn't label
// the location: it's the line beside the company name. The search list's
// card for the open job does label it, so that's the fallback.
const INDEED_COUNTRIES = { uk: "UK", ie: "Ireland", ca: "Canada", au: "Australia", nz: "New Zealand" };

function indeedCountry() {
  if (location.hostname.endsWith(".co.uk")) return "UK";
  const sub = location.hostname.split(".")[0];
  if (sub === "www" || location.hostname === "indeed.com") return "USA";
  return INDEED_COUNTRIES[sub] || "";
}

// "Hybrid work in Manchester M1 3BN" → "Manchester M1 3BN". Null for places
// too vague to route to, like "Remote" or "United Kingdom".
function cleanIndeedLocation(text) {
  const place = (text || "")
    .split("\n")[0]
    .replace(/^(?:hybrid(?: work| remote)?|(?:temporarily )?remote|fully remote|on-?site)\s+in\s+/i, "")
    .replace(/\s*[•·]?\s*\+\d+\s+locations?$/i, "")
    .trim();
  if (!place || place.length > 100) return null;
  if (/^(remote|fully remote|hybrid|hybrid work|hybrid remote|on-?site|in[- ]person|uk|united kingdom|united states|usa|us|england|scotland|wales|northern ireland|ireland|canada|australia|new zealand)$/i.test(place)) {
    return null;
  }
  return place;
}

function indeedLocationText() {
  const header = document.querySelector('[data-testid="desktop-job-header"]') || document;

  // Older layouts labelled the location.
  const labelled = header.querySelector(
    '[data-testid="inlineHeader-companyLocation"], [data-testid="jobsearch-JobInfoHeader-companyLocation"], [data-testid="job-location"]'
  );
  if (labelled && cleanIndeedLocation(labelled.innerText)) return labelled.innerText;

  // Current layout: the metadata row holds the company name (sometimes a
  // link, sometimes with a star rating), then the location, then maybe a work
  // mode like "Hybrid work", with "·" and "•" between them.
  const meta = header.querySelector('[data-testid="company-info-metadata"]');
  if (meta) {
    const companyEl = meta.querySelector(
      '[data-testid="vj-company-name"], [data-testid="company-name"], a[href*="/cmp/"]'
    );
    const company = companyEl ? firstLine(companyEl) : null;
    const line = (meta.innerText || "")
      .split("\n")
      .map((l) => l.trim())
      .find(
        (l) =>
          l !== company &&
          /[a-z]/i.test(l) &&
          !/review|stars?\b|rating/i.test(l) &&
          cleanIndeedLocation(l)
      );
    if (line) return line;
  }

  // Search pages: the open job's card in the results list.
  const jk = new URLSearchParams(location.search).get("vjk");
  const card =
    (jk && document.querySelector(`[data-jk="${jk}"]`)) || document.querySelector(".vjs-highlight [data-jk]");
  const cardRoot = card && (card.closest("li, .job_seen_beacon, .result") || climbAncestors(card, 4));
  const cardLocation = cardRoot && cardRoot.querySelector('[data-testid="text-location"]');
  return cardLocation ? cardLocation.innerText : null;
}

function extractFromIndeed() {
  const place = cleanIndeedLocation(indeedLocationText());
  if (!place) return null;
  const country = indeedCountry();
  const address = country && !place.endsWith(country) ? `${place}, ${country}` : place;
  return { addresses: [address], title: null, company: null };
}

// The open job's own link also tells jobs apart on search pages that swap
// the job in place without changing the address bar.
function jobIdentifier() {
  return advertUrl();
}

function looksLikeJobPage() {
  if (!/job/i.test(location.pathname)) return false;
  return (document.body.innerText || "").length > 500;
}

// Every DOM mutation (ads, hover states, chat widgets — anything) re-fires
// the debounced re-scan below, but only a changed job actually needs the
// expensive work (schema parsing, or extractFromViewPage's TreeWalker).
// Gate on the cheap identifier first so an already-handled job short-circuits
// instantly instead of re-running detection just to be deduped afterwards.
const handledJobIds = new Set();

// Jobs sent as text only get a few more looks as the page changes, in case the
// job's details were still loading (Indeed fills its job panel in late).
const TEXT_ONLY_RECHECKS = 5;
const textOnlyRechecks = new Map();

// The job found on this page, shared with location-highlighter.js (content
// scripts share one scope), which only marks up places on job pages.
let currentJob = null;

function isJobPage() {
  return handledJobIds.has(jobIdentifier());
}

function announceJobPage() {
  if (typeof onJobPageDetected === "function") onJobPageDetected();
}

function detectAndSend() {
  const id = jobIdentifier();
  const rechecksLeft = textOnlyRechecks.get(id) || 0;
  if (handledJobIds.has(id) && !rechecksLeft) return;
  if (rechecksLeft) textOnlyRechecks.set(id, rechecksLeft - 1);

  const host = location.hostname;
  const result =
    detectJobFromSchema() ||
    (host.includes("linkedin.com")
      ? extractFromSearchList() || extractFromViewPage()
      : host.includes("indeed.")
        ? extractFromIndeed()
        : null);

  if (result && result.addresses && result.addresses.length) {
    handledJobIds.add(id);
    textOnlyRechecks.delete(id);
    // The job card's name beats what the address finders guessed.
    const card = jobNameFromCard() || {};
    currentJob = {
      ...result,
      title: card.title || result.title,
      company: card.company || result.company,
      salary: jobSalary(),
      url: advertUrl(),
    };
    chrome.runtime.sendMessage({ type: "JOB_DETECTED", ...currentJob });
    announceJobPage();
    return;
  }

  // No address found by the free methods. If this still looks like a job
  // posting, offer the page's text up for an opt-in AI lookup rather than
  // giving up.
  if (handledJobIds.has(id) || !looksLikeJobPage()) return;
  handledJobIds.add(id);
  textOnlyRechecks.set(id, TEXT_ONLY_RECHECKS);
  currentJob = null;
  announceJobPage();

  chrome.runtime.sendMessage({
    type: "JOB_TEXT_ONLY",
    text: (document.body.innerText || "").slice(0, 6000),
    ...jobNameFromPage(),
    salary: jobSalary(),
    url: advertUrl(),
  });
}

detectAndSend();

// Several boards (LinkedIn, Indeed, Glassdoor, ...) swap the job detail
// panel in-place via JS when you click a different search result, without a
// full page load — a plain one-shot scan would miss every job after the
// first. Re-scan whenever the page's content settles after a change.
let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(detectAndSend, 800);
});
observer.observe(document.body, { childList: true, subtree: true });
