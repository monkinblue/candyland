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
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') || null;

const TMP_DIR = path.join(ROOT, 'scripts', 'tmp');
const PORTRAIT_DIR = path.join(ROOT, 'public', 'images', 'portraits');
const TOKEN_DIR = path.join(ROOT, 'public', 'images', 'tokens');
fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
fs.mkdirSync(TOKEN_DIR, { recursive: true });

const STYLE_BASE = `Vibrant, joyful Pixar / Disney 3D animated movie storybook portrait illustration in a magical Candyland kingdom. Warm cinematic lighting, crisp glossy textures, expressive joyful eyes, super high facial likeness to the reference photo so family members recognize them instantly! Centered head-and-shoulders portrait with plenty of breathing room around the head (so it crops cleanly into both a square card and a circular board game token). ABSOLUTELY NO TEXT, NO LETTERS, NO WATERMARKS anywhere.`;

const CHARACTER_SPECS = [
  {
    id: 'robert',
    ref: 'robert_ref.png',
    color: '#22c55e',
    accent: '#86efac',
    prompt: `${STYLE_BASE}
Subject: Transform the exact man in the reference photo (Dad, Robert) into a joyful Candyland storybook hero. Keep his EXACT facial features, short sandy-blond/light-brown hair, light neatly trimmed beard and stubble, friendly blue-hazel eyes, and warm cheerful smile!
Outfit & Setting: Wearing a dashing emerald-green Candyland explorer vest over a cream tunic with a cute candy-cane lapel pin, against a softly glowing pastel Candyland meadow and sunny sky with sprinkles.`,
  },
  {
    id: 'rita',
    ref: 'rita_ref.png',
    color: '#ec4899',
    accent: '#fbcfe8',
    prompt: `${STYLE_BASE}
Subject: Transform the exact woman in the reference photo (Mom, Rita) into a radiant Candyland storybook adventurer. Keep her EXACT facial features, long straight jet-black hair, East Asian features, beaming joyful toothy smile, and warm crinkled happy eyes!
Outfit & Setting: Wearing a charming berry-pink and cream Candyland storybook jacket with pastel candy buttons, against a softly glowing sunlit Cupcake Commons background with floating pastel sprinkles.`,
  },
  {
    id: 'wyatt',
    ref: 'wyatt_ref.png',
    color: '#ef4444',
    accent: '#fecaca',
    prompt: `${STYLE_BASE}
Subject: Transform the exact adorable 4-year-old boy in the reference photo (Wyatt) into an excited little Candyland explorer! Keep his EXACT adorable face, straight light-brown hair with bangs, sweet rosy cheeks, bright dark smiling eyes, and big joyful grin (smooth healthy clear skin on his forehead/eyebrow).
Outfit & Setting: Wearing a bright cherry-red Candyland adventurer hoodie with a little swirled peppermint explorer badge, against a whimsical colorful Lollipop Woods background with pastel sparkles.`,
  },
  {
    id: 'emma',
    ref: 'emma_ref.png',
    color: '#a855f7',
    accent: '#e9d5ff',
    prompt: `${STYLE_BASE}
Subject: Transform the exact adorable 3-year-old girl in the reference photo (Emma) into a joyful little Candyland storybook princess! Keep her EXACT adorable face, sweet round cheeks, dark expressive eyes, and cute wavy brown hair with a sparkly pink bow/hair clip on top — giving her a delighted, radiant happy smile (no phone in frame!).
Outfit & Setting: Wearing a sparkling pastel pink-and-rainbow Candyland princess dress with tiny candy stars, against a dreamy glowing Candy Castle and pastel rainbow clouds background.`,
  },
  {
    id: 'grandpa',
    ref: 'grandpa_ref.png',
    color: '#2563eb',
    accent: '#bfdbfe',
    prompt: `${STYLE_BASE}
Subject: Transform the exact friendly gentleman in the reference photo (Grandpa) into a warm distinguished Candyland storybook traveler! Keep his EXACT facial features, short wavy salt-and-pepper silver-gray hair, thin round wire-rimmed glasses, and warm kind smile!
Outfit & Setting: Wearing a cheerful sky-blue and white striped collared Candyland explorer shirt under a cozy royal-blue vest with a golden candy button, against a sunny Ice Cream Slopes background with fluffy clouds.`,
  },
  {
    id: 'bapci',
    ref: 'bapci_ref.png',
    color: '#06b6d4',
    accent: '#a5f3fc',
    prompt: `${STYLE_BASE}
Subject: Transform the exact warm smiling woman in the reference photo (Bapci) into an enchanting Candyland storybook queen/explorer! Keep her EXACT facial features, shoulder-length wavy brown hair with caramel-blonde highlights, bright happy toothy smile, and delicate blue pendant necklace!
Outfit & Setting: Wearing an elegant navy-and-turquoise Candyland storybook top with a shimmering pastel frost shawl and candy-crystal brooch, against a sparkling turquoise Ice Palace background.`,
  },
  {
    id: 'papa',
    ref: 'papa_ref.png',
    color: '#f97316',
    accent: '#fed7aa',
    prompt: `${STYLE_BASE}
Subject: Transform the exact jovial gentleman in the reference photo (Papa) into a super cheerful Candyland storybook captain! Keep his EXACT facial features, thick wavy dark-gray/salt-and-pepper hair brushed back, prominent classic dark mustache, warm tanned rosy cheeks, and big joyful beaming smile!
Outfit & Setting: Wearing a joyful sky-blue Candyland adventurer collar shirt with a bright orange-gold gummy star emblem, against a sunny golden Gummy Hills & gingerbread cottage background.`,
  },
  {
    id: 'nana',
    ref: 'nana_ref.png',
    color: '#eab308',
    accent: '#fef08a',
    prompt: `${STYLE_BASE}
Subject: Transform the exact radiant smiling woman in the reference photo (Nana) into a joyful Candyland storybook adventurer! Keep her EXACT facial features, chin-to-shoulder wavy blonde hair with wispy bangs, huge warm toothy smile, and happy crinkles around her sparkling eyes!
Outfit & Setting: Wearing a cheerful sunny-yellow and white striped Candyland storybook cardigan with a playful pastel candy scarf, against a glowing golden-hour Cupcake Commons and rainbow sky background.`,
  },
  {
    id: 'guest',
    ref: null,
    color: '#14b8a6',
    accent: '#99f6e4',
    prompt: `${STYLE_BASE}
Subject: An adorable, super-friendly smiling Gingerbread Candy Explorer character with warm baked gingerbread cookie features, sparkling icing eyebrows, rosy gumdrop cheeks, big cheerful eyes, wearing a jaunty turquoise-and-white peppermint explorer hat and a tiny rainbow frosting bowtie!
Setting: Centered head-and-shoulders portrait against a magical glowing Candyland rainbow sky with floating gumdrops and stars.`,
  },
];

