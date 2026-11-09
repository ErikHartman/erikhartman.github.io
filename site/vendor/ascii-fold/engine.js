import { add, mul, dot, norm } from "./vec.js";
import { buildGeometry, SHAPE_DEFAULT } from "./geometry.js";
import { parsePDB, parseStructure, readStructureFile } from "./parse.js";
import { fetchAFDB, describeAFDB } from "./afdb.js";
import KRAS_6GJ8 from "./data/kras-6gj8.js";
import { GIFEncoder, quantize, applyPalette } from "./vendor/gifenc.js";

// ---------------------------------------------------------------------------------------
// createAsciiFold(container, options) → view
//
// Renders a protein as spinning ASCII text that dissolves into a cartoon ribbon. The view
// fills `container` and follows its size. Everything is drawn with a <pre> (text) laid
// over a <canvas> (ribbon) that share one projection, so the two always line up.
// ---------------------------------------------------------------------------------------

export const PALETTES = {
  paper: { bg: "#F2ECDF", ink: "#1B1A18", H: "#D33A2C", E: "#1F63B0", C: "#C99410", mono: "#34312D",
           P: ["#0053D6", "#65CBF3", "#D9B400", "#FF7D45"] },
  night: { bg: "#121212", ink: "#F2ECDF", H: "#D33A2C", E: "#1F63B0", C: "#EFB52E", mono: "#E8E1D2",
           P: ["#0053D6", "#65CBF3", "#FFDB13", "#FF7D45"] },
};
export const GLYPHS = { classic: " .,:;-=+*x#%@", blocks: " ·░░▒▒▓▓██", geo: " ·∙•◦○◎●◉■" };
export const DETAIL = { coarse: 46, medium: 64, fine: 92, ultra: 128 };   // text rows; columns follow width
export const DEFAULTS = {
  theme: "paper", colour: "ss", layout: "lr", seam: "dither", glyphs: "classic", detail: "medium",
  spin: 0.35, blendFrom: 0.25, blendTo: 0.8, interactive: true, background: true, palette: null,
  font: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
};

const MAX_CELLS = 70000, ZMIN = 0.4, ZMAX = 10;
const LIGHT = norm([-0.45, 0.55, 0.75]);
const hex = h => { h = h.trim().replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };

