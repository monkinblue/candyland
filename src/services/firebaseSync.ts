import { useEffect, useMemo, useRef, useState } from 'react';
import {
  endAt,
  get,
  onDisconnect,
  onValue,
  orderByChild,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
} from 'firebase/database';
import { database, isFirebaseConfigured } from '../firebaseConfig';
import { ALL_ACTION_CARDS } from '../data/actionCards';
import { BOARD_SHORTCUTS, BOARD_TILES } from '../data/boardData';
import { getCutsceneVideoUrl } from '../data/videoManifest';
import {
  applyActionCardComplete,
  applyCutsceneComplete,
  applyDrawCard,
  applyMiniGameComplete,
  applyMiniGameScore,
  applyMoveComplete,
  applyPlayAgain,
  applyResolveDrawnCard,
  createInitialRoomState,
  normalizeRoomState,
  startGameState,
  type EngineContext,
} from '../engine/rules';
import type {
  GameRoomState,
  GameSettings,
  PlayerState,
} from '../types/game';

export type SyncRole = 'host' | 'tablet' | 'mirror';
export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'local'
  | 'error';
export type TransportMode = 'firebase' | 'local';

export interface CreateRoomOptions {
  roomCode?: string;
  players?: PlayerState[];
  settings?: Partial<GameSettings>;
}

export interface RoomActions {
  updatePlayers: (players: PlayerState[]) => Promise<GameRoomState | null>;
  updateSettings: (
    settings: Partial<GameSettings>
  ) => Promise<GameRoomState | null>;
  startGame: () => Promise<GameRoomState | null>;
  drawCard: () => Promise<GameRoomState | null>;
  resolveDrawnCard: (context?: EngineContext) => Promise<GameRoomState | null>;
  advanceMoveComplete: (
    context?: EngineContext
  ) => Promise<GameRoomState | null>;
  submitMiniGameScore: (score: number, progress: number) => void;
  finishMiniGame: (
    won: boolean,
    finalScore: number,
    context?: EngineContext
  ) => Promise<GameRoomState | null>;
  completeActionCard: (
    completed: boolean,
    context?: EngineContext
  ) => Promise<GameRoomState | null>;
  finishCutscene: () => Promise<GameRoomState | null>;
  playAgain: () => Promise<GameRoomState | null>;
  returnToLobby: () => Promise<GameRoomState | null>;
}

export interface UseGameRoomResult {
  room: GameRoomState | null;
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  transportMode: TransportMode;
  isConnected: boolean;
  actions: RoomActions;
}

// ============================================================================
// Kid-Friendly Room Code Generator (Excludes I, O, 0, 1 & Bad Words)
// ============================================================================

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const KID_FRIENDLY_WORDS: readonly string[] = [
  'CAKE',
  'GUMY',
  'FUDG',
  'PLUM',
  'PEAR',
  'TART',
  'STAR',
  'BEAR',
  'SWET',
  'SUGA',
  'YUMY',
  'CANE',
  'PUFF',
  'ZEST',
  'ZING',
  'CAFE',
  'CHEF',
  'LUSH',
  'JUMP',
  'PLAY',
  'GLAD',
  'BEAM',
  'WAVE',
  'DASH',
  'HUGS',
  'GLEE',
  'JAMZ',
  'SNAP',
  'CLAP',
  'BLUE',
  'PEAK',
  'CREM',
  'BUNS',
  'NANA',
  'PAPA',
  'EMMA',
  'WYAT',
  'DAWN',
  'RUBY',
  'JADE',
  'MALT',
  'TANG',
  'PURE',
  'RUSH',
  'TADA',
  'WAND',
  'CAST',
  'DUKE',
  'BARK',
  'MEAD',
  'NUTS',
  'CHEW',
  'MELT',
  'CRSP',
  'SPRK',
  'JAZY',
];

const BLOCKED_CODES = new Set<string>([
  'ANAL',
  'ANUS',
  'ARSE',
  'ASSH',
  'BUMS',
  'CLAN',
  'CRAP',
  'CUNT',
  'DAMN',
  'DANG',
  'DUMB',
  'DYKE',
  'FAGS',
  'FART',
  'FUCK',
  'FUKK',
  'GAYS',
  'HATE',
  'HELL',
  'JERK',
  'KILL',
  'KKK',
  'LUST',
  'METH',
  'NAZY',
  'NUDE',
  'PUBE',
  'RAPE',
  'SCUM',
  'SEXY',
  'SHAT',
  'SLUT',
  'SMUT',
  'SUCK',
  'TURD',
  'TWAT',
  'WANK',
]);

const VALID_CHAR_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

export function sanitizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code);
}

function randomSafeCode(): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let code = '';
    for (let i = 0; i < 4; i += 1) {
      const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[idx];
    }
    if (!BLOCKED_CODES.has(code)) {
      return code;
    }
  }
  return 'CAKE';
}

