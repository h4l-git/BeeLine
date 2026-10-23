document.getElementById("back").addEventListener("click", () => {
  window.location.href = "popup.html";
});

const WEBSITE_URL = "https://h4l-git.github.io/BeeLine/";

document.getElementById("website").addEventListener("click", () => {
  chrome.tabs.create({ url: WEBSITE_URL });
});

// Opens this extension's own Web Store reviews page; the installed ID matches the listing.
document.getElementById("rate").addEventListener("click", () => {
  chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
});

document.querySelectorAll(".get-key").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!chrome?.tabs?.create) return;
    event.preventDefault();
    chrome.tabs.create({ url: link.href });
  });
});

const apiKeyEl = document.getElementById("apiKey");
const homeEl = document.getElementById("home");
const workEl = document.getElementById("work");
const aiApiKeyEl = document.getElementById("aiApiKey");
const statusEl = document.getElementById("status");

const highlightEl = document.getElementById("highlightPostcodes");

chrome.storage.sync.get(["apiKey", "home", "work", "aiApiKey", "highlightPostcodes"], (data) => {
  apiKeyEl.value = data.apiKey || "";
  homeEl.value = data.home || "";
  workEl.value = data.work || "";
  aiApiKeyEl.value = data.aiApiKey || "";
  highlightEl.checked = data.highlightPostcodes !== false; // on unless turned off
});

function showSaved() {
  statusEl.textContent = "✓ Saved";
  statusEl.classList.add("show");
  setTimeout(() => statusEl.classList.remove("show"), 1600);
}

// Saves straight away, like a switch should; open job tabs pick it up live.
highlightEl.addEventListener("change", () => {
  chrome.storage.sync.set({ highlightPostcodes: highlightEl.checked }, showSaved);
});

// Colour theme swatches, built from palettes.js. Real radio buttons underneath,
// so arrow keys move between them. Saves straight away, like the switch.
const palettePickerEl = document.getElementById("palettePicker");
const paletteNameEl = document.getElementById("paletteName");

function paletteLabel(palette) {
  return palette.id === BEELINE_DEFAULT_PALETTE ? `${palette.name} (default)` : palette.name;
}

function showPaletteName(id) {
  paletteNameEl.textContent = paletteLabel(findBeelinePalette(id));
}

BEELINE_PALETTES.forEach((palette) => {
  const option = document.createElement("label");
  option.className = "palette-option";
  option.title = paletteLabel(palette);

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "palette";
  radio.value = palette.id;
  radio.setAttribute("aria-label", paletteLabel(palette));
  radio.checked = palette.id === document.documentElement.dataset.palette;
  radio.addEventListener("change", () => {
    setPalette(palette.id);
    showSaved();
  });

  const hex = document.createElement("span");
  hex.className = "palette-hex";
  hex.style.setProperty("--swatch", palette.accent);

  option.append(radio, hex);
  palettePickerEl.appendChild(option);
});
showPaletteName(document.documentElement.dataset.palette);

// theme.js announces every change, including ones from another device or page.
document.addEventListener("beeline-palette", (event) => {
  const radio = palettePickerEl.querySelector(`input[value="${event.detail}"]`);
  if (radio) radio.checked = true;
  showPaletteName(event.detail);
});

const useLocationEl = document.getElementById("useLocation");
const locationStatusEl = document.getElementById("locationStatus");

function showLocationStatus(text) {
  locationStatusEl.textContent = text;
  locationStatusEl.hidden = !text;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

// Turns coordinates into a street address, with the user's own Maps key if
// they've added one and BeeLine's shared service otherwise. If that fails
// (Geocoding API not enabled, daily limit reached) the raw "lat,lng" is
// returned instead — Directions accepts that as an origin just as well.
async function reverseGeocode(lat, lng) {
  const coords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const apiKey = apiKeyEl.value.trim();

  try {
    if (!apiKey) {
      const data = await callProxy("geocode", { latlng: coords });
      if (data.address) return { address: data.address, exact: true };
    } else {
      const params = new URLSearchParams({ latlng: coords, key: apiKey });
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
      );
      const data = await res.json();
      if (data.status === "OK" && data.results.length) {
        return { address: data.results[0].formatted_address, exact: true };
      }
    }
  } catch {
    // Fall through to coordinates.
  }
  return { address: coords, exact: false, ownKey: Boolean(apiKey) };
}

const GEO_ERRORS = {
  1: "Location access was denied. Allow it for BeeLine in Chrome's site settings.",
  2: "Couldn't work out your location right now. Try again in a moment.",
  3: "Finding your location took too long. Try again.",
};

useLocationEl.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    showLocationStatus("Location isn't available in this browser.");
    return;
  }

  useLocationEl.disabled = true;
  showLocationStatus("Finding your location…");
  try {
    const { coords } = await getPosition();
    const { address, exact, ownKey } = await reverseGeocode(coords.latitude, coords.longitude);
    homeEl.value = address;
    showLocationStatus(
      exact
        ? "Filled in from your current location — check it, then save."
        : ownKey
          ? "Filled in your coordinates. Enable the Geocoding API on your key to get a street address instead."
          : "Filled in your coordinates — couldn't look up a street address right now. You can type it in instead."
    );
  } catch (err) {
    showLocationStatus(GEO_ERRORS[err.code] || "Couldn't get your location.");
  } finally {
    useLocationEl.disabled = false;
  }
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      apiKey: apiKeyEl.value.trim(),
      home: homeEl.value.trim(),
      work: workEl.value.trim(),
      aiApiKey: aiApiKeyEl.value.trim(),
    },
    showSaved
  );
});
