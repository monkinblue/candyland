import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:\\projects\\candyland';
const BACKUP_IMG = path.join(ROOT, 'scripts', 'tmp', 'board_original_backup.png');
const OUT_IMG = path.join(ROOT, 'public', 'images', 'board.png');
const BOARD_DATA_TS = path.join(ROOT, 'src', 'data', 'boardData.ts');
const BRAIN_OUT =
  'C:\\Users\\RobaD\\.gemini\\antigravity\\brain\\936e00a2-55a8-4fbe-9366-d935864f1768\\board_balanced_colors.png';
const INSPECT_GRID =
  'C:\\Users\\RobaD\\.gemini\\antigravity\\brain\\936e00a2-55a8-4fbe-9366-d935864f1768\\scratch\\recolor_closeup_check.png';

if (!fs.existsSync(BACKUP_IMG)) {
  fs.mkdirSync(path.dirname(BACKUP_IMG), { recursive: true });
  fs.copyFileSync(OUT_IMG, BACKUP_IMG);
  console.log('Created backup:', BACKUP_IMG);
}

// Exact target RGB palette sampled directly from the untouched painted tiles on board_original_backup.png
const PALETTE = {
  red: [253, 63, 90],
  purple: [158, 86, 230],
  yellow: [254, 211, 58],
  blue: [54, 177, 254],
  orange: [255, 134, 48],
  green: [69, 207, 89],
};

// Dark chocolate ink tile outline & warm cream road colors sampled from board_original_backup.png
const C_INK = [57, 33, 23];
const C_ROAD = [237, 209, 183];

// Parse tiles directly from src/data/boardData.ts
const srcText = fs.readFileSync(BOARD_DATA_TS, 'utf8');
const tileBlocks = [...srcText.matchAll(/\{[^{}]*\bindex:\s*(\d+)[^{}]*\}/gs)];
const tiles = tileBlocks.map((m) => {
  const b = m[0];
  const num = (re) => {
    const r = b.match(re);
    return r ? Number(r[1]) : undefined;
  };
  const str = (re) => {
    const r = b.match(re);
    return r ? r[1] : undefined;
  };
  return {
    index: num(/\bindex:\s*(\d+)/),
    color: str(/\bcolor:\s*'([^']+)'/),
    x: num(/\bx:\s*([0-9.]+)/),
    y: num(/\by:\s*([0-9.]+)/),
    landmark: str(/\blandmark:\s*'([^']+)'/),
    isStarMiniGame: /\bisStarMiniGame:\s*true/.test(b),
    isLicoriceTrap: /\bisLicoriceTrap:\s*true/.test(b),
  };
});

// Tiles whose entire enclosed interior should be cleanly refilled (removes accidental icons on #55/#67
// and gives all 5 star tiles a spotless base before compositing crisp storybook stars!)
const FULL_INTERIOR_CLEANUP = new Set([9, 22, 46, 55, 63, 67, 69]);

function dist3(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luma(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function medianRgb(samples) {
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

const { data, info } = await sharp(BACKUP_IMG)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const orig = Buffer.from(data);
const out = Buffer.from(data);

function getOrigRgb(x, y) {
  const i = (y * W + x) * 4;
  return [orig[i], orig[i + 1], orig[i + 2]];
}

function setOutRgb(x, y, rgb) {
  const i = (y * W + x) * 4;
  out[i] = clamp255(rgb[0]);
  out[i + 1] = clamp255(rgb[1]);
  out[i + 2] = clamp255(rgb[2]);
}

function closestPaletteColor(rgb) {
  let bestName = 'red';
  let bestDist = Infinity;
  for (const [name, p] of Object.entries(PALETTE)) {
    const d = dist3(rgb, p);
    if (d < bestDist) {
      bestDist = d;
      bestName = name;
    }
  }
  return { name: bestName, dist: bestDist };
}

function sampleTileBaseColor(cx, cy, avoidCenter) {
  const samples = [];
  const radii = avoidCenter ? [29, 34] : [0, 12, 24];
  for (const r of radii) {
    const steps = r === 0 ? 1 : 16;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * r);
      const py = Math.round(cy + Math.sin(a) * r);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const rgb = getOrigRgb(px, py);
      if (luma(rgb) > 75 && dist3(rgb, C_INK) > 50 && dist3(rgb, C_ROAD) > 35) {
        samples.push(rgb);
      }
    }
  }
  return medianRgb(samples);
}

function segmentProjection(P, A, B) {
  const vx = B[0] - A[0];
  const vy = B[1] - A[1];
  const vz = B[2] - A[2];
  const denom = vx * vx + vy * vy + vz * vz || 1;
  const t = ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy + (P[2] - A[2]) * vz) / denom;
  const proj = [A[0] + t * vx, A[1] + t * vy, A[2] + t * vz];
  return { t, perpDist: dist3(P, proj), residual: [P[0] - proj[0], P[1] - proj[1], P[2] - proj[2]] };
}