export function generateRoomCode(existingCodes?: ReadonlySet<string>): string {
  const validCurated = KID_FRIENDLY_WORDS.filter(
    (w) =>
      VALID_CHAR_REGEX.test(w) &&
      !BLOCKED_CODES.has(w) &&
      (!existingCodes || !existingCodes.has(w))
  );

  // Prefer cheerful candy words first so 3- and 4-year-olds & parents love reading them aloud
  if (validCurated.length > 0 && Math.random() < 0.8) {
    const idx = Math.floor(Math.random() * validCurated.length);
    return validCurated[idx];
  }

  for (let i = 0; i < 20; i += 1) {
    const candidate = randomSafeCode();
    if (!existingCodes || !existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return randomSafeCode();
}

// ============================================================================
// Engine Context Registry (Wired with boardData & videoManifest by host/app)
// ============================================================================

let defaultEngineContext: EngineContext = {
  tiles: BOARD_TILES,
  shortcuts: BOARD_SHORTCUTS,
  actionCards: ALL_ACTION_CARDS,
  getVideoUrl: (type, playerId) => getCutsceneVideoUrl(type, playerId),
};

export function setDefaultEngineContext(ctx: EngineContext): void {
  defaultEngineContext = {
    tiles: ctx.tiles,
    shortcuts: ctx.shortcuts,
    actionCards:
      ctx.actionCards.length > 0 ? ctx.actionCards : ALL_ACTION_CARDS,
    getVideoUrl: ctx.getVideoUrl,
  };
}

export function getDefaultEngineContext(): EngineContext {
  return defaultEngineContext;
}

function resolveContext(override?: EngineContext): EngineContext {
  if (override) {
    return {
      tiles:
        override.tiles.length > 0 ? override.tiles : defaultEngineContext.tiles,
      shortcuts:
        override.shortcuts.length > 0
          ? override.shortcuts
          : defaultEngineContext.shortcuts,
      actionCards:
        override.actionCards.length > 0
          ? override.actionCards
          : ALL_ACTION_CARDS,
      getVideoUrl: override.getVideoUrl ?? defaultEngineContext.getVideoUrl,
    };
  }
  return defaultEngineContext;
}

// ============================================================================
// Firebase RTDB Serialization & Normalization Helpers
// ============================================================================

/**
 * Recursively converts `undefined` values to `null` because Firebase RTDB
 * throws on any `undefined` property inside `set()` / `update()` / `runTransaction()`.
 */
export function stripUndefinedForFirebase<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedForFirebase(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = val === undefined ? null : stripUndefinedForFirebase(val);
  }
  return result as T;
}

/**
 * Firebase RTDB can turn sparse or partially-written arrays into numeric-keyed
 * plain objects (`{ "0": a, "1": b }`). Coerce safely back to dense arrays.
 */
function coerceArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null) as T[];
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => /^\d+$/.test(k))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v)
      .filter((item) => item !== undefined && item !== null);
    return entries as T[];
  }
  return [];
}

/**
 * Normalizes any raw snapshot from Firebase RTDB or localStorage into a
 * guaranteed-safe `GameRoomState` where every array field is a real `Array`.
 */
export function normalizeFirebaseRoom(raw: unknown): GameRoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawMovement =
    obj.movement && typeof obj.movement === 'object'
      ? (obj.movement as Record<string, unknown>)
      : null;

  const coerced: Partial<GameRoomState> = {
    ...(obj as Partial<GameRoomState>),
    players: coerceArray<PlayerState>(obj.players),
    deck: coerceArray(obj.deck),
    discardPile: coerceArray(obj.discardPile),
    usedActionCardIds: coerceArray<string>(obj.usedActionCardIds),
    movement: rawMovement
      ? ({
          ...rawMovement,
          path: coerceArray<number>(rawMovement.path),
          shortcutWaypoints: coerceArray(rawMovement.shortcutWaypoints),
        } as GameRoomState['movement'])
      : null,
  };

  return normalizeRoomState(coerced);
}

// ============================================================================
// Dual-Mode Transport (Firebase RTDB + Local BroadcastChannel / localStorage)
// ============================================================================

const LOCAL_STORAGE_PREFIX = 'candyland_room_v1_';
const BROADCAST_CHANNEL_NAME = 'candyland_rooms_sync_v1';

interface LocalBroadcastMessage {
  type: 'room-updated' | 'room-deleted';
  roomCode: string;
  state: GameRoomState | null;
  senderId: string;
  timestamp: number;
}

const TAB_SENDER_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type LocalRoomListener = (state: GameRoomState | null) => void;
const localListeners = new Map<string, Set<LocalRoomListener>>();
const localMemoryCache = new Map<string, GameRoomState>();

let broadcastChannel: BroadcastChannel | null = null;
let storageListenerBound = false;

function isUsingFirebase(): boolean {
  return Boolean(isFirebaseConfigured && database);
}

function getFirebaseDb(): Database | null {
  return isUsingFirebase() ? database : null;
}

export function getTransportMode(): TransportMode {
  return isUsingFirebase() ? 'firebase' : 'local';
}

function localKey(roomCode: string): string {
  return `${LOCAL_STORAGE_PREFIX}${roomCode.toUpperCase()}`;
}

function ensureLocalChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;

  if (!broadcastChannel && typeof BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event: MessageEvent<LocalBroadcastMessage>) => {
        const msg = event.data;
        if (!msg || msg.senderId === TAB_SENDER_ID || !msg.roomCode) return;
        const code = msg.roomCode.toUpperCase();
        const normalized = msg.state ? normalizeFirebaseRoom(msg.state) : null;
        if (normalized) {
          localMemoryCache.set(code, normalized);
        } else {
          localMemoryCache.delete(code);
        }
        notifyLocalListeners(code, normalized);
      };
    } catch {
      broadcastChannel = null;
    }
  }

  if (!storageListenerBound) {
    storageListenerBound = true;
    window.addEventListener('storage', (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith(LOCAL_STORAGE_PREFIX)) return;
      const code = event.key.slice(LOCAL_STORAGE_PREFIX.length).toUpperCase();
      if (!event.newValue) {
        localMemoryCache.delete(code);
        notifyLocalListeners(code, null);
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue);
        const normalized = normalizeFirebaseRoom(parsed);
        if (normalized) {
          localMemoryCache.set(code, normalized);
        }
        notifyLocalListeners(code, normalized);
      } catch {
        // Ignore corrupted external localStorage writes
      }
    });
  }

  return broadcastChannel;
}

function notifyLocalListeners(
  roomCode: string,
  state: GameRoomState | null
): void {
  const code = roomCode.toUpperCase();
  const listeners = localListeners.get(code);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // Isolate listener errors
    }
  }
}

function readLocalRoom(roomCode: string): GameRoomState | null {
  const code = roomCode.toUpperCase();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(localKey(code));
      if (raw) {
        const parsed = normalizeFirebaseRoom(JSON.parse(raw));
        if (parsed) {
          localMemoryCache.set(code, parsed);
          return parsed;
        }
      }
    } catch {
      // Fall back to memory cache if storage is blocked (e.g. strict private mode)
    }
  }
  return localMemoryCache.get(code) ?? null;
}

function writeLocalRoom(state: GameRoomState): GameRoomState {
  const clean = stripUndefinedForFirebase(state);
  const code = clean.roomCode.toUpperCase();
  localMemoryCache.set(code, clean);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(localKey(code), JSON.stringify(clean));
    } catch {
      // Storage quota or restricted context; BroadcastChannel + memory still work
    }
  }

  const channel = ensureLocalChannel();
  if (channel) {
    try {
      const msg: LocalBroadcastMessage = {
        type: 'room-updated',
        roomCode: code,
        state: clean,
        senderId: TAB_SENDER_ID,
        timestamp: Date.now(),
      };
      channel.postMessage(msg);
    } catch {
      // Ignore closed channel errors
    }
  }

  notifyLocalListeners(code, clean);
  return clean;
}

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_ROOM_TTL_MS = ROOM_TTL_MS;

function deleteLocalRoom(roomCode: string): void {
  const code = roomCode.toUpperCase();
  localMemoryCache.delete(code);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(localKey(code));
    } catch {
      // Ignore restricted storage errors
    }
  }

  const channel = ensureLocalChannel();
  if (channel) {
    try {
      const msg: LocalBroadcastMessage = {
        type: 'room-deleted',
        roomCode: code,
        state: null,
        senderId: TAB_SENDER_ID,
        timestamp: Date.now(),
      };
      channel.postMessage(msg);
    } catch {
      // Ignore closed channel errors
    }
  }

  notifyLocalListeners(code, null);
}

/**
 * Best-effort sweep removing stale or malformed Candyland rooms in localStorage
 * older than 24 hours so test and finished sessions never pile up.
 */
export function sweepStaleLocalRooms(maxAgeMs = LOCAL_ROOM_TTL_MS): number {
  if (typeof window === 'undefined') return 0;
  let removed = 0;
  const now = Date.now();
  try {
    const keysToCheck: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LOCAL_STORAGE_PREFIX)) {
        keysToCheck.push(k);
      }
    }
    for (const key of keysToCheck) {
      const code = key.slice(LOCAL_STORAGE_PREFIX.length).toUpperCase();
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = normalizeFirebaseRoom(JSON.parse(raw));
        const isStale = !parsed || now - parsed.updatedAt > maxAgeMs;
        if (isStale) {
          window.localStorage.removeItem(key);
          localMemoryCache.delete(code);
          removed += 1;
        }
      } catch {
        window.localStorage.removeItem(key);
        localMemoryCache.delete(code);
        removed += 1;
      }
    }
  } catch {
    // Ignore storage access errors in private browsing
  }
  return removed;
}

function subscribeLocalRoom(
  roomCode: string,
  listener: LocalRoomListener
): () => void {
  const code = roomCode.toUpperCase();
  ensureLocalChannel();

  let setForCode = localListeners.get(code);
  if (!setForCode) {
    setForCode = new Set<LocalRoomListener>();
    localListeners.set(code, setForCode);
  }
  setForCode.add(listener);

  // Immediately deliver current snapshot
  listener(readLocalRoom(code));

  return () => {
    const existing = localListeners.get(code);
    if (existing) {
      existing.delete(listener);
      if (existing.size === 0) {
        localListeners.delete(code);
      }
    }
  };
}

// ============================================================================
// Core Atomic Read / Write / Transaction Layer
// ============================================================================

