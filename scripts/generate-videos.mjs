import fs from 'node:fs';
import path from 'node:path';

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

const MODE_TEST = process.argv.includes('--test');
const MODE_BATCH = process.argv.includes('--batch');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') || null;

if (!MODE_TEST && !MODE_BATCH && !ONLY) {
  console.log('Usage: node scripts/generate-videos.mjs --test | --batch | --only=clip1,clip2 [--force]');
  process.exit(0);
}

const VIDEO_DIR = path.join(ROOT, 'public', 'videos');
const PORTRAIT_DIR = path.join(ROOT, 'public', 'images', 'portraits');
const TMP_DIR = path.join(ROOT, 'scripts', 'tmp');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const MODEL = 'gemini-omni-1.2-flash';
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

function getPortraitRef(id) {
  const portrait = path.join(PORTRAIT_DIR, `${id}.png`);
  if (fs.existsSync(portrait)) return { file: portrait, mime: 'image/png' };
  const crop = path.join(TMP_DIR, `${id}_ref.png`);
  if (fs.existsSync(crop)) return { file: crop, mime: 'image/png' };
  return null;
}

const TEST_CLIP = {
  id: 'shortcut_peppermint',
  filename: 'shortcut_peppermint.mp4',
  refs: ['wyatt'],
  prompt:
    'A joyful 5-second Pixar 3D animated storybook movie cutscene in vibrant Candyland! Keep the exact likeness of the smiling 4-year-old boy from the reference image wearing his bright cherry-red hoodie with peppermint badge. He cheers happily and slides playfully down a sparkling red-and-white striped giant candy-cane Peppermint Pass bridge through swirling sugary sparkles and flying pastel gumdrops! Smooth 16:9 cinematic camera tracking, bright daylight, cheerful whimsical sound effects and happy giggles, no text on screen.',
};