/**
 * Computes the EXACT enclosed tile interior via outside-in barrier flood-fill:
 * 1) Mark dark ink border pixels (continuous closed tile outline).
 * 2) Flood-fill OUTSIDE from the 4 edges of the local box (stopping at dark ink outline).
 * 3) Find the connected component containing the tile center inside the unreached region.
 * This cleanly captures 100% of a tile's interior regardless of internal icons (lollipop, chocolate, star)!
 */
function buildCleanInteriorMask(cx, cy, baseOld, x0, y0, bw, bh) {
  const isInk = new Uint8Array(bw * bh);
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      const rgb = getOrigRgb(x0 + lx, y0 + ly);
      // Dark outline pixels (dark brown ink) act as the closed tile fence
      if (luma(rgb) < 88 && dist3(rgb, C_INK) < 75) {
        isInk[ly * bw + lx] = 1;
      }
    }
  }

  // Step 1: Flood-fill outside from all 4 box edges
  const outside = new Uint8Array(bw * bh);
  const oq = [];
  function pushOut(lx, ly) {
    const idx = ly * bw + lx;
    if (outside[idx] || isInk[idx]) return;
    outside[idx] = 1;
    oq.push(lx, ly);
  }
  for (let lx = 0; lx < bw; lx++) {
    pushOut(lx, 0);
    pushOut(lx, bh - 1);
  }
  for (let ly = 0; ly < bh; ly++) {
    pushOut(0, ly);
    pushOut(bw - 1, ly);
  }
  let oh = 0;
  while (oh < oq.length) {
    const lx = oq[oh++];
    const ly = oq[oh++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
      const nIdx = ny * bw + nx;
      if (outside[nIdx] || isInk[nIdx]) continue;
      outside[nIdx] = 1;
      oq.push(nx, ny);
    }
  }

  // Step 2: Find the true outer ink boundary ring (ink pixels within 12px of outside)
  // vs any internal icon dark ink pixels (far from outside, inside the tile!)
  const distToOut = new Int16Array(bw * bh).fill(999);
  const dq = [];
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      const idx = ly * bw + lx;
      if (outside[idx]) {
        distToOut[idx] = 0;
        dq.push(lx, ly);
      }
    }
  }
  let dh = 0;
  while (dh < dq.length) {
    const lx = dq[dh++];
    const ly = dq[dh++];
    const d = distToOut[ly * bw + lx];
    if (d >= 12) continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
      const nIdx = ny * bw + nx;
      if (distToOut[nIdx] > d + 1) {
        distToOut[nIdx] = d + 1;
        dq.push(nx, ny);
      }
    }
  }

  // Step 3: Flood-fill interior from center (cx - x0, cy - y0), stopping ONLY at outer fence
  // (pixels that are outside OR outer-ring ink with distToOut <= 11)!
  const mask = new Uint8Array(bw * bh);
  const iq = [];
  const slx = cx - x0;
  const sly = cy - y0;
  mask[sly * bw + slx] = 1;
  iq.push(slx, sly);
  let ih = 0;
  while (ih < iq.length) {
    const lx = iq[ih++];
    const ly = iq[ih++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = lx + dx;
      const ny = ly + dy;
      if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
      const nIdx = ny * bw + nx;
      if (mask[nIdx] !== 0) continue;
      if (outside[nIdx]) continue;
      if (isInk[nIdx] && distToOut[nIdx] <= 11) continue;
      mask[nIdx] = 1;
      iq.push(nx, ny);
    }
  }

  // Step 4: Anti-aliased 2px inner edge along the outer ink ring (smooth transition into C_INK)
  let frontier = [];
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      if (mask[ly * bw + lx] === 1) frontier.push(lx, ly);
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const nextF = [];
    for (let i = 0; i < frontier.length; i += 2) {
      const lx = frontier[i];
      const ly = frontier[i + 1];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]) {
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
        const nIdx = ny * bw + nx;
        if (mask[nIdx] !== 0 || outside[nIdx]) continue;
        const rgb = getOrigRgb(x0 + nx, y0 + ny);
        const proj = segmentProjection(rgb, C_INK, baseOld);
        if (proj.t > 0.08 && proj.t < 1.1 && proj.perpDist < 42) {
          mask[nIdx] = 2;
          nextF.push(nx, ny);
        }
      }
    }
    frontier = nextF;
  }
  return mask;
}