export async function getRoomSnapshot(
  roomCode: string
): Promise<GameRoomState | null> {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return null;

  const db = getFirebaseDb();
  if (db) {
    const snapshot = await get(ref(db, `rooms/${code}`));
    if (!snapshot.exists()) return null;
    return normalizeFirebaseRoom(snapshot.val());
  }

  return readLocalRoom(code);
}

/**
 * Atomically reads, transforms, and persists a room state.
 * Uses Firebase RTDB `runTransaction` online, or synchronous read-modify-write locally.
 */
export async function mutateRoom(
  roomCode: string,
  updater: (current: GameRoomState) => GameRoomState | null
): Promise<GameRoomState | null> {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return null;

  const db = getFirebaseDb();
  if (db) {
    const roomRef = ref(db, `rooms/${code}`);
    let resultState: GameRoomState | null = null;
    const tx = await runTransaction(roomRef, (currentRaw: unknown) => {
      const normalized = normalizeFirebaseRoom(currentRaw);
      if (!normalized) {
        // Abort transaction if room does not exist yet
        return currentRaw;
      }
      const next = updater(normalized);
      if (!next) {
        return; // Abort cleanly
      }
      resultState = stripUndefinedForFirebase({
        ...next,
        updatedAt: Date.now(),
      });
      return resultState;
    });

    if (tx.committed && tx.snapshot.exists()) {
      return normalizeFirebaseRoom(tx.snapshot.val()) ?? resultState;
    }
    return resultState;
  }

  const current = readLocalRoom(code);
  if (!current) return null;
  const next = updater(current);
  if (!next) return current;
  return writeLocalRoom({
    ...next,
    updatedAt: Date.now(),
  });
}

// ============================================================================
// Throttled Mini-Game Live Score Streaming (~100ms, race-safe)
// ============================================================================

interface PendingScoreEntry {
  score: number;
  progress: number;
  lastSentAt: number;
  timerId: number | null;
}

const SCORE_THROTTLE_MS = 100;
const scoreThrottleMap = new Map<string, PendingScoreEntry>();

function cancelPendingMiniGameScore(roomCode: string): void {
  const code = sanitizeRoomCode(roomCode);
  const entry = scoreThrottleMap.get(code);
  if (entry?.timerId != null && typeof window !== 'undefined') {
    window.clearTimeout(entry.timerId);
  }
  scoreThrottleMap.delete(code);
}

async function flushMiniGameScore(
  code: string,
  score: number,
  progress: number
): Promise<void> {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const db = getFirebaseDb();

  if (db) {
    // Use targeted transaction on `miniGame` so we never overwrite a cleared/finished miniGame
    // and never rewrite the whole deck during rapid 10Hz score updates.
    const mgRef = ref(db, `rooms/${code}/miniGame`);
    try {
      const now = Date.now();
      const tx = await runTransaction(mgRef, (currentMg: unknown) => {
        if (!currentMg || typeof currentMg !== 'object') {
          return; // Mini-game already ended; abort write
        }
        const mg = currentMg as Record<string, unknown>;
        if (mg.status === 'finished') {
          return;
        }
        return {
          ...mg,
          score,
          progress: clampedProgress,
          status: 'playing',
          updatedAt: now,
        };
      });
      if (tx.committed) {
        void update(ref(db, `rooms/${code}`), { updatedAt: now }).catch(
          () => {}
        );
      }
    } catch {
      // Non-fatal transient network hiccup during live score stream
    }
    return;
  }

  const current = readLocalRoom(code);
  if (!current || current.phase !== 'minigame' || !current.miniGame) return;
  writeLocalRoom(applyMiniGameScore(current, score, clampedProgress));
}

export function submitMiniGameScore(
  roomCode: string,
  score: number,
  progress: number
): void {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return;

  const now = Date.now();
  const existing = scoreThrottleMap.get(code);

  if (!existing || now - existing.lastSentAt >= SCORE_THROTTLE_MS) {
    if (existing?.timerId != null && typeof window !== 'undefined') {
      window.clearTimeout(existing.timerId);
    }
    scoreThrottleMap.set(code, {
      score,
      progress,
      lastSentAt: now,
      timerId: null,
    });
    void flushMiniGameScore(code, score, progress);
    return;
  }

  existing.score = score;
  existing.progress = progress;

  if (existing.timerId == null && typeof window !== 'undefined') {
    const delay = Math.max(16, SCORE_THROTTLE_MS - (now - existing.lastSentAt));
    existing.timerId = window.setTimeout(() => {
      const latest = scoreThrottleMap.get(code);
      if (!latest) return;
      latest.timerId = null;
      latest.lastSentAt = Date.now();
      void flushMiniGameScore(code, latest.score, latest.progress);
    }, delay);
  }
}

// ============================================================================
// Public Atomic Action Dispatchers
// ============================================================================

// Tracks rooms currently being explicitly left so useGameRoom unmount cleanup
// doesn't race with `remove(roomRef)` or re-create a deleted room node.
const explicitlyLeavingRooms = new Set<string>();

