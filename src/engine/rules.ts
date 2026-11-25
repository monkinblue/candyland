import {
  ActionCardItem,
  ActionCardSession,
  BoardShortcut,
  BoardTile,
  Card,
  CelebrationKind,
  CharacterDefinition,
  CharacterId,
  CutsceneSession,
  CutsceneType,
  DEFAULT_GAME_SETTINGS,
  GameRoomState,
  GameSettings,
  LANDMARK_META,
  MINI_GAME_LABELS,
  MINI_GAME_ORDER,
  MiniGameSession,
  MovementState,
  PlayerState,
  TurnPhase,
} from '../types/game';
import { createDeck, drawFromDeck, getVoiceKeyForCard } from './deck';

export interface EngineContext {
  tiles: readonly BoardTile[];
  shortcuts: readonly BoardShortcut[];
  actionCards: readonly ActionCardItem[];
  getVideoUrl?: (type: CutsceneType, playerId?: CharacterId) => string | null;
}

const FALLBACK_ACTION_CARDS: readonly ActionCardItem[] = [
  {
    id: 'fallback-kid-1',
    tier: 'kid',
    title: 'Gummy Bear Dance',
    prompt: 'Do your best wiggly gummy bear dance!',
    emoji: '🐻',
    bonusSpaces: 2,
  },
  {
    id: 'fallback-adult-1',
    tier: 'adult',
    title: 'Royal Candy Bow',
    prompt: 'Give everyone a dramatic King Kandy royal bow!',
    emoji: '👑',
    bonusSpaces: 2,
  },
];

let eventCounter = 0;

