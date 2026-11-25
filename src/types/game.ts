/**
 * Shared Candyland Game Types & Constants
 *
 * Designed to be strictly JSON / Firebase Realtime Database serializable:
 * - Never store `undefined` values in GameRoomState (use `null` for absent values).
 * - Firebase RTDB omits empty arrays; always normalize arrays on read via helpers.
 */

export type CharacterId =
  | 'robert'
  | 'rita'
  | 'wyatt'
  | 'emma'
  | 'grandpa'
  | 'bapci'
  | 'papa'
  | 'nana'
  | 'guest';

export type TileColor =
  | 'red'
  | 'purple'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'green';

export type LandmarkId =
  | 'cupcake'
  | 'ice-cream'
  | 'gummy'
  | 'gingerbread'
  | 'lollipop'
  | 'popsicle'
  | 'chocolate'
  | 'castle';

export type ShortcutId = 'peppermint-pass' | 'gummy-pass';

export type MiniGameType =
  | 'catch-gumdrops'
  | 'shake-peppermint'
  | 'trace-candy-cane'
  | 'pop-lollipop';

export type CardType =
  | 'single'
  | 'double'
  | 'landmark'
  | 'action'
  | 'licorice';

export type ViewMode = 'landing' | 'tv' | 'tablet' | 'mirror';

export type TurnPhase =
  | 'lobby'
  | 'waiting-draw'
  | 'card-drawn'
  | 'moving'
  | 'cutscene'
  | 'minigame'
  | 'action-card'
  | 'victory';

export type CutsceneType =
  | 'shortcut-peppermint'
  | 'shortcut-gummy'
  | 'licorice-stuck'
  | 'landmark-lollipop'
  | 'landmark-ice-palace'
  | 'landmark-chocolate'
  | 'victory-castle';

export type CelebrationKind =
  | 'card-reveal'
  | 'double-card'
  | 'shortcut'
  | 'minigame-win'
  | 'action-complete'
  | 'victory';

export interface BoardCoord {
  /** Normalized horizontal position in [0, 1] across the 16:9 board */
  x: number;
  /** Normalized vertical position in [0, 1] across the 16:9 board */
  y: number;
}

export interface BoardTile {
  index: number;
  color: TileColor | 'pink' | 'licorice' | 'rainbow';
  x: number;
  y: number;
  region?: string;
  landmark?: LandmarkId;
  isStarMiniGame?: boolean;
  isLicoriceTrap?: boolean;
  shortcutEntrance?: ShortcutId;
}

export interface BoardShortcut {
  id: ShortcutId;
  name: string;
  fromTile: number;
  toTile: number;
  waypoints: BoardCoord[];
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  role: string;
  isKid: boolean;
  color: string;
  accentColor: string;
  portraitUrl: string;
  tokenUrl: string;
  tagline: string;
}

export interface Card {
  id: string;
  type: CardType;
  color: TileColor | null;
  landmark: LandmarkId | null;
  label: string;
  subtitle: string | null;
  emoji: string | null;
}

export interface PlayerState {
  id: CharacterId;
  name: string;
  isKid: boolean;
  color: string;
  accentColor: string;
  portraitUrl: string;
  tokenUrl: string;
  /** 0 = start area before tile 1; 1..lastTileIndex = board tiles; lastTileIndex = Candy Castle */
  tileIndex: number;
  /** > 0 means player is stuck in Licorice Lagoon and skips next turn */
  stuckTurns: number;
  miniGamesWon: number;
  actionCardsCompleted: number;
  turnOrder: number;
}

export interface MovementState {
  playerId: CharacterId;
  fromTile: number;
  toTile: number;
  /** Exact ordered sequence of tile indices to hop through */
  path: number[];
  shortcutUsed: ShortcutId | null;
  /** Normalized waypoints for curved glide across a shortcut bridge */
  shortcutWaypoints: BoardCoord[];
  /** True when moving from mini-game or action card bonus spaces */
  isBonusMove: boolean;
  /** True if player jumped backwards (e.g. classic landmark card) */
  isBackward: boolean;
  startedAt: number;
}

export interface MiniGameSession {
  id: string;
  type: MiniGameType;
  title: string;
  playerId: CharacterId;
  playerName: string;
  playerPortraitUrl: string;
  playerColor: string;
  isKid: boolean;
  targetScore: number;
  durationSeconds: number;
  bonusSpacesOnWin: number;
  bonusSpacesOnTry: number;
  score: number;
  /** Normalized progress in [0, 1] */
  progress: number;
  status: 'ready' | 'playing' | 'finished';
  won: boolean | null;
  startedAt: number;
  updatedAt: number;
}

export interface ActionCardItem {
  id: string;
  tier: 'kid' | 'adult';
  title: string;
  prompt: string;
  emoji: string;
  bonusSpaces: number;
  category?: string;
}

