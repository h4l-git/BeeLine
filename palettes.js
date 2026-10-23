// Colour themes, shared by the extension pages (via theme.js) and the
// location highlights on job sites. Each one is a bright fill that dark text
// reads well on, plus a deeper shade for links and icons on white. Dark mode
// uses the bright fill for those instead.
globalThis.BEELINE_PALETTES = [
  { id: "honey", name: "Honey", accent: "#ffc41e", deep: "#9a6200" },
  { id: "mint", name: "Mint", accent: "#3ddc97", deep: "#0b7a4b" },
  { id: "sky", name: "Sky", accent: "#5cb8ff", deep: "#0b5fa5" },
  { id: "lavender", name: "Lavender", accent: "#b8a1ff", deep: "#5b3fd1" },
  { id: "coral", name: "Coral", accent: "#ff8c69", deep: "#b33a17" },
  { id: "rose", name: "Rose", accent: "#ff94c2", deep: "#ad2366" },
  { id: "slate", name: "Slate", accent: "#c9ccd6", deep: "#4a4d5c" },
];

globalThis.BEELINE_DEFAULT_PALETTE = "honey";

globalThis.findBeelinePalette = function (id) {
  return (
    BEELINE_PALETTES.find((p) => p.id === id) ||
    BEELINE_PALETTES.find((p) => p.id === BEELINE_DEFAULT_PALETTE)
  );
};