let recoloredCount = 0;
let unchangedCount = 0;

for (const tile of tiles) {
  if (!PALETTE[tile.color]) continue;

  const cx = Math.round(tile.x * W);
  const cy = Math.round(tile.y * H);
  const isCleanFull = FULL_INTERIOR_CLEANUP.has(tile.index);
  const baseOld = sampleTileBaseColor(cx, cy, isCleanFull);
  const detected = closestPaletteColor(baseOld);
  const targetRgb = PALETTE[tile.color];

  if (detected.name === tile.color && !isCleanFull) {
    unchangedCount++;
    continue;
  }

  const BOX = 84;
  const x0 = Math.max(0, cx - BOX);
  const y0 = Math.max(0, cy - BOX);
  const x1 = Math.min(W - 1, cx + BOX);
  const y1 = Math.min(H - 1, cy + BOX);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  let mask;
  if (isCleanFull) {
    mask = buildCleanInteriorMask(cx, cy, baseOld, x0, y0, bw, bh);
  } else {
    mask = new Uint8Array(bw * bh);
    const queue = [];
    const pushSeed = (px, py) => {
      if (px < x0 || px > x1 || py < y0 || py > y1) return;
      const lx = px - x0;
      const ly = py - y0;
      const idx = ly * bw + lx;
      if (mask[idx] !== 0) return;
      if (dist3(getOrigRgb(px, py), baseOld) < 42) {
        mask[idx] = 1;
        queue.push(lx, ly);
      }
    };
    pushSeed(cx, cy);
    for (const r of [14, 26]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pushSeed(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
      }
    }
    let head = 0;
    while (head < queue.length) {
      const lx = queue[head++];
      const ly = queue[head++];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
        const nIdx = ny * bw + nx;
        if (mask[nIdx] !== 0) continue;
        const rgb = getOrigRgb(x0 + nx, y0 + ny);
        const dBase = dist3(rgb, baseOld);
        const projInk = segmentProjection(rgb, C_INK, baseOld);
        const projWhite = segmentProjection(rgb, [255, 255, 255], baseOld);
        const isCoreFill =
          dBase < 52 ||
          (projInk.t >= 0.45 && projInk.t <= 1.15 && projInk.perpDist < 34) ||
          (projWhite.t >= 0.35 && projWhite.t <= 1.05 && projWhite.perpDist < 28);
        if (isCoreFill && dist3(rgb, C_ROAD) > 34) {
          mask[nIdx] = 1;
          queue.push(nx, ny);
        }
      }
    }
    let frontier = [];
    for (let ly = 0; ly < bh; ly++) {
      for (let lx = 0; lx < bw; lx++) {
        if (mask[ly * bw + lx] === 1) frontier.push(lx, ly);
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      const nextF = [];
      for (let i = 0; i < frontier.length; i += 2) {
        const lx = frontier[i];
        const ly = frontier[i + 1];
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = lx + dx;
          const ny = ly + dy;
          if (nx < 0 || nx >= bw || ny < 0 || ny >= bh) continue;
          const nIdx = ny * bw + nx;
          if (mask[nIdx] !== 0) continue;
          const rgb = getOrigRgb(x0 + nx, y0 + ny);
          const projInk = segmentProjection(rgb, C_INK, baseOld);
          if (projInk.t > 0.06 && projInk.t < 1.15 && projInk.perpDist < 42 && dist3(rgb, C_ROAD) > 32) {
            mask[nIdx] = 2;
            nextF.push(nx, ny);
          }
        }
      }
      frontier = nextF;
    }
  }

  let pixelCount = 0;
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      const m = mask[ly * bw + lx];
      if (m === 0) continue;
      pixelCount++;
      const px = x0 + lx;
      const py = y0 + ly;
      const rgb = getOrigRgb(px, py);

      if (isCleanFull && m === 1) {
        // Pure spotless candy fill (erasing any old icon/star halo completely!)
        // Preserve subtle natural AA along outer border where original pixel dipped near C_INK
        const projInk = segmentProjection(rgb, C_INK, baseOld);
        const nearOuterEdge =
          ly > 0 && ly < bh - 1 && lx > 0 && lx < bw - 1 &&
          (mask[(ly - 1) * bw + lx] !== 1 ||
            mask[(ly + 1) * bw + lx] !== 1 ||
            mask[ly * bw + (lx - 1)] !== 1 ||
            mask[ly * bw + (lx + 1)] !== 1);
        if (nearOuterEdge && projInk.t > 0.15 && projInk.t < 0.92 && projInk.perpDist < 40) {
          const t = projInk.t;
          setOutRgb(px, py, [
            C_INK[0] + t * (targetRgb[0] - C_INK[0]),
            C_INK[1] + t * (targetRgb[1] - C_INK[1]),
            C_INK[2] + t * (targetRgb[2] - C_INK[2]),
          ]);
        } else {
          const dyNorm = Math.max(-1, Math.min(1, (py - cy) / 42));
          const sheen = -dyNorm * 3.5;
          setOutRgb(px, py, [targetRgb[0] + sheen, targetRgb[1] + sheen, targetRgb[2] + sheen]);
        }
      } else {
        const projInk = segmentProjection(rgb, C_INK, baseOld);
        const projWhite = segmentProjection(rgb, [255, 255, 255], baseOld);
        if (projWhite.t < 0.88 && projWhite.t >= 0.0 && projWhite.perpDist < projInk.perpDist) {
          const t = Math.max(0, Math.min(1, projWhite.t));
          setOutRgb(px, py, [
            255 + t * (targetRgb[0] - 255),
            255 + t * (targetRgb[1] - 255),
            255 + t * (targetRgb[2] - 255),
          ]);
        } else {
          const t = Math.max(0, Math.min(1.08, projInk.t));
          const keepRes = m === 1 ? 0.22 : 0.1;
          setOutRgb(px, py, [
            C_INK[0] + t * (targetRgb[0] - C_INK[0]) + projInk.residual[0] * keepRes,
            C_INK[1] + t * (targetRgb[1] - C_INK[1]) + projInk.residual[1] * keepRes,
            C_INK[2] + t * (targetRgb[2] - C_INK[2]) + projInk.residual[2] * keepRes,
          ]);
        }
      }
    }
  }

  recoloredCount++;
  console.log(
    `[tile #${String(tile.index).padStart(2, ' ')}] ${detected.name.padEnd(6)} -> ${tile.color.padEnd(6)} (${pixelCount} px)${tile.isStarMiniGame ? ' [STAR]' : ''}${isCleanFull && !tile.isStarMiniGame ? ' [CLEANUP]' : ''}`
  );
}

