import type { CharacterId, CutsceneType } from '../types/game';

export interface VideoAssetEntry {
  type: CutsceneType;
  url: string;
  title: string;
  subtitle: string;
  durationSeconds: number;
}

/**
 * Default cached AI-generated cutscene videos (`gemini-omni-1.2-flash`) served from `public/videos/`.
 */
export const VIDEO_MANIFEST: Record<CutsceneType, VideoAssetEntry> = {
  'shortcut-peppermint': {
    type: 'shortcut-peppermint',
    url: '/videos/shortcut_peppermint.mp4',
    title: 'Peppermint Pass Shortcut!',
    subtitle: 'Zooming across the candy-cane bridge!',
    durationSeconds: 5,
  },
  'shortcut-gummy': {
    type: 'shortcut-gummy',
    url: '/videos/shortcut_gummy.mp4',
    title: 'Gummy Pass Shortcut!',
    subtitle: 'Bouncing high over the rainbow gummy bridge!',
    durationSeconds: 5,
  },
  'licorice-stuck': {
    type: 'licorice-stuck',
    url: '/videos/licorice_stuck.mp4',
    title: 'Sticky Licorice Lagoon!',
    subtitle: 'Uh-oh! Wiggle free on your next turn!',
    durationSeconds: 5,
  },
  'landmark-lollipop': {
    type: 'landmark-lollipop',
    url: '/videos/landmark_lollipop.mp4',
    title: 'Welcome to Lollipop Woods!',
    subtitle: 'Giant rainbow lollipops sparkle all around!',
    durationSeconds: 5,
  },
  'landmark-ice-palace': {
    type: 'landmark-ice-palace',
    url: '/videos/landmark_ice_palace.mp4',
    title: 'Shimmering Ice Palace!',
    subtitle: 'Frosty sparkles and popsicle magic!',
    durationSeconds: 5,
  },
  'landmark-chocolate': {
    type: 'landmark-chocolate',
    url: '/videos/landmark_chocolate.mp4',
    title: 'Chocolate Mountain!',
    subtitle: 'High-fives by the sparkling fudge waterfall!',
    durationSeconds: 5,
  },
  'victory-castle': {
    type: 'victory-castle',
    url: '/videos/victory_castle.mp4',
    title: 'Hooray! Candy Castle Champion!',
    subtitle: 'Fireworks and confetti over Candy Castle!',
    durationSeconds: 6,
  },
};

/**
 * Personalized character-specific cutscene overrides (`${CutsceneType}:${CharacterId}`).
 * Automatically falls back to the shared family cutscene in VIDEO_MANIFEST when not overridden.
 */
export const CHARACTER_VIDEO_OVERRIDES: Partial<
  Record<`${CutsceneType}:${CharacterId}`, string>
> = {
  'victory-castle:wyatt': '/videos/victory_wyatt.mp4',
  'victory-castle:emma': '/videos/victory_emma.mp4',
};

export function getCutsceneVideoUrl(
  type: CutsceneType,
  playerId?: CharacterId | null
): string | null {
  if (playerId) {
    const key = `${type}:${playerId}` as `${CutsceneType}:${CharacterId}`;
    const custom = CHARACTER_VIDEO_OVERRIDES[key];
    if (custom) return custom;
  }
  return VIDEO_MANIFEST[type]?.url ?? null;
}

export function getCutsceneMetadata(type: CutsceneType): VideoAssetEntry {
  return VIDEO_MANIFEST[type];
}
