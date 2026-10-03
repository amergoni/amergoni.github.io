/*
  Interactive DEA explainer: one input (spending per pupil) and one output (share of proficient pupils).
  Scores follow the Farrell definitions used by the R package Benchmarking:
  input orientation  -> theta <= 1 (share of the input that would be enough)
  output orientation -> phi  >= 1 (factor by which the output could grow); shown to readers as 1/phi.
*/
const DEA = (function () {
  // Constant returns to scale: the frontier is a ray from the origin through the best output/input ratio
  function crs(pts, o) {
    let best = -Infinity, peers = [];
    pts.forEach((p, j) => {
      const r = p.y / p.x;
      if (r > best + 1e-12) { best = r; peers = [j]; } else if (Math.abs(r - best) <= 1e-12) peers.push(j);
    });
    const theta = (pts[o].y / pts[o].x) / best;
    return { theta, phi: 1 / theta, peersIn: peers, peersOut: peers };
  }

  // Variable returns to scale (convex hull + free disposability). With one input and one output an optimal
  // solution uses at most two units, so checking every single unit and every pair is exact.
  function vrs(pts, o) {
    const { x: xo, y: yo } = pts[o];
    let bestX = Infinity, peersIn = [];
    let bestY = -Infinity, peersOut = [];
    pts.forEach((p, j) => {
      if (p.y >= yo && p.x < bestX) { bestX = p.x; peersIn = [j]; }
      if (p.x <= xo && p.y > bestY) { bestY = p.y; peersOut = [j]; }
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        if (a.y < yo && b.y > yo) { // input side: mix two units to produce exactly yo
          const x = a.x + (b.x - a.x) * (yo - a.y) / (b.y - a.y);
          if (x < bestX - 1e-12) { bestX = x; peersIn = [i, j]; }
        }
        if (a.x < xo && b.x > xo) { // output side: mix two units that use exactly xo
          const y = a.y + (b.y - a.y) * (xo - a.x) / (b.x - a.x);
          if (y > bestY + 1e-12) { bestY = y; peersOut = [i, j]; }
        }
      }
    }
    return { theta: bestX / xo, phi: bestY / yo, peersIn, peersOut };
  }

  // Free disposal hull: compare only with real units that do at least as well (no mixing)
  function fdh(pts, o) {
    const { x: xo, y: yo } = pts[o];
    let bestX = Infinity, bestY = -Infinity, peersIn = [], peersOut = [];
    pts.forEach((p, j) => {
      if (p.y >= yo && p.x < bestX) { bestX = p.x; peersIn = [j]; }
      if (p.x <= xo && p.y > bestY) { bestY = p.y; peersOut = [j]; }
    });
    return { theta: bestX / xo, phi: bestY / yo, peersIn, peersOut };
  }

  // Frontier outline as a list of [x, y] points, for drawing up to xMax / yMax
  function frontier(pts, model, xMax, yMax) {
    if (model === "crs") {
      const s = Math.max(...pts.map(p => p.y / p.x));
      const x = Math.min(xMax, yMax / s);
      return [[0, 0], [x, x * s]];
    }
    const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b);
    const yAt = x => {
      // best output achievable with input x under the chosen model
      let best = -Infinity;
      pts.forEach(p => { if (p.x <= x + 1e-12) best = Math.max(best, p.y); });
      if (model === "vrs") {
        for (const a of pts) for (const b of pts) {
          if (a.x < x && b.x > x) best = Math.max(best, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
        }
      }
      return best;
    };
    const line = [[xs[0], 0]];
    if (model === "vrs") {
      for (const x of xs) line.push([x, yAt(x)]);
    } else {
      let prev = 0;
      for (const x of xs) {
        const y = yAt(x);
        if (y > prev) { line.push([x, prev], [x, y]); prev = y; }
      }
    }
    line.push([xMax, yAt(xMax)]);
    return line.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  }

  return { crs, vrs, fdh, frontier };
})();

