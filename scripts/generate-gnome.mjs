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
const PORTRAIT_DIR = path.join(ROOT, 'public', 'images', 'portraits');
const TOKEN_DIR = path.join(ROOT, 'public', 'images', 'tokens');
fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
fs.mkdirSync(TOKEN_DIR, { recursive: true });

const SPEC = {
  id: 'gnome',
  color: '#12b886',
  accent: '#ff6b6b',
  prompt: `Vibrant, joyful Pixar / Disney 3D animated movie storybook portrait illustration in a magical Candyland kingdom. Warm cinematic lighting, crisp glossy textures, expressive twinkling joyful eyes! Centered head-and-shoulders portrait with plenty of breathing room around the head and pointed hat tip so it crops cleanly into both a square card and a circular board game token. ABSOLUTELY NO TEXT, NO LETTERS, NO WATERMARKS anywhere.
Subject: An adorable, super-friendly rosy-cheeked whimsical Candyland garden gnome AI buddy! He wears a charming red-and-white peppermint-striped pointed gnome hat tilted playfully, has a fluffy snowy-white curled beard, cute round rosy button nose, bright twinkling happy eyes, and a warm cheerful smile! Wearing a mint-green and berry-red storybook tunic decorated with glossy candy buttons.
Setting: Lush glowing sunlit Candyland lollipop meadow background with giant pastel rainbow lollipops, gumdrops, and sparkling sugar dust.`,
};

async function generatePortrait() {
  const outPath = path.join(PORTRAIT_DIR, `${SPEC.id}.png`);
  if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 20000) {
    console.log(`[skip] Portrait exists: ${outPath}`);
    return outPath;
  }

  const models = ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image'];
  for (const model of models) {
    console.log(`[start] Generating ${SPEC.id} portrait with ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: SPEC.prompt }] }],
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
      console.error(`[${SPEC.id}] ${model} failed (${res.status}):`, err.slice(0, 300));
      continue;
    }

    const data = await res.json();
    const imgPart = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!imgPart) {
      console.error(`[${SPEC.id}] ${model} returned no image`);
      continue;
    }

    const rawBuf = Buffer.from(imgPart.inlineData.data, 'base64');
    await sharp(rawBuf)
      .resize(768, 768, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 8 })
      .toFile(outPath);
    console.log(`[ok] Portrait ${SPEC.id} -> ${outPath} (${model})`);
    return outPath;
  }
  throw new Error(`Failed to generate portrait for ${SPEC.id}`);
}

async function buildToken() {
  const portraitPath = path.join(PORTRAIT_DIR, `${SPEC.id}.png`);
  const tokenPath = path.join(TOKEN_DIR, `${SPEC.id}.png`);
  if (!FORCE && fs.existsSync(tokenPath) && fs.statSync(tokenPath).size > 10000) {
    console.log(`[skip] Token exists: ${tokenPath}`);
    return tokenPath;
  }

  const SIZE = 256;
  const INNER = 216;
  const OFFSET = (SIZE - INNER) / 2;

  // Match the exact circular candy-ring token framing & gloss of scripts/generate-portraits.mjs
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
    <circle cx="128" cy="128" r="124" fill="${SPEC.color}" stroke="#2b1738" stroke-width="6"/>
    <circle cx="128" cy="128" r="115" fill="none" stroke="${SPEC.accent}" stroke-width="11" stroke-dasharray="18 14" stroke-linecap="round"/>
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
  console.log(`[ok] Token ${SPEC.id} -> ${tokenPath}`);
  return tokenPath;
}

async function run() {
  await generatePortrait();
  await buildToken();
  console.log('GNOME PORTRAIT & CIRCULAR TOKEN READY!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