async function generatePortrait(spec) {
  const outPath = path.join(PORTRAIT_DIR, `${spec.id}.png`);
  if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
    console.log(`[skip] Portrait exists: ${spec.id}`);
    return outPath;
  }

  const parts = [];
  if (spec.ref) {
    const refPath = path.join(TMP_DIR, spec.ref);
    const refB64 = fs.readFileSync(refPath).toString('base64');
    parts.push({ inlineData: { mimeType: 'image/png', data: refB64 } });
  }
  parts.push({ text: spec.prompt });

  const models = ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image'];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '1K',
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[${spec.id}] ${model} failed (${res.status}):`, err.slice(0, 300));
      continue;
    }
    const data = await res.json();
    const imgPart = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!imgPart) {
      console.error(`[${spec.id}] ${model} returned no image`);
      continue;
    }

    const rawBuf = Buffer.from(imgPart.inlineData.data, 'base64');
    await sharp(rawBuf)
      .resize(768, 768, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 8 })
      .toFile(outPath);
    console.log(`[ok] Portrait ${spec.id} generated with ${model}`);
    return outPath;
  }
  throw new Error(`Failed to generate portrait for ${spec.id}`);
}

async function buildToken(spec) {
  const portraitPath = path.join(PORTRAIT_DIR, `${spec.id}.png`);
  const tokenPath = path.join(TOKEN_DIR, `${spec.id}.png`);
  const SIZE = 256;
  const INNER = 216;
  const OFFSET = (SIZE - INNER) / 2;

  // Slightly zoom & favor upper-center so face fills the circular board token crisply!
  const croppedFace = await sharp(portraitPath)
    .extract({ left: 64, top: 24, width: 640, height: 640 })
    .resize(INNER, INNER, { fit: 'cover' })
    .png()
    .toBuffer();

  // Circle alpha mask
  const circleMask = Buffer.from(
    `<svg width="${INNER}" height="${INNER}"><circle cx="${INNER / 2}" cy="${INNER / 2}" r="${INNER / 2}" fill="#ffffff"/></svg>`
  );

  const maskedFace = await sharp(croppedFace)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Crisp glossy candy-ring border frame with white inner highlight & candy stripe outer ring
  const ringSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <radialGradient id="gloss" cx="35%" cy="22%" r="65%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
      </radialGradient>
    </defs>
    <!-- Outer dark crisp outline -->
    <circle cx="128" cy="128" r="124" fill="${spec.color}" stroke="#2b1738" stroke-width="6"/>
    <!-- Playful dashed candy-stripe ring -->
    <circle cx="128" cy="128" r="115" fill="none" stroke="${spec.accent}" stroke-width="11" stroke-dasharray="18 14" stroke-linecap="round"/>
    <!-- Clean inner white separator ring -->
    <circle cx="128" cy="128" r="108" fill="none" stroke="#ffffff" stroke-width="6"/>
  </svg>`);

  const glossOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="topSheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/>
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <ellipse cx="128" cy="68" rx="74" ry="38" fill="url(#topSheen)"/>
    <circle cx="128" cy="128" r="108" fill="none" stroke="#ffffff" stroke-width="5"/>
  </svg>`);

  await sharp(ringSvg)
    .composite([
      { input: maskedFace, left: OFFSET, top: OFFSET },
      { input: glossOverlay, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toFile(tokenPath);
  console.log(`[ok] Token ${spec.id} -> ${tokenPath}`);
}

async function run() {
  const targets = ONLY
    ? CHARACTER_SPECS.filter((c) => ONLY.includes(c.id))
    : CHARACTER_SPECS;

  // Run with concurrency 3 for fast generation without hammering rate limits
  const queue = [...targets];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const spec = queue.shift();
      await generatePortrait(spec);
      await buildToken(spec);
    }
  });
  await Promise.all(workers);
  console.log(`ALL ${targets.length} PORTRAITS & TOKENS READY!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
