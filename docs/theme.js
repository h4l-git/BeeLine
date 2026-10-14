// Same theme switcher as the extension: loaded in <head> so a saved theme is
// applied before first paint. With no saved choice the site follows the
// system light/dark setting.
const THEME_KEY = "theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) {
    return null;
  }
}

function effectiveTheme() {
  return document.documentElement.dataset.theme || readSavedTheme() || (darkQuery.matches ? "dark" : "light");
}

function applyTheme() {
  const saved = readSavedTheme();
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
  const btn = document.getElementById("themeToggle");
  if (btn) {
    const dark = effectiveTheme() === "dark";
    btn.dataset.mode = dark ? "dark" : "light";
    btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }
}

applyTheme();
darkQuery.addEventListener("change", applyTheme);

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  applyTheme();
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      // Storage unavailable: still switch for this visit.
    }
    applyTheme();
  });
});