const BATCH_CLIPS = [
  TEST_CLIP,
  {
    id: 'shortcut_gummy',
    filename: 'shortcut_gummy.mp4',
    refs: ['emma'],
    prompt:
      'A joyful 5-second Pixar 3D animated storybook movie cutscene in magical Candyland! Keep the exact likeness of the adorable 3-year-old girl from the reference image with her wavy brown hair, sparkly pink bow, and pink-and-rainbow candy princess dress. She giggles and bounces high across a glowing translucent rainbow gummy bridge over Gummy Hills as giant colorful jelly gummy bears wave and cheer beside floating gummy stars! Smooth 16:9 widescreen animation, bright sunny lighting, playful boing sound effects and joyful giggles, zero text on screen.',
  },
  {
    id: 'licorice_stuck',
    filename: 'licorice_stuck.mp4',
    refs: ['robert', 'papa'],
    prompt:
      'A hilarious, warm, kid-friendly 5-second Pixar 3D animated storybook cutscene in Candyland Licorice Lagoon! Keep the exact likeness of BOTH smiling men from the reference images: the bearded dad in the emerald vest with candy-cane pin, and the jovial mustached grandpa in the sky-blue shirt with golden star. Both playfully step onto a glossy swirling purple-and-black licorice path and get their boots comically stuck with stretchy taffy-like purple licorice ribbons — laughing heartily and pulling their boots up with silly cartoon boings! Bright silly family comedy mood (never scary!), smooth 16:9 widescreen animation, funny squish and laughter SFX, zero text on screen.',
  },
  {
    id: 'landmark_lollipop',
    filename: 'landmark_lollipop.mp4',
    refs: ['emma', 'rita'],
    prompt:
      'A magical 5-second Pixar 3D animated storybook cutscene in Candyland Lollipop Woods! Keep the exact likeness of BOTH the adorable 3-year-old girl in her rainbow princess dress with pink bow and her radiant smiling dark-haired mom in the berry-pink Candyland jacket from the reference images. Holding hands, they twirl and skip joyfully down a sun-dappled pastel forest lane surrounded by towering spinning rainbow spiral lollipops and floating iridescent candy bubbles! Smooth 16:9 widescreen animation, enchanting twinkling chimes music and happy laughter, zero text on screen.',
  },
  {
    id: 'landmark_ice_palace',
    filename: 'landmark_ice_palace.mp4',
    refs: ['bapci', 'grandpa'],
    prompt:
      'A dazzling 5-second Pixar 3D animated storybook cutscene at the Candyland Ice Palace! Keep the exact likeness of BOTH the warm smiling grandma with highlighted wavy brown hair, blue pendant necklace, and frost shawl, and the smiling glasses-wearing silver-haired grandpa in the striped blue shirt and vest from the reference images. Standing together on a shimmering crystal-blue frosted bridge before glowing crystal spires, they wave cheerfully as swirling snow-sugar sparkles and glowing pastel popsicles dance around them! Smooth 16:9 widescreen animation, magical sparkling bells music, zero text on screen.',
  },
  {
    id: 'victory_castle',
    filename: 'victory_castle.mp4',
    refs: ['wyatt', 'emma', 'rita', 'robert'],
    prompt:
      'An epic, heartwarming 6-second Pixar 3D animated storybook movie finale at golden Candy Castle! Keep the exact likeness of ALL FOUR happy family members from the reference images: the 4-year-old boy in the red hoodie, the 3-year-old girl in the rainbow candy princess dress, the beaming dark-haired mom in berry-pink, and the smiling bearded dad in the emerald vest. They jump and cheer together on the glowing rainbow bridge throwing colorful confetti as the giant golden Candy Castle gates swing wide open and dazzling candy fireworks burst in the sunny pastel sky! Smooth 16:9 cinematic celebration, triumphant joyful fanfare music and family cheers, zero text on screen.',
  },
  {
    id: 'victory_wyatt',
    filename: 'victory_wyatt.mp4',
    refs: ['wyatt'],
    prompt:
      'A joyful 5-second Pixar 3D animated storybook victory cutscene at golden Candy Castle! Keep the exact likeness of the smiling 4-year-old boy in his bright cherry-red hoodie with peppermint pin from the reference image. A sparkling golden candy crown magically floats down onto his head as he jumps up cheering with both arms raised in front of the glowing golden Candy Castle gates while rainbow confetti and colorful fireworks burst overhead! Smooth 16:9 cinematic animation, triumphant happy fanfare music and giggles, zero text on screen.',
  },
  {
    id: 'victory_emma',
    filename: 'victory_emma.mp4',
    refs: ['emma'],
    prompt:
      'A magical 5-second Pixar 3D animated storybook victory cutscene at golden Candy Castle! Keep the exact likeness of the adorable 3-year-old girl with wavy brown hair, pink bow, and sparkling rainbow candy princess dress from the reference image. A shimmering golden candy tiara sparkles onto her head as she twirls joyfully and cheers in front of the open golden Candy Castle gates while pastel rainbow confetti and starry candy fireworks fill the sunny sky! Smooth 16:9 cinematic animation, enchanting triumphant royal fanfare music and happy giggles, zero text on screen.',
  },
  {
    id: 'landmark_chocolate',
    filename: 'landmark_chocolate.mp4',
    refs: ['papa', 'nana'],
    prompt:
      'A joyful 5-second Pixar 3D animated storybook cutscene at Candyland Chocolate Mountain! Keep the exact likeness of BOTH the jovial mustached grandpa in the sky-blue shirt with golden star and the radiant smiling blonde grandma in the sunny yellow-and-white striped cardigan and pastel scarf from the reference images. They laugh and give each other a celebratory high-five beside a gleaming flowing hot-fudge chocolate waterfall and sculpted brownie cliffs sparkling with golden sprinkles! Smooth 16:9 widescreen animation, cheerful whimsical adventure music and warm laughter, zero text on screen.',
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findVideoPayload(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVideoPayload(item);
      if (found) return found;
    }
    return null;
  }
  const type = String(obj.type || '').toLowerCase();
  const mime = String(obj.mime_type || obj.mimeType || '').toLowerCase();
  if (type === 'video' || mime.startsWith('video/')) {
    if (obj.data) return { kind: 'base64', data: obj.data, mime: mime || 'video/mp4' };
    if (obj.uri || obj.url) return { kind: 'uri', uri: obj.uri || obj.url, mime: mime || 'video/mp4' };
  }
  if (obj.inline_data?.mime_type?.startsWith('video/') || obj.inlineData?.mimeType?.startsWith('video/')) {
    const d = obj.inline_data || obj.inlineData;
    return { kind: 'base64', data: d.data, mime: d.mime_type || d.mimeType };
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const found = findVideoPayload(val);
      if (found) return found;
    }
  }
  return null;
}