// Composite razor-crisp, hand-styled glowing golden storybook stars onto all 5 Star Mini-Game tiles (#9, #22, #46, #63, #69)
const starTiles = tiles.filter((t) => t.isStarMiniGame);
const starOverlays = [];
for (const st of starTiles) {
  // Compute gentle tile tilt angle along the board path so each star sits naturally with its tile!
  const prev = tiles[Math.max(0, st.index - 2)];
  const next = tiles[Math.min(tiles.length - 1, st.index)];
  let deg = (Math.atan2((next.y - prev.y) * H, (next.x - prev.x) * W) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;

  // On yellow tile (#46), use an extra-crisp creamy ivory-gold star with rich warm cocoa-amber outline so it pops cleanly!
  const isOnYellow = st.color === 'yellow';
  const fillTop = isOnYellow ? '#fffef5' : '#fff8c4';
  const fillBot = isOnYellow ? '#ffe78a' : '#ffcf33';
  const strokeColor = isOnYellow ? '#9a4f00' : '#b86200';
  const S = 84;
  const starSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="-42 -42 84 84">
    <defs>
      <linearGradient id="sg" x1="0" y1="-26" x2="0" y2="26" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${fillTop}"/>
        <stop offset="100%" stop-color="${fillBot}"/>
      </linearGradient>
      <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#3b1d08" flood-opacity="0.32"/>
      </filter>
    </defs>
    <g transform="rotate(${deg.toFixed(1)})" filter="url(#ds)">
      <polygon points="0,-24 7,-8 24,-7 11,4 15,21 0,12 -15,21 -11,4 -24,-7 -7,-8"
        fill="url(#sg)" stroke="${strokeColor}" stroke-width="4.2" stroke-linejoin="round"/>
      <polygon points="0,-16 4.2,-5.5 14,-4.8 6.5,1.8 8.8,11.5 0,6.5 -8.8,11.5 -6.5,1.8 -14,-4.8 -4.2,-5.5"
        fill="#ffffff" fill-opacity="0.45"/>
    </g>
  </svg>`);

  const starBuf = await sharp(starSvg).png().toBuffer();
  starOverlays.push({
    input: starBuf,
    left: Math.round(st.x * W - S / 2),
    top: Math.round(st.y * H - S / 2),
  });
}

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .composite(starOverlays)
  .png({ compressionLevel: 8, palette: false })
  .toFile(OUT_IMG);

fs.mkdirSync(path.dirname(BRAIN_OUT), { recursive: true });
fs.copyFileSync(OUT_IMG, BRAIN_OUT);

// Build 3x3 microscope closeup grid of key recolored tiles
const closeupIds = [6, 9, 13, 22, 46, 55, 63, 67, 69];
const CROP = 180;
const cols = 3;
const rows = 3;
const comps = [];
for (let i = 0; i < closeupIds.length; i++) {
  const t = tiles.find((x) => x.index === closeupIds[i]);
  const left = Math.max(0, Math.min(W - CROP, Math.round(t.x * W - CROP / 2)));
  const top = Math.max(0, Math.min(H - CROP, Math.round(t.y * H - CROP / 2)));
  const tileCrop = await sharp(OUT_IMG)
    .extract({ left, top, width: CROP, height: CROP })
    .resize(260, 260)
    .png()
    .toBuffer();
  const col = i % cols;
  const row = Math.floor(i / cols);
  comps.push({ input: tileCrop, left: col * 268 + 4, top: row * 290 + 4 });
  const lbl = Buffer.from(
    `<svg width="260" height="24"><rect width="260" height="24" fill="#181224"/><text x="130" y="17" font-family="Arial" font-size="15" font-weight="bold" fill="#fff" text-anchor="middle">#${t.index} ${t.color.toUpperCase()}${t.isStarMiniGame ? ' ★' : ''}</text></svg>`
  );
  comps.push({ input: lbl, left: col * 268 + 4, top: row * 290 + 264 });
}
fs.mkdirSync(path.dirname(INSPECT_GRID), { recursive: true });
await sharp({
  create: { width: cols * 268, height: rows * 290, channels: 4, background: { r: 24, g: 18, b: 36, alpha: 1 } },
})
  .composite(comps)
  .png()
  .toFile(INSPECT_GRID);

console.log(`SUCCESS! Recolored ${recoloredCount} tiles, kept ${unchangedCount} unchanged -> ${OUT_IMG}`);
console.log(`Saved milestone board -> ${BRAIN_OUT}`);
console.log(`Saved closeup grid -> ${INSPECT_GRID}`);