function shouldDeleteRoomOnLeave(
  existing: GameRoomState,
  role: SyncRole
): boolean {
  if (role === 'host') {
    return (
      !existing.tabletConnected ||
      existing.phase === 'lobby' ||
      existing.phase === 'victory'
    );
  }
  if (role === 'tablet') {
    return (
      !existing.hostConnected &&
      (existing.phase === 'lobby' || existing.phase === 'victory')
    );
  }
  return false;
}

/**
 * Lightweight client-side cleanup triggered on TV Host startup:
 * Queries Firebase RTDB `rooms` indexed by `updatedAt` and deletes any room
 * older than `maxAgeMs` (default: 24 hours). Never throws or blocks hosting.
 */
export async function cleanupExpiredFirebaseRooms(
  excludeRoomCode?: string,
  maxAgeMs = ROOM_TTL_MS
): Promise<number> {
  const db = getFirebaseDb();
  if (!db) return 0;

  const normalizedExclude = excludeRoomCode
    ? sanitizeRoomCode(excludeRoomCode)
    : null;
  const cutoff = Date.now() - maxAgeMs;

  try {
    const expiredQuery = query(
      ref(db, 'rooms'),
      orderByChild('updatedAt'),
      endAt(cutoff)
    );
    const snapshot = await get(expiredQuery);
    if (!snapshot.exists()) return 0;

    const removals: Promise<boolean>[] = [];
    snapshot.forEach((childSnap) => {
      const key = childSnap.key;
      if (!key || !isValidRoomCode(key)) return;
      if (normalizedExclude && key === normalizedExclude) return;

      const val = childSnap.val() as { updatedAt?: unknown } | null;
      const isExpired =
        !val || typeof val.updatedAt !== 'number' || val.updatedAt <= cutoff;
      if (!isExpired) return;

      removals.push(
        remove(ref(db, `rooms/${key}`))
          .then(() => {
            deleteLocalRoom(key);
            return true;
          })
          .catch(() => false)
      );
    });

    if (removals.length === 0) return 0;
    const settled = await Promise.allSettled(removals);
    return settled.filter(
      (res) => res.status === 'fulfilled' && res.value === true
    ).length;
  } catch {
    // Best-effort sweep must never disrupt room hosting if offline or restricted
    return 0;
  }
}

export async function createRoom(
  options: CreateRoomOptions = {}
): Promise<GameRoomState> {
  // Lightweight sweep of stale localStorage rooms (> 24h old)
  sweepStaleLocalRooms();

  const db = getFirebaseDb();
  let code = options.roomCode
    ? sanitizeRoomCode(options.roomCode)
    : generateRoomCode();

  if (!isValidRoomCode(code)) {
    code = generateRoomCode();
  }

  // Avoid colliding with an existing live room if code wasn't explicitly forced
  if (!options.roomCode) {
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      tried.add(code);
      const existing = await getRoomSnapshot(code);
      if (!existing) break;
      // Reuse abandoned rooms older than 6 hours, otherwise pick a fresh code
      const isStale = Date.now() - existing.updatedAt > 6 * 60 * 60 * 1000;
      if (isStale) break;
      code = generateRoomCode(tried);
    }
  }

  explicitlyLeavingRooms.delete(code);

  const initial = stripUndefinedForFirebase({
    ...createInitialRoomState(code, options.players ?? [], options.settings),
    updatedAt: Date.now(),
  });

  if (db) {
    await set(ref(db, `rooms/${code}`), initial);
    // Non-blocking 24h expired room sweep across Firebase RTDB
    void cleanupExpiredFirebaseRooms(code);
    return initial;
  }

  return writeLocalRoom(initial);
}

export async function joinRoom(
  roomCode: string,
  role: SyncRole = 'tablet'
): Promise<GameRoomState | null> {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return null;

  explicitlyLeavingRooms.delete(code);

  const existing = await getRoomSnapshot(code);
  if (!existing) return null;

  const updated = await mutateRoom(code, (current) => ({
    ...current,
    updatedAt: Date.now(),
    hostConnected: role === 'host' || role === 'mirror' ? true : current.hostConnected,
    tabletConnected:
      role === 'tablet' || role === 'mirror' ? true : current.tabletConnected,
  }));

  return updated ?? existing;
}

