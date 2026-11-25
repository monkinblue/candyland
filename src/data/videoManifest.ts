import type { CharacterId, CutsceneType } from '../types/game';
import generatedVideosList from './generatedVideos.json';

export interface VideoAssetEntry {
  type: CutsceneType;
  scenePrefix: string;
  url: string;
  title: string;
  subtitle: string;
  durationSeconds: number;
}

export const ALL_CUTSCENE_TYPES: readonly CutsceneType[] = [
  'shortcut-peppermint',
  'shortcut-gummy',
  'licorice-stuck',
  'landmark-lollipop',
  'landmark-ice-palace',
  'landmark-chocolate',
  'victory-castle',
] as const;

export const ALL_VIDEO_CHARACTER_IDS: readonly CharacterId[] = [
  'wyatt',
  'emma',
  'robert',
  'rita',
  'grandpa',
  'bapci',
  'papa',
  'nana',
  'guest',
] as const;

export const CUTSCENE_SCENE_PREFIX: Record<CutsceneType, string> = {
  'shortcut-peppermint': 'shortcut_peppermint',
  'shortcut-gummy': 'shortcut_gummy',
  'licorice-stuck': 'licorice_stuck',
  'landmark-lollipop': 'landmark_lollipop',
  'landmark-ice-palace': 'landmark_ice_palace',
  'landmark-chocolate': 'landmark_chocolate',
  'victory-castle': 'victory_castle',
};

/**
 * Verified individualized `<scene>_<characterId>.mp4` files currently cached on disk
 * (auto-updated by `scripts/generate-videos.mjs`).
 */
export const GENERATED_INDIVIDUAL_VIDEOS: readonly string[] = generatedVideosList;
const GENERATED_VIDEO_SET = new Set<string>(generatedVideosList);

/**
 * Metadata and guaranteed shared fallback scene video (`/videos/<scene>.mp4`)
 * for all 7 Candyland cutscene types.
 */
export const VIDEO_MANIFEST: Record<CutsceneType, VideoAssetEntry> = {
  'shortcut-peppermint': {
    type: 'shortcut-peppermint',
    scenePrefix: 'shortcut_peppermint',
    url: '/videos/shortcut_peppermint.mp4',
    title: 'Peppermint Pass Shortcut!',
    subtitle: 'Zooming across the candy-cane bridge!',
    durationSeconds: 5,
  },
  'shortcut-gummy': {
    type: 'shortcut-gummy',
    scenePrefix: 'shortcut_gummy',
    url: '/videos/shortcut_gummy.mp4',
    title: 'Gummy Pass Shortcut!',
    subtitle: 'Bouncing high over the rainbow gummy bridge!',
    durationSeconds: 5,
  },
  'licorice-stuck': {
    type: 'licorice-stuck',
    scenePrefix: 'licorice_stuck',
    url: '/videos/licorice_stuck.mp4',
    title: 'Sticky Licorice Lagoon!',
    subtitle: 'Uh-oh! Wiggle free on your next turn!',
    durationSeconds: 5,
  },
  'landmark-lollipop': {
    type: 'landmark-lollipop',
    scenePrefix: 'landmark_lollipop',
    url: '/videos/landmark_lollipop.mp4',
    title: 'Welcome to Lollipop Woods!',
    subtitle: 'Giant rainbow lollipops sparkle all around!',
    durationSeconds: 5,
  },
  'landmark-ice-palace': {
    type: 'landmark-ice-palace',
    scenePrefix: 'landmark_ice_palace',
    url: '/videos/landmark_ice_palace.mp4',
    title: 'Shimmering Ice Palace!',
    subtitle: 'Frosty sparkles and popsicle magic!',
    durationSeconds: 5,
  },
  'landmark-chocolate': {
    type: 'landmark-chocolate',
    scenePrefix: 'landmark_chocolate',
    url: '/videos/landmark_chocolate.mp4',
    title: 'Chocolate Mountain!',
    subtitle: 'Cheering by the sparkling fudge waterfall!',
    durationSeconds: 5,
  },
  'victory-castle': {
    type: 'victory-castle',
    scenePrefix: 'victory_castle',
    url: '/videos/victory_castle.mp4',
    title: 'Hooray! Candy Castle Champion!',
    subtitle: 'Fireworks and confetti over Candy Castle!',
    durationSeconds: 5,
  },
};

/**
 * Active individualized character video overrides (`${CutsceneType}:${CharacterId}`),
 * populated automatically from `src/data/generatedVideos.json`.
 */
export const CHARACTER_VIDEO_OVERRIDES: Partial<
  Record<`${CutsceneType}:${CharacterId}`, string>
> = ALL_CUTSCENE_TYPES.reduce(
  (acc, type) => {
    const prefix = CUTSCENE_SCENE_PREFIX[type];
    for (const charId of ALL_VIDEO_CHARACTER_IDS) {
      const filename = `${prefix}_${charId}.mp4`;
      if (GENERATED_VIDEO_SET.has(filename)) {
        acc[`${type}:${charId}`] = `/videos/${filename}`;
      }
    }
    return acc;
  },
  {} as Partial<Record<`${CutsceneType}:${CharacterId}`, string>>
);

/**
 * Complete list of all active video URLs (7 shared scene fallbacks + all generated individualized clips).
 */
export const ALL_CUTSCENE_VIDEO_URLS: readonly string[] = Array.from(
  new Set([
    ...ALL_CUTSCENE_TYPES.map((t) => VIDEO_MANIFEST[t].url),
    ...GENERATED_INDIVIDUAL_VIDEOS.map((f) => `/videos/${f}`),
  ])
);

export function hasIndividualizedVideo(
  type: CutsceneType,
  playerId?: CharacterId | null
): boolean {
  if (!playerId) return false;
  const prefix = CUTSCENE_SCENE_PREFIX[type];
  return Boolean(prefix && GENERATED_VIDEO_SET.has(`${prefix}_${playerId}.mp4`));
}

/**
 * Returns the player's individualized `/videos/<scene>_<playerId>.mp4` clip when present
 * in `generatedVideos.json`, falling back cleanly to the shared `/videos/<scene>.mp4` clip
 * so every cutscene always resolves to a verified on-disk MP4 with zero 404s.
 */
export function getCutsceneVideoUrl(
  type: CutsceneType,
  playerId?: CharacterId | null
): string | null {
  const prefix = CUTSCENE_SCENE_PREFIX[type];
  if (!prefix) return null;
  if (playerId) {
    const filename = `${prefix}_${playerId}.mp4`;
    if (GENERATED_VIDEO_SET.has(filename)) {
      return `/videos/${filename}`;
    }
  }
  return VIDEO_MANIFEST[type]?.url ?? null;
}

export function getCutsceneMetadata(type: CutsceneType): VideoAssetEntry {
  return VIDEO_MANIFEST[type];
}