function nextId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-${Date.now()}-${eventCounter}`;
}

function makeCelebration(kind: CelebrationKind) {
  return {
    id: nextId(`cel-${kind}`),
    kind,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a GameRoomState read from Firebase RTDB where empty arrays
 * or absent keys may be stripped to undefined/null.
 */
export function normalizeRoomState(
  raw: Partial<GameRoomState> | null | undefined
): GameRoomState | null {
  if (!raw || !raw.roomCode) return null;

  const players: PlayerState[] = Array.isArray(raw.players)
    ? raw.players
        .filter((p): p is PlayerState => Boolean(p && p.id))
        .map((p, idx) => ({
          id: p.id,
          name: p.name ?? String(p.id),
          isKid: Boolean(p.isKid),
          color: p.color ?? '#ff5e99',
          accentColor: p.accentColor ?? '#ffd43b',
          portraitUrl: p.portraitUrl ?? `/images/portraits/${p.id}.png`,
          tokenUrl: p.tokenUrl ?? `/images/tokens/${p.id}.png`,
          tileIndex: typeof p.tileIndex === 'number' ? p.tileIndex : 0,
          stuckTurns: typeof p.stuckTurns === 'number' ? p.stuckTurns : 0,
          miniGamesWon: typeof p.miniGamesWon === 'number' ? p.miniGamesWon : 0,
          actionCardsCompleted:
            typeof p.actionCardsCompleted === 'number' ? p.actionCardsCompleted : 0,
          turnOrder: typeof p.turnOrder === 'number' ? p.turnOrder : idx,
        }))
    : [];

  const movement: MovementState | null = raw.movement
    ? {
        playerId: raw.movement.playerId,
        fromTile: raw.movement.fromTile ?? 0,
        toTile: raw.movement.toTile ?? 0,
        path: Array.isArray(raw.movement.path) ? raw.movement.path : [],
        shortcutUsed: raw.movement.shortcutUsed ?? null,
        shortcutWaypoints: Array.isArray(raw.movement.shortcutWaypoints)
          ? raw.movement.shortcutWaypoints
          : [],
        isBonusMove: Boolean(raw.movement.isBonusMove),
        isBackward: Boolean(raw.movement.isBackward),
        startedAt: raw.movement.startedAt ?? Date.now(),
      }
    : null;

  const settings: GameSettings = {
    kidFriendlyLandmarks:
      raw.settings?.kidFriendlyLandmarks ?? DEFAULT_GAME_SETTINGS.kidFriendlyLandmarks,
    enableMiniGames:
      raw.settings?.enableMiniGames ?? DEFAULT_GAME_SETTINGS.enableMiniGames,
    enableActionCards:
      raw.settings?.enableActionCards ?? DEFAULT_GAME_SETTINGS.enableActionCards,
    enableCutscenes:
      raw.settings?.enableCutscenes ?? DEFAULT_GAME_SETTINGS.enableCutscenes,
  };

  const safePlayerIndex =
    players.length > 0
      ? Math.max(0, Math.min(raw.currentPlayerIndex ?? 0, players.length - 1))
      : 0;

  return {
    roomCode: raw.roomCode,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
    hostConnected: Boolean(raw.hostConnected),
    tabletConnected: Boolean(raw.tabletConnected),
    phase: raw.phase ?? 'lobby',
    settings,
    players,
    currentPlayerIndex: safePlayerIndex,
    turnNumber: raw.turnNumber ?? 1,
    deck: Array.isArray(raw.deck) ? raw.deck : [],
    discardPile: Array.isArray(raw.discardPile) ? raw.discardPile : [],
    currentCard: raw.currentCard ?? null,
    movement,
    miniGame: raw.miniGame ?? null,
    nextMiniGameIndex: raw.nextMiniGameIndex ?? 0,
    actionCard: raw.actionCard ?? null,
    usedActionCardIds: Array.isArray(raw.usedActionCardIds)
      ? raw.usedActionCardIds
      : [],
    cutscene: raw.cutscene ?? null,
    winnerId: raw.winnerId ?? null,
    celebration: raw.celebration ?? null,
    lastEventBanner: raw.lastEventBanner ?? null,
    lastEventId: raw.lastEventId ?? null,
    lastVoiceKey: raw.lastVoiceKey ?? null,
  };
}

/**
 * Converts an ordered array of CharacterDefinitions into initial PlayerState entries.
 */
export function createPlayersFromCharacters(
  characters: readonly CharacterDefinition[]
): PlayerState[] {
  return characters.map((char, index) => ({
    id: char.id,
    name: char.name,
    isKid: char.isKid,
    color: char.color,
    accentColor: char.accentColor,
    portraitUrl: char.portraitUrl,
    tokenUrl: char.tokenUrl,
    tileIndex: 0,
    stuckTurns: 0,
    miniGamesWon: 0,
    actionCardsCompleted: 0,
    turnOrder: index,
  }));
}

/**
 * Creates a brand new lobby GameRoomState.
 */
export function createInitialRoomState(
  roomCode: string,
  players: PlayerState[] = [],
  settingsOverride?: Partial<GameSettings>,
  rng: () => number = Math.random
): GameRoomState {
  const settings: GameSettings = {
    ...DEFAULT_GAME_SETTINGS,
    ...settingsOverride,
  };
  const now = Date.now();
  return {
    roomCode: roomCode.toUpperCase(),
    createdAt: now,
    updatedAt: now,
    hostConnected: true,
    tabletConnected: false,
    phase: 'lobby',
    settings,
    players,
    currentPlayerIndex: 0,
    turnNumber: 1,
    deck: createDeck(settings, rng),
    discardPile: [],
    currentCard: null,
    movement: null,
    miniGame: null,
    nextMiniGameIndex: 0,
    actionCard: null,
    usedActionCardIds: [],
    cutscene: null,
    winnerId: null,
    celebration: null,
    lastEventBanner: 'Pick your family characters to start the adventure!',
    lastEventId: nextId('lobby'),
    lastVoiceKey: 'event_welcome',
  };
}

/**
 * Starts the game from the lobby with the selected players.
 */
export function startGameState(
  state: GameRoomState,
  rng: () => number = Math.random
): GameRoomState {
  const resetPlayers = state.players.map((p, idx) => ({
    ...p,
    tileIndex: 0,
    stuckTurns: 0,
    miniGamesWon: 0,
    actionCardsCompleted: 0,
    turnOrder: idx,
  }));

  const firstPlayer = resetPlayers[0];
  const now = Date.now();

  return {
    ...state,
    updatedAt: now,
    phase: 'waiting-draw',
    players: resetPlayers,
    currentPlayerIndex: 0,
    turnNumber: 1,
    deck: createDeck(state.settings, rng),
    discardPile: [],
    currentCard: null,
    movement: null,
    miniGame: null,
    nextMiniGameIndex: 0,
    actionCard: null,
    usedActionCardIds: [],
    cutscene: null,
    winnerId: null,
    celebration: null,
    lastEventBanner: firstPlayer
      ? `Adventure begins! It's ${firstPlayer.name}'s turn!`
      : 'Adventure begins!',
    lastEventId: nextId('start'),
    lastVoiceKey: firstPlayer ? `turn_${firstPlayer.id}` : 'event_welcome',
  };
}

export function getLastTileIndex(tiles: readonly BoardTile[]): number {
  if (tiles.length === 0) return 60;
  return tiles[tiles.length - 1].index;
}

export function getTileByIndex(
  tiles: readonly BoardTile[],
  index: number
): BoardTile | undefined {
  return tiles.find((t) => t.index === index);
}

/**
 * Builds step-by-step tile indices from `fromTile` to `toTile`.
 * Long landmark teleports (> 14 spaces) glide directly in 1 swoop so kids aren't waiting.
 */
export function buildHopPath(fromTile: number, toTile: number): number[] {
  if (fromTile === toTile) return [];
  const distance = Math.abs(toTile - fromTile);
  if (distance > 14) {
    return [toTile];
  }
  const step = toTile > fromTile ? 1 : -1;
  const path: number[] = [];
  for (let idx = fromTile + step; step > 0 ? idx <= toTile : idx >= toTile; idx += step) {
    path.push(idx);
  }
  return path;
}

export interface ComputedCardMove {
  path: number[];
  toTile: number;
  shortcut: BoardShortcut | null;
  isBackward: boolean;
  banner: string;
}

/**
 * Pure deterministic calculation of where a drawn card moves a player.
 */
export function computeMovementForCard(
  player: PlayerState,
  card: Card,
  tiles: readonly BoardTile[],
  shortcuts: readonly BoardShortcut[],
  settings: GameSettings
): ComputedCardMove {
  const lastIndex = getLastTileIndex(tiles);
  const start = player.tileIndex;

  if (card.type === 'single' || card.type === 'double') {
    const neededMatches = card.type === 'double' ? 2 : 1;
    let found = 0;
    let target = lastIndex;

    for (const tile of tiles) {
      if (tile.index <= start) continue;
      // Regular single/double color cards strictly skip 'pink' candy landmark tiles and 'licorice' traps
      if (tile.color === 'pink' || tile.color === 'licorice') continue;
      if (tile.color === card.color || tile.color === 'rainbow') {
        found += 1;
        target = tile.index;
        if (found >= neededMatches || tile.index === lastIndex) {
          break;
        }
      }
    }

    const basePath = buildHopPath(start, target);
    const shortcut = shortcuts.find((s) => s.fromTile === target) ?? null;
    const finalTile = shortcut ? shortcut.toTile : target;
    const path = shortcut ? [...basePath, shortcut.toTile] : basePath;

    return {
      path,
      toTile: finalTile,
      shortcut,
      isBackward: false,
      banner: shortcut
        ? `${player.name} found ${shortcut.name}! Zoom ahead!`
        : `${player.name} drew ${card.label}!`,
    };
  }

  if (card.type === 'landmark' && card.landmark) {
    const landmarkTile = tiles.find((t) => t.landmark === card.landmark);
    const meta = LANDMARK_META[card.landmark];
    let target = landmarkTile ? landmarkTile.index : Math.min(start + 4, lastIndex);
    let isBackward = target < start;
    let banner = `${player.name} zooms to ${meta.label}! ${meta.emoji}`;

    if (isBackward && settings.kidFriendlyLandmarks && player.isKid) {
      // Optional kid-friendly protection when toggled ON: advance forward instead of pulling backwards
      target = Math.min(start + 3, lastIndex);
      isBackward = false;
      banner = `Sweet Landmark Boost! ${player.name} hops +3 spaces! ✨`;
    } else if (isBackward) {
      banner = `Whoa! Back to ${meta.label}! ${meta.emoji}`;
    } else if (target === start) {
      target = Math.min(start + 1, lastIndex);
      banner = `Already at ${meta.label}! ${player.name} hops +1 bonus space!`;
    }

    const basePath = buildHopPath(start, target);
    const shortcut = shortcuts.find((s) => s.fromTile === target) ?? null;
    const finalTile = shortcut ? shortcut.toTile : target;
    const path = shortcut ? [...basePath, shortcut.toTile] : basePath;

    return {
      path,
      toTile: finalTile,
      shortcut,
      isBackward,
      banner,
    };
  }

  if (card.type === 'licorice') {
    // Move to the nearest Licorice Lagoon trap ahead within 24 tiles, or stick in place!
    const aheadTrap = tiles.find(
      (t) => t.isLicoriceTrap && t.index > start && t.index - start <= 24
    );
    const target = aheadTrap ? aheadTrap.index : start;
    return {
      path: buildHopPath(start, target),
      toTile: target,
      shortcut: null,
      isBackward: false,
      banner: `Uh-oh! ${player.name} hit a sticky Licorice Swirl!`,
    };
  }

  // Action card stays in place until completed
  return {
    path: [],
    toTile: start,
    shortcut: null,
    isBackward: false,
    banner: `Silly Action Card for ${player.name}!`,
  };
}

/**
 * Advances turn to the next player in turnOrder.
 */
export function advanceToNextTurn(
  state: GameRoomState,
  customBanner?: string
): GameRoomState {
  if (state.players.length === 0) return state;
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex];
  const wrapped = nextIndex === 0;

  const isStuck = nextPlayer.stuckTurns > 0;
  const banner =
    customBanner ??
    (isStuck
      ? `${nextPlayer.name} is stuck in Licorice Lagoon! Tap to wiggle free!`
      : `It's ${nextPlayer.name}'s turn! Tap to draw a card!`);

  return {
    ...state,
    updatedAt: Date.now(),
    phase: 'waiting-draw',
    currentPlayerIndex: nextIndex,
    turnNumber: wrapped ? state.turnNumber + 1 : state.turnNumber,
    currentCard: null,
    movement: null,
    miniGame: null,
    actionCard: null,
    cutscene: null,
    lastEventBanner: banner,
    lastEventId: nextId('turn'),
    lastVoiceKey: isStuck ? 'event_licorice_skip' : `turn_${nextPlayer.id}`,
  };
}

/**
 * Step 1 of a turn: Current player taps "Draw Card" (or "Wiggle Free" if stuck).
 * Transitions `waiting-draw` -> `card-drawn` (or clears licorice stickiness and advances).
 */
export function applyDrawCard(
  state: GameRoomState,
  rng: () => number = Math.random
): GameRoomState {
  if (state.phase !== 'waiting-draw' || state.players.length === 0) {
    return state;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer) return state;

  // Stuck in Licorice Lagoon: wiggle free and pass turn!
  if (currentPlayer.stuckTurns > 0) {
    const updatedPlayers = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex
        ? { ...p, stuckTurns: Math.max(0, p.stuckTurns - 1) }
        : p
    );
    const nextIndex = (state.currentPlayerIndex + 1) % updatedPlayers.length;
    const nextPlayer = updatedPlayers[nextIndex];
    const nextIsStuck = nextPlayer.stuckTurns > 0;
    return {
      ...state,
      updatedAt: Date.now(),
      players: updatedPlayers,
      currentPlayerIndex: nextIndex,
      turnNumber: nextIndex === 0 ? state.turnNumber + 1 : state.turnNumber,
      phase: 'waiting-draw',
      currentCard: null,
      movement: null,
      lastEventBanner: `${currentPlayer.name} wiggled free from Licorice Lagoon! Now it's ${nextPlayer.name}'s turn!`,
      lastEventId: nextId('licorice-free'),
      lastVoiceKey: nextIsStuck ? 'event_licorice_skip' : `turn_${nextPlayer.id}`,
    };
  }

  const { card, deck, discardPile } = drawFromDeck(
    state.deck,
    state.discardPile,
    state.settings,
    rng
  );

  const celebration =
    card.type === 'double'
      ? makeCelebration('double-card')
      : card.type === 'landmark'
      ? makeCelebration('card-reveal')
      : null;

  return {
    ...state,
    updatedAt: Date.now(),
    phase: 'card-drawn',
    deck,
    discardPile,
    currentCard: card,
    movement: null,
    celebration,
    lastEventBanner: `${currentPlayer.name} drew ${card.label}!`,
    lastEventId: nextId('draw'),
    lastVoiceKey: getVoiceKeyForCard(card),
  };
}

function pickActionCardForPlayer(
  player: PlayerState,
  pool: readonly ActionCardItem[],
  usedIds: readonly string[],
  rng: () => number
): { item: ActionCardItem; nextUsedIds: string[] } {
  const source = pool.length > 0 ? pool : FALLBACK_ACTION_CARDS;
  const targetTier = player.isKid ? 'kid' : 'adult';
  const tierCards = source.filter((c) => c.tier === targetTier);
  const candidates = tierCards.length > 0 ? tierCards : source;
  const unused = candidates.filter((c) => !usedIds.includes(c.id));
  const pickFrom = unused.length > 0 ? unused : candidates;
  const chosen = pickFrom[Math.floor(rng() * pickFrom.length)];
  const nextUsedIds =
    unused.length > 0 ? [...usedIds, chosen.id] : [chosen.id];

  return { item: chosen, nextUsedIds };
}

function createCutsceneSession(
  type: CutsceneType,
  player: PlayerState,
  nextPhase: TurnPhase,
  context: EngineContext,
  pendingBonusSpaces = 0
): CutsceneSession {
  const titles: Record<CutsceneType, { title: string; subtitle: string }> = {
    'shortcut-peppermint': {
      title: 'Peppermint Pass Shortcut!',
      subtitle: `${player.name} zipped across the sparkling peppermint bridge!`,
    },
    'shortcut-gummy': {
      title: 'Gummy Pass Shortcut!',
      subtitle: `${player.name} bounced over Gummy Hills in record time!`,
    },
    'licorice-stuck': {
      title: 'Sticky Licorice Lagoon!',
      subtitle: `Oh no! ${player.name}'s shoes got stuck in goofy licorice goo!`,
    },
    'landmark-lollipop': {
      title: 'Welcome to Lollipop Woods!',
      subtitle: `${player.name} arrived among the giant swirling lollipops!`,
    },
    'landmark-ice-palace': {
      title: 'Shimmering Ice Palace!',
      subtitle: `${player.name} reached the frosty crystal popsicle palace!`,
    },
    'landmark-chocolate': {
      title: 'Welcome to Chocolate Mountain!',
      subtitle: `${player.name} climbed the delicious swirling chocolate fudge peaks!`,
    },
    'victory-castle': {
      title: `${player.name} Reached Candy Castle!`,
      subtitle: 'Hooray!! A royal Candyland celebration!',
    },
  };

  const videoUrl = context.getVideoUrl
    ? context.getVideoUrl(type, player.id)
    : null;

  return {
    id: nextId(`cutscene-${type}`),
    type,
    videoUrl,
    title: titles[type].title,
    subtitle: titles[type].subtitle,
    playerId: player.id,
    playerName: player.name,
    playerPortraitUrl: player.portraitUrl,
    nextPhase,
    pendingBonusSpaces,
    startedAt: Date.now(),
  };
}

