#!/usr/bin/env node
/**
 * Idempotent ElevenLabs Voiceover Generator for Family Candyland.
 *
 * Reads ELEVENLABS_API_KEY from C:\projects\candyland\.env (never prints secrets).
 * Usage:
 *   node scripts/generate-audio.mjs --check          # Verify API key, quota, and pick storyteller voice
 *   node scripts/generate-audio.mjs --test           # Generate 1-clip test (turn_wyatt.mp3)
 *   node scripts/generate-audio.mjs                  # Generate all 48 missing voiceover clips
 *   node scripts/generate-audio.mjs --force          # Regenerate all clips even if they already exist
 *   node scripts/generate-audio.mjs --voice <id>     # Pin a specific ElevenLabs voice ID
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const VOICE_OUT_DIR = path.join(ROOT_DIR, 'public', 'audio', 'voice');

// Voiceover lines (ttsText uses phonetic "Bopchee" for warm pronunciation of "Bapci")
const VOICE_CLIPS = [
  // Priority 1: Turn announcements (all 9 family characters)
  { key: 'turn_wyatt', ttsText: "Yay! It's Wyatt's turn! Tap to draw a sweet card!" },
  { key: 'turn_emma', ttsText: "Yay! It's Emma's turn! Tap to draw a sweet card!" },
  { key: 'turn_robert', ttsText: "It's Robert's turn! Tap to draw a sweet card!" },
  { key: 'turn_rita', ttsText: "It's Rita's turn! Tap to draw a sweet card!" },
  { key: 'turn_grandpa', ttsText: "It's Grandpa's turn! Let's see what candy card you draw!" },
  { key: 'turn_bapci', ttsText: "It's Bopchee's turn! Tap to draw a sweet card!" },
  { key: 'turn_papa', ttsText: "It's Papa's turn! Ready to draw a sweet card?" },
  { key: 'turn_nana', ttsText: "It's Nana's turn! Tap to draw a sweet card!" },
  { key: 'turn_guest', ttsText: "It's our Guest's turn! Tap to draw a sweet card!" },

  // Priority 2: Game events
  { key: 'event_welcome', ttsText: 'Welcome to Family Candyland! Let the sweet adventure begin!' },
  { key: 'event_shortcut_peppermint', ttsText: 'Whoa! Peppermint Pass shortcut! Zoom right across the candy bridge!' },
  { key: 'event_shortcut_gummy', ttsText: 'Yay! Gummy Pass shortcut! Bounce all the way ahead!' },
  { key: 'event_licorice_stuck', ttsText: "Uh oh! Sticky Licorice Lagoon! You're stuck for one turn!" },
  { key: 'event_licorice_skip', ttsText: 'Pop! You broke free from the sticky licorice! Ready for next turn!' },
  { key: 'event_minigame_intro', ttsText: 'Sparkle Star Mini-Game! Grab the tablet and get ready to play!' },
  { key: 'event_minigame_win', ttsText: 'Superstar! You won the mini-game! Bonus candy spaces!' },
  { key: 'event_minigame_try', ttsText: "Awesome try! Here's a sweet bonus hop!" },
  { key: 'event_action_complete', ttsText: 'Woohoo! Amazing job! Take your bonus hops!' },

  // Priority 3: Victory announcements (generic + all 9 characters)
  { key: 'victory_generic', ttsText: 'Hooray! You reached Candy Castle and won the game!' },
  { key: 'victory_wyatt', ttsText: 'Hooray! Wyatt reached Candy Castle and won the game!' },
  { key: 'victory_emma', ttsText: 'Hooray! Emma reached Candy Castle and won the game!' },
  { key: 'victory_robert', ttsText: 'Hooray! Robert reached Candy Castle and won the game!' },
  { key: 'victory_rita', ttsText: 'Hooray! Rita reached Candy Castle and won the game!' },
  { key: 'victory_grandpa', ttsText: 'Hooray! Grandpa reached Candy Castle and won the game!' },
  { key: 'victory_bapci', ttsText: 'Hooray! Bopchee reached Candy Castle and won the game!' },
  { key: 'victory_papa', ttsText: 'Hooray! Papa reached Candy Castle and won the game!' },
  { key: 'victory_nana', ttsText: 'Hooray! Nana reached Candy Castle and won the game!' },
  { key: 'victory_guest', ttsText: 'Hooray! Our Guest reached Candy Castle and won the game!' },

  // Priority 4: Color cards (single & double)
  { key: 'card_red', ttsText: 'One cherry red!' },
  { key: 'card_purple', ttsText: 'One plum purple!' },
  { key: 'card_yellow', ttsText: 'One lemon yellow!' },
  { key: 'card_blue', ttsText: 'One blueberry blue!' },
  { key: 'card_orange', ttsText: 'One tangerine orange!' },
  { key: 'card_green', ttsText: 'One minty green!' },
  { key: 'card_double_red', ttsText: 'Ooh, double red! Hop ahead two red squares!' },
  { key: 'card_double_purple', ttsText: 'Ooh, double purple! Hop two purple spaces!' },
  { key: 'card_double_yellow', ttsText: 'Woohoo, double yellow! Zoom right ahead!' },
  { key: 'card_double_blue', ttsText: 'Awesome, double blue! Double the hop!' },
  { key: 'card_double_orange', ttsText: 'Yay, double orange! Off you go!' },
  { key: 'card_double_green', ttsText: 'Sweet, double green! Leap right ahead!' },

  // Priority 5: Landmark & action cards
  { key: 'card_cupcake', ttsText: 'Cupcake Commons! Zoom to the frosted cupcake!' },
  { key: 'card_ice_cream', ttsText: 'Ice Cream Slopes! Scoop your way to the cone!' },
  { key: 'card_gummy', ttsText: 'Gummy Hills! Bounce over to the gummy star!' },
  { key: 'card_gingerbread', ttsText: 'Gingerbread House! Sweet cookie magic awaits!' },
  { key: 'card_lollipop', ttsText: 'Lollipop Woods! Swirl right to the giant lollipop!' },
  { key: 'card_popsicle', ttsText: 'Ice Palace! Glide over to the sparkling popsicle!' },
  { key: 'card_chocolate', ttsText: 'Chocolate Mountain! Almost to the castle!' },
  { key: 'card_action', ttsText: 'Silly Action Card! Time for some family fun!' },
];

// Preferred warm, expressive storybook voice IDs / names on ElevenLabs (in priority order)
const PREFERRED_VOICE_IDS = [
  'nzFihrBIvB34imQBuxub', // Josh - Teacher for Kids (sweet, energetic children's storyteller)
  'cgSgspJ2msm6clMCkdW9', // Jessica - Playful, Bright, Warm
];

const PREFERRED_VOICE_NAMES = [
  'josh - teacher for kids',
  'jessica',
  'matilda',
  'sarah',
  'alice',
  'lily',
  'charlotte',
  'laura',
  'rachel',
  'bella',
  'aria',
  'george',
];

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function parseArgs(argv) {
  const args = { check: false, test: false, force: false, voiceId: null, modelId: 'eleven_multilingual_v2' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--test') args.test = true;
    else if (a === '--force') args.force = true;
    else if (a === '--voice' && argv[i + 1]) args.voiceId = argv[++i];
    else if (a === '--model' && argv[i + 1]) args.modelId = argv[++i];
  }
  return args;
}

async function fetchJson(url, apiKey) {
  const res = await fetch(url, {
    headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${errText}`);
  }
  return res.json();
}

function pickStorytellerVoice(voices) {
  // First try preferred voice IDs
  for (const id of PREFERRED_VOICE_IDS) {
    const match = voices.find((v) => v.voice_id === id);
    if (match) return match;
  }
  // Next try preferred expressive family-friendly voices by name
  for (const pref of PREFERRED_VOICE_NAMES) {
    const match = voices.find((v) => v.name && v.name.toLowerCase().startsWith(pref));
    if (match) return match;
  }
  // Next prefer warm/expressive/animation/children's story descriptions
  const scored = voices.map((v) => {
    const blob = `${v.name || ''} ${v.description || ''} ${JSON.stringify(v.labels || {})}`.toLowerCase();
    let score = 0;
    if (blob.includes('warm')) score += 3;
    if (blob.includes('expressive') || blob.includes('playful') || blob.includes('cheerful')) score += 3;
    if (blob.includes('story') || blob.includes('narration') || blob.includes('children') || blob.includes('animation')) score += 4;
    if (blob.includes('american')) score += 2;
    if (blob.includes('female')) score += 1;
    if (blob.includes('deep') || blob.includes('raspy') || blob.includes('villain')) score -= 3;
    return { voice: v, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.voice ?? voices[0];
}

async function synthesizeClip({ apiKey, voiceId, modelId, text, outPath }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.78,
        style: 0.55,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS failed (HTTP ${res.status}): ${errText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength < 2048) {
    throw new Error(`Generated audio too small (${buffer.byteLength} bytes)`);
  }

  // Basic MP3 header check (ID3 tag or MPEG sync frame 0xFF 0xE0+)
  const isId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const isMpegSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!isId3 && !isMpegSync) {
    throw new Error(`Unexpected audio header bytes: 0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  return buffer.byteLength;
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv(ENV_PATH);
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Error: ELEVENLABS_API_KEY missing in .env');
    process.exit(1);
  }

  // 1. Check subscription quota
  let remainingChars = Infinity;
  try {
    const sub = await fetchJson('https://api.elevenlabs.io/v1/user/subscription', apiKey);
    remainingChars = (sub.character_limit ?? 0) - (sub.character_count ?? 0);
    console.log(
      `ElevenLabs quota: ${sub.character_count} / ${sub.character_limit} used (${remainingChars} remaining, tier=${sub.tier})`
    );
  } catch (err) {
    console.error('Quota check failed:', err.message);
    process.exit(1);
  }

  // 2. Fetch voices and pick storyteller voice
  const voicesData = await fetchJson('https://api.elevenlabs.io/v1/voices', apiKey);
  const voices = voicesData.voices ?? [];
  if (voices.length === 0) {
    console.error('No voices returned from ElevenLabs API.');
    process.exit(1);
  }

  let selectedVoice = args.voiceId
    ? voices.find((v) => v.voice_id === args.voiceId)
    : pickStorytellerVoice(voices);
  if (!selectedVoice) {
    selectedVoice = { voice_id: args.voiceId, name: 'CustomVoice' };
  }

  console.log(`Selected voice: ${selectedVoice.name} (${selectedVoice.voice_id})`);

  const totalCharsNeeded = VOICE_CLIPS.reduce((sum, c) => sum + c.ttsText.length, 0);
  console.log(`Total clips: ${VOICE_CLIPS.length} (~${totalCharsNeeded} characters total)`);

  if (args.check) {
    console.log('\nAvailable voices (top 15):');
    for (const v of voices.slice(0, 15)) {
      const labels = v.labels ? Object.entries(v.labels).map(([k, val]) => `${k}=${val}`).join(', ') : '';
      console.log(`  - ${v.voice_id} | ${v.name} | ${labels}`);
    }
    return;
  }

  const targetClips = args.test ? [VOICE_CLIPS[0]] : VOICE_CLIPS;
  fs.mkdirSync(VOICE_OUT_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const clip of targetClips) {
    const outPath = path.join(VOICE_OUT_DIR, `${clip.key}.mp3`);
    if (!args.force && fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath);
      if (stat.size > 2048) {
        skipped++;
        continue;
      }
    }

    if (remainingChars < clip.ttsText.length + 20) {
      console.warn(`Stopping early before ${clip.key}: remaining quota (${remainingChars}) too low.`);
      break;
    }

    try {
      const bytes = await synthesizeClip({
        apiKey,
        voiceId: selectedVoice.voice_id,
        modelId: args.modelId,
        text: clip.ttsText,
        outPath,
      });
      remainingChars -= clip.ttsText.length;
      generated++;
      console.log(`[ok] ${clip.key}.mp3 (${(bytes / 1024).toFixed(1)} KB) — "${clip.ttsText}"`);
      // Brief pause to stay well inside ElevenLabs rate limits
      await new Promise((r) => setTimeout(r, 180));
    } catch (err) {
      failed++;
      console.error(`[fail] ${clip.key}: ${err.message}`);
    }
  }

  console.log(`\nDone! generated=${generated}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