export async function leaveRoom(
  roomCode: string,
  role: SyncRole
): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return;

  explicitlyLeavingRooms.add(code);
  cancelPendingMiniGameScore(code);
  cancelPendingPlayerWrites(code);

  const scheduleLeavingFlagClear = () => {
    if (typeof window !== 'undefined') {
      window.setTimeout(() => explicitlyLeavingRooms.delete(code), 1500);
    } else {
      explicitlyLeavingRooms.delete(code);
    }
  };

  try {
    const db = getFirebaseDb();
    if (db) {
      const presenceField =
        role === 'tablet'
          ? 'tabletConnected'
          : role === 'host'
            ? 'hostConnected'
            : null;

      if (presenceField) {
        try {
          await onDisconnect(ref(db, `rooms/${code}/${presenceField}`)).cancel();
        } catch {
          // Safe to ignore if already disconnected
        }
      }

      const existing = await getRoomSnapshot(code);
      if (!existing) {
        deleteLocalRoom(code);
        return;
      }

      if (shouldDeleteRoomOnLeave(existing, role)) {
        try {
          await remove(ref(db, `rooms/${code}`));
        } catch {
          // Ignore transient disconnect errors during room deletion
        }
        deleteLocalRoom(code);
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (role === 'tablet') patch.tabletConnected = false;
      if (role === 'host') patch.hostConnected = false;
      try {
        await update(ref(db, `rooms/${code}`), patch);
      } catch {
        // Ignore disconnect errors on unmount
      }
      return;
    }

    const localExisting = readLocalRoom(code);
    if (!localExisting) return;

    if (shouldDeleteRoomOnLeave(localExisting, role)) {
      deleteLocalRoom(code);
      return;
    }

    await mutateRoom(code, (current) => ({
      ...current,
      updatedAt: Date.now(),
      tabletConnected: role === 'tablet' ? false : current.tabletConnected,
      hostConnected: role === 'host' ? false : current.hostConnected,
    }));
  } finally {
    scheduleLeavingFlagClear();
  }
}

// ============================================================================
// Serialized / Coalesced Player Roster Write Queue (Prevents Rapid-Tap Clobber)
// ============================================================================

interface PlayerWriteQueue {
  draining: boolean;
  pending: PlayerState[] | null;
  latestDesired: PlayerState[] | null;
  waiters: Array<(state: GameRoomState | null) => void>;
}

type OptimisticPlayersListener = (players: PlayerState[]) => void;

const playerWriteQueues = new Map<string, PlayerWriteQueue>();
const optimisticPlayersListeners = new Map<
  string,
  Set<OptimisticPlayersListener>
>();

function subscribeOptimisticPlayers(
  roomCode: string,
  listener: OptimisticPlayersListener
): () => void {
  const code = roomCode.toUpperCase();
  let setForCode = optimisticPlayersListeners.get(code);
  if (!setForCode) {
    setForCode = new Set<OptimisticPlayersListener>();
    optimisticPlayersListeners.set(code, setForCode);
  }
  setForCode.add(listener);
  return () => {
    const existing = optimisticPlayersListeners.get(code);
    if (existing) {
      existing.delete(listener);
      if (existing.size === 0) {
        optimisticPlayersListeners.delete(code);
      }
    }
  };
}

function notifyOptimisticPlayers(
  roomCode: string,
  players: PlayerState[]
): void {
  const listeners = optimisticPlayersListeners.get(roomCode.toUpperCase());
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(players);
    } catch {
      // Isolate listener errors
    }
  }
}

function getPendingDesiredPlayers(roomCode: string): PlayerState[] | null {
  const entry = playerWriteQueues.get(roomCode.toUpperCase());
  if (!entry || (!entry.draining && entry.pending === null)) return null;
  return entry.latestDesired;
}

async function waitForPendingPlayerWrites(roomCode: string): Promise<void> {
  const code = sanitizeRoomCode(roomCode);
  const entry = playerWriteQueues.get(code);
  if (!entry || (!entry.draining && entry.pending === null)) return;
  await new Promise<void>((resolve) => {
    entry.waiters.push(() => resolve());
  });
}

function cancelPendingPlayerWrites(roomCode: string): void {
  const code = sanitizeRoomCode(roomCode);
  const entry = playerWriteQueues.get(code);
  if (!entry) return;
  entry.pending = null;
  entry.latestDesired = null;
  const resolvers = entry.waiters.splice(0, entry.waiters.length);
  playerWriteQueues.delete(code);
  for (const resolve of resolvers) {
    resolve(null);
  }
}

export async function updatePlayers(
  roomCode: string,
  players: PlayerState[]
): Promise<GameRoomState | null> {
  const code = sanitizeRoomCode(roomCode);
  if (!isValidRoomCode(code)) return null;

  const indexed = players.map((p, idx) => ({
    ...p,
    turnOrder: idx,
  }));

  let entry = playerWriteQueues.get(code);
  if (!entry) {
    entry = {
      draining: false,
      pending: null,
      latestDesired: null,
      waiters: [],
    };
    playerWriteQueues.set(code, entry);
  }

  // Coalesce rapid taps: keep only the newest roster snapshot and update local UI immediately
  entry.pending = indexed;
  entry.latestDesired = indexed;
  notifyOptimisticPlayers(code, indexed);

  const resultPromise = new Promise<GameRoomState | null>((resolve) => {
    entry!.waiters.push(resolve);
  });

  if (!entry.draining) {
    entry.draining = true;
    void (async () => {
      let lastCommitted: GameRoomState | null = null;
      try {
        while (entry.pending !== null) {
          const batch = entry.pending;
          entry.pending = null;
          lastCommitted = await mutateRoom(code, (current) => ({
            ...current,
            updatedAt: Date.now(),
            players: batch,
            currentPlayerIndex:
              batch.length > 0
                ? Math.min(current.currentPlayerIndex, batch.length - 1)
                : 0,
          }));
        }
      } finally {
        entry.draining = false;
        entry.pending = null;
        entry.latestDesired = null;
        const resolvers = entry.waiters.splice(0, entry.waiters.length);
        playerWriteQueues.delete(code);
        for (const resolve of resolvers) {
          resolve(lastCommitted);
        }
      }
    })();
  }

  return resultPromise;
}

