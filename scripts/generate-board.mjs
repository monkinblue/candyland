import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:\\projects\\candyland';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const API_KEY = env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

const FORCE = process.argv.includes('--force');
const OUT_PATH = path.join(ROOT, 'public', 'images', 'board.png');
const REF_BOARD_PATH = path.join(ROOT, 'board', 'PXL_20261122_191741679.jpg');
const BLUEPRINT_PATH =
  'C:\\Users\\RobaD\\.gemini\\antigravity\\brain\\936e00a2-55a8-4fbe-9366-d935864f1768\\scratch\\board_blueprint.png';

if (!FORCE && fs.existsSync(OUT_PATH) && fs.statSync(OUT_PATH).size > 50000) {
  console.log('Board already exists at', OUT_PATH, '(pass --force to regenerate)');
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

const blueprintBase64 = fs.readFileSync(BLUEPRINT_PATH).toString('base64');
const refBase64 = fs.readFileSync(REF_BOARD_PATH).toString('base64');

const prompt = `Transform IMAGE 1 (the exact game board tile layout blueprint) into a breathtaking, ultra-high-resolution 16:9 widescreen storybook Candyland board game illustration in the lush, rich, glossy painted fairytale art style of IMAGE 2!

ABSOLUTE TOPOLOGY & ALIGNMENT REQUIREMENT (CRITICAL):
- Preserve the EXACT position, exact count (71 tiles), exact winding continuous S-curve road, exact colors, and exact proportions of EVERY SINGLE colored tile and BOTH curved shortcut bridges from IMAGE 1!
- DO NOT add extra branches, DO NOT break or disconnect the road, DO NOT move tiles away from their exact spots in IMAGE 1, and DO NOT change any tile's color!
- Render every tile from IMAGE 1 as a plump, glossy, sugar-glazed 3D storybook stepping-stone tile with crisp dark outlines and a clean flat center so board game tokens sit neatly on each tile.
- Render the 7 soft-pink circle tiles from IMAGE 1 as special pastel-pink Landmark tiles each containing a crisp cute candy icon matching its region:
  1) Bottom-left pink tile: Frosted Cupcake icon
  2) Bottom-center pink tile: Ice Cream Cone icon
  3) Bottom-right pink tile: Glowing Gummy Star icon
  4) Mid-left pink tile: Cute Gingerbread Man icon
  5) Mid-right pink tile: Swirly Rainbow Lollipop icon
  6) Top-right pink tile: Frosty Popsicle icon
  7) Top-left pink tile: Chocolate Fudge Square icon
- Render the 2 dark purple-black X tiles in the center from IMAGE 1 as sticky swirling black-and-purple Licorice Swirl trap tiles!
- Render the 5 yellow-star tiles from IMAGE 1 as sparkling golden Candy Star bonus tiles!
- Render the rainbow finish tile at top-center from IMAGE 1 as a radiant Rainbow Candy Finish Tile right at the open golden gates of Candy Castle!
- Render the red-and-white curved arc on the far left of IMAGE 1 as the whimsical arched striped candy-cane **Peppermint Pass** bridge!
- Render the rainbow curved arc on the far right of IMAGE 1 as the glowing translucent rainbow **Gummy Pass** bridge!

LUSH CANDYLAND SCENERY TO PAINT AROUND & BENEATH THE EXACT ROAD FROM IMAGE 1:
- **Bottom-Left (around first pink zone)**: Cupcake Commons — giant pastel frosted cupcakes with sprinkles, cherries, frosting hills, and a welcoming candy start gate at the very bottom-left corner!
- **Bottom-Center (around light blue zone)**: Ice Cream Slopes — snowy vanilla/strawberry/chocolate ice cream hills, giant waffle cones, chocolate fudge drips, and whipped cream swirls!
- **Bottom-Right (around mint green zone)**: Gummy Hills — joyful sparkling translucent green/red/orange gummy bears, glowing gummy stars, and colorful jelly domes!
- **Mid-Left (around peach zone)**: Gingerbread House — an enchanting cozy candy-coated Gingerbread Cottage with gumdrop roof tiles, icing icicles, and peppermint columns nestled neatly next to the path!
- **Dead-Center (around dark purple zone)**: Licorice Lagoon — a playful, dramatic indigo-and-violet lagoon with twisting glossy black-and-purple licorice vines, swirling dark water, and glowing violet pebbles!
- **Mid-Right (around pink/lavender zone)**: Lollipop Woods — an enchanted forest of giant colorful rainbow spiral lollipops, pastel cotton-candy bushes, and glowing sparkle trees!
- **Top-Right (around icy cyan zone)**: Ice Palace — a shimmering turquoise-and-lavender crystal Ice Castle on frosted cliffs with a sparkling frozen waterfall cascading down!
- **Top-Left (around warm brown zone)**: Chocolate Mountain — dramatic sculpted fudge mountain peaks with glossy melted chocolate waterfalls and rich brownie boulders!
- **Top-Center (right above the rainbow finish tile)**: Candy Castle — a magnificent sunlit golden fairy-tale Candy Castle with pastel pink-and-gold spires, candy turrets, glowing open golden gates, and cheerful fluffy clouds in a bright sky!

STRICT CLEANLINESS RULES:
- ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, AND NO NUMBERS anywhere on the entire image! Pure visual storybook magic only!
- Fill the entire 16:9 frame edge-to-edge with zero borders or margins.
- Keep the exact tile positions and tile colors from IMAGE 1 locked in place so our coordinate grid aligns pixel-for-pixel!`;

async function generateBoard() {
  const models = ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image'];
  for (const model of models) {
    console.log(`Generating aligned board with ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: blueprintBase64 } },
            { inlineData: { mimeType: 'image/jpeg', data: refBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '2K',
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Model ${model} failed (${res.status}):`, errText.slice(0, 600));
      continue;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (!imgPart) {
      console.error(`Model ${model} returned no image part:`, JSON.stringify(data).slice(0, 500));
      continue;
    }

    const rawBuf = Buffer.from(imgPart.inlineData.data, 'base64');
    // Save clean true PNG at crisp 2560x1440 (exact 16:9, ultra-sharp for 4K/1080p TVs)
    await sharp(rawBuf)
      .resize(2560, 1440, { fit: 'fill' })
      .png({ compressionLevel: 8, palette: false })
      .toFile(OUT_PATH);

    const stats = fs.statSync(OUT_PATH);
    console.log(`SUCCESS! Saved ${OUT_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB, 2560x1440 PNG) using ${model}`);
    return;
  }
  console.error('All models failed to generate board.');
  process.exit(1);
}

generateBoard().catch((err) => {
  console.error(err);
  process.exit(1);
});
