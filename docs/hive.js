// Click two cells of the honeycomb background and a bee flies a route
// between them, going around the page's text, images and controls.
//
// The grid matches the --hive-tile pattern in site.css: pointy-top hexagons,
// 26px wide, 30px tall, rows 22.5px apart, every other row shifted 13px.
// It is anchored at the top-left of <body>, the same as body::before.
(() => {
  const W = 26;          // cell width (and distance between neighbours)
  const ROW = 22.5;      // vertical distance between row centres
  const HALF_H = 15;     // centre to top/bottom point
  const HALF_W = 13;     // centre to left/right edge
  const PAD = 4;         // breathing room kept around content
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // Things a route must go around, besides text (found separately).
  const SOLID = "img, svg, video, canvas, input, textarea, select, button, .btn, .key, .pill, .tool-card, .shots-track, .shots-dots, code, pre";
  // Clicks on these belong to the page, not the honeycomb.
  const INTERACTIVE = "a, button, input, textarea, select, label, summary, [tabindex], .shots-track";

  // ---------- Grid geometry ----------

  const offsetX = (r) => (r % 2 === 0 ? HALF_W : 0);
  const centre = (r, c) => [offsetX(r) + c * W, HALF_H + r * ROW];

  // Nearest cell centre is the cell the point is in.
  function cellAt(x, y) {
    const r0 = Math.round((y - HALF_H) / ROW);
    let best = null;
    let bestD = Infinity;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      if (r < 0) continue;
      const c0 = Math.round((x - offsetX(r)) / W);
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const [cx, cy] = centre(r, c);
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < bestD) { bestD = d; best = { r, c }; }
      }
    }
    return best;
  }

  // Neighbour steps by direction: E, NE, NW, W, SW, SE.
  function step(r, c, dir) {
    const even = r % 2 === 0;
    switch (dir) {
      case 0: return [r, c + 1];
      case 1: return [r - 1, even ? c + 1 : c];
      case 2: return [r - 1, even ? c : c - 1];
      case 3: return [r, c - 1];
      case 4: return [r + 1, even ? c : c - 1];
      default: return [r + 1, even ? c + 1 : c];
    }
  }

  function hexPoints(x, y, scale = 1) {
    const h = HALF_H * scale;
    const w = HALF_W * scale;
    return `${x},${y - h} ${x + w},${y - h / 2} ${x + w},${y + h / 2} ${x},${y + h} ${x - w},${y + h / 2} ${x - w},${y - h / 2}`;
  }

  // ---------- Where the content is ----------

  let grid = null; // { rows, cols, blocked: Uint8Array }

  function contentRects() {
    const sx = scrollX;
    const sy = scrollY;
    const rects = [];
    const add = (r) => {
      if (r.width > 0 && r.height > 0) {
        rects.push([r.left + sx - PAD, r.top + sy - PAD, r.right + sx + PAD, r.bottom + sy + PAD]);
      }
    };

    // Text: one tight box per line, not the whole paragraph.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        !n.nodeValue.trim() || n.parentElement.closest("script, style, svg, .hive-trail")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }

    for (const el of document.body.querySelectorAll(SOLID)) {
      if (el.closest(".hive-trail")) continue;
      add(el.getBoundingClientRect());
    }
    return rects;
  }

  function buildGrid() {
    const width = document.body.scrollWidth;
    const height = document.body.scrollHeight;
    // Cells cut off by the right edge still count, so routes can hug it.
    const cols = Math.floor((width + HALF_W) / W) + 1;
    const rows = Math.floor((height - HALF_H) / ROW) + 1;
    const blocked = new Uint8Array(rows * cols);

    // A cell is blocked when its bounding box touches any content box.
    for (const [l, t, rgt, b] of contentRects()) {
      const r1 = Math.max(0, Math.ceil((t - 2 * HALF_H) / ROW));
      const r2 = Math.min(rows - 1, Math.floor(b / ROW));
      for (let r = r1; r <= r2; r++) {
        const o = offsetX(r);
        const c1 = Math.max(0, Math.ceil((l - HALF_W - o) / W));
        const c2 = Math.min(cols - 1, Math.floor((rgt + HALF_W - o) / W));
        for (let c = c1; c <= c2; c++) blocked[r * cols + c] = 1;
      }
    }
    grid = { rows, cols, blocked };
    return grid;
  }

  const getGrid = () => grid || buildGrid();
  const inGrid = (g, r, c) => r >= 0 && c >= 0 && r < g.rows && c < g.cols;
  const isFree = (g, r, c) => inGrid(g, r, c) && !g.blocked[r * g.cols + c];

  // ---------- Route finding: A* over cells, preferring fewer turns ----------

  function findRoute(g, a, b) {
    const DIRS = 7; // 6 directions + "just started"
    const n = g.rows * g.cols * DIRS;
    const cost = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const [bx, by] = centre(b.r, b.c);
    const guess = (r, c) => {
      const [x, y] = centre(r, c);
      return Math.hypot(bx - x, by - y) / W;
    };

    // Small binary heap of [priority, state].
    const heap = [];
    const push = (p, s) => {
      heap.push([p, s]);
      let i = heap.length - 1;
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (heap[up][0] <= heap[i][0]) break;
        [heap[up], heap[i]] = [heap[i], heap[up]];
        i = up;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    const start = (a.r * g.cols + a.c) * DIRS + 6;
    cost[start] = 0;
    push(guess(a.r, a.c), start);

    while (heap.length) {
      const [, s] = pop();
      const cell = Math.floor(s / DIRS);
      const dir = s % DIRS;
      const r = Math.floor(cell / g.cols);
      const c = cell % g.cols;
      if (r === b.r && c === b.c) {
        const cells = [];
        for (let t = s; t !== -1; t = from[t]) {
          const k = Math.floor(t / DIRS);
          cells.push({ r: Math.floor(k / g.cols), c: k % g.cols });
        }
        return cells.reverse();
      }
      for (let d = 0; d < 6; d++) {
        const [nr, nc] = step(r, c, d);
        if (!isFree(g, nr, nc)) continue;
        const turn = dir === 6 ? 0 : Math.min(Math.abs(d - dir), 6 - Math.abs(d - dir));
        const next = cost[s] + 1 + (turn ? 0.35 + 0.2 * (turn - 1) : 0);
        const ns = (nr * g.cols + nc) * DIRS + d;
        if (next < cost[ns]) {
          cost[ns] = next;
          from[ns] = s;
          push(next + guess(nr, nc), ns);
        }
      }
    }
    return null;
  }

  // Polyline through the cell centres, with rounded corners.
  function routePath(cells) {
    const pts = cells.map(({ r, c }) => centre(r, c));
    const corners = pts.filter((p, i) => {
      if (i === 0 || i === pts.length - 1) return true;
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i + 1];
      return Math.abs((p[0] - ax) * (by - p[1]) - (p[1] - ay) * (bx - p[0])) > 0.01;
    });
    const RADIUS = 10;
    let d = `M${corners[0][0]},${corners[0][1]}`;
    for (let i = 1; i < corners.length - 1; i++) {
      const [px, py] = corners[i];
      const [ax, ay] = corners[i - 1];
      const [bx, by] = corners[i + 1];
      const la = Math.hypot(ax - px, ay - py);
      const lb = Math.hypot(bx - px, by - py);
      const ka = Math.min(RADIUS / la, 0.5);
      const kb = Math.min(RADIUS / lb, 0.5);
      d += ` L${px + (ax - px) * ka},${py + (ay - py) * ka}`;
      d += ` Q${px},${py} ${px + (bx - px) * kb},${py + (by - py) * kb}`;
    }
    const last = corners[corners.length - 1];
    return d + ` L${last[0]},${last[1]}`;
  }

  // ---------- Drawing ----------

  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  };

  const svg = el("svg", { class: "hive-trail", "aria-hidden": "true", focusable: "false" });
  const defs = el("defs", {}, svg);
  const hoverHex = el("polygon", { class: "hive-hover" }, svg);
  let layer = el("g", {}, svg);
  let maskCount = 0;

  function bee(parent) {
    const g = el("g", { class: "hive-bee" }, parent);
    const body = el("g", { class: "hive-bee-body" }, g);
    const wings = el("g", { class: "hive-bee-wings" }, body);
    el("ellipse", { class: "hive-bee-wing", cx: -1, cy: -5, rx: 4, ry: 2.6, transform: "rotate(-25 -1 -5)" }, wings);
    el("ellipse", { class: "hive-bee-wing", cx: -1, cy: 5, rx: 4, ry: 2.6, transform: "rotate(25 -1 5)" }, wings);
    el("ellipse", { class: "hive-bee-abdomen", cx: -1, cy: 0, rx: 6.5, ry: 4.5 }, body);
    el("path", { class: "hive-bee-stripe", d: "M-3.5,-4 V4 M0.5,-4.3 V4.3" }, body);
    el("circle", { class: "hive-bee-head", cx: 6, cy: 0, r: 2.8 }, body);
    return g;
  }

  // Fade the current drawing out and start a fresh layer.
  function clearLayer() {
    const old = layer;
    old.classList.add("is-leaving");
    setTimeout(() => old.remove(), 300);
    layer = el("g", {}, svg);
    if (old.cancel) old.cancel();
  }

  function markCell({ r, c }, cls, parent = layer) {
    const [x, y] = centre(r, c);
    return el("polygon", { class: cls, points: hexPoints(x, y, 0.88) }, parent);
  }

  let first = null;
  let firstHex = null;

  function pick(cell) {
    // Clicking the chosen cell again lets it go.
    if (first && first.r === cell.r && first.c === cell.c) {
      first = null;
      clearLayer();
      return;
    }
    if (!first) {
      clearLayer();
      first = cell;
      firstHex = markCell(cell, "hive-end");
      return;
    }

    const cells = findRoute(getGrid(), first, cell);
    if (!cells) {
      // Walled in: shake the cell and keep the first pick for another try.
      const miss = markCell(cell, "hive-end is-miss");
      setTimeout(() => miss.remove(), 450);
      return;
    }
    first = null;
    flyRoute(cells);
  }

  function flyRoute(cells) {
    const group = layer;
    const d = routePath(cells);

    // The dotted trail is revealed by a mask that draws along the route.
    const id = `hive-mask-${++maskCount}`;
    const mask = el("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: "100%", height: "100%" }, defs);
    const reveal = el("path", { d, class: "hive-reveal" }, mask);

    const cellGroup = el("g", {}, group);
    const lit = cells.slice(1, -1).map((cell) => markCell(cell, "hive-lit", cellGroup));
    group.appendChild(firstHex);
    el("path", { d, class: "hive-glow", mask: `url(#${id})` }, group);
    el("path", { d, class: "hive-dots", mask: `url(#${id})` }, group);
    const end = markCell(cells[cells.length - 1], "hive-end is-waiting", group);
    const flyer = bee(group);

    const total = reveal.getTotalLength();
    reveal.style.strokeDasharray = `${total} ${total}`;
    // Distance along the route at which each cell is reached.
    const reach = [0];
    for (let i = 1; i < cells.length; i++) {
      const [ax, ay] = centre(cells[i - 1].r, cells[i - 1].c);
      const [bx, by] = centre(cells[i].r, cells[i].c);
      reach.push(reach[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    const scale = total / reach[reach.length - 1];

    const finish = () => {
      reveal.style.strokeDashoffset = 0;
      lit.forEach((p) => p.classList.add("is-on"));
      end.classList.remove("is-waiting");
      flyer.classList.add("is-landed");
      const [x, y] = centre(cells[cells.length - 1].r, cells[cells.length - 1].c);
      flyer.setAttribute("transform", `translate(${x} ${y}) rotate(-90)`);
    };

    let cancelled = false;
    group.cancel = () => { cancelled = true; setTimeout(() => mask.remove(), 300); };

    if (reduceMotion.matches) {
      finish();
      return;
    }

    const duration = Math.min(2600, Math.max(700, total * 2.2));
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    let t0 = null;
    let lastAngle = 0;

    function frame(now) {
      if (cancelled) return;
      if (t0 === null) t0 = now;
      const t = Math.min(1, (now - t0) / duration);
      const len = ease(t) * total;
      reveal.style.strokeDashoffset = total - len;

      const p = reveal.getPointAtLength(len);
      const q = reveal.getPointAtLength(Math.min(total, len + 2));
      if (q.x !== p.x || q.y !== p.y) lastAngle = Math.atan2(q.y - p.y, q.x - p.x);
      // A little side-to-side wobble, like a real bee.
      const wob = Math.sin(now / 70) * 1.6 * Math.sin(Math.PI * t);
      const x = p.x - Math.sin(lastAngle) * wob;
      const y = p.y + Math.cos(lastAngle) * wob;
      flyer.setAttribute("transform", `translate(${x} ${y}) rotate(${(lastAngle * 180) / Math.PI})`);

      for (let i = 0; i < lit.length; i++) {
        if (reach[i + 1] * scale <= len + 6) lit[i].classList.add("is-on");
      }
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    }
    requestAnimationFrame(frame);
  }

  // ---------- Input ----------

  function cellUnder(e) {
    if (e.target.closest && e.target.closest(INTERACTIVE)) return null;
    const cell = cellAt(e.clientX + scrollX, e.clientY + scrollY);
    return cell && isFree(getGrid(), cell.r, cell.c) ? cell : null;
  }

  function onClick(e) {
    if (e.button !== 0 || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (String(getSelection()).length) return; // finishing a text selection
    const cell = cellUnder(e);
    if (cell) pick(cell);
  }

  let hoverFrame = 0;
  function onMove(e) {
    if (e.pointerType !== "mouse") return;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      const cell = cellUnder(e);
      document.documentElement.classList.toggle("hive-pointer", !!cell);
      if (cell) {
        const [x, y] = centre(cell.r, cell.c);
        hoverHex.setAttribute("points", hexPoints(x, y, 0.88));
        hoverHex.classList.add("is-on");
      } else {
        hoverHex.classList.remove("is-on");
      }
    });
  }

  function onLeave() {
    document.documentElement.classList.remove("hive-pointer");
    hoverHex.classList.remove("is-on");
  }

  function reset() {
    first = null;
    clearLayer();
  }

  function start() {
    document.body.prepend(svg);
    document.addEventListener("click", onClick);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") reset(); });

    // Content moves when the layout changes; a route drawn before may now
    // cross it, so work the grid out again and clear the old route.
    let lastWidth = document.body.clientWidth;
    new ResizeObserver(() => {
      grid = null;
      if (document.body.clientWidth !== lastWidth) {
        lastWidth = document.body.clientWidth;
        reset();
      }
    }).observe(document.body);
    if (document.fonts) document.fonts.addEventListener("loadingdone", () => { grid = null; });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
