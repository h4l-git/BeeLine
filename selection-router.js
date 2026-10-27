// Route to highlighted text. When the user selects some text on a page, a
// small BeeLine button appears beside it; clicking it opens the panel with the
// route from home to whatever the text names. If Google Maps can't place it,
// the popup says so. Nothing is looked up until the button is clicked, so
// selecting text never uses up the daily free lookups.
//
// Turned on from BeeLine's settings, which also grants the site access this
// needs (background.js then injects it into every page). Wrapped in a function
// so its names can't clash with the job-page scripts, which share this scope
// on job sites.
(() => {
  if (globalThis.__beelineSelectionRouter) return;
  globalThis.__beelineSelectionRouter = true;

  // Long enough to be a place, short enough to not be a paragraph.
  const MIN_LENGTH = 2;
  const MAX_LENGTH = 200;
  const MAX_WORDS = 25;
  const GAP = 8; // px between the selection and the button

  let active = false;
  let accent = findBeelinePalette().accent;
  let host = null;
  let button = null;
  let labelEl = null;
  let styleEl = null;
  let range = null;
  let place = "";
  let resetTimer = null;

  function inEditable(node) {
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!el) return false;
    return el.isContentEditable || Boolean(el.closest("input, textarea, select"));
  }

  // The selected text, if it could plausibly be a place.
  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return null;
    if (text.split(" ").length > MAX_WORDS) return null;
    if (!/[\p{L}\p{N}]/u.test(text)) return null;
    const r = sel.getRangeAt(0);
    if (inEditable(r.commonAncestorContainer) || (host && host.contains(r.commonAncestorContainer))) {
      return null;
    }
    return { text, range: r.cloneRange() };
  }

  function styleText() {
    return `
      :host { all: initial; }
      button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 320px;
        padding: 6px 11px 6px 9px;
        background: ${accent};
        color: #1b1b1b;
        border: 2px solid #1b1b1b;
        border-radius: 10px;
        box-shadow: 2px 3px 0 #1b1b1b;
        font: 700 13px/1.2 Nunito, system-ui, -apple-system, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
        animation: pop 0.14s ease-out;
      }
      button:hover { transform: translateY(-1px); box-shadow: 3px 4px 0 #1b1b1b; }
      button:active { transform: translateY(1px); box-shadow: 1px 1px 0 #1b1b1b; }
      button:focus-visible { outline: 2px solid #1b1b1b; outline-offset: 2px; }
      svg {
        flex: none;
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @keyframes pop { from { opacity: 0; transform: translateY(3px); } }
      @media (prefers-reduced-motion: reduce) { button { animation: none; transition: none; } }
    `;
  }

  function build() {
    host = document.createElement("beeline-route-button");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; display: none;";
    const shadow = host.attachShadow({ mode: "closed" });

    styleEl = document.createElement("style");
    styleEl.textContent = styleText();

    button = document.createElement("button");
    button.type = "button";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';
    labelEl = document.createElement("span");
    labelEl.className = "label";
    button.appendChild(labelEl);

    // Keep the page's selection when the button is pressed.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", onButtonClick);

    shadow.append(styleEl, button);
    document.documentElement.appendChild(host);
  }

  function setLabel(text) {
    labelEl.textContent = text;
    button.title = text;
  }

  function hide() {
    clearTimeout(resetTimer);
    if (host) host.style.display = "none";
    range = null;
    place = "";
  }

  // Below the selection, or above it when there's no room underneath.
  function position() {
    if (!host || !range) return;
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      host.style.visibility = "hidden";
      return;
    }
    host.style.visibility = "visible";
    const { width, height } = button.getBoundingClientRect();
    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - GAP) top = rect.top - height - GAP;
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - width - GAP);
    host.style.top = `${Math.max(GAP, top)}px`;
    host.style.left = `${Math.max(GAP, left)}px`;
  }

  function show(selection) {
    if (!host) build();
    clearTimeout(resetTimer);
    range = selection.range;
    place = selection.text;
    setLabel(`Route to ${place}`);
    host.style.display = "block";
    position();
  }

  function update() {
    if (!active) return;
    const selection = readSelection();
    if (selection) show(selection);
    else hide();
  }

  function onButtonClick() {
    if (!place) return;
    const message = {
      type: "LOCATION_CLICKED",
      source: "selection",
      place,
      label: place,
      title: document.title,
      url: location.href,
    };
    setLabel("Finding your route…");
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || !response.opened) {
          // The panel can't always open itself; the toolbar icon has the route.
          setLabel("Click the BeeLine icon in your toolbar");
          resetTimer = setTimeout(hide, 4000);
        } else {
          hide();
        }
      });
    } catch {
      // The extension was reloaded or removed since this page loaded.
      setLabel("BeeLine was updated — reload this page");
      resetTimer = setTimeout(hide, 4000);
    }
  }

  // Wait a tick so the selection has settled after the mouse or key is let go.
  function onRelease(event) {
    if (!active || (host && event.composedPath().includes(host))) return;
    setTimeout(update, 0);
  }

  function onPress(event) {
    if (host && !event.composedPath().includes(host)) hide();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") hide();
  }

  function onSelectionChange() {
    const sel = window.getSelection();
    if (range && (!sel || sel.isCollapsed)) hide();
  }

  let frame = 0;
  function onViewportChange() {
    if (!range || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      position();
    });
  }

  function enable() {
    if (active) return;
    active = true;
    document.addEventListener("mouseup", onRelease, true);
    document.addEventListener("keyup", onRelease, true);
    document.addEventListener("mousedown", onPress, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange, { passive: true });
  }

  function disable() {
    active = false;
    hide();
    document.removeEventListener("mouseup", onRelease, true);
    document.removeEventListener("keyup", onRelease, true);
    document.removeEventListener("mousedown", onPress, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener("scroll", onViewportChange, { capture: true });
    window.removeEventListener("resize", onViewportChange);
  }

  function applyAccent(paletteId) {
    accent = findBeelinePalette(paletteId).accent;
    if (styleEl) styleEl.textContent = styleText();
  }

  // Off unless the user has turned it on in settings.
  chrome.storage.sync.get(["routeSelection", "palette"], (data) => {
    accent = findBeelinePalette(data.palette).accent;
    if (data.routeSelection === true) enable();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.palette) applyAccent(changes.palette.newValue);
    if (changes.routeSelection) {
      if (changes.routeSelection.newValue === true) enable();
      else disable();
    }
  });
})();