export async function updateSettings(
  roomCode: string,
  settings: Partial<GameSettings>
): Promise<GameRoomState | null> {
  return mutateRoom(roomCode, (current) => ({
    ...current,
    updatedAt: Date.now(),
    settings: {
      ...current.settings,
      ...settings,
    },
  }));
}

export async function startGame(
  roomCode: string
): Promise<GameRoomState | null> {
  cancelPendingMiniGameScore(roomCode);
  // Wait for any rapid portrait selection writes to finish committing first
  await waitForPendingPlayerWrites(roomCode);
  return mutateRoom(roomCode, (current) => {
    if (current.players.length < 2) return current;
    return startGameState(current);
  });
}

export async function drawCard(
  roomCode: string
): Promise<GameRoomState | null> {
  return mutateRoom(roomCode, (current) => applyDrawCard(current));
}

export async function resolveDrawnCard(
  roomCode: string,
  context?: EngineContext
): Promise<GameRoomState | null> {
  const ctx = resolveContext(context);
  return mutateRoom(roomCode, (current) =>
    applyResolveDrawnCard(current, ctx)
  );
}

export async function advanceMoveComplete(
  roomCode: string,
  context?: EngineContext
): Promise<GameRoomState | null> {
  const ctx = resolveContext(context);
  return mutateRoom(roomCode, (current) => applyMoveComplete(current, ctx));
}

export async function finishMiniGame(
  roomCode: string,
  won: boolean,
  finalScore: number,
  context?: EngineContext
): Promise<GameRoomState | null> {
  cancelPendingMiniGameScore(roomCode);
  const ctx = resolveContext(context);
  return mutateRoom(roomCode, (current) =>
    applyMiniGameComplete(current, won, finalScore, ctx)
  );
}

export async function completeActionCard(
  roomCode: string,
  completed: boolean,
  context?: EngineContext
): Promise<GameRoomState | null> {
  const ctx = resolveContext(context);
  return mutateRoom(roomCode, (current) =>
    applyActionCardComplete(current, completed, ctx)
  );
}

export async function finishCutscene(
  roomCode: string
): Promise<GameRoomState | null> {
  return mutateRoom(roomCode, (current) => applyCutsceneComplete(current));
}

export async function playAgain(
  roomCode: string
): Promise<GameRoomState | null> {
  cancelPendingMiniGameScore(roomCode);
  return mutateRoom(roomCode, (current) => applyPlayAgain(current));
}

export async function returnToLobby(
  roomCode: string
): Promise<GameRoomState | null> {
  cancelPendingMiniGameScore(roomCode);
  return mutateRoom(roomCode, (current) => ({
    ...current,
    updatedAt: Date.now(),
    phase: 'lobby',
    currentCard: null,
    movement: null,
    miniGame: null,
    actionCard: null,
    cutscene: null,
    winnerId: null,
    celebration: null,
    lastEventBanner: 'Pick your family characters for the next adventure!',
  }));
}

// ============================================================================
// React Hook: useGameRoom(roomCode, role)
// ============================================================================