function createMiniGameSession(
  state: GameRoomState,
  player: PlayerState
): MiniGameSession {
  const type = MINI_GAME_ORDER[state.nextMiniGameIndex % MINI_GAME_ORDER.length];
  return {
    id: nextId(`mg-${type}`),
    type,
    title: MINI_GAME_LABELS[type],
    playerId: player.id,
    playerName: player.name,
    playerPortraitUrl: player.portraitUrl,
    playerColor: player.color,
    isKid: player.isKid,
    targetScore: player.isKid ? 6 : 10,
    durationSeconds: 10,
    bonusSpacesOnWin: 3,
    bonusSpacesOnTry: 1,
    score: 0,
    progress: 0,
    status: 'ready',
    won: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Step 2 of a turn: After the card reveal finishes (~1.3s), resolve the card
 * into hop-by-hop movement, an Action Card overlay, or a Licorice trap.
 */
export function applyResolveDrawnCard(
  state: GameRoomState,
  context: EngineContext,
  rng: () => number = Math.random
): GameRoomState {
  if (state.phase !== 'card-drawn' || !state.currentCard) return state;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;

  const card = state.currentCard;

  // Action card launches the silly family prompt immediately!
  if (card.type === 'action') {
    const { item, nextUsedIds } = pickActionCardForPlayer(
      player,
      context.actionCards,
      state.usedActionCardIds,
      rng
    );
    const session: ActionCardSession = {
      id: nextId('action-session'),
      card: item,
      playerId: player.id,
      playerName: player.name,
      playerPortraitUrl: player.portraitUrl,
      playerColor: player.color,
      isKid: player.isKid,
      status: 'active',
      startedAt: Date.now(),
    };
    return {
      ...state,
      updatedAt: Date.now(),
      phase: 'action-card',
      actionCard: session,
      usedActionCardIds: nextUsedIds,
      lastEventBanner: `${player.name}'s Action Card: ${item.title}!`,
      lastEventId: nextId('action-start'),
      lastVoiceKey: null,
    };
  }

  const computed = computeMovementForCard(
    player,
    card,
    context.tiles,
    context.shortcuts,
    state.settings
  );

  // Licorice card when no ahead trap is within range: stick in place!
  if (card.type === 'licorice' && computed.path.length === 0) {
    const updatedPlayers = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? { ...p, stuckTurns: 1 } : p
    );
    if (state.settings.enableCutscenes) {
      const cutscene = createCutsceneSession(
        'licorice-stuck',
        player,
        'waiting-draw',
        context
      );
      return {
        ...state,
        updatedAt: Date.now(),
        players: updatedPlayers,
        phase: 'cutscene',
        cutscene,
        lastEventBanner: computed.banner,
        lastEventId: nextId('licorice-trap'),
        lastVoiceKey: cutscene.videoUrl ? null : 'event_licorice_stuck',
      };
    }
    return advanceToNextTurn(
      { ...state, players: updatedPlayers },
      `${player.name} got stuck in Licorice Lagoon for 1 turn!`
    );
  }

  const movement: MovementState = {
    playerId: player.id,
    fromTile: player.tileIndex,
    toTile: computed.toTile,
    path: computed.path,
    shortcutUsed: computed.shortcut ? computed.shortcut.id : null,
    shortcutWaypoints: computed.shortcut ? computed.shortcut.waypoints : [],
    isBonusMove: false,
    isBackward: computed.isBackward,
    startedAt: Date.now(),
  };

  return {
    ...state,
    updatedAt: Date.now(),
    phase: 'moving',
    movement,
    lastEventBanner: computed.banner,
    lastEventId: nextId('move-start'),
    lastVoiceKey: null,
  };
}

/**
 * Step 3 of a turn: Called when hop-by-hop (and optional shortcut glide) finishes.
 * Evaluates Victory -> Shortcut Cutscene -> Licorice Trap -> Landmark Cutscene -> Star Mini-Game -> Next Turn.
 */
export function applyMoveComplete(
  state: GameRoomState,
  context: EngineContext
): GameRoomState {
  if (state.phase !== 'moving' || !state.movement) return state;

  const { movement } = state;
  const playerIdx = state.players.findIndex((p) => p.id === movement.playerId);
  if (playerIdx === -1) return advanceToNextTurn(state);

  const lastTileIndex = getLastTileIndex(context.tiles);
  const clampedTile = Math.max(0, Math.min(movement.toTile, lastTileIndex));
  const landedTile = getTileByIndex(context.tiles, clampedTile);

  const updatedPlayers = state.players.map((p, idx) =>
    idx === playerIdx ? { ...p, tileIndex: clampedTile } : p
  );
  const player = updatedPlayers[playerIdx];
  const baseState: GameRoomState = {
    ...state,
    updatedAt: Date.now(),
    players: updatedPlayers,
    movement: null,
    lastVoiceKey: null,
  };

  // 1. Victory at Candy Castle!
  if (clampedTile >= lastTileIndex || landedTile?.landmark === 'castle') {
    const victoryState: GameRoomState = {
      ...baseState,
      winnerId: player.id,
      celebration: makeCelebration('victory'),
      lastEventBanner: `🎉 ${player.name} reached Candy Castle and WON!!`,
      lastEventId: nextId('victory'),
      lastVoiceKey: `victory_${player.id}`,
    };

    if (state.settings.enableCutscenes) {
      const cutscene = createCutsceneSession(
        'victory-castle',
        player,
        'victory',
        context
      );
      return {
        ...victoryState,
        phase: 'cutscene',
        cutscene,
        lastVoiceKey: cutscene.videoUrl ? null : `victory_${player.id}`,
      };
    }

    return {
      ...victoryState,
      phase: 'victory',
    };
  }

  // 2. Shortcut celebration cutscene!
  if (movement.shortcutUsed) {
    const cutsceneType: CutsceneType =
      movement.shortcutUsed === 'peppermint-pass'
        ? 'shortcut-peppermint'
        : 'shortcut-gummy';
    const voiceKey =
      movement.shortcutUsed === 'peppermint-pass'
        ? 'event_shortcut_peppermint'
        : 'event_shortcut_gummy';
    const nextPhase: TurnPhase =
      landedTile?.isStarMiniGame && state.settings.enableMiniGames
        ? 'minigame'
        : 'waiting-draw';

    if (state.settings.enableCutscenes) {
      const cutscene = createCutsceneSession(
        cutsceneType,
        player,
        nextPhase,
        context
      );
      return {
        ...baseState,
        phase: 'cutscene',
        celebration: makeCelebration('shortcut'),
        cutscene,
        lastEventBanner: `${player.name} zoomed through the shortcut!`,
        lastEventId: nextId('shortcut'),
        lastVoiceKey: cutscene.videoUrl ? null : voiceKey,
      };
    }

    if (nextPhase === 'minigame') {
      return {
        ...baseState,
        phase: 'minigame',
        celebration: makeCelebration('shortcut'),
        miniGame: createMiniGameSession(baseState, player),
        nextMiniGameIndex: baseState.nextMiniGameIndex + 1,
        lastEventBanner: `Mini-Game Time for ${player.name}!`,
        lastEventId: nextId('mg-start'),
        lastVoiceKey: 'event_minigame_intro',
      };
    }

    return advanceToNextTurn({
      ...baseState,
      celebration: makeCelebration('shortcut'),
      lastVoiceKey: voiceKey,
    });
  }

  // 3. Licorice Lagoon sticky trap!
  const hitLicorice =
    Boolean(landedTile?.isLicoriceTrap) ||
    (state.currentCard?.type === 'licorice' && !movement.isBonusMove);

  if (hitLicorice && !movement.isBonusMove) {
    const stuckPlayers = updatedPlayers.map((p, idx) =>
      idx === playerIdx ? { ...p, stuckTurns: 1 } : p
    );
    const stuckState: GameRoomState = {
      ...baseState,
      players: stuckPlayers,
      lastEventBanner: `Uh-oh! ${player.name} got stuck in Licorice Lagoon!`,
      lastEventId: nextId('licorice-land'),
      lastVoiceKey: 'event_licorice_stuck',
    };

    if (state.settings.enableCutscenes) {
      const cutscene = createCutsceneSession(
        'licorice-stuck',
        player,
        'waiting-draw',
        context
      );
      return {
        ...stuckState,
        phase: 'cutscene',
        cutscene,
        lastVoiceKey: cutscene.videoUrl ? null : 'event_licorice_stuck',
      };
    }

    return advanceToNextTurn(stuckState);
  }

  // 4. Landmark cutscenes (Lollipop Woods, Ice Palace & Chocolate Mountain)
  const shouldPlayLandmarkCutscene =
    !movement.isBonusMove &&
    state.settings.enableCutscenes &&
    (landedTile?.landmark === 'lollipop' ||
      landedTile?.landmark === 'popsicle' ||
      landedTile?.landmark === 'chocolate');

  if (shouldPlayLandmarkCutscene && landedTile) {
    const type: CutsceneType =
      landedTile.landmark === 'lollipop'
        ? 'landmark-lollipop'
        : landedTile.landmark === 'popsicle'
          ? 'landmark-ice-palace'
          : 'landmark-chocolate';
    const nextPhase: TurnPhase =
      landedTile.isStarMiniGame && state.settings.enableMiniGames
        ? 'minigame'
        : 'waiting-draw';
    return {
      ...baseState,
      phase: 'cutscene',
      cutscene: createCutsceneSession(type, player, nextPhase, context),
      celebration: makeCelebration('card-reveal'),
      lastEventBanner: `${player.name} arrived at ${LANDMARK_META[landedTile.landmark!].regionName}!`,
      lastEventId: nextId('landmark-cutscene'),
      lastVoiceKey: null,
    };
  }

  // 5. Star Mini-Game tile!
  if (
    landedTile?.isStarMiniGame &&
    state.settings.enableMiniGames &&
    !movement.isBonusMove
  ) {
    const miniGame = createMiniGameSession(baseState, player);
    return {
      ...baseState,
      phase: 'minigame',
      miniGame,
      nextMiniGameIndex: baseState.nextMiniGameIndex + 1,
      lastEventBanner: `⭐ Star Mini-Game! ${player.name}: ${miniGame.title}`,
      lastEventId: nextId('minigame'),
      lastVoiceKey: 'event_minigame_intro',
    };
  }

  // 6. Standard landing -> next player's turn!
  return advanceToNextTurn(baseState);
}

/**
 * Finishes or skips the active video cutscene and transitions to `cutscene.nextPhase`.
 */
export function applyCutsceneComplete(state: GameRoomState): GameRoomState {
  if (state.phase !== 'cutscene' || !state.cutscene) return state;

  const { cutscene } = state;
  const player = state.players[state.currentPlayerIndex];

  if (cutscene.nextPhase === 'victory') {
    const winnerId = state.winnerId ?? player?.id ?? null;
    return {
      ...state,
      updatedAt: Date.now(),
      phase: 'victory',
      cutscene: null,
      celebration: makeCelebration('victory'),
      lastEventId: nextId('victory-reveal'),
      lastVoiceKey: winnerId ? `victory_${winnerId}` : 'victory_generic',
    };
  }

  if (cutscene.nextPhase === 'minigame' && player) {
    const miniGame = createMiniGameSession(state, player);
    return {
      ...state,
      updatedAt: Date.now(),
      phase: 'minigame',
      cutscene: null,
      miniGame,
      nextMiniGameIndex: state.nextMiniGameIndex + 1,
      lastEventBanner: `⭐ Star Mini-Game! ${player.name}: ${miniGame.title}`,
      lastEventId: nextId('minigame-post-cutscene'),
      lastVoiceKey: 'event_minigame_intro',
    };
  }

  return advanceToNextTurn({
    ...state,
    cutscene: null,
  });
}

/**
 * Updates live mini-game score & progress (throttled from tablet -> TV).
 */
export function applyMiniGameScore(
  state: GameRoomState,
  score: number,
  progress: number
): GameRoomState {
  if (state.phase !== 'minigame' || !state.miniGame) return state;
  return {
    ...state,
    updatedAt: Date.now(),
    miniGame: {
      ...state.miniGame,
      score,
      progress: Math.max(0, Math.min(1, progress)),
      status: 'playing',
      updatedAt: Date.now(),
    },
  };
}

/**
 * Completes a mini-game and launches a bonus hop (+3 on win, +1 on great try!).
 */
export function applyMiniGameComplete(
  state: GameRoomState,
  won: boolean,
  finalScore: number,
  context: EngineContext
): GameRoomState {
  if (state.phase !== 'minigame' || !state.miniGame) return state;

  const mg = state.miniGame;
  const playerIdx = state.players.findIndex((p) => p.id === mg.playerId);
  if (playerIdx === -1) return advanceToNextTurn(state);

  const player = state.players[playerIdx];
  const bonusSpaces = won ? mg.bonusSpacesOnWin : mg.bonusSpacesOnTry;
  const lastTileIndex = getLastTileIndex(context.tiles);
  const targetTile = Math.min(player.tileIndex + bonusSpaces, lastTileIndex);

  const updatedPlayers = state.players.map((p, idx) =>
    idx === playerIdx
      ? { ...p, miniGamesWon: p.miniGamesWon + (won ? 1 : 0) }
      : p
  );

  const shortcut =
    context.shortcuts.find((s) => s.fromTile === targetTile) ?? null;
  const basePath = buildHopPath(player.tileIndex, targetTile);
  const finalTile = shortcut ? shortcut.toTile : targetTile;
  const path = shortcut ? [...basePath, shortcut.toTile] : basePath;

  const movement: MovementState = {
    playerId: player.id,
    fromTile: player.tileIndex,
    toTile: finalTile,
    path,
    shortcutUsed: shortcut ? shortcut.id : null,
    shortcutWaypoints: shortcut ? shortcut.waypoints : [],
    isBonusMove: true,
    isBackward: false,
    startedAt: Date.now(),
  };

  return {
    ...state,
    updatedAt: Date.now(),
    players: updatedPlayers,
    phase: path.length > 0 ? 'moving' : 'waiting-draw',
    miniGame: null,
    movement: path.length > 0 ? movement : null,
    celebration: won ? makeCelebration('minigame-win') : null,
    lastEventBanner: won
      ? `🌟 ${player.name} WON the mini-game (${finalScore} pts)! +${bonusSpaces} bonus spaces!`
      : `🍬 Great try, ${player.name}! +${bonusSpaces} sweet bonus space!`,
    lastEventId: nextId('mg-done'),
    lastVoiceKey: won ? 'event_minigame_win' : 'event_minigame_try',
  };
}

/**
 * Resolves an Action Card (parent taps "COMPLETE!" or "Skip").
 */
export function applyActionCardComplete(
  state: GameRoomState,
  completed: boolean,
  context: EngineContext
): GameRoomState {
  if (state.phase !== 'action-card' || !state.actionCard) return state;

  const session = state.actionCard;
  const playerIdx = state.players.findIndex((p) => p.id === session.playerId);
  if (playerIdx === -1) return advanceToNextTurn(state);

  if (!completed) {
    return advanceToNextTurn(
      { ...state, actionCard: null },
      `${session.playerName} passed on the action card. Next turn!`
    );
  }

  const player = state.players[playerIdx];
  const bonusSpaces = Math.max(1, session.card.bonusSpaces);
  const lastTileIndex = getLastTileIndex(context.tiles);
  const targetTile = Math.min(player.tileIndex + bonusSpaces, lastTileIndex);

  const updatedPlayers = state.players.map((p, idx) =>
    idx === playerIdx
      ? { ...p, actionCardsCompleted: p.actionCardsCompleted + 1 }
      : p
  );

  const shortcut =
    context.shortcuts.find((s) => s.fromTile === targetTile) ?? null;
  const basePath = buildHopPath(player.tileIndex, targetTile);
  const finalTile = shortcut ? shortcut.toTile : targetTile;
  const path = shortcut ? [...basePath, shortcut.toTile] : basePath;

  const movement: MovementState = {
    playerId: player.id,
    fromTile: player.tileIndex,
    toTile: finalTile,
    path,
    shortcutUsed: shortcut ? shortcut.id : null,
    shortcutWaypoints: shortcut ? shortcut.waypoints : [],
    isBonusMove: true,
    isBackward: false,
    startedAt: Date.now(),
  };

  return {
    ...state,
    updatedAt: Date.now(),
    players: updatedPlayers,
    phase: path.length > 0 ? 'moving' : 'waiting-draw',
    actionCard: null,
    movement: path.length > 0 ? movement : null,
    celebration: makeCelebration('action-complete'),
    lastEventBanner: `🎉 Awesome job, ${player.name}! +${bonusSpaces} bonus spaces!`,
    lastEventId: nextId('action-done'),
    lastVoiceKey: 'event_action_complete',
  };
}

/**
 * Resets a completed game to play again with the same family roster.
 */
export function applyPlayAgain(
  state: GameRoomState,
  rng: () => number = Math.random
): GameRoomState {
  return startGameState(state, rng);
}