export interface ActionCardSession {
  id: string;
  card: ActionCardItem;
  playerId: CharacterId;
  playerName: string;
  playerPortraitUrl: string;
  playerColor: string;
  isKid: boolean;
  status: 'active' | 'completed' | 'skipped';
  startedAt: number;
}

export interface CutsceneSession {
  id: string;
  type: CutsceneType;
  videoUrl: string | null;
  title: string;
  subtitle: string;
  playerId: CharacterId;
  playerName: string;
  playerPortraitUrl: string;
  /** Phase to transition to once cutscene ends or is skipped */
  nextPhase: TurnPhase;
  /** Optional bonus spaces to award immediately after cutscene */
  pendingBonusSpaces: number;
  startedAt: number;
}

export interface GameSettings {
  /** When true, landmark cards never move kids backwards; they advance +3 spaces instead */
  kidFriendlyLandmarks: boolean;
  enableMiniGames: boolean;
  enableActionCards: boolean;
  enableCutscenes: boolean;
}

export interface CelebrationEvent {
  id: string;
  kind: CelebrationKind;
  timestamp: number;
}

export interface GameRoomState {
  roomCode: string;
  createdAt: number;
  updatedAt: number;
  hostConnected: boolean;
  tabletConnected: boolean;
  phase: TurnPhase;
  settings: GameSettings;
  players: PlayerState[];
  currentPlayerIndex: number;
  turnNumber: number;
  deck: Card[];
  discardPile: Card[];
  currentCard: Card | null;
  movement: MovementState | null;
  miniGame: MiniGameSession | null;
  /** Monotonic index cycling through MINI_GAME_ORDER */
  nextMiniGameIndex: number;
  actionCard: ActionCardSession | null;
  usedActionCardIds: string[];
  cutscene: CutsceneSession | null;
  winnerId: CharacterId | null;
  celebration: CelebrationEvent | null;
  lastEventBanner: string | null;
  lastEventId: string | null;
  lastVoiceKey: string | null;
}

export const TILE_COLORS: readonly TileColor[] = [
  'red',
  'purple',
  'yellow',
  'blue',
  'orange',
  'green',
] as const;

export const MINI_GAME_ORDER: readonly MiniGameType[] = [
  'catch-gumdrops',
  'shake-peppermint',
  'trace-candy-cane',
  'pop-lollipop',
] as const;

export const MINI_GAME_LABELS: Record<MiniGameType, string> = {
  'catch-gumdrops': 'Catch the Gumdrops!',
  'shake-peppermint': 'Shake the Peppermint Tree!',
  'trace-candy-cane': 'Trace the Candy Cane!',
  'pop-lollipop': 'Pop the Lollipop Bubbles!',
};

export const TILE_COLOR_META: Record<
  TileColor,
  { label: string; hex: string; darkHex: string; lightHex: string }
> = {
  red: { label: 'Red', hex: '#ff4d6d', darkHex: '#c9184a', lightHex: '#ffe0e8' },
  purple: { label: 'Purple', hex: '#9b5de5', darkHex: '#6a1cb8', lightHex: '#efe2ff' },
  yellow: { label: 'Yellow', hex: '#ffd166', darkHex: '#d49400', lightHex: '#fff6d6' },
  blue: { label: 'Blue', hex: '#38b6ff', darkHex: '#0077b6', lightHex: '#dcf3ff' },
  orange: { label: 'Orange', hex: '#ff8c42', darkHex: '#d65a00', lightHex: '#ffe9d6' },
  green: { label: 'Green', hex: '#4cd964', darkHex: '#1f9d3a', lightHex: '#dffbe4' },
};

export const LANDMARK_META: Record<
  LandmarkId,
  { label: string; emoji: string; regionName: string }
> = {
  cupcake: { label: 'Cupcake Commons', emoji: '🧁', regionName: 'Cupcake Commons' },
  'ice-cream': { label: 'Ice Cream Cone', emoji: '🍦', regionName: 'Ice Cream Slopes' },
  gummy: { label: 'Gummy Star', emoji: '⭐', regionName: 'Gummy Hills' },
  gingerbread: { label: 'Gingerbread Man', emoji: '🍪', regionName: 'Gingerbread House' },
  lollipop: { label: 'Giant Lollipop', emoji: '🍭', regionName: 'Lollipop Woods' },
  popsicle: { label: 'Frosty Popsicle', emoji: '🍧', regionName: 'Ice Palace' },
  chocolate: { label: 'Chocolate Fudge', emoji: '🍫', regionName: 'Chocolate Mountain' },
  castle: { label: 'Candy Castle', emoji: '🏰', regionName: 'Candy Castle' },
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  kidFriendlyLandmarks: false,
  enableMiniGames: true,
  enableActionCards: true,
  enableCutscenes: true,
};
