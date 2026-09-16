(() => {
  "use strict";

  const section = document.querySelector(".landscape");
  const canvas = document.getElementById("landscape-canvas");
  if (!section || !canvas) return;
  const ctx = canvas.getContext("2d");

  const TILE = 8; // logical pixels per ground block
  let PIXEL_SCALE = 4; // CSS px per logical/canvas pixel

  let W = 0, H = 0, COLS = 0, ROWS = 0;
  let scene = null;
  let resizeTimer = null;
  let running = true;

  function hash(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function groundHeightTiles(c) {
    const h =
      6 +
      2.4 * Math.sin(c * 0.17) +
      1.3 * Math.sin(c * 0.052 + 2.1) +
      0.6 * Math.sin(c * 0.41 + 5);
    return Math.round(h);
  }

  function buildScene() {
    COLS = Math.max(8, Math.ceil(W / TILE));
    ROWS = Math.max(8, Math.ceil(H / TILE));

    const heights = new Array(COLS);
    for (let c = 0; c < COLS; c++) {
      heights[c] = Math.min(ROWS - 4, Math.max(4, groundHeightTiles(c)));
    }

    // Flatten a stretch on the right for the solar farm.
    const solarStart = Math.floor(COLS * 0.76);
    const solarEnd = Math.floor(COLS * 0.95);
    if (solarEnd > solarStart) {
      const flatH = heights[solarStart];
      for (let c = solarStart; c <= solarEnd && c < COLS; c++) {
        heights[c] = flatH;
      }
    }

    // Turbines: pick a couple of hill-top columns before the solar zone.
    const turbines = [];
    const turbineZoneEnd = Math.max(1, solarStart - 2);
    const tCols = [
      Math.floor(COLS * 0.56),
      Math.floor(COLS * 0.67),
    ].filter((c) => c > 2 && c <= turbineZoneEnd);
    tCols.forEach((c, i) => {
      turbines.push({
        col: c,
        height: 15 + Math.round(hash(c + 7) * 4),
        phase: hash(c + 21) * Math.PI * 2,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 0.9 + hash(c + 33) * 0.5,
      });
    });
    const reserved = new Set();
    turbines.forEach((t) => {
      for (let d = -2; d <= 2; d++) reserved.add(t.col + d);
    });
    for (let c = solarStart - 2; c <= solarEnd + 1; c++) reserved.add(c);

    // Trees scattered across the rest of the terrain.
    const trees = [];
    for (let c = 2; c < COLS - 2; c++) {
      if (reserved.has(c)) continue;
      if (hash(c) < 0.32) {
        const sizeRoll = hash(c + 50);
        const size = sizeRoll < 0.33 ? "s" : sizeRoll < 0.75 ? "m" : "l";
        trees.push({
          col: c,
          size,
          phase: hash(c + 99) * Math.PI * 2,
          swaySpeed: 0.5 + hash(c + 61) * 0.4,
        });
        reserved.add(c + 1);
      }
    }

    scene = { heights, turbines, trees, solarStart, solarEnd };
  }

  function resize() {
    const rect = section.getBoundingClientRect();
    PIXEL_SCALE = rect.width < 640 ? 3 : 4;
    W = Math.max(1, Math.round(rect.width / PIXEL_SCALE));
    H = Math.max(1, Math.round(rect.height / PIXEL_SCALE));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.imageSmoothingEnabled = false;
    buildScene();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }

  // ---- palette ----
  const SKY_TOP = "#bfe4f5";
  const SKY_BOTTOM = "#eef7e4";
  const SUN = "#fff0b0";
  const SUN_CORE = "#ffe27a";
  const CLOUD = "#ffffff";
  const CLOUD_SHADE = "#d9e9ef";
  const GRASS = "#6abf4b";
  const GRASS_EDGE = "#8ed96a";
  const DIRT = "#8a5a30";
  const DIRT_DARK = "#734a26";
  const STONE = "#7a7d7f";
  const STONE_DARK = "#65686a";
  const TRUNK = "#6b4021";
  const LEAF_DARK = "#2e7a3c";
  const LEAF_MID = "#3f9950";
  const LEAF_LIGHT = "#59bb66";
  const POLE = "#d9dde0";
  const POLE_SHADE = "#a8adb2";
  const BLADE = "#f2f4f6";
  const PANEL_FRAME = "#2b2f38";
  const PANEL_BLUE = "#1c3f70";
  const PANEL_BLUE_LIGHT = "#2e6fae";
  const PANEL_GRID = "#0f2440";

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawSun(t) {
    const r = Math.max(10, H * 0.09);
    const x = W * 0.14;
    const y = H * 0.18 + Math.sin(t * 0.0002) * 3;
    ctx.fillStyle = SUN;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SUN_CORE;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCloudShape(x, y, s, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = CLOUD_SHADE;
    ctx.fillRect(x, y + s * 0.4, s * 3.2, s * 0.6);
    ctx.fillStyle = CLOUD;
    ctx.fillRect(x + s * 0.4, y, s * 2.2, s * 0.6);
    ctx.fillRect(x, y + s * 0.3, s * 3.2, s * 0.5);
    ctx.fillRect(x + s * 0.9, y - s * 0.35, s * 1.3, s * 0.5);
    ctx.globalAlpha = 1;
  }

  const clouds = [
    { row: 0.12, size: 0.055, speed: 6, offset: 0 },
    { row: 0.24, size: 0.04, speed: 4, offset: 0.4 },
    { row: 0.08, size: 0.045, speed: 5, offset: 0.75 },
  ];

  function drawClouds(t) {
    clouds.forEach((c) => {
      const s = H * c.size;
      const span = W + s * 6;
      const x =
        ((c.offset * span + (t * 0.001 * c.speed)) % span) - s * 3;
      drawCloudShape(x, H * c.row, s, 0.9);
    });
  }

  function drawGround() {
    for (let c = 0; c < COLS; c++) {
      const topTile = ROWS - scene.heights[c];
      const x = c * TILE;
      for (let r = topTile; r < ROWS; r++) {
        const y = r * TILE;
        const depth = r - topTile;
        let color;
        if (depth === 0) color = GRASS;
        else if (depth === 1) color = DIRT;
        else if (depth < 7) color = depth % 3 === 0 ? DIRT_DARK : DIRT;
        else color = depth % 4 === 0 ? STONE_DARK : STONE;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, TILE, TILE);
      }
      // grass highlight strip on the very top edge
      ctx.fillStyle = GRASS_EDGE;
      ctx.fillRect(x, topTile * TILE, TILE, Math.max(1, TILE * 0.25));
    }
  }

  function drawTree(tree, t) {
    const groundTop = ROWS - scene.heights[tree.col];
    const baseX = tree.col * TILE + TILE / 2;
    const baseY = groundTop * TILE;
    const dims = { s: [2, 3], m: [2, 4], l: [3, 5] }[tree.size];
    const [trunkW, trunkH] = dims;
    const trunkPxW = trunkW * (TILE / 2);
    const trunkPxH = trunkH * (TILE / 2);

    ctx.fillStyle = TRUNK;
    ctx.fillRect(baseX - trunkPxW / 2, baseY - trunkPxH, trunkPxW, trunkPxH);

    const sway = Math.sin(t * 0.001 * tree.swaySpeed + tree.phase) * (TILE * 0.35);
    const canopyBaseY = baseY - trunkPxH;
    const layers =
      tree.size === "l"
        ? [
            [canopyBaseY - trunkPxH * 0.2, trunkPxW * 3.6, LEAF_DARK],
            [canopyBaseY - trunkPxH * 0.9, trunkPxW * 2.9, LEAF_MID],
            [canopyBaseY - trunkPxH * 1.5, trunkPxW * 1.9, LEAF_LIGHT],
          ]
        : tree.size === "m"
        ? [
            [canopyBaseY - trunkPxH * 0.1, trunkPxW * 3.0, LEAF_DARK],
            [canopyBaseY - trunkPxH * 0.7, trunkPxW * 2.1, LEAF_MID],
          ]
        : [[canopyBaseY, trunkPxW * 2.3, LEAF_MID]];

    layers.forEach(([cy, cw, color], i) => {
      const layerSway = sway * (0.4 + i * 0.3);
      ctx.fillStyle = color;
      ctx.fillRect(baseX - cw / 2 + layerSway, cy - cw * 0.32, cw, cw * 0.62);
    });
  }

  function drawTurbine(tb, t) {
    const groundTop = ROWS - scene.heights[tb.col];
    const baseX = tb.col * TILE + TILE / 2;
    const baseY = groundTop * TILE;
    const poleH = tb.height * (TILE / 2);
    const poleW = Math.max(2, TILE * 0.18);
    const hubY = baseY - poleH;

    ctx.fillStyle = POLE_SHADE;
    ctx.fillRect(baseX - poleW / 2 - 1, hubY, poleW + 2, poleH);
    ctx.fillStyle = POLE;
    ctx.fillRect(baseX - poleW / 2, hubY, poleW, poleH);

    // nacelle
    const nw = TILE * 1.3;
    const nh = TILE * 0.55;
    ctx.fillStyle = POLE_SHADE;
    ctx.fillRect(baseX - nw / 2, hubY - nh / 2, nw, nh);

    const angle = t * 0.0016 * tb.speed * tb.dir + tb.phase;
    const bladeLen = TILE * 2.6;
    const bladeW = Math.max(1.5, TILE * 0.16);

    ctx.save();
    ctx.translate(baseX, hubY);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(angle + (i * Math.PI * 2) / 3);
      ctx.fillStyle = BLADE;
      ctx.beginPath();
      ctx.moveTo(-bladeW / 2, 0);
      ctx.lineTo(bladeW / 2, 0);
      ctx.lineTo(bladeW / 4, -bladeLen);
      ctx.lineTo(-bladeW / 4, -bladeLen);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#8f9498";
    ctx.beginPath();
    ctx.arc(0, 0, bladeW * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSolarFarm(t) {
    const { solarStart, solarEnd } = scene;
    if (solarEnd <= solarStart) return;
    const groundTop = ROWS - scene.heights[solarStart];
    const baseY = groundTop * TILE;
    const panelCount = Math.max(1, Math.floor((solarEnd - solarStart) / 3));
    const spacing = (solarEnd - solarStart) * TILE / panelCount;
    const panelW = spacing * 0.72;
    const panelH = panelW * 0.42;

    const sweep = ((t * 0.05) % (panelW * panelCount * 3.2 + 400)) - 200;

    for (let i = 0; i < panelCount; i++) {
      const x = solarStart * TILE + spacing * (i + 0.5);
      const standH = TILE * 1.4;
      const standTopY = baseY - standH;

      // stand
      ctx.fillStyle = PANEL_FRAME;
      ctx.fillRect(x - TILE * 0.12, standTopY, TILE * 0.24, standH);

      // angled panel (parallelogram)
      const skew = panelW * 0.22;
      const py = standTopY - panelH * 0.5;
      ctx.fillStyle = PANEL_FRAME;
      ctx.beginPath();
      ctx.moveTo(x - panelW / 2 - skew, py);
      ctx.lineTo(x + panelW / 2 - skew, py);
      ctx.lineTo(x + panelW / 2 + skew, py + panelH);
      ctx.lineTo(x - panelW / 2 + skew, py + panelH);
      ctx.closePath();
      ctx.fill();

      const inset = 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - panelW / 2 - skew + inset, py + inset);
      ctx.lineTo(x + panelW / 2 - skew - inset, py + inset);
      ctx.lineTo(x + panelW / 2 + skew - inset, py + panelH - inset);
      ctx.lineTo(x - panelW / 2 + skew + inset, py + panelH - inset);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = PANEL_BLUE;
      ctx.fillRect(x - panelW, py - 4, panelW * 2, panelH + 8);

      // grid lines
      ctx.strokeStyle = PANEL_GRID;
      ctx.lineWidth = 1;
      for (let gxi = -2; gxi <= 2; gxi++) {
        const gx = x + gxi * (panelW / 5) - skew;
        ctx.beginPath();
        ctx.moveTo(gx, py);
        ctx.lineTo(gx + skew * 2, py + panelH);
        ctx.stroke();
      }

      // glint sweep
      const localSweep = sweep + i * panelW * 1.6;
      const gx = x - panelW + (localSweep % (panelW * 3));
      const glintGrad = ctx.createLinearGradient(gx - 6, py, gx + 6, py + panelH);
      glintGrad.addColorStop(0, "rgba(255,255,255,0)");
      glintGrad.addColorStop(0.5, "rgba(255,255,255,0.55)");
      glintGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glintGrad;
      ctx.fillRect(gx - 8, py - 4, 16, panelH + 8);

      ctx.fillStyle = PANEL_BLUE_LIGHT;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x - panelW / 2 - skew, py, panelW, panelH * 0.4);
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  function frame(t) {
    if (!running) return;
    if (!scene) buildScene();

    drawSky();
    drawSun(t);
    drawClouds(t);
    drawGround();
    scene.trees.forEach((tree) => drawTree(tree, t));
    scene.turbines.forEach((tb) => drawTurbine(tb, t));
    drawSolarFarm(t);

    requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState !== "hidden";
    if (running) requestAnimationFrame(frame);
  });

  window.addEventListener("resize", onResize);

  resize();
  requestAnimationFrame(frame);
})();