export function useGameRoom(
  roomCode: string | null,
  role: SyncRole
): UseGameRoomResult {
  const normalizedCode = roomCode ? sanitizeRoomCode(roomCode) : null;
  const transportMode: TransportMode = getTransportMode();

  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(normalizedCode));
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    transportMode === 'firebase' ? 'connecting' : 'local'
  );

  const hadConnectedOnceRef = useRef<boolean>(false);

  useEffect(() => {
    if (!normalizedCode || !isValidRoomCode(normalizedCode)) {
      setRoom(null);
      setLoading(false);
      setError(null);
      setConnectionStatus(transportMode === 'firebase' ? 'connecting' : 'local');
      return;
    }

    setLoading(true);
    setError(null);
    hadConnectedOnceRef.current = false;

    const db = getFirebaseDb();

    // -----------------------------------------------------------------------
    // Mode 1: Online Firebase Realtime Database with Presence & Auto-Reconnect
    // -----------------------------------------------------------------------
    if (db) {
      let active = true;
      setConnectionStatus('connecting');

      const roomRef = ref(db, `rooms/${normalizedCode}`);
      const connectedRef = ref(db, '.info/connected');
      const presenceField =
        role === 'tablet'
          ? 'tabletConnected'
          : role === 'host'
            ? 'hostConnected'
            : null;

      let roomExists = false;

      const markPresenceOnline = async () => {
        if (!presenceField || !roomExists || !active) return;
        const fieldRef = ref(db, `rooms/${normalizedCode}/${presenceField}`);
        try {
          await onDisconnect(fieldRef).set(false);
          await set(fieldRef, true);
        } catch {
          // Safe to ignore if room was removed
        }
      };

      const unsubConnected = onValue(connectedRef, (snap) => {
        if (!active) return;
        const connected = Boolean(snap.val());
        if (connected) {
          hadConnectedOnceRef.current = true;
          setConnectionStatus('connected');
          void markPresenceOnline();
        } else {
          setConnectionStatus(
            hadConnectedOnceRef.current ? 'reconnecting' : 'connecting'
          );
        }
      });

      const unsubOptimistic = subscribeOptimisticPlayers(
        normalizedCode,
        (optimisticPlayers) => {
          if (!active) return;
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  players: optimisticPlayers,
                  currentPlayerIndex:
                    optimisticPlayers.length > 0
                      ? Math.min(
                          prev.currentPlayerIndex,
                          optimisticPlayers.length - 1
                        )
                      : 0,
                }
              : prev
          );
        }
      );

      const unsubRoom = onValue(
        roomRef,
        (snapshot) => {
          if (!active) return;
          setLoading(false);
          if (!snapshot.exists()) {
            roomExists = false;
            setRoom(null);
            return;
          }
          const parsed = normalizeFirebaseRoom(snapshot.val());
          const firstDiscovery = !roomExists && Boolean(parsed);
          roomExists = Boolean(parsed);

          // Prevent intermediate RTDB snapshots from reverting newer rapid taps while draining
          const pendingDesired = getPendingDesiredPlayers(normalizedCode);
          const merged =
            parsed && pendingDesired
              ? {
                  ...parsed,
                  players: pendingDesired,
                  currentPlayerIndex:
                    pendingDesired.length > 0
                      ? Math.min(
                          parsed.currentPlayerIndex,
                          pendingDesired.length - 1
                        )
                      : 0,
                }
              : parsed;

          setRoom(merged);
          setError(null);
          if (firstDiscovery) {
            void markPresenceOnline();
          }
        },
        (err) => {
          if (!active) return;
          setLoading(false);
          setConnectionStatus('error');
          setError(err.message || 'Connection error syncing game room.');
        }
      );

      return () => {
        active = false;
        unsubConnected();
        unsubOptimistic();
        unsubRoom();
        cancelPendingMiniGameScore(normalizedCode);
        if (presenceField) {
          const fieldRef = ref(db, `rooms/${normalizedCode}/${presenceField}`);
          void onDisconnect(fieldRef).cancel().catch(() => {});
          if (roomExists && !explicitlyLeavingRooms.has(normalizedCode)) {
            void set(fieldRef, false).catch(() => {});
          }
        }
      };
    }

    // -----------------------------------------------------------------------
    // Mode 2: Local BroadcastChannel + localStorage Fallback
    // -----------------------------------------------------------------------
    setConnectionStatus('local');
    let markedPresence = false;

    const unsubscribe = subscribeLocalRoom(normalizedCode, (nextState) => {
      setLoading(false);
      setRoom(nextState);
      setError(null);

      if (nextState && !markedPresence) {
        markedPresence = true;
        if (role === 'tablet' && !nextState.tabletConnected) {
          writeLocalRoom({
            ...nextState,
            updatedAt: Date.now(),
            tabletConnected: true,
          });
        } else if (role === 'host' && !nextState.hostConnected) {
          writeLocalRoom({
            ...nextState,
            updatedAt: Date.now(),
            hostConnected: true,
          });
        }
      }
    });

    const handleBeforeUnload = () => {
      const current = readLocalRoom(normalizedCode);
      if (!current) return;
      if (role === 'tablet' && current.tabletConnected) {
        writeLocalRoom({ ...current, tabletConnected: false });
      } else if (role === 'host' && current.hostConnected) {
        writeLocalRoom({ ...current, hostConnected: false });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      unsubscribe();
      cancelPendingMiniGameScore(normalizedCode);
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
      if (explicitlyLeavingRooms.has(normalizedCode)) {
        return;
      }
      const current = readLocalRoom(normalizedCode);
      if (current) {
        if (role === 'tablet' && current.tabletConnected) {
          writeLocalRoom({ ...current, tabletConnected: false });
        } else if (role === 'host' && current.hostConnected) {
          writeLocalRoom({ ...current, hostConnected: false });
        }
      }
    };
  }, [normalizedCode, role, transportMode]);

  const actions = useMemo<RoomActions>(() => {
    const code = normalizedCode ?? '';
    return {
      updatePlayers: (players) => updatePlayers(code, players),
      updateSettings: (settings) => updateSettings(code, settings),
      startGame: () => startGame(code),
      drawCard: () => drawCard(code),
      resolveDrawnCard: (ctx) => resolveDrawnCard(code, ctx),
      advanceMoveComplete: (ctx) => advanceMoveComplete(code, ctx),
      submitMiniGameScore: (score, progress) =>
        submitMiniGameScore(code, score, progress),
      finishMiniGame: (won, finalScore, ctx) =>
        finishMiniGame(code, won, finalScore, ctx),
      completeActionCard: (completed, ctx) =>
        completeActionCard(code, completed, ctx),
      finishCutscene: () => finishCutscene(code),
      playAgain: () => playAgain(code),
      returnToLobby: () => returnToLobby(code),
    };
  }, [normalizedCode]);

  return {
    room,
    loading,
    error,
    connectionStatus,
    transportMode,
    isConnected:
      connectionStatus === 'connected' || connectionStatus === 'local',
    actions,
  };
}
