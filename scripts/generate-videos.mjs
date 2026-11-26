import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\projects\\candyland';
const VIDEO_DIR = path.join(ROOT, 'public', 'videos');
const PORTRAIT_DIR = path.join(ROOT, 'public', 'images', 'portraits');
const MANIFEST_JSON_PATH = path.join(ROOT, 'src', 'data', 'generatedVideos.json');

const SYNC_ONLY = process.argv.includes('--sync-only');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') || null;
const CONCURRENCY = Number(
  process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || 2
);
const PACE_MS = Number(
  process.argv.find((a) => a.startsWith('--pace-ms='))?.split('=')[1] || 4000
);

const MODEL = 'gemini-omni-1.2-flash';
const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// Strict generation priority order:
// 1) Robert, Rita, Emma, Wyatt, Nana, Papa (core family priority)
// 2) Grandpa, Bapci, Guest (complete original 9 cast -> 63/63)
// 3) Mabel, Gina, Caroline, Ian, Emilia, Gnome (Kozlowski family + AI Gnome buddy)
const CHARACTERS = [
  {
    id: 'robert',
    desc: 'the warm smiling bearded dad from the reference portrait with short sandy-blond hair, neatly trimmed light beard, friendly eyes, wearing his emerald-green Candyland explorer vest with a candy-cane pin over a cream tunic',
    crown: 'a gleaming golden candy explorer crown',
    cheer: 'hearty joyful dad laughter and cheers',
  },
  {
    id: 'rita',
    desc: 'the radiant smiling dark-haired mom from the reference portrait with long straight jet-black hair, warm joyful crinkled eyes, beaming smile, wearing her berry-pink and cream striped Candyland storybook jacket with pastel candy buttons',
    crown: 'a dazzling golden candy queen tiara',
    cheer: 'warm joyful laughter and cheers',
  },
  {
    id: 'emma',
    desc: 'the adorable 3-year-old girl from the reference portrait with wavy brown hair, sparkly pink bow on top, rosy cheeks, beaming smile, wearing her pastel pink-and-rainbow candy princess dress covered in colorful candy stars',
    crown: 'a shimmering golden candy princess tiara',
    cheer: 'delighted little-girl giggles and cheers',
  },
  {
    id: 'wyatt',
    desc: 'the adorable 4-year-old boy from the reference portrait with straight light-brown hair, rosy cheeks, bright joyful smile, wearing his cherry-red Candyland hoodie with a swirled peppermint pin and jeans',
    crown: 'a sparkling golden candy crown',
    cheer: 'happy kid giggles and cheers',
  },
  {
    id: 'nana',
    desc: 'the radiant smiling grandmother from the reference portrait with chin-to-shoulder wavy blonde hair and wispy bangs, big joyful toothy smile with happy eye crinkles, wearing her sunny yellow-and-white striped Candyland cardigan and pastel candy scarf',
    crown: 'a sunny sparkling golden candy tiara',
    cheer: 'bright joyful laughter and cheers',
  },
  {
    id: 'papa',
    desc: 'the jovial warm older gentleman from the reference portrait with thick wavy salt-and-pepper hair brushed back, prominent classic dark mustache, rosy tanned cheeks, huge beaming smile, wearing his sky-blue Candyland shirt with a big golden gummy star badge',
    crown: 'a joyful gleaming golden candy crown',
    cheer: 'booming jolly laughter and cheers',
  },
  {
    id: 'grandpa',
    desc: 'the friendly distinguished older gentleman from the reference portrait with short wavy silver-gray hair, thin round wire-rimmed glasses, warm gentle smile, wearing his sky-blue and white striped shirt under a cozy royal-blue vest with golden candy buttons',
    crown: 'a gleaming golden candy king crown',
    cheer: 'warm happy grandfatherly chuckles and cheers',
  },
  {
    id: 'bapci',
    desc: 'the warm radiant grandmother from the reference portrait with shoulder-length wavy brown hair with caramel highlights, bright toothy smile, delicate blue pendant necklace, wearing her navy Candyland top and shimmering pastel frost shawl with crystal brooch',
    crown: 'a sparkling crystal-and-gold candy tiara',
    cheer: 'joyful warm laughter and cheers',
  },
  {
    id: 'guest',
    desc: 'the adorable smiling gingerbread candy explorer character from the reference portrait with warm baked gingerbread cookie features, rosy gumdrop cheeks, big cheerful eyes, wearing a jaunty turquoise-and-white peppermint explorer hat and rainbow frosting bowtie',
    crown: 'a sparkling golden frosting crown',
    cheer: 'whimsical cheerful giggles and chimes',
  },
  {
    id: 'mabel',
    desc: 'the adorable smiling young blonde girl from the reference portrait with shoulder-length straight golden-blonde hair, a cute pink hair clip on the side, big warm hazel eyes, and a bright pink Candyland t-shirt covered in colorful candy sprinkles and a golden star badge',
    crown: 'a sparkling pastel-pink and gold candy tiara',
    cheer: 'delighted happy little-girl giggles and cheers',
  },
  {
    id: 'gina',
    desc: 'the radiant smiling blonde woman from the reference portrait with a wavy golden-blonde ponytail, a pastel lavender-and-mint candy bow headband, bright warm brown eyes, and a cream-and-lavender Candyland explorer shirt with a shimmering crystal candy button',
    crown: 'a dazzling lavender-and-gold candy queen tiara',
    cheer: 'bright joyful laughter and cheers',
  },
  {
    id: 'caroline',
    desc: 'the cheerful smiling young girl from the reference portrait with bouncy golden-blonde curls pulled up loosely, bright blue eyes, joyful wide smile, wearing a cream-and-orange Candyland raglan t-shirt covered in pastel rainbow lollipops and a pink wrapped-candy pin',
    crown: 'a sunny sparkling golden candy princess tiara',
    cheer: 'happy kid giggles and cheers',
  },
  {
    id: 'ian',
    desc: 'the friendly smiling dad from the reference portrait with short brushed-up dark-brown hair, warm brown eyes, cheerful grin, wearing a glossy royal-blue Candyland explorer jacket decorated with candy buttons and a peppermint compass badge over a light-blue collared shirt',
    crown: 'a gleaming royal-blue and gold candy explorer crown',
    cheer: 'warm hearty laughter and cheers',
  },
  {
    id: 'emilia',
    desc: 'the bright smiling blonde girl from the reference portrait with golden-blonde hair in a neat high side ponytail, warm hazel eyes, joyful smile, wearing a pastel floral-and-lollipop patterned sundress and a sparkly rainbow-pink crossbody bag',
    crown: 'a shimmering rainbow-crystal candy princess tiara',
    cheer: 'joyful excited giggles and cheers',
  },
  {
    id: 'gnome',
    desc: 'the adorable whimsical Candyland garden gnome from the reference portrait with a tall red-and-white peppermint striped pointed hat, fluffy curled snowy-white beard, bright twinkling green eyes, rosy cheeks, and a cozy mint-green and berry tunic with colorful candy buttons',
    crown: 'a sparkling tiny golden candy crown perched atop his peppermint hat',
    cheer: 'merry magical gnome giggles and twinkling chimes',
  },
];