export function createAsciiFold(container, options = {}) {
  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const o = { ...DEFAULTS, ...(reduceMotion && options.spin === undefined ? { spin: 0 } : {}), ...options };
  let shape = { ...SHAPE_DEFAULT, ...(options.shape || {}) };
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] || []).forEach(fn => fn(d));

  // ---------- DOM ----------
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  const root = document.createElement("div");
  root.className = "ascii-fold";
  root.style.cssText = "position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;touch-action:none;";
  const inner = document.createElement("div");
  inner.style.cssText = "position:relative;width:max-content;";
  const rib = document.createElement("canvas");
  rib.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
  rib.setAttribute("aria-hidden", "true");
  const out = document.createElement("pre");
  out.style.cssText = "margin:0;white-space:pre;line-height:1;font-weight:700;position:relative;";
  out.setAttribute("aria-hidden", "true");
  const probe = document.createElement("span");
  probe.textContent = "MMMMMMMMMM";
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;line-height:1;font-weight:700;left:-9999px;top:0;";
  inner.append(rib, out);
  root.append(inner, probe);
  container.append(root);
  root.setAttribute("role", "img");

  const rctx = rib.getContext("2d");
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d");

  // ---------- state ----------
  let G = null, lastParsed = null, info = null;
  let COLS = 112, ROWS = 64, cw = 8, lh = 13, aspect = 0.6;
  let rotY = 0.6, rotX = -0.35, zoom = 1, panX = 0, panY = 0;
  let mimg, HASH, zbuf, lbuf, cbuf, ibuf, lastGrid = [];
  let PAL = null, ramp = GLYPHS.classic;

  function alloc() {
    mask.width = COLS; mask.height = ROWS;
    mimg = mctx.createImageData(COLS, ROWS);
    const n = COLS * ROWS;
    HASH = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; HASH[i] = x - Math.floor(x); }
    zbuf = new Float32Array(n); lbuf = new Float32Array(n); cbuf = new Float32Array(n); ibuf = new Int32Array(n);
  }

  function applyStyle() {
    const p = { ...PALETTES[o.theme] || PALETTES.paper, ...(o.palette || {}) };
    PAL = { paper: hex(p.bg), ink: hex(p.ink), H: hex(p.H), E: hex(p.E), C: hex(p.C), mono: hex(p.mono), P: p.P.map(hex), css: p };
    out.style.color = p.ink;
    out.style.fontFamily = probe.style.fontFamily = o.font;
    root.style.background = o.background ? p.bg : "transparent";
    ramp = GLYPHS[o.glyphs] || (typeof o.glyphs === "string" && o.glyphs.length > 2 ? o.glyphs : GLYPHS.classic);
    root.style.cursor = o.interactive ? "grab" : "default";
  }

  function fit() {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    probe.style.fontSize = "100px";
    const ratio = probe.getBoundingClientRect().width / 10 / 100 || 0.6;
    let rows = typeof o.detail === "number" ? o.detail : (DETAIL[o.detail] || DETAIL.medium), fs = H / rows;
    while (rows > 16 && rows * Math.floor(W / (fs * ratio)) > MAX_CELLS) { rows -= 2; fs = H / rows; }
    probe.style.fontSize = fs + "px";
    cw = probe.getBoundingClientRect().width / 10 || fs * ratio; lh = fs; aspect = cw / lh;
    const cols = Math.max(16, Math.floor(W / cw));
    if (cols !== COLS || rows !== ROWS || !HASH) { COLS = cols; ROWS = rows; alloc(); }
    out.style.fontSize = fs + "px";
    const dpr = window.devicePixelRatio || 1;
    rib.style.width = COLS * cw + "px"; rib.style.height = ROWS * lh + "px";
    rib.width = Math.round(COLS * cw * dpr); rib.height = Math.round(ROWS * lh * dpr);
  }

  // ---------- colour ----------
  const rgb = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
  function shadeCol(base, s, cue) {
    const lit = 0.25 + 0.75 * s;
    let c = base.map(v => v * (0.5 + 0.5 * lit) + (255 - v) * 0.28 * Math.pow(s, 3));
    const fog = (1 - cue) * 0.45;
    return rgb(c.map((v, i) => v * (1 - fog) + PAL.paper[i] * fog));
  }
  const colourMode = () => (o.colour === "plddt" && !(G && G.hasPlddt)) ? "ss" : o.colour;
  const textColour = q => { if (q.color) return q.color; const m = colourMode(); return m === "ss" ? PAL.css[q.ss] : m === "plddt" ? PAL.css.P[q.pk] : null; };
  const baseOf = (q, kind) => { if (q.color) return hex(q.color); const m = colourMode(); return m === "ss" ? PAL[kind] : m === "plddt" ? PAL.P[q.pk] : PAL.mono; };

  // ---------- view helpers ----------
  const baseScale = () => G ? Math.min((COLS * 0.5 - 2) / G.R, (ROWS * 0.5 - 1) / (G.R * aspect)) : 1;
  function zoomAt(factor, cx = COLS / 2, cy = ROWS / 2) {
    const z2 = Math.max(ZMIN, Math.min(ZMAX, zoom * factor));
    if (z2 === zoom) return;
    const S1 = baseScale() * zoom, S2 = baseScale() * z2, ox = COLS / 2, oy = ROWS / 2;
    const ax = (cx - ox) / S1 - panX, ay = (oy - cy) / (S1 * aspect) - panY;
    panX = (cx - ox) / S2 - ax; panY = (oy - cy) / (S2 * aspect) - ay;
    zoom = z2; emit("zoom", zoom);
  }
  function panBy(dxPx, dyPx) { const S = baseScale() * zoom; panX += dxPx / cw / S; panY -= dyPx / lh / (S * aspect); }
  function cellAt(x, y) { const r = inner.getBoundingClientRect(); return [(x - r.left) / cw, (y - r.top) / lh]; }
  function resetView(rotation = false) { zoom = 1; panX = 0; panY = 0; if (rotation) { rotY = 0.6; rotX = -0.35; } emit("zoom", zoom); }
  const asciiAmount = u => o.layout === "ascii" ? 1 : o.layout === "ribbon" ? 0 : 1 - smooth(o.blendFrom, o.blendTo, o.layout === "lr" ? u : 1 - u);

  // ---------- frame ----------
  let lastBox = null;   // protein extent in cells, for cropped exports
  function render(dom = true) {
    if (!G || !HASH) return;
    const { pts, R } = G;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const rot = v => { const x = v[0] * cy + v[2] * sy, z0 = -v[0] * sy + v[2] * cy; return [x, v[1] * cx - z0 * sx, v[1] * sx + z0 * cx]; };
    const S = baseScale() * zoom, ox = COLS / 2, oy = ROWS / 2;
    const left = Math.max(0, ox + (panX - R) * S), right = Math.min(COLS, ox + (panX + R) * S), span = Math.max(1, right - left);
    lastBox = { x0: left, x1: right, y0: Math.max(0, oy - (panY + R) * S * aspect), y1: Math.min(ROWS, oy - (panY - R) * S * aspect) };

    // text: splat spheres along the spline into a z-buffered character grid
    zbuf.fill(-1e9);
    const P = new Array(pts.length);
    for (let k = 0; k < pts.length; k++) {
      const q = pts[k], v = rot(q.p); P[k] = v;
      const r = q.r, px = ox + (v[0] + panX) * S, py = oy - (v[1] + panY) * S * aspect, rx = r * S, ry = r * S * aspect;
      const i0 = Math.max(0, Math.floor(px - rx)), i1 = Math.min(COLS - 1, Math.ceil(px + rx));
      const j0 = Math.max(0, Math.floor(py - ry)), j1 = Math.min(ROWS - 1, Math.ceil(py + ry));
      for (let j = j0; j <= j1; j++) {
        const dy = (j + 0.5 - py) / ry;
        for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5 - px) / rx, d2 = dx * dx + dy * dy;
          if (d2 >= 1) continue;
          const nz = Math.sqrt(1 - d2), zf = v[2] + r * nz, c = j * COLS + i;
          if (zf <= zbuf[c]) continue;
          zbuf[c] = zf;
          const diff = Math.max(0, dx * LIGHT[0] - dy * LIGHT[1] + nz * LIGHT[2]);
          lbuf[c] = Math.min(1, 0.18 + 0.82 * diff + Math.pow(nz, 24) * 0.2);
          cbuf[c] = Math.max(0, Math.min(1, 0.55 + 0.45 * (zf + R) / (2 * R)));
          ibuf[c] = k;
        }
      }
    }

    // characters + the mask that hands cells over to the ribbon
    const night = o.theme === "night", n = ramp.length - 1, html = [], grid = [], md = mimg.data, useCol = colourMode() !== "mono";
    for (let j = 0; j < ROWS; j++) {
      let line = "", row = "", runCol = null, run = "";
      for (let i = 0; i < COLS; i++) {
        const c = j * COLS + i;
        const f = asciiAmount((i + 0.5 - left) / span);
        const showText = HASH[c] < f * 1.04 && f > 0.001;
        md[c * 4 + 3] = o.seam === "dither" ? (showText ? 0 : 255) : Math.round((1 - f) * 255);
        let ch = " ", col = null;
        if (zbuf[c] > -1e8 && showText) {
          const light = lbuf[c], cue = cbuf[c];
          let v = night ? light * cue : (0.42 + 0.58 * (1 - light)) * (0.25 + 0.75 * cue) * 1.1;
          v = Math.min(1, v) * (0.45 + 0.55 * f);
          ch = ramp[Math.max(1, Math.min(n, Math.round(v * n)))];
          col = useCol ? textColour(pts[ibuf[c]]) : null;
        }
        line += ch;
        if (useCol) {
          if (col !== runCol) { if (run) row += runCol ? `<span style="color:${runCol}">${run}</span>` : run; run = ""; runCol = col; }
          run += ch;
        }
      }
      if (useCol) { row += runCol ? `<span style="color:${runCol}">${run}</span>` : run; html.push(row); }
      grid.push(line);
    }
    lastGrid = grid;
    if (dom) { if (useCol) out.innerHTML = html.join("\n"); else out.textContent = grid.join("\n"); }

    // ribbon: painter's algorithm in the same projection
    const dpr = rib.width / (COLS * cw);
    const kpx = S * aspect * lh * dpr, OX = ox * cw * dpr, OY = oy * lh * dpr;
    const X = v => OX + (v[0] + panX) * kpx, Y = v => OY - (v[1] + panY) * kpx;
    const polys = [];
    if (o.layout !== "ascii") {
      const SN = new Array(pts.length), NN = new Array(pts.length);
      for (let k = 0; k < pts.length; k++) { SN[k] = rot(pts[k].side); NN[k] = rot(pts[k].nrm); }
      let cylRun = null;
      const flushCyl = () => {
        if (!cylRun || cylRun.path.length < 2) { cylRun = null; return; }
        const path = cylRun.path, zc = cylRun.z / cylRun.n, cue = Math.max(0, Math.min(1, (zc + R) / (2 * R)));
        const a = path[0], b = path[path.length - 1];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        if (nx * -LIGHT[0] + ny * LIGHT[1] > 0) { nx = -nx; ny = -ny; }
        const w = 2 * shape.cylR * kpx, col = cylRun.col;
        polys.push({ z: zc, cyl: path, w, off: [nx * w * 0.2, ny * w * 0.2],
                     c0: shadeCol(col, 0.3, cue), c1: shadeCol(col, 0.62, cue), c2: shadeCol(col, 0.95, cue) });
        cylRun = null;
      };
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        if (a.gap) { flushCyl(); continue; }
        const A = P[k], B = P[k + 1], zc = (A[2] + B[2]) / 2, cue = Math.max(0, Math.min(1, (zc + R) / (2 * R)));
        if (a.kind === "Hc" && b.kind === "Hc") {
          if (!cylRun) cylRun = { path: [[X(A), Y(A)]], z: 0, n: 0, col: baseOf(a, "H") };
          cylRun.path.push([X(B), Y(B)]); cylRun.z += zc; cylRun.n++;
          continue;
        }
        flushCyl();
        if (a.kind === "C" || a.kind === "Hc" || a.wOut === 0) {
          polys.push({ z: zc, line: [X(A), Y(A), X(B), Y(B)], w: 2 * shape.coilR * kpx, c: shadeCol(baseOf(a, "C"), 0.55, cue) });
          continue;
        }
        const wa = a.wOut, wb = (b.res === a.res || b.kind === a.kind) ? b.wIn : 0.04;
        const Ta = a.th, Tb = b.kind === a.kind ? b.th : a.th;
        const sa = SN[k], sb = SN[k + 1], na = NN[k], nb = NN[k + 1];
        const c1 = add(A, mul(sa, wa)), c2 = add(A, mul(sa, -wa)), c3 = add(B, mul(sb, -wb)), c4 = add(B, mul(sb, wb));
        const nf = norm(add(na, nb)), col = baseOf(a, a.kind);
        polys.push({ z: zc, q: [c1, c2, c3, c4], c: shadeCol(col, Math.abs(dot(nf, LIGHT)), cue) });
        if (Math.abs(nf[2]) < 0.9 && Ta > 0.02) {
          for (const sg of [1, -1]) {
            const ea = add(A, mul(sa, sg * wa)), eb = add(B, mul(sb, sg * wb));
            const e = [add(ea, mul(na, Ta)), add(ea, mul(na, -Ta)), add(eb, mul(nb, -Tb)), add(eb, mul(nb, Tb))];
            polys.push({ z: zc + sg * 0.01 * (sa[2] + sb[2]), q: e, c: shadeCol(col, Math.abs(dot(mul(norm(add(sa, sb)), sg), LIGHT)) * 0.7, cue * 0.95) });
          }
        }
      }
      flushCyl();
      polys.sort((p, q) => p.z - q.z);
    }
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, rib.width, rib.height);
    rctx.lineJoin = "round"; rctx.lineCap = "round";
    for (const p of polys) {
      if (p.cyl) {
        const trace = (dx, dy) => { rctx.beginPath(); rctx.moveTo(p.cyl[0][0] + dx, p.cyl[0][1] + dy); for (let m = 1; m < p.cyl.length; m++) rctx.lineTo(p.cyl[m][0] + dx, p.cyl[m][1] + dy); };
        rctx.strokeStyle = p.c0; rctx.lineWidth = p.w; trace(0, 0); rctx.stroke();
        rctx.strokeStyle = p.c1; rctx.lineWidth = p.w * 0.78; trace(p.off[0] * 0.5, p.off[1] * 0.5); rctx.stroke();
        rctx.strokeStyle = p.c2; rctx.lineWidth = p.w * 0.3; trace(p.off[0] * 1.6, p.off[1] * 1.6); rctx.stroke();
      } else if (p.line) {
        rctx.strokeStyle = p.c; rctx.lineWidth = p.w;
        rctx.beginPath(); rctx.moveTo(p.line[0], p.line[1]); rctx.lineTo(p.line[2], p.line[3]); rctx.stroke();
      } else {
        rctx.fillStyle = p.c; rctx.strokeStyle = p.c; rctx.lineWidth = 0.8 * dpr;
        rctx.beginPath(); rctx.moveTo(X(p.q[0]), Y(p.q[0]));
        for (let m = 1; m < 4; m++) rctx.lineTo(X(p.q[m]), Y(p.q[m]));
        rctx.closePath(); rctx.fill(); rctx.stroke();
      }
    }
    mctx.putImageData(mimg, 0, 0);
    rctx.globalCompositeOperation = "destination-in";
    rctx.imageSmoothingEnabled = o.seam === "soft";
    rctx.drawImage(mask, 0, 0, rib.width, rib.height);
    rctx.globalCompositeOperation = "source-over";
  }

  // ---------- animation (paused while off-screen) ----------
  let raf = 0, prev = performance.now(), visible = true, dragging = false, destroyed = false, capturing = false;
  function loop(t) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.05, (t - prev) / 1000); prev = t;
    if (capturing) { raf = 0; return; }
    if (!dragging) rotY += o.spin * dt * 1.6;
    render();
    if (visible) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && visible && !destroyed) { prev = performance.now(); raf = requestAnimationFrame(loop); } };
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); kick(); }) : null;
  if (io) io.observe(root);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { fit(); kick(); }) : null;
  if (ro) ro.observe(root); else window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!destroyed) fit(); });

  // ---------- interaction: drag rotate · shift/alt/right-drag pan · wheel/pinch zoom · dblclick reset ----------
  const ptrs = new Map();
  let pinch = null, panning = false, lx = 0, ly = 0;
  root.addEventListener("contextmenu", e => { if (o.interactive) e.preventDefault(); });
  root.addEventListener("pointerdown", e => {
    if (!o.interactive) return;
    root.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    } else { dragging = true; panning = e.shiftKey || e.altKey || e.button === 2; lx = e.clientX; ly = e.clientY; root.style.cursor = "grabbing"; }
  });
  root.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      panBy(m[0] - pinch.m[0], m[1] - pinch.m[1]);
      zoomAt(d / Math.max(1, pinch.d), ...cellAt(m[0], m[1]));
      pinch = { d, m };
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (panning) panBy(dx, dy);
    else { rotY += dx * 0.008; rotX = Math.max(-1.5, Math.min(1.5, rotX + dy * 0.008)); }
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { dragging = false; root.style.cursor = o.interactive ? "grab" : "default"; }
    else if (ptrs.size === 1) { const [p] = ptrs.values(); lx = p[0]; ly = p[1]; panning = false; }
  };
  root.addEventListener("pointerup", endPtr);
  root.addEventListener("pointercancel", endPtr);
  root.addEventListener("wheel", e => {
    if (!o.interactive) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-dy * 0.001), ...cellAt(e.clientX, e.clientY));
  }, { passive: false });
  root.addEventListener("dblclick", () => { if (o.interactive) resetView(); });

  // ---------- export helpers ----------
  function cropBox(crop) {
    let x0 = 0, x1 = COLS, y0 = 0, y1 = ROWS;
    if (crop && lastBox) {
      x0 = Math.max(0, Math.floor(lastBox.x0) - 1); x1 = Math.min(COLS, Math.ceil(lastBox.x1) + 1);
      y0 = Math.max(0, Math.floor(lastBox.y0) - 1); y1 = Math.min(ROWS, Math.ceil(lastBox.y1) + 1);
    }
    return { i0: x0, i1: x1, j0: y0, j1: y1, w: (x1 - x0) * cw, h: (y1 - y0) * lh };
  }
  function composeFrame(ctx, box, scale, pad) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = PAL.css.bg; ctx.fillRect(0, 0, box.w + pad * 2, box.h + pad * 2);
    const dpr = rib.width / (COLS * cw);
    ctx.drawImage(rib, box.i0 * cw * dpr, box.j0 * lh * dpr, box.w * dpr, box.h * dpr, pad, pad, box.w, box.h);
    const cs = getComputedStyle(out);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.textBaseline = "top";
    for (let j = box.j0; j < box.j1; j++) {
      const line = lastGrid[j]; if (!line) continue;
      for (let i = box.i0; i < box.i1; i++) {
        const ch = line[i]; if (!ch || ch === " ") continue;
        ctx.fillStyle = (G && textColour(G.pts[ibuf[j * COLS + i]])) || PAL.css.ink;
        ctx.fillText(ch, pad + (i - box.i0) * cw, pad + (j - box.j0) * lh);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- public API ----------
  let loadToken = 0, aborter = null;
  function setStructure(parsed, meta = {}) {
    G = buildGeometry(parsed, shape);
    lastParsed = parsed;
    info = { title: meta.title || parsed.title || "Structure", sub: meta.sub || "", residues: G.N, meanPlddt: G.hasPlddt ? G.meanP : null,
             hasPlddt: G.hasPlddt, ssFromGeometry: G.ssAuto, chain: parsed.chain, entryUrl: meta.entryUrl || null, acc: meta.acc || null };
    root.setAttribute("aria-label", `${info.title}: rotating protein structure drawn as text and ribbon`);
    resetView(true);
    emit("load", info);
    kick();
    return info;
  }

  const api = {
    get options() { return { ...o, shape: { ...shape } }; },
    get info() { return info; },
    get zoom() { return zoom; },
    get element() { return root; },
    /** Update any display option (see DEFAULTS). */
    set(opts = {}) {
      const needsFit = "detail" in opts && opts.detail !== o.detail;
      Object.assign(o, opts);
      if (opts.shape) api.setShape(opts.shape);
      applyStyle();
      if (needsFit) fit();
      kick();
      return api;
    },
    /** Update ribbon shape parameters (see SHAPE_DEFAULT); rebuilds geometry. */
    setShape(partial = {}) {
      shape = { ...shape, ...partial };
      if (lastParsed) G = buildGeometry(lastParsed, shape);
      kick();
      return api;
    },
    resetShape() { return api.setShape(SHAPE_DEFAULT); },
    setStructure,
    loadText(text, meta) { loadToken++; return setStructure(parseStructure(text), meta); },
    async loadFile(file) {
      const token = ++loadToken;
      const { parsed, afId } = await readStructureFile(file);
      if (token !== loadToken) return null;
      return setStructure(parsed, {
        title: afId ? afId.acc : file.name.replace(/\.(pdb|cif|mmcif|ent)(\.gz)?$/i, ""),
        sub: [afId ? `AF-${afId.acc}-F${afId.frag}` : (parsed.title || "local file"), `chain ${parsed.chain}`].join(" · "),
      });
    },
    /** Fetch a model from AlphaFold DB by UniProt accession. Rejects with AFDBError. */
    async loadAccession(acc) {
      const token = ++loadToken;
      if (aborter) aborter.abort();
      aborter = typeof AbortController === "function" ? new AbortController() : null;
      const { parsed, meta, entryUrl, acc: a } = await fetchAFDB(acc, { signal: aborter && aborter.signal });
      if (token !== loadToken) return null;
      return setStructure(parsed, { ...describeAFDB(meta, a), entryUrl, acc: a });
    },
    loadDefault() { loadToken++; return setStructure(parsePDB(KRAS_6GJ8), { title: "KRAS G12D", sub: "PDB 6GJ8 · chain A" }); },
    zoomBy(f) { zoomAt(f); kick(); return api; },
    /** Set the viewing angle in radians (y = spin axis, x = tilt). */
    setRotation(y, x = rotX) { rotY = y; rotX = Math.max(-1.5, Math.min(1.5, x)); kick(); return api; },
    get rotation() { return { y: rotY, x: rotX }; },
    resetView() { resetView(); kick(); return api; },
    /** Current frame as plain text. */
    text() { return lastGrid.join("\n"); },
    /** Current frame (ribbon + text) as a PNG data URL. crop: trim to the protein. */
    snapshot({ scale = 2, pad = 40, crop = true } = {}) {
      const box = cropBox(crop), c = document.createElement("canvas");
      c.width = Math.round((box.w + pad * 2) * scale); c.height = Math.round((box.h + pad * 2) * scale);
      composeFrame(c.getContext("2d"), box, scale, pad);
      return c.toDataURL("image/png");
    },
    /**
     * Record one full turn as an animated GIF. Each frame is rendered at an exact angle,
     * so the loop is seamless. Resolves to a Blob (image/gif).
     *   frames: frames per turn · delay: ms per frame · width: output px · onProgress(0..1) · signal: AbortSignal
     */
    async recordGif({ frames = 60, delay = 50, width = 720, pad = 24, crop = true, onProgress, signal } = {}) {
      if (!G) throw new Error("Nothing loaded");
      if (capturing) throw new Error("Already recording");
      capturing = true;
      const y0 = rotY, x0 = rotX, tick = () => new Promise(r => setTimeout(r, 0));
      try {
        render(false);
        const box = cropBox(crop), scale = width / (box.w + pad * 2);
        const W = Math.round(width), H = Math.round((box.h + pad * 2) * scale);
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        const frameAt = i => { rotY = y0 + (2 * Math.PI * i) / frames; rotX = x0; render(true); composeFrame(ctx, box, scale, pad); return ctx.getImageData(0, 0, W, H).data; };
        // one shared palette from a few spread-out frames keeps colours from flickering
        const picks = [0, 0.25, 0.5, 0.75].map(f => Math.floor(f * frames));
        const sample = new Uint8ClampedArray(W * H * 4 * picks.length);
        picks.forEach((i, k) => sample.set(frameAt(i), k * W * H * 4));
        const palette = quantize(sample, 256);
        const gif = GIFEncoder();
        for (let i = 0; i < frames; i++) {
          if (signal && signal.aborted) throw new DOMException("Recording cancelled", "AbortError");
          gif.writeFrame(applyPalette(frameAt(i), palette), W, H, { palette, delay, repeat: 0 });
          if (onProgress) onProgress((i + 1) / frames);
          await tick();
        }
        gif.finish();
        return new Blob([gif.bytes()], { type: "image/gif" });
      } finally {
        rotY = y0; rotX = x0; capturing = false; render(); kick();
      }
    },
    palette() { return { ...PAL.css }; },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return () => { listeners[ev] = listeners[ev].filter(f => f !== fn); }; },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (io) io.disconnect(); if (ro) ro.disconnect(); else window.removeEventListener("resize", fit);
      if (aborter) aborter.abort();
      root.remove();
    },
  };

  applyStyle();
  fit();
  kick();
  return api;
}