async function generateClip(clip) {
  const outPath = path.join(VIDEO_DIR, clip.filename);
  if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 50000) {
    console.log(`[skip] Video already exists: ${clip.filename}`);
    return outPath;
  }

  const inputItems = [];
  for (const refId of clip.refs) {
    const ref = getPortraitRef(refId);
    if (ref) {
      inputItems.push({
        type: 'image',
        data: fs.readFileSync(ref.file).toString('base64'),
        mime_type: ref.mime,
      });
    }
  }
  inputItems.push({ type: 'text', text: clip.prompt });

  const payload = {
    model: MODEL,
    background: true,
    store: true,
    response_modalities: ['video'],
    input: inputItems,
  };

  console.log(`[start] ${clip.filename} (refs: ${clip.refs.join(', ')}) via ${MODEL}...`);
  const createRes = await fetch(INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    console.error(`[error] ${clip.filename} POST failed (${createRes.status}):`, createText.slice(0, 1200));
    throw new Error(`Interactions API POST HTTP ${createRes.status} for ${clip.filename}`);
  }

  let interaction = JSON.parse(createText);
  const id = interaction.id || interaction.name;
  console.log(`  [${clip.id}] interaction id=${id}, status=${interaction.status}`);

  const startedAt = Date.now();
  while (interaction.status && !['completed', 'failed', 'cancelled'].includes(interaction.status)) {
    if (Date.now() - startedAt > 300000) {
      throw new Error(`Timed out waiting for interaction ${id} (${clip.filename})`);
    }
    await sleep(6000);
    const pollRes = await fetch(`${INTERACTIONS_URL}/${encodeURIComponent(id)}`, {
      headers: { 'x-goog-api-key': API_KEY },
    });
    const pollText = await pollRes.text();
    if (!pollRes.ok) {
      console.error(`  [${clip.id}] poll HTTP ${pollRes.status}:`, pollText.slice(0, 300));
      continue;
    }
    interaction = JSON.parse(pollText);
  }

  if (interaction.status === 'failed' || interaction.status === 'cancelled') {
    console.error(`[${clip.id}] failed:`, JSON.stringify(interaction).slice(0, 1200));
    throw new Error(`Interaction ${id} (${clip.filename}) ended with status=${interaction.status}`);
  }

  const videoPayload = findVideoPayload(interaction);
  if (!videoPayload) {
    const preview = JSON.stringify(interaction, (k, v) =>
      typeof v === 'string' && v.length > 200 ? `<string len=${v.length}>` : v
    );
    console.error(`[${clip.id}] No video payload:`, preview.slice(0, 1200));
    throw new Error(`No video output in completed interaction ${id}`);
  }

  let videoBuf;
  if (videoPayload.kind === 'base64') {
    videoBuf = Buffer.from(videoPayload.data, 'base64');
  } else {
    const dlUrl = videoPayload.uri.includes('key=')
      ? videoPayload.uri
      : `${videoPayload.uri}${videoPayload.uri.includes('?') ? '&' : '?'}key=${API_KEY}`;
    const dlRes = await fetch(dlUrl, { headers: { 'x-goog-api-key': API_KEY } });
    if (!dlRes.ok) {
      throw new Error(`Video download failed HTTP ${dlRes.status} for ${clip.filename}`);
    }
    videoBuf = Buffer.from(await dlRes.arrayBuffer());
  }

  const headerAscii = videoBuf.subarray(4, 12).toString('ascii');
  fs.writeFileSync(outPath, videoBuf);
  const secs = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[ok] ${clip.filename} (${(videoBuf.length / 1024 / 1024).toFixed(2)} MB, ${headerAscii}, ${secs}s)`
  );
  return outPath;
}

async function main() {
  let queue = [];
  if (MODE_TEST) {
    queue = [TEST_CLIP];
  } else if (ONLY) {
    queue = BATCH_CLIPS.filter((c) => ONLY.includes(c.id));
  } else if (MODE_BATCH) {
    queue = [...BATCH_CLIPS];
  }

  // Run 2 concurrent clips to stay fast and gentle on rate limits
  const total = queue.length;
  const workers = Array.from({ length: Math.min(2, total) }, async () => {
    while (queue.length > 0) {
      const clip = queue.shift();
      await generateClip(clip);
    }
  });
  await Promise.all(workers);
  console.log(`ALL ${total} VIDEO CLIP(S) COMPLETE!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
