/*
  Places on the home page map.
  To add a place: copy one block, set the country code (ISO 3166 numeric, e.g. "056" = Belgium),
  the city coordinates [latitude, longitude] and the items. Types: work, study, visit, talk, meeting, project, paper, teaching.
*/
const PLACES = [
  {
    code: "056", country: "Belgium", city: "Leuven", at: [50.88, 4.70],
    items: [
      ["work", "Senior Researcher at HIVA – KU Leuven (2023 – present)"],
      ["study", "PhD in Economics, KU Leuven (2018 – 2023)"],
      ["paper", "Long-term poverty dynamics in Belgium on linked administrative data (book chapter, 2024; working paper)"],
      ["project", "Re-InVEST.be – anti-poverty policies in Belgium (BELSPO)"],
      ["talk", "ESPAnet Belgium seminar, Leuven (2025) · Irish College Leuven (2025) · WeLaR Final Conference, Brussels (2025)"]
    ]
  },
  {
    code: "380", country: "Italy", city: "Pisa", at: [43.72, 10.40],
    items: [
      ["study", "BSc and MSc in Economics, University of Pisa and Sant'Anna School of Advanced Studies"],
      ["visit", "Politecnico di Milano (Fall 2021)"],
      ["paper", "School principals' management and efficiency in Italian schools (EJOR, 2026)"],
      ["talk", "ESPAnet Conference, Milan (2025) · European University Institute, Florence (2026)"],
      ["meeting", "HEQUITY toolkit development meeting, Padova (June 2026) · COST Action EfficientJustice meeting, Canazei"],
      ["teaching", "PhD classes at IMT Lucca (2022) and Politecnico di Milano (2021)"]
    ]
  },
  {
    code: "620", country: "Portugal", city: "Porto", at: [41.15, -8.61],
    items: [
      ["visit", "University of Porto (January – March 2021)"],
      ["talk", "EWEPA XVII – European Workshop on Efficiency and Productivity Analysis, Porto (June 2022)"],
      ["paper", "Environmental performance of Portuguese water, wastewater and waste utilities (Utilities Policy, 2022)"]
    ]
  },
  {
    code: "300", country: "Greece", city: "Athens", at: [37.98, 23.73],
    items: [
      ["talk", "Presentation at EURO 2021 – 31st European Conference on Operational Research, Athens (July 2021)"],
      ["meeting", "COST Action EfficientJustice meeting, Thessaloniki"]
    ]
  },
  {
    code: "792", country: "Turkey", city: "Sakarya", at: [40.69, 30.44],
    items: [
      ["project", "HEQUITY (Erasmus+): international training session at Sakarya University, 21 – 25 September 2026"]
    ]
  },
  {
    code: "246", country: "Finland", city: "Espoo (Helsinki)", at: [60.18, 24.83],
    items: [
      ["talk", "Presentation at EURO 2022 – 32nd European Conference on Operational Research, Aalto University, Espoo (July 2022)"]
    ]
  },
  {
    code: "826", country: "United Kingdom", city: "London", at: [51.51, -0.13],
    items: [
      ["talk", "EWEPA XVI – European Workshop on Efficiency and Productivity Analysis, London (June 2019)"]
    ]
  },
  {
    code: "724", country: "Spain", city: "Madrid", at: [40.42, -3.70],
    items: [
      ["visit", "Complutense University of Madrid (May – June 2021)"],
      ["talk", "ECSR Conference, Barcelona (2024)"]
    ]
  },
  {
    code: "348", country: "Hungary", city: "Budapest", at: [47.50, 19.04],
    items: [
      ["visit", "TARKI Social Research Institute (August 2021, InGRID Horizon 2020 grant)"]
    ]
  },
  {
    code: "604", country: "Peru", city: "Lima", at: [-12.05, -77.04],
    items: [
      ["paper", "Performance of the Peruvian education system from a governance perspective (Socio-Economic Planning Sciences, 2024)"],
      ["teaching", "Seminar “AI as a tool for qualitative and quantitative research”, Universidad del Pacífico (2025)"]
    ]
  },
  {
    code: "784", country: "United Arab Emirates", city: "Sharjah", at: [25.35, 55.42],
    items: [
      ["project", "Consultancy for UNESCO RCEP: “Measuring and Improving Productive Efficiency in Education in the UAE”"]
    ]
  }
];

