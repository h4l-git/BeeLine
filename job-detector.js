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
  if (handledJobIds.has(id)) return;

  const result =
    detectJobFromSchema() ||
    (location.hostname.includes("linkedin.com")
      ? extractFromSearchList() || extractFromViewPage()
      : null);

  if (result && result.addresses && result.addresses.length) {
    handledJobIds.add(id);
    // The job card's name beats what the address finders guessed.
    const card = jobNameFromCard() || {};
    currentJob = {
      ...result,
      title: card.title || result.title,
      company: card.company || result.company,
      url: advertUrl(),
    };
    chrome.runtime.sendMessage({ type: "JOB_DETECTED", ...currentJob });
    announceJobPage();
    return;
  }

  // No address found by the free methods. If this still looks like a job
  // posting, offer the page's text up for an opt-in AI lookup rather than
  // giving up.
  if (!looksLikeJobPage()) return;
  handledJobIds.add(id);
  currentJob = null;
  announceJobPage();

  chrome.runtime.sendMessage({
    type: "JOB_TEXT_ONLY",
    text: (document.body.innerText || "").slice(0, 6000),
    ...jobNameFromPage(),
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
