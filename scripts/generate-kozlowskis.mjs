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

const KOZLOWSKI_SPECS = [
  {
    id: 'mabel',
    ref: 'kozlowski_mabel.jpg',
    color: '#ff6fb5',
    accent: '#ffe066',
    prompt: `${STYLE_BASE}
Subject: Transform the exact adorable young blonde girl in the reference photo (Mabel) into a joyful little Candyland storybook adventurer! Keep her EXACT facial features, soft blonde hair with a cute little pastel hair clip on the side, bright expressive eyes, rosy cheeks, and sweet cheerful smile!
Outfit & Setting: Wearing a bright bubblegum-pink Candyland explorer top with tiny pastel star sprinkles and a cute yellow candy star pin, against a softly glowing sunlit Cupcake Commons & pastel rainbow background.`,
  },
  {
    id: 'gina',
    ref: 'kozlowski_gina.jpg',
    color: '#845ef7',
    accent: '#63e6be',
    prompt: `${STYLE_BASE}
Subject: Transform the exact warm smiling woman in the reference photo (Aunt Gina) into a radiant Candyland storybook adventurer! Keep her EXACT facial features, bright joyful toothy smile, warm crinkled eyes, and wavy dirty-blonde/light-brown hair pulled into a soft ponytail — WITHOUT the dark sports visor (instead wearing a cute subtle pastel lavender-and-mint candy hairband or just her natural wavy blonde ponytail!).
Outfit & Setting: Wearing a stylish cream-and-lavender Candyland explorer top with mint candy trim and a sparkling pastel gem pin, against a lush sun-dappled Lollipop Woods & pastel cotton-candy sky background.`,
  },
  {
    id: 'caroline',
    ref: 'kozlowski_caroline.jpg',
    color: '#ffa94d',
    accent: '#ff6b9d',
    prompt: `${STYLE_BASE}
Subject: Transform the exact adorable curly-haired blonde girl in the reference photo (Caroline) into a bouncy joyful Candyland storybook explorer! Keep her EXACT facial features, fluffy golden-blonde curly hair pulled loosely back, rosy cheeks, bright eyes, and big cheerful toothy smile!
Outfit & Setting: Wearing a cozy cream-and-tangerine Candyland adventure tee decorated with cheerful pastel rainbow swirls and a cute pink candy pin, against a sparkling sunny Gummy Hills background with glowing pastel gummy stars.`,
  },
  {
    id: 'ian',
    ref: 'kozlowski_ian.jpg',
    color: '#228be6',
    accent: '#74c0fc',
    prompt: `${STYLE_BASE}
Subject: Transform the exact friendly tall man in the reference photo (Uncle Ian) into a cheerful Candyland storybook trailblazer! Keep his EXACT facial features, short dark-brown hair brushed slightly up in front, warm kind eyes, and friendly happy smile!
Outfit & Setting: Wearing a vibrant royal-blue Candyland adventurer jacket over a crisp light-blue collar shirt with a playful candy-cane compass badge, against a bright whimsical Ice Cream Slopes and blue pastel sky background.`,
  },
  {
    id: 'emilia',
    ref: 'kozlowski_emilia.jpg',
    color: '#f06595',
    accent: '#b197fc',
    prompt: `${STYLE_BASE}
Subject: Transform the exact blonde girl in the reference photo (Emilia) into a joyful Candyland storybook explorer smiling warmly directly toward the camera! Keep her EXACT facial features, blonde hair tied back in a neat ponytail, bright friendly eyes, and happy glowing smile (facing forward cheerfully!).
Outfit & Setting: Wearing a charming pastel candy-floral sundress with a sparkly pink-and-iridescent crossbody candy bag strap across her shoulder, against a magical golden Candy Castle and rainbow clouds background.`,
  },
];

async function generatePortrait(spec) {
  const outPath = path.join(PORTRAIT_DIR, `${spec.id}.png`);
  if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
    console.log(`[skip] Portrait exists: ${spec.id}`);
    return outPath;
  }

  const refPath = path.join(TMP_DIR, spec.ref);
  if (!fs.existsSync(refPath)) {
    throw new Error(`Missing isolated reference crop: ${refPath}`);
  }
  const refB64 = fs.readFileSync(refPath).toString('base64');

  const models = ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image'];
  for (const model of models) {
    console.log(`[start] Generating ${spec.id} portrait with ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: refB64 } },
              { text: spec.prompt },
            ],
          },
        ],
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
    console.log(`[ok] Portrait ${spec.id} -> ${outPath} (${model})`);
    return outPath;
  }
  throw new Error(`Failed to generate portrait for ${spec.id}`);
}

async function buildToken(spec) {
  const portraitPath = path.join(PORTRAIT_DIR, `${spec.id}.png`);
  const tokenPath = path.join(TOKEN_DIR, `${spec.id}.png`);
  if (!FORCE && fs.existsSync(tokenPath) && fs.statSync(tokenPath).size > 10000) {
    console.log(`[skip] Token exists: ${spec.id}`);
    return tokenPath;
  }

  const SIZE = 256;
  const INNER = 216;
  const OFFSET = (SIZE - INNER) / 2;

  const croppedFace = await sharp(portraitPath)
    .extract({ left: 64, top: 24, width: 640, height: 640 })
    .resize(INNER, INNER, { fit: 'cover' })
    .png()
    .toBuffer();

  const circleMask = Buffer.from(
    `<svg width="${INNER}" height="${INNER}"><circle cx="${INNER / 2}" cy="${INNER / 2}" r="${INNER / 2}" fill="#ffffff"/></svg>`
  );

  const maskedFace = await sharp(croppedFace)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const ringSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <circle cx="128" cy="128" r="124" fill="${spec.color}" stroke="#2b1738" stroke-width="6"/>
    <circle cx="128" cy="128" r="115" fill="none" stroke="${spec.accent}" stroke-width="11" stroke-dasharray="18 14" stroke-linecap="round"/>
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
  return tokenPath;
}

async function run() {
  const targets = ONLY
    ? KOZLOWSKI_SPECS.filter((c) => ONLY.includes(c.id))
    : KOZLOWSKI_SPECS;

  const queue = [...targets];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const spec = queue.shift();
      await generatePortrait(spec);
      await buildToken(spec);
    }
  });
  await Promise.all(workers);
  console.log(`ALL ${targets.length} KOZLOWSKI PORTRAITS & TOKENS READY!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
