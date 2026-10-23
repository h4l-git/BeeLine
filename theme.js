// Loaded in <head> (after palettes.js) so a saved theme is applied before
// first paint. With no saved choice the pages follow the system light/dark
// setting.
const THEME_KEY = "theme";
const PALETTE_KEY = "palette";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function readSaved(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeSaved(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function effectiveTheme() {
  return readSaved(THEME_KEY) || (darkQuery.matches ? "dark" : "light");
}

function applyTheme() {
  const saved = readSaved(THEME_KEY);
  if (saved) {
    document.documentElement.dataset.theme = saved;
  } else {
    delete document.documentElement.dataset.theme;
  }
  const btn = document.getElementById("themeToggle");
  if (btn) {
    const dark = effectiveTheme() === "dark";
    btn.dataset.mode = dark ? "dark" : "light";
    btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }
}

// Colour theme: sets the two base accent colours the stylesheet builds on.
function applyPalette(id) {
  const palette = findBeelinePalette(id || readSaved(PALETTE_KEY));
  const root = document.documentElement;
  root.dataset.palette = palette.id;
  root.style.setProperty("--accent-1", palette.accent);
  root.style.setProperty("--accent-deep", palette.deep);
  document.dispatchEvent(new CustomEvent("beeline-palette", { detail: palette.id }));
}

// Saves a colour theme. localStorage gives the next page an instant first
// paint; chrome.storage.sync carries it to other devices, open pages and the
// location highlights on job sites.
function setPalette(id) {
  const palette = findBeelinePalette(id);
  writeSaved(PALETTE_KEY, palette.id);
  applyPalette(palette.id);
  if (globalThis.chrome?.storage?.sync) {
    chrome.storage.sync.set({ palette: palette.id });
  }
}

applyTheme();
applyPalette();
darkQuery.addEventListener("change", applyTheme);

if (globalThis.chrome?.storage?.sync) {
  // Pick up a choice made on another device.
  chrome.storage.sync.get(["palette"], (data) => {
    if (data.palette && data.palette !== readSaved(PALETTE_KEY)) {
      writeSaved(PALETTE_KEY, data.palette);
      applyPalette(data.palette);
    }
  });
  // And one made in another open BeeLine page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.palette) return;
    const id = changes.palette.newValue;
    writeSaved(PALETTE_KEY, id || BEELINE_DEFAULT_PALETTE);
    applyPalette(id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  applyTheme();
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    if (!writeSaved(THEME_KEY, next)) {
      // Storage unavailable: still switch for this session.
      document.documentElement.dataset.theme = next;
      return;
    }
    applyTheme();
  });
});
