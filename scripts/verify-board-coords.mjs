import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:\\projects\\candyland';
const BOARD_IMG = path.join(ROOT, 'public', 'images', 'board.png');
const BOARD_DATA_TS = path.join(ROOT, 'src', 'data', 'boardData.ts');
const OUT_PATH =
  process.argv[2] ||
  'C:\\Users\\RobaD\\.gemini\\antigravity\\brain\\936e00a2-55a8-4fbe-9366-d935864f1768\\board_coords_check.png';

// Parse BOARD_TILES and BOARD_SHORTCUTS directly from src/data/boardData.ts
const srcText = fs.readFileSync(BOARD_DATA_TS, 'utf8');

const tileBlocks = [...srcText.matchAll(/\{[^{}]*index:\s*(\d+)[^{}]*\}/gs)];
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
    shortcutEntrance: str(/\bshortcutEntrance:\s*'([^']+)'/),
  };
});

// Parse shortcuts
const shortcuts = [];
const scSection = srcText.slice(srcText.indexOf('export const BOARD_SHORTCUTS'));
for (const m of scSection.matchAll(/id:\s*'([^']+)'[\s\S]*?fromTile:\s*(\d+)[\s\S]*?toTile:\s*(\d+)[\s\S]*?waypoints:\s*\[([\s\S]*?)\]/g)) {
  const wps = [...m[4].matchAll(/x:\s*([0-9.]+),\s*y:\s*([0-9.]+)/g)].map((w) => ({
    x: Number(w[1]),
    y: Number(w[2]),
  }));
  shortcuts.push({ id: m[1], fromTile: Number(m[2]), toTile: Number(m[3]), waypoints: wps });
}

const meta = await sharp(BOARD_IMG).metadata();
const W = meta.width;
const H = meta.height;

const COLOR_HEX = {
  red: '#ff2e55',
  purple: '#9d4edd',
  yellow: '#ffcc00',
  blue: '#00a8ff',
  orange: '#ff7b00',
  green: '#22c55e',
  pink: '#ff85b3',
  licorice: '#1a092b',
  rainbow: '#ff66cc',
};

// Path polyline connecting tile centers
const pathPts = tiles.map((t) => `${(t.x * W).toFixed(1)},${(t.y * H).toFixed(1)}`).join(' ');

// Fine subtle coordinate grid lines every 0.05 for super easy visual adjustment
const gridLines = [];
for (let g = 5; g <= 95; g += 5) {
  const frac = g / 100;
  const x = (frac * W).toFixed(1);
  const y = (frac * H).toFixed(1);
  gridLines.push(
    `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1"/>`,
    `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="1"/>`
  );
  if (g % 10 === 0) {
    gridLines.push(
      `<text x="${x}" y="22" font-family="Arial" font-size="18" font-weight="bold" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${frac.toFixed(1)}</text>`,
      `<text x="26" y="${Number(y) + 6}" font-family="Arial" font-size="18" font-weight="bold" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke" text-anchor="middle">${frac.toFixed(1)}</text>`
    );
  }
}

const shortcutSvgs = shortcuts
  .map((s) => {
    const pts = s.waypoints.map((p) => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(' ');
    const stroke = s.id === 'peppermint-pass' ? '#ff0044' : '#00e5ff';
    return `<polyline points="${pts}" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="8" stroke-dasharray="16 12" stroke-linecap="round" stroke-linejoin="round"/>`;
  })
  .join('\n');

const markers = tiles
  .map((t) => {
    const cx = (t.x * W).toFixed(1);
    const cy = (t.y * H).toFixed(1);
    const fill = COLOR_HEX[t.color] || '#ffffff';
    let ring = `<circle cx="${cx}" cy="${cy}" r="18" fill="${fill}" stroke="#ffffff" stroke-width="4"/>`;
    if (t.landmark) {
      ring = `<circle cx="${cx}" cy="${cy}" r="24" fill="#ff66b2" stroke="#ffffff" stroke-width="5"/>`;
    } else if (t.isLicoriceTrap) {
      ring = `<circle cx="${cx}" cy="${cy}" r="23" fill="#1a092b" stroke="#ff55ff" stroke-width="5"/>`;
    } else if (t.isStarMiniGame) {
      ring = `<circle cx="${cx}" cy="${cy}" r="23" fill="#ffaa00" stroke="#ffffff" stroke-width="5"/>`;
    } else if (t.shortcutEntrance) {
      ring = `<circle cx="${cx}" cy="${cy}" r="23" fill="#00d4ff" stroke="#ffffff" stroke-width="5"/>`;
    }
    const tag = t.landmark
      ? `L:${t.index}`
      : t.isLicoriceTrap
      ? `X:${t.index}`
      : t.isStarMiniGame
      ? `★${t.index}`
      : t.shortcutEntrance
      ? `S:${t.index}`
      : `${t.index}`;
    return `${ring}
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#000000"/>
    <text x="${cx}" y="${(t.y * H + 6).toFixed(1)}" font-family="Arial" font-size="16" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="4" paint-order="stroke" text-anchor="middle">${tag}</text>`;
  })
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${gridLines.join('\n')}
  <polyline points="${pathPts}" fill="none" stroke="#ffffff" stroke-width="5" stroke-opacity="0.7"/>
  ${shortcutSvgs}
  ${markers}
</svg>`;

const OUT_W = 1920;
const OUT_H = 1080;
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const overlayPng = await sharp(Buffer.from(svg))
  .resize(OUT_W, OUT_H, { fit: 'fill' })
  .png()
  .toBuffer();

await sharp(BOARD_IMG)
  .resize(OUT_W, OUT_H, { fit: 'fill' })
  .composite([{ input: overlayPng, top: 0, left: 0 }])
  .png()
  .toFile(OUT_PATH);

console.log(`Verified ${tiles.length} tiles & ${shortcuts.length} shortcuts -> ${OUT_PATH}`);