// ---- Interactive chart ----
(function () {
  const svg = document.getElementById("dea-chart");
  if (!svg) return;

  const START = [
    { name: "A", x: 5.0, y: 52 }, { name: "B", x: 6.5, y: 70 }, { name: "C", x: 8.0, y: 76 },
    { name: "D", x: 9.5, y: 84 }, { name: "E", x: 7.0, y: 55 }, { name: "F", x: 11.0, y: 80 },
    { name: "G", x: 12.5, y: 90 }, { name: "H", x: 10.0, y: 62 }
  ];
  const X_MAX = 15, Y_MAX = 100;
  const W = 640, H = 420, M = { l: 66, r: 18, t: 16, b: 50 };
  const sx = x => M.l + x / X_MAX * (W - M.l - M.r);
  const sy = y => H - M.b - y / Y_MAX * (H - M.t - M.b);
  const ix = px => (px - M.l) / (W - M.l - M.r) * X_MAX;
  const iy = py => (H - M.b - py) / (H - M.t - M.b) * Y_MAX;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  let schools = START.map(s => ({ ...s }));
  let model = "vrs", orient = "in", selected = 7;
  const fmtK = v => "€" + v.toFixed(1) + "k";
  const fmtP = v => Math.round(v) + "%";

  // Static layers: grid and axes
  const gGrid = el("g", { class: "dea-grid" }, svg);
  for (let x = 0; x <= X_MAX; x += 2.5) {
    el("line", { x1: sx(x), x2: sx(x), y1: sy(0), y2: sy(Y_MAX) }, gGrid);
    el("text", { x: sx(x), y: sy(0) + 20, "text-anchor": "middle" }, gGrid).textContent = x === 0 ? "0" : "€" + x + "k";
  }
  for (let y = 0; y <= Y_MAX; y += 20) {
    el("line", { x1: sx(0), x2: sx(X_MAX), y1: sy(y), y2: sy(y) }, gGrid);
    el("text", { x: sx(0) - 8, y: sy(y) + 4, "text-anchor": "end" }, gGrid).textContent = y + "%";
  }
  el("text", { class: "dea-axis-title", x: (sx(0) + sx(X_MAX)) / 2, y: H - 6, "text-anchor": "middle" }, gGrid).textContent = "Spending per pupil (input)";
  el("text", { class: "dea-axis-title", transform: `translate(12 ${(sy(0) + sy(Y_MAX)) / 2}) rotate(-90)`, "text-anchor": "middle" }, gGrid).textContent = "Pupils reaching proficiency (output)";

  const gArea = el("g", {}, svg);
  const gFrontier = el("g", {}, svg);
  const gProj = el("g", {}, svg);
  const gPts = el("g", {}, svg);

  function scores() {
    const f = DEA[model];
    return schools.map((s, i) => {
      const r = f(schools, i);
      const eff = orient === "in" ? r.theta : 1 / r.phi;
      return { ...r, eff: Math.min(1, eff), peers: orient === "in" ? r.peersIn : r.peersOut };
    });
  }

  function render() {
    const sc = scores();
    const line = DEA.frontier(schools, model, X_MAX, Y_MAX);
    const pts = line.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ");

    gArea.innerHTML = "";
    gFrontier.innerHTML = "";
    gProj.innerHTML = "";
    const last = line[line.length - 1];
    el("polygon", { class: "dea-area", points: `${pts} ${sx(last[0])},${sy(0)}` }, gArea);
    el("polyline", { class: "dea-frontier", points: pts }, gFrontier);

    // Selected school: arrow to its target on the frontier
    const s = schools[selected], r = sc[selected];
    const tx = orient === "in" ? s.x * r.theta : s.x;
    const ty = orient === "in" ? s.y : Math.min(s.y * r.phi, Y_MAX);
    if (r.eff < 0.999) {
      // Stop the arrow just short of the target dot so the arrowhead stays visible
      const x1 = sx(s.x), y1 = sy(s.y), x2 = sx(tx), y2 = sy(ty);
      const len = Math.hypot(x2 - x1, y2 - y1), cut = Math.min(9, len / 2);
      el("line", { class: "dea-proj", x1, y1, x2: x2 - (x2 - x1) / len * cut, y2: y2 - (y2 - y1) / len * cut, "marker-end": "url(#dea-arrow)" }, gProj);
      el("circle", { class: "dea-target", cx: sx(tx), cy: sy(ty), r: 5 }, gProj);
    }

    // Points (reuse elements so a drag in progress is not interrupted)
    schools.forEach((p, i) => {
      let g = gPts.querySelector(`[data-i="${i}"]`);
      if (!g) {
        g = el("g", { class: "dea-pt", "data-i": i, tabindex: 0, role: "button" }, gPts);
        el("circle", { class: "hit", r: 18 }, g);
        el("circle", { class: "dot", r: 9 }, g);
        el("text", { "text-anchor": "middle", dy: "0.35em" }, g);
        attachDrag(g, i);
      }
      g.setAttribute("transform", `translate(${sx(p.x)} ${sy(p.y)})`);
      g.setAttribute("aria-label", `School ${p.name}: ${fmtK(p.x)} per pupil, ${fmtP(p.y)} proficient, efficiency ${fmtP(sc[i].eff * 100)}. Use arrow keys to move.`);
      g.classList.toggle("efficient", sc[i].eff >= 0.999);
      g.classList.toggle("selected", i === selected);
      g.querySelector("text").textContent = p.name;
    });

    renderPanel(sc);
  }

  function renderPanel(sc) {
    const s = schools[selected], r = sc[selected];
    const peers = r.peers.filter(j => j !== selected).map(j => "School " + schools[j].name);
    const peersText = peers.length ? ` Its benchmark${peers.length > 1 ? "s are" : " is"} ${peers.join(" and ")}.` : "";
    let text;
    if (r.eff >= 0.999) {
      text = `School ${s.name} is on the frontier: no other school, or mix of schools, does better with its resources. It scores 100%.`;
    } else if (orient === "in") {
      text = `School ${s.name} could reach the same results (${fmtP(s.y)} proficient) with ${fmtK(s.x * r.theta)} per pupil instead of ${fmtK(s.x)}. It uses its budget at ${fmtP(r.eff * 100)} efficiency.` + peersText;
    } else {
      text = `With the same budget (${fmtK(s.x)} per pupil), School ${s.name} could reach ${fmtP(Math.min(s.y * r.phi, 100))} proficient instead of ${fmtP(s.y)}. It achieves ${fmtP(r.eff * 100)} of its potential.` + peersText;
    }
    document.getElementById("dea-selected").innerHTML =
      `<p class="label">Selected</p><h3>School ${s.name} · ${fmtP(r.eff * 100)}</h3><p>${text}</p>`;

    const ranking = schools.map((p, i) => ({ p, i, e: sc[i].eff })).sort((a, b) => b.e - a.e);
    const list = document.getElementById("dea-ranking");
    list.innerHTML = ranking.map(({ p, i, e }) =>
      `<li><button type="button" data-i="${i}" aria-pressed="${i === selected}">` +
      `<span class="n">${p.name}</span><span class="meter"><span style="width:${(e * 100).toFixed(1)}%"></span></span>` +
      `<span class="v">${fmtP(e * 100)}</span></button></li>`).join("");
  }

  document.getElementById("dea-ranking").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) { selected = +b.dataset.i; render(); }
  });

  // Dragging: remember which school is held, and follow the pointer anywhere on the page
  let dragging = -1;
  function moveTo(i, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    schools[i].x = Math.min(X_MAX - 0.3, Math.max(1, ix(p.x)));
    schools[i].y = Math.min(Y_MAX - 2, Math.max(5, iy(p.y)));
    render();
  }
  window.addEventListener("pointermove", e => { if (dragging >= 0) moveTo(dragging, e.clientX, e.clientY); });
  const stopDrag = () => {
    if (dragging < 0) return;
    gPts.querySelector(`[data-i="${dragging}"]`)?.classList.remove("dragging");
    dragging = -1;
  };
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  function attachDrag(g, i) {
    g.addEventListener("pointerdown", e => {
      e.preventDefault();
      selected = i;
      dragging = i;
      g.classList.add("dragging");
      render();
    });
    g.addEventListener("focus", () => { if (selected !== i) { selected = i; render(); } });
    g.addEventListener("keydown", e => {
      const step = e.shiftKey ? 5 : 1;
      const moves = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      schools[i].x = Math.min(X_MAX - 0.3, Math.max(1, schools[i].x + m[0] * step));
      schools[i].y = Math.min(Y_MAX - 2, Math.max(5, schools[i].y + m[1] * step));
      render();
    });
  }

  // Segmented controls
  function segmented(id, set) {
    const group = document.getElementById(id);
    group.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      group.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      set(b.dataset.v);
      document.querySelectorAll(`[data-show-${id}]`).forEach(n => { n.hidden = n.getAttribute(`data-show-${id}`) !== b.dataset.v; });
      render();
    });
  }
  segmented("dea-model", v => { model = v; });
  segmented("dea-orient", v => { orient = v; });

  function rebuildPoints() { gPts.innerHTML = ""; render(); }

  document.getElementById("dea-add").addEventListener("click", () => {
    const used = new Set(schools.map(s => s.name));
    const name = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find(c => !used.has(c));
    if (!name) return;
    schools.push({ name, x: 3 + Math.random() * 10, y: 25 + Math.random() * 55 });
    selected = schools.length - 1;
    rebuildPoints();
  });
  document.getElementById("dea-shuffle").addEventListener("click", () => {
    schools.forEach(s => { s.x = 3 + Math.random() * 10; s.y = 25 + Math.random() * 65; });
    rebuildPoints();
  });
  document.getElementById("dea-reset").addEventListener("click", () => {
    schools = START.map(s => ({ ...s }));
    selected = 7;
    rebuildPoints();
  });

  render();
})();