const SCENES = [
  {
    prefix: 'shortcut_peppermint',
    buildPrompt: (c) =>
      `A joyful 5-second Pixar 3D animated storybook movie cutscene in vibrant sunlit Candyland! Feature ONLY ${c.desc} — keep their EXACT face, hair, expression, and outfit from the reference portrait. They cheer excitedly with arms raised and slide swiftly down a giant sparkling red-and-white striped candy-cane Peppermint Pass bridge through swirling peppermint sparkles, pastel flying gumdrops, and colorful lollipop hills! Smooth 16:9 widescreen cinematic tracking camera, joyful whoosh SFX, whimsical adventure music, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'shortcut_gummy',
    buildPrompt: (c) =>
      `A joyful 5-second Pixar 3D animated storybook movie cutscene in magical Candyland Gummy Hills! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. They giggle and bounce joyfully high across a glowing translucent rainbow gummy bridge over Gummy Hills while giant colorful translucent jelly gummy bears wave and cheer beside floating glowing gummy stars! Smooth 16:9 widescreen cinematic animation, bright cheerful daylight, playful boing SFX, upbeat whimsical music, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'licorice_stuck',
    buildPrompt: (c) =>
      `A hilarious, warm, kid-friendly 5-second Pixar 3D animated storybook comedy cutscene in Candyland Licorice Lagoon! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. Stepping playfully onto a glossy swirling purple-and-black licorice path in Licorice Lagoon, their candy boots get comically stuck in stretchy taffy-like purple licorice goo — they wiggle, pull one boot up with a silly stretchy cartoon pop, and burst out laughing with cheerful good humor! Bright funny family-friendly mood (never scary!), smooth 16:9 widescreen animation, funny squish and boing SFX, playful whimsical music, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'landmark_lollipop',
    buildPrompt: (c) =>
      `A magical 5-second Pixar 3D animated storybook movie cutscene in Candyland Lollipop Woods! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. They twirl and dance joyfully down a sun-dappled pastel forest lane surrounded by towering spinning rainbow spiral lollipops, pastel cotton-candy trees, and floating iridescent candy bubbles shimmering in golden sunlight! Smooth 16:9 widescreen cinematic animation, enchanting twinkling chimes music, bubble pop SFX, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'landmark_ice_palace',
    buildPrompt: (c) =>
      `A dazzling 5-second Pixar 3D animated storybook movie cutscene at the Candyland Ice Palace! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. They glide and skate joyfully with arms outstretched across a shimmering turquoise crystal-ice bridge in front of the glowing pastel crystal Ice Palace spires while swirling snow-sugar sparkles and floating glowing popsicles twinkle all around! Smooth 16:9 widescreen cinematic animation, sparkling magical ice-bells music, crisp chime SFX, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'landmark_chocolate',
    buildPrompt: (c) =>
      `A delicious joyful 5-second Pixar 3D animated storybook movie cutscene at Candyland Chocolate Mountain! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. Standing excitedly on sculpted brownie cliffs beside gleaming flowing hot-fudge chocolate waterfalls and swirling chocolate peaks sparkling with golden sprinkles, they throw their hands up cheering and laughing joyfully as chocolate sparkles shimmer in the warm golden sunlight! Smooth 16:9 widescreen cinematic animation, cheerful triumphant adventure music and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
  {
    prefix: 'victory_castle',
    buildPrompt: (c) =>
      `An epic joyful 5-second Pixar 3D animated storybook victory finale outside the golden Candy Castle! Feature ONLY ${c.desc} — keep their EXACT face, hair, and outfit from the reference portrait. Standing triumphant on the glowing rainbow bridge as the giant golden Candy Castle gates swing wide open behind them, ${c.crown} magically floats down in a burst of golden sparkles onto their head while they jump up cheering with both arms raised as pastel rainbow confetti and dazzling candy fireworks explode across the sunny sky! Smooth 16:9 widescreen cinematic celebration, triumphant royal fanfare music, fireworks SFX, and ${c.cheer}. ABSOLUTELY NO TEXT, NO WORDS, NO LETTERS, NO WATERMARKS anywhere on screen.`,
  },
];

function isValidExistingMp4(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.size < 400_000) return false;
  const buf = fs.readFileSync(filePath);
  const ftyp = buf.subarray(4, 8).toString('ascii') === 'ftyp';
  const latin = buf.toString('latin1');
  return ftyp && latin.includes('moov') && latin.includes('vide');
}