const TYPE_LABELS = {
  work: "Work", study: "Study", visit: "Research visit", talk: "Conference & talks", meeting: "Project meeting",
  project: "Project", paper: "Research on this country", teaching: "Teaching"
};

// ---- Renderer: dotted world map on a canvas, with a "torch" that lights up dots near the cursor ----
(function () {
  const canvas = document.getElementById("world-canvas");
  const tip = document.getElementById("map-tip");
  const panel = document.getElementById("place-panel");
  const list = document.getElementById("place-list");
  if (!canvas || !panel || !list || typeof WORLD === "undefined") return;

  const ctx = canvas.getContext("2d");
  const { cols, rows, top, step, runs, ids, names } = WORLD;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Muted blue/teal patchwork for countries, gold for places connected to my work
  const PALETTE = ["#1f3f7c", "#27508f", "#2f639f", "#3a77a8", "#4a88a9", "#5a96a5", "#34598f", "#43709e"];
  const GOLD = [234, 175, 0];
  const TORCH = [255, 214, 90];
  const TORCH_RADIUS = 85; // CSS pixels

  const visitedIndex = new Map(); // country index -> place index
  PLACES.forEach((p, i) => {
    const ci = ids.indexOf(p.code);
    if (ci >= 0) visitedIndex.set(ci, i);
  });

  // Grid lookup: country index per cell (-1 = sea), plus a flat list of dots
  const grid = new Int16Array(cols * rows).fill(-1);
  const dots = [];
  runs.forEach((r, row) => {
    for (let k = 0; k < r.length; k += 3) {
      for (let c = r[k]; c < r[k] + r[k + 1]; c++) {
        grid[row * cols + c] = r[k + 2];
        dots.push([c, row, r[k + 2]]);
      }
    }
  });

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const baseColor = ci => visitedIndex.has(ci) ? GOLD : hex(PALETTE[(ci * 5) % PALETTE.length]);
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  let W = 0, H = 0, cell = 0, dpr = 1, selected = 0;
  let mouse = null;
  const base = document.createElement("canvas");
  const bctx = base.getContext("2d");

  const toXY = ([lat, lon]) => [(lon + 180) / 360 * W, (top - lat) / (rows * step) * H];
  const dotXY = (c, r) => [(c + .5) * cell, (r + .5) * cell];

  function resize() {
    W = canvas.clientWidth;
    cell = W / cols;
    H = cell * rows;
    dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, base]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    canvas.style.height = H + "px";
    drawBase();
    draw(performance.now());
  }

  function drawBase() {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, W, H);
    const r = Math.max(cell * .36, .8);
    const selectedCi = ids.indexOf(PLACES[selected].code);
    for (const [c, row, ci] of dots) {
      const [x, y] = dotXY(c, row);
      const isVisited = visitedIndex.has(ci);
      bctx.fillStyle = ci === selectedCi ? "#fff4c2" : rgb(baseColor(ci), isVisited ? 1 : .85);
      bctx.beginPath();
      bctx.arc(x, y, isVisited ? r * 1.15 : r, 0, 6.2832);
      bctx.fill();
    }
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0, W, H);

    // Torch: re-draw only the dots within reach of the cursor, brighter and larger
    if (mouse) {
      const r0 = Math.max(cell * .36, .8);
      const span = Math.ceil(TORCH_RADIUS / cell);
      const mc = Math.floor(mouse.x / cell), mr = Math.floor(mouse.y / cell);
      for (let row = Math.max(0, mr - span); row <= Math.min(rows - 1, mr + span); row++) {
        for (let c = Math.max(0, mc - span); c <= Math.min(cols - 1, mc + span); c++) {
          const ci = grid[row * cols + c];
          if (ci < 0) continue;
          const [x, y] = dotXY(c, row);
          const d = Math.hypot(x - mouse.x, y - mouse.y);
          if (d > TORCH_RADIUS) continue;
          const f = Math.pow(1 - d / TORCH_RADIUS, 1.25);
          ctx.fillStyle = rgb(mix(baseColor(ci), TORCH, f));
          ctx.beginPath();
          ctx.arc(x, y, r0 * (1 + f * .9), 0, 6.2832);
          ctx.fill();
        }
      }
    }

    // Markers with a pulsing ring, scaled to the map size
    const mr = Math.min(4, Math.max(2.4, cell * 1.4));
    PLACES.forEach((p, i) => {
      const [x, y] = toXY(p.at);
      const on = i === selected;
      if (!reduceMotion) {
        const phase = ((t / 1600) + i * .13) % 1;
        ctx.strokeStyle = rgb(GOLD, (1 - phase) * .8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, mr + phase * mr * 3, 0, 6.2832);
        ctx.stroke();
      }
      ctx.fillStyle = on ? "#ffffff" : rgb(GOLD);
      ctx.strokeStyle = "#0a2540";
      ctx.lineWidth = mr > 3 ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(x, y, on ? mr + 1 : mr, 0, 6.2832);
      ctx.fill();
      ctx.stroke();
    });
  }

  function loop(t) {
    draw(t);
    if (!reduceMotion) requestAnimationFrame(loop);
  }

  // What is under the cursor: a nearby marker first, otherwise the country of the nearest dot
  function hitTest(x, y) {
    let best = -1, bestD = 12;
    PLACES.forEach((p, i) => {
      const [px, py] = toXY(p.at);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) return { place: best, ci: ids.indexOf(PLACES[best].code) };
    const c = Math.floor(x / cell), r = Math.floor(y / cell);
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const ci = grid[rr * cols + cc];
      if (ci >= 0) return { ci, place: visitedIndex.has(ci) ? visitedIndex.get(ci) : -1 };
    }
    return null;
  }

  function showTip(x, y, hit) {
    if (!hit) { tip.hidden = true; canvas.style.cursor = "default"; return; }
    const p = hit.place >= 0 ? PLACES[hit.place] : null;
    tip.innerHTML = p
      ? `<strong>${p.country}</strong><span>${p.items.length} ${p.items.length === 1 ? "activity" : "activities"} · details below</span>`
      : `<strong>${names[hit.ci]}</strong>`;
    tip.hidden = false;
    const fw = canvas.clientWidth;
    tip.style.left = Math.min(Math.max(x, 70), fw - 70) + "px";
    tip.style.top = y + "px";
    canvas.style.cursor = p ? "pointer" : "default";
  }

  canvas.addEventListener("mousemove", e => {
    const rc = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    const hit = hitTest(mouse.x, mouse.y);
    showTip(mouse.x, mouse.y, hit);
    // Hovering one of my countries shows its details straight away
    if (hit && hit.place >= 0 && hit.place !== selected) select(hit.place);
    if (reduceMotion) draw(0);
  });
  canvas.addEventListener("mouseleave", () => {
    mouse = null;
    tip.hidden = true;
    if (reduceMotion) draw(0);
  });
  canvas.addEventListener("click", e => {
    const rc = canvas.getBoundingClientRect();
    const hit = hitTest(e.clientX - rc.left, e.clientY - rc.top);
    if (hit && hit.place >= 0) select(hit.place);
  });

  const buttons = PLACES.map((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.country;
    b.addEventListener("click", () => select(i));
    list.appendChild(b);
    return b;
  });

  function select(i) {
    selected = i;
    const p = PLACES[i];
    panel.innerHTML =
      `<p class="label">${p.city}</p><h3>${p.country}</h3>` +
      `<ul>${p.items.map(([t, text]) => `<li><span class="tag">${TYPE_LABELS[t]}</span>${text}</li>`).join("")}</ul>`;
    buttons.forEach((b, j) => b.setAttribute("aria-pressed", i === j));
    if (W) { drawBase(); draw(performance.now()); }
  }

  select(0);
  resize();
  window.addEventListener("resize", resize);
  if (!reduceMotion) requestAnimationFrame(loop);
})();