/**
 * Scans `public/videos/` for valid individualized `<scene>_<characterId>.mp4` files
 * and writes `src/data/generatedVideos.json` so `videoManifest.ts` activates them automatically.
 */
function syncGeneratedVideosJson() {
  const validFiles = [];
  for (const scene of SCENES) {
    for (const ch of CHARACTERS) {
      const filename = `${scene.prefix}_${ch.id}.mp4`;
      const fullPath = path.join(VIDEO_DIR, filename);
      if (isValidExistingMp4(fullPath)) {
        validFiles.push(filename);
      }
    }
  }
  validFiles.sort();
  fs.mkdirSync(path.dirname(MANIFEST_JSON_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_JSON_PATH, `${JSON.stringify(validFiles, null, 2)}\n`, 'utf8');
  return validFiles;
}

function loadApiKey() {
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
  if (!env.GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY in .env');
    process.exit(1);
  }
  return env.GEMINI_API_KEY;
}

function sleep(ms) {
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
  if (
    obj.inline_data?.mime_type?.startsWith('video/') ||
    obj.inlineData?.mimeType?.startsWith('video/')
  ) {
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

function isDailyQuotaMessage(text) {
  return /per day|daily|rpd|requests per day/i.test(text || '');
}

const portraitCache = new Map();
function getPortraitBase64(charId) {
  if (!portraitCache.has(charId)) {
    const file = path.join(PORTRAIT_DIR, `${charId}.png`);
    if (!fs.existsSync(file)) throw new Error(`Missing portrait: ${file}`);
    portraitCache.set(charId, fs.readFileSync(file).toString('base64'));
  }
  return portraitCache.get(charId);
}

let stopDueToQuota = false;
let consecutiveQuotaOrFail = 0;

async function generateClipOnce(job, apiKey) {
  if (stopDueToQuota) {
    const err = new Error('Stopped early due to daily quota limit');
    err.quotaExhausted = true;
    throw err;
  }

  const payload = {
    model: MODEL,
    background: true,
    store: true,
    response_modalities: ['video'],
    input: [
      {
        type: 'image',
        data: getPortraitBase64(job.charId),
        mime_type: 'image/png',
      },
      {
        type: 'text',
        text: job.prompt,
      },
    ],
  };

  const startedAt = Date.now();
  const createRes = await fetch(INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    const err = new Error(`POST HTTP ${createRes.status}: ${createText.slice(0, 350)}`);
    err.status = createRes.status;
    err.quotaExhausted = createRes.status === 429 && isDailyQuotaMessage(createText);
    err.retryable = !err.quotaExhausted && (createRes.status === 429 || createRes.status >= 500);
    throw err;
  }

  let interaction = JSON.parse(createText);
  const id = interaction.id || interaction.name;

  while (interaction.status && !['completed', 'failed', 'cancelled'].includes(interaction.status)) {
    if (Date.now() - startedAt > 300_000) {
      const err = new Error(`Timeout polling interaction ${id}`);
      err.retryable = true;
      throw err;
    }
    await sleep(6000);
    const pollRes = await fetch(`${INTERACTIONS_URL}/${encodeURIComponent(id)}`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    const pollText = await pollRes.text();
    if (!pollRes.ok) {
      if (pollRes.status === 429 || pollRes.status >= 500) {
        await sleep(4000);
        continue;
      }
      throw new Error(`Poll HTTP ${pollRes.status}: ${pollText.slice(0, 300)}`);
    }
    interaction = JSON.parse(pollText);
  }

  if (interaction.status === 'failed' || interaction.status === 'cancelled') {
    const detail = JSON.stringify(interaction.error || interaction.status_message || '');
    const err = new Error(`Interaction ended with status=${interaction.status} ${detail}`.trim());
    err.quotaExhausted = isDailyQuotaMessage(detail);
    err.interactionFailed = true;
    err.retryable = !err.quotaExhausted;
    throw err;
  }

  const videoPayload = findVideoPayload(interaction);
  if (!videoPayload) {
    const err = new Error(`No video payload in completed interaction ${id}`);
    err.retryable = true;
    throw err;
  }

  let videoBuf;
  if (videoPayload.kind === 'base64') {
    videoBuf = Buffer.from(videoPayload.data, 'base64');
  } else {
    const dlUrl = videoPayload.uri.includes('key=')
      ? videoPayload.uri
      : `${videoPayload.uri}${videoPayload.uri.includes('?') ? '&' : '?'}key=${apiKey}`;
    const dlRes = await fetch(dlUrl, { headers: { 'x-goog-api-key': apiKey } });
    if (!dlRes.ok) {
      const err = new Error(`Download HTTP ${dlRes.status}`);
      err.retryable = dlRes.status === 429 || dlRes.status >= 500;
      throw err;
    }
    videoBuf = Buffer.from(await dlRes.arrayBuffer());
  }

  if (videoBuf.length < 400_000 || videoBuf.subarray(4, 8).toString('ascii') !== 'ftyp') {
    const err = new Error(`Invalid MP4 buffer (${videoBuf.length} bytes)`);
    err.retryable = true;
    throw err;
  }

  const tmpPath = `${job.outPath}.tmp`;
  fs.writeFileSync(tmpPath, videoBuf);
  fs.renameSync(tmpPath, job.outPath);
  const secs = Math.round((Date.now() - startedAt) / 1000);
  return { sizeMB: (videoBuf.length / 1048576).toFixed(2), secs };
}

async function generateWithRetry(job, apiKey, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (stopDueToQuota) {
      const err = new Error('Stopped early due to daily quota limit');
      err.quotaExhausted = true;
      throw err;
    }
    try {
      const res = await generateClipOnce(job, apiKey);
      consecutiveQuotaOrFail = 0;
      return res;
    } catch (err) {
      if (err?.quotaExhausted) {
        stopDueToQuota = true;
        throw err;
      }
      if (err?.status === 429 || err?.interactionFailed) {
        consecutiveQuotaOrFail++;
        if (consecutiveQuotaOrFail >= 5) {
          stopDueToQuota = true;
          const qErr = new Error(
            `Stopping cleanly after ${consecutiveQuotaOrFail} consecutive rate-limit/failed interactions (likely daily RPD quota reached)`
          );
          qErr.quotaExhausted = true;
          throw qErr;
        }
      }
      const retryable = err?.retryable !== false;
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      const backoffMs = err?.status === 429 ? 20_000 : 6000 * attempt;
      console.warn(
        `[retry ${attempt}/${maxAttempts}] ${job.filename}: ${err.message} — waiting ${Math.round(backoffMs / 1000)}s`
      );
      await sleep(backoffMs);
    }
  }
}

async function main() {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const totalSlots = CHARACTERS.length * SCENES.length;
  const initialValid = syncGeneratedVideosJson();
  console.log(`Synced src/data/generatedVideos.json (${initialValid.length}/${totalSlots} individualized clips valid on disk)`);

  if (SYNC_ONLY) {
    return;
  }

  const apiKey = loadApiKey();
  // Character-first priority ordering so Robert, Rita, Emma, Wyatt, Nana, and Papa finish 100% first!
  const allJobs = [];
  for (const ch of CHARACTERS) {
    for (const scene of SCENES) {
      const id = `${scene.prefix}_${ch.id}`;
      const filename = `${id}.mp4`;
      allJobs.push({
        id,
        filename,
        charId: ch.id,
        scenePrefix: scene.prefix,
        outPath: path.join(VIDEO_DIR, filename),
        prompt: scene.buildPrompt(ch),
      });
    }
  }

  const selected = ONLY
    ? allJobs.filter((j) => ONLY.includes(j.id) || ONLY.includes(j.charId) || ONLY.includes(j.scenePrefix))
    : allJobs;

  const pending = [];
  let skipped = 0;
  for (const job of selected) {
    if (!FORCE && isValidExistingMp4(job.outPath)) {
      skipped++;
    } else {
      pending.push(job);
    }
  }

  const total = selected.length;
  let completed = skipped;
  const failures = [];
  console.log(
    `=== ${totalSlots}-Video Pipeline (${MODEL}) === total=${total}, skipped(valid)=${skipped}, toGenerate=${pending.length}, concurrency=${CONCURRENCY}`
  );
  console.log(
    `First 15 queued: ${pending.slice(0, 15).map((j) => j.filename).join(', ')}`
  );

  if (pending.length === 0) {
    console.log(`All ${totalSlots} individualized clips already exist and are valid MP4s!`);
    return;
  }

  const queue = [...pending];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async (_, idx) => {
    await sleep(idx * 1500);
    while (queue.length > 0 && !stopDueToQuota) {
      const job = queue.shift();
      try {
        const res = await generateWithRetry(job, apiKey);
        completed++;
        const synced = syncGeneratedVideosJson();
        console.log(
          `[ok ${completed}/${total}] ${job.filename} (${res.sizeMB} MB, ${res.secs}s) [manifest: ${synced.length}/${totalSlots}]`
        );
        if (PACE_MS > 0 && queue.length > 0 && !stopDueToQuota) await sleep(PACE_MS);
      } catch (err) {
        failures.push({ filename: job.filename, error: err.message });
        console.error(`[FAIL] ${job.filename}: ${err.message}`);
      }
    }
  });

  await Promise.all(workers);
  const finalValid = syncGeneratedVideosJson();

  if (stopDueToQuota) {
    console.warn(
      `\n=== PAUSED ON DAILY QUOTA (${finalValid.length}/${totalSlots} individualized clips active in src/data/generatedVideos.json) ===`
    );
    console.warn(
      `Remaining ${totalSlots - finalValid.length} clips fall back seamlessly to shared scene videos. Re-run tomorrow: node scripts/generate-videos.mjs`
    );
    process.exit(0);
  }

  console.log(`=== FINISHED: ${finalValid.length}/${totalSlots} valid, ${failures.length} failed ===`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  - ${f.filename}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
