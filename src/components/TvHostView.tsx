import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Crown,
  LogOut,
  Maximize2,
  Minimize2,
  Music,
  Play,
  QrCode,
  RotateCcw,
  Sparkles,
  Tablet,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  BOARD_IMAGE_URL,
  BOARD_SHORTCUTS,
  BOARD_TILES,
  LAST_TILE_INDEX,
} from '../data/boardData';
import { CHARACTERS } from '../data/characters';
import { createPlayersFromCharacters } from '../engine/rules';
import {
  cleanupExpiredFirebaseRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  sanitizeRoomCode,
  useGameRoom,
} from '../services/firebaseSync';
import { soundEngine, type AudioEngineState } from '../audio/soundEngine';
import {
  LANDMARK_META,
  TILE_COLOR_META,
  type Card,
  type PlayerState,
} from '../types/game';
import { BoardView } from './BoardView';
import { CharacterSelect } from './CharacterSelect';
import { CelebrationEffects } from './CelebrationEffects';
import { ActionCardOverlay } from './ActionCardOverlay';
import { MiniGameTvOverlay } from './minigames/MiniGameTvOverlay';
import { MiniGameHost } from './minigames/MiniGameHost';
import { useFullscreen } from '../utils/fullscreen';
import { useToddlerTap } from '../utils/toddlerTap';
import './TvHostView.css';

export interface TvHostViewProps {
  /** Optional pre-existing room code; if omitted, a fresh kid-friendly code is created. */
  initialRoomCode?: string;
  /** Called when the user exits back to the Landing Screen. */
  onExit: () => void;
}

function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Calm, voice-aware storybook pacing helper:
 * Yields an initial 80ms tick so sibling voice effects queue their clip,
 * waits for active narrator speech to finish plus a gentle breath, AND
 * ensures at least `minMs` total elapsed time.
 */
async function waitCalmly(
  minMs: number,
  postVoiceBreathMs: number,
  isCancelled: () => boolean,
  maxVoiceWaitMs = 5500
): Promise<boolean> {
  const startedAt = performance.now();
  await delayMs(80);
  if (isCancelled()) return false;

  await soundEngine.waitForVoiceToFinish(maxVoiceWaitMs);
  if (isCancelled()) return false;

  if (postVoiceBreathMs > 0) {
    await delayMs(postVoiceBreathMs);
    if (isCancelled()) return false;
  }

  const remainingMin = minMs - (performance.now() - startedAt);
  if (remainingMin > 0) {
    await delayMs(remainingMin);
    if (isCancelled()) return false;
  }

  return !isCancelled();
}

/**
 * Probes whether the browser genuinely transitions `display` + `overlay` on top-layer exit
 * (per modern-web-guidance `animate-to-from-top-layer`).
 */
let cachedDisplayExitSupport: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (cachedDisplayExitSupport !== undefined) return cachedDisplayExitSupport;
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText =
    'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedDisplayExitSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedDisplayExitSupport;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.CSS?.supports?.('overlay', 'auto')) &&
    canTransitionDisplay()
  );
}

async function closeAnimatedDialog(
  dialog: HTMLDialogElement,
  returnValue = ''
): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise<void>((r) => window.setTimeout(r, 420)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  if (dialog.open) {
    dialog.close(returnValue);
  }
}

/**
 * Edge-based 2D spatial focus handler for TV Bro D-pad arrow keys
 * (per modern-web-guidance `spatial-navigation`).
 * Leaves arrow keys un-intercepted when no candidate exists in the pressed direction.
 */
function handleSpatialKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null
): void {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !container
  ) {
    return;
  }

  const direction =
    event.key === 'ArrowRight'
      ? 'right'
      : event.key === 'ArrowLeft'
        ? 'left'
        : event.key === 'ArrowDown'
          ? 'down'
          : event.key === 'ArrowUp'
            ? 'up'
            : null;
  if (!direction) return;

  const target = event.nativeEvent.composedPath()[0];
  if (
    target instanceof HTMLElement &&
    target.matches(':read-write, select, input[type="range"], [role="slider"]')
  ) {
    return;
  }

  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex="0"]'
    )
  ).filter((el) =>
    typeof el.checkVisibility === 'function'
      ? el.checkVisibility()
      : el.getBoundingClientRect().width > 0
  );

  const activeEl = document.activeElement as HTMLElement | null;
  if (!activeEl || !candidates.includes(activeEl)) return;

  const curr = activeEl.getBoundingClientRect();
  const currCx = curr.left + curr.width / 2;
  const currCy = curr.top + curr.height / 2;
  const tolerance = 4;

  let bestAligned: { el: HTMLElement; gap: number; perp: number } | null = null;
  let bestFallback: { el: HTMLElement; score: number } | null = null;

  for (const el of candidates) {
    if (el === activeEl) continue;
    const r = el.getBoundingClientRect();
    const rCx = r.left + r.width / 2;
    const rCy = r.top + r.height / 2;

    let inDirection = false;
    let gap = 0;
    let overlaps = false;
    let perpOffset = 0;

    if (direction === 'right') {
      inDirection = r.left >= curr.right - tolerance;
      gap = Math.max(0, r.left - curr.right);
      overlaps = r.bottom > curr.top && r.top < curr.bottom;
      perpOffset = Math.abs(rCy - currCy);
    } else if (direction === 'left') {
      inDirection = r.right <= curr.left + tolerance;
      gap = Math.max(0, curr.left - r.right);
      overlaps = r.bottom > curr.top && r.top < curr.bottom;
      perpOffset = Math.abs(rCy - currCy);
    } else if (direction === 'down') {
      inDirection = r.top >= curr.bottom - tolerance;
      gap = Math.max(0, r.top - curr.bottom);
      overlaps = r.right > curr.left && r.left < curr.right;
      perpOffset = Math.abs(rCx - currCx);
    } else {
      inDirection = r.bottom <= curr.top + tolerance;
      gap = Math.max(0, curr.top - r.bottom);
      overlaps = r.right > curr.left && r.left < curr.right;
      perpOffset = Math.abs(rCx - currCx);
    }

    if (!inDirection) continue;

    if (overlaps) {
      if (
        !bestAligned ||
        gap < bestAligned.gap ||
        (gap === bestAligned.gap && perpOffset < bestAligned.perp)
      ) {
        bestAligned = { el, gap, perp: perpOffset };
      }
    } else {
      const score = gap + 2.5 * perpOffset;
      if (!bestFallback || score < bestFallback.score) {
        bestFallback = { el, score };
      }
    }
  }

  const chosen = bestAligned?.el ?? bestFallback?.el ?? null;
  if (!chosen) return; // Preserve native scrolling when no candidate exists

  event.preventDefault();
  chosen.focus();
  chosen.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function getJoinUrl(roomCode: string): { fullUrl: string; displayHost: string } {
  if (typeof window === 'undefined') {
    return {
      fullUrl: `https://emma-dawson.com/?room=${roomCode}`,
      displayHost: 'emma-dawson.com',
    };
  }
  const origin = window.location.origin;
  const host = window.location.host;
  return {
    fullUrl: `${origin}/?room=${roomCode}`,
    displayHost: host.includes('emma-dawson.com') ? 'emma-dawson.com' : host,
  };
}

function renderCardArtwork(card: Card) {
  if ((card.type === 'single' || card.type === 'double') && card.color) {
    const meta = TILE_COLOR_META[card.color];
    const isDouble = card.type === 'double';
    return (
      <div className={`tv-card-swatches ${isDouble ? 'is-double' : 'is-single'}`}>
        <div
          className="tv-card-swatch"
          style={
            {
              '--swatch-hex': meta.hex,
              '--swatch-dark': meta.darkHex,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
        {isDouble && (
          <div
            className="tv-card-swatch"
            style={
              {
                '--swatch-hex': meta.hex,
                '--swatch-dark': meta.darkHex,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        )}
      </div>
    );
  }

  if (card.type === 'landmark' && card.landmark) {
    const lm = LANDMARK_META[card.landmark];
    return (
      <div className="tv-card-emblem is-landmark" aria-hidden="true">
        <span className="tv-card-emblem-emoji">{lm.emoji}</span>
      </div>
    );
  }

  if (card.type === 'action') {
    return (
      <div className="tv-card-emblem is-action" aria-hidden="true">
        <span className="tv-card-emblem-emoji">{card.emoji ?? '🎭'}</span>
      </div>
    );
  }

  return (
    <div className="tv-card-emblem is-licorice" aria-hidden="true">
      <span className="tv-card-emblem-emoji">{card.emoji ?? '🌀'}</span>
    </div>
  );
}

export const TvHostView: React.FC<TvHostViewProps> = ({
  initialRoomCode,
  onExit,
}) => {
  const [roomCode, setRoomCode] = useState<string | null>(
    initialRoomCode ? sanitizeRoomCode(initialRoomCode) : null
  );
  const [creatingRoom, setCreatingRoom] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showCharSelect, setShowCharSelect] = useState<boolean>(false);
  const [playMiniGameOnTv, setPlayMiniGameOnTv] = useState<boolean>(false);
  const [audioState, setAudioState] = useState<AudioEngineState>(() =>
    soundEngine.getState()
  );
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});

  // Native modal <dialog> refs (QR Info modal & Leave Confirmation modal)
  const qrDialogRef = useRef<HTMLDialogElement | null>(null);
  const leaveDialogRef = useRef<HTMLDialogElement | null>(null);
  const lobbyActionsRef = useRef<HTMLDivElement | null>(null);
  const victoryActionsRef = useRef<HTMLDivElement | null>(null);

  const qrTitleId = useId();
  const leaveTitleId = useId();

  // Deduplication refs for TV-driven transitions & audio
  const lastSpokenEventRef = useRef<string | null>(null);
  const lastCardRevealIdRef = useRef<string | null>(null);
  const lastCelebratedPhaseEventRef = useRef<string | null>(null);
  const lastAiDrawKeyRef = useRef<string | null>(null);
  const completedAiMiniGameIdRef = useRef<string | null>(null);
  const completedAiActionIdRef = useRef<string | null>(null);

  // Configure audio engine for TV Host (BGM + Narrator Voiceovers + SFX)
  useEffect(() => {
    soundEngine.setAudioMode('tv');
    soundEngine.startBgm();
    soundEngine.preloadVoices([
      'event_welcome',
      'turn_wyatt',
      'turn_emma',
      'turn_robert',
      'turn_rita',
      'event_minigame_intro',
      'event_shortcut_peppermint',
      'event_shortcut_gummy',
    ]);
    const unsub = soundEngine.subscribe(setAudioState);
    return () => {
      unsub();
      soundEngine.setCutsceneDucking(false);
      soundEngine.stopVoice();
      soundEngine.stopBgm();
    };
  }, []);

  // Create or re-attach room on mount
  useEffect(() => {
    let cancelled = false;
    const bootstrapRoom = async () => {
      setCreatingRoom(true);
      setInitError(null);
      try {
        if (initialRoomCode) {
          const clean = sanitizeRoomCode(initialRoomCode);
          const existing = await joinRoom(clean, 'host');
          if (!cancelled) {
            if (existing) {
              setRoomCode(existing.roomCode);
              void cleanupExpiredFirebaseRooms(existing.roomCode);
            } else {
              const created = await createRoom({ roomCode: clean });
              if (!cancelled) setRoomCode(created.roomCode);
            }
          }
        } else {
          const created = await createRoom();
          if (!cancelled) setRoomCode(created.roomCode);
        }
      } catch (err) {
        if (!cancelled) {
          setInitError(
            err instanceof Error
              ? err.message
              : 'Could not start TV game room. Please try again.'
          );
        }
      } finally {
        if (!cancelled) setCreatingRoom(false);
      }
    };

    void bootstrapRoom();
    return () => {
      cancelled = true;
    };
  }, [initialRoomCode]);

  const { room, connectionStatus, transportMode, actions } = useGameRoom(
    roomCode,
    'host'
  );

  // Generate high-contrast scannable QR code whenever roomCode changes
  const joinInfo = useMemo(
    () => (roomCode ? getJoinUrl(roomCode) : null),
    [roomCode]
  );

  useEffect(() => {
    if (!joinInfo) return;
    let cancelled = false;
    QRCode.toDataURL(joinInfo.fullUrl, {
      width: 340,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#3b1c32',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [joinInfo]);

  // If tablet starts the game while TV is showing CharacterSelect, close CharacterSelect smoothly
  useEffect(() => {
    if (room && room.phase !== 'lobby' && showCharSelect) {
      setShowCharSelect(false);
    }
    if (room && room.phase !== 'minigame' && playMiniGameOnTv) {
      setPlayMiniGameOnTv(false);
    }
  }, [room?.phase, showCharSelect, playMiniGameOnTv]);

  // Duck TV BGM during video cutscenes & stop lingering narrator voice before MP4 soundtrack plays
  useEffect(() => {
    const isCutscene = room?.phase === 'cutscene';
    soundEngine.setCutsceneDucking(isCutscene);
    if (isCutscene && room.cutscene?.videoUrl) {
      soundEngine.stopVoice();
    }
  }, [room?.phase, room?.cutscene?.videoUrl]);

  // Play narrator voiceovers & phase SFX on TV (deduplicated by lastEventId)
  useEffect(() => {
    if (!room) return;
    const eventKey = room.lastEventId;
    const hasCutsceneVideo =
      room.phase === 'cutscene' && Boolean(room.cutscene?.videoUrl);

    if (eventKey && eventKey !== lastSpokenEventRef.current) {
      lastSpokenEventRef.current = eventKey;

      if (room.phase === 'card-drawn' && room.currentCard) {
        soundEngine.playCardFlip();
        soundEngine.playCardReveal(room.currentCard.type === 'double');
      } else if (room.phase === 'minigame') {
        soundEngine.playStarChime();
      } else if (
        room.phase === 'cutscene' &&
        room.cutscene?.type === 'licorice-stuck' &&
        !hasCutsceneVideo
      ) {
        soundEngine.playLicoriceSquish();
      }

      if (hasCutsceneVideo) {
        soundEngine.stopVoice();
      } else if (room.lastVoiceKey) {
        void soundEngine.playVoiceIfValid(room.lastVoiceKey, { interrupt: true });
      }
    }

    // Trigger celebratory fanfare strictly ONCE per victory (direct or post-cutscene)
    const phaseKey = `${room.phase}:${room.turnNumber}:${room.winnerId ?? ''}`;
    if (
      room.phase === 'victory' &&
      lastCelebratedPhaseEventRef.current !== phaseKey
    ) {
      lastCelebratedPhaseEventRef.current = phaseKey;
      soundEngine.playVictoryFanfare();
    }
  }, [room]);

  // Authoritative TV timing: calm, voice-aware card reveal before resolving movement/overlays
  const cardRevealKey =
    room && room.phase === 'card-drawn' && room.currentCard
      ? `${room.lastEventId ?? room.createdAt}:${room.currentCard.id}`
      : null;
  const cardRevealIsSpecial = Boolean(
    room?.currentCard &&
      (room.currentCard.type === 'landmark' ||
        room.currentCard.type === 'action' ||
        room.currentCard.type === 'licorice')
  );

  useEffect(() => {
    if (!cardRevealKey || lastCardRevealIdRef.current === cardRevealKey) return;
    let cancelled = false;
    const minRevealMs = cardRevealIsSpecial ? 2600 : 2200;

    void (async () => {
      const ok = await waitCalmly(minRevealMs, 350, () => cancelled, 5500);
      if (!ok || lastCardRevealIdRef.current === cardRevealKey) return;
      lastCardRevealIdRef.current = cardRevealKey;
      void actions.resolveDrawnCard();
    })();

    return () => {
      cancelled = true;
    };
  }, [cardRevealKey, cardRevealIsSpecial, actions]);

  // Wire native <dialog> cancel/close handlers whenever dialogs are mounted
  // (per modern-web-guidance `dialog` + `animate-to-from-top-layer`)
  const hasMountedRoomDialogs = Boolean(room) && !(room?.phase === 'lobby' && showCharSelect);

  useEffect(() => {
    if (!hasMountedRoomDialogs) return;
    const qrDialog = qrDialogRef.current;
    const leaveDialog = leaveDialogRef.current;

    const handleQrCancel = (e: Event) => {
      if (!qrDialog) return;
      e.preventDefault();
      void closeAnimatedDialog(qrDialog, '');
    };
    const handleLeaveCancel = (e: Event) => {
      if (!leaveDialog) return;
      e.preventDefault();
      void closeAnimatedDialog(leaveDialog, 'stay');
    };
    const handleLeaveClose = () => {
      if (!leaveDialog) return;
      const choice = leaveDialog.returnValue;
      leaveDialog.returnValue = '';
      if (choice === 'leave') {
        if (roomCode) {
          void leaveRoom(roomCode, 'host');
        }
        onExit();
      }
    };

    qrDialog?.addEventListener('cancel', handleQrCancel);
    leaveDialog?.addEventListener('cancel', handleLeaveCancel);
    leaveDialog?.addEventListener('close', handleLeaveClose);
    return () => {
      qrDialog?.removeEventListener('cancel', handleQrCancel);
      leaveDialog?.removeEventListener('cancel', handleLeaveCancel);
      leaveDialog?.removeEventListener('close', handleLeaveClose);
    };
  }, [hasMountedRoomDialogs, roomCode, onExit]);

  const openQrDialog = useCallback(() => {
    soundEngine.playButtonTap();
    const dialog = qrDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const closeQrDialog = useCallback(() => {
    soundEngine.playButtonTap();
    const dialog = qrDialogRef.current;
    if (dialog && dialog.open) {
      void closeAnimatedDialog(dialog, '');
    }
  }, []);

  const openLeaveDialog = useCallback(() => {
    soundEngine.playButtonTap();
    const dialog = leaveDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleLeaveDialogAction = useCallback((choice: 'stay' | 'leave') => {
    soundEngine.playButtonTap();
    const dialog = leaveDialogRef.current;
    if (dialog && dialog.open) {
      void closeAnimatedDialog(dialog, choice);
    }
  }, []);

  const handleUnlockAudio = useCallback(() => {
    void soundEngine.unlock().then((ok) => {
      if (ok) {
        soundEngine.startBgm();
        soundEngine.playStarChime();
      }
    });
  }, []);

  const handleQuickFamilyPreset = useCallback(() => {
    soundEngine.playStarChime();
    const presetIds = new Set(['wyatt', 'emma', 'rita', 'robert']);
    const presetChars = CHARACTERS.filter((c) => presetIds.has(c.id));
    const players = createPlayersFromCharacters(presetChars);
    void actions.updatePlayers(players);
  }, [actions]);

  const handleHopStep = useCallback(
    (stepIndex: number, _tileIndex: number, isShortcutGlide: boolean) => {
      if (isShortcutGlide) {
        soundEngine.playShortcutWhoosh();
      } else {
        soundEngine.playHop(stepIndex);
      }
    },
    []
  );

  const handleMovementComplete = useCallback(() => {
    void actions.advanceMoveComplete();
  }, [actions]);

  const handleCutsceneComplete = useCallback(() => {
    void actions.finishCutscene();
  }, [actions]);

  const {
    isSupported: fullscreenSupported,
    isFullscreen,
    toggleFullscreen,
  } = useFullscreen();

  const handleToggleFullscreen = useCallback(() => {
    soundEngine.playButtonTap();
    toggleFullscreen();
  }, [toggleFullscreen]);

  const players: readonly PlayerState[] = room?.players ?? [];
  const currentPlayer: PlayerState | null =
    players.length > 0
      ? (players[room?.currentPlayerIndex ?? 0] ?? players[0])
      : null;
  const isCurrentPlayerAi = Boolean(currentPlayer?.isAi);
  const miniGamePlayer: PlayerState | null = room?.miniGame
    ? (players.find((p) => p.id === room.miniGame?.playerId) ?? currentPlayer)
    : null;
  const isMiniGameAi = Boolean(miniGamePlayer?.isAi);
  const actionCardPlayer: PlayerState | null = room?.actionCard
    ? (players.find((p) => p.id === room.actionCard?.playerId) ?? currentPlayer)
    : null;
  const isActionCardAi = Boolean(actionCardPlayer?.isAi);

  const tvHudDrawTapProps = useToddlerTap(
    () => {
      soundEngine.playButtonTap();
      void actions.drawCard();
    },
    room?.phase !== 'waiting-draw' || isCurrentPlayerAi
  );

  // Authoritative TV AI Turn Automation (e.g. Gnome AI Buddy) — calm, voice-aware pacing
  // 1) Auto-draw card after min 1800ms AND narrator turn announcement finishes + 500ms breath
  const aiDrawKey =
    room && room.phase === 'waiting-draw' && isCurrentPlayerAi
      ? `${room.turnNumber}:${room.currentPlayerIndex}:${room.lastEventId ?? ''}`
      : null;

  useEffect(() => {
    if (!aiDrawKey || lastAiDrawKeyRef.current === aiDrawKey) return;
    let cancelled = false;

    void (async () => {
      const ok = await waitCalmly(1800, 500, () => cancelled, 5500);
      if (!ok || lastAiDrawKeyRef.current === aiDrawKey) return;
      lastAiDrawKeyRef.current = aiDrawKey;
      void actions.drawCard();
    })();

    return () => {
      cancelled = true;
    };
  }, [aiDrawKey, actions]);

  // 2) Auto-simulate calm AI mini-game: wait for intro voice + warm-up, tick every 620ms, 1300ms finale breath
  const aiMiniGameId =
    room?.phase === 'minigame' && isMiniGameAi && room.miniGame
      ? room.miniGame.id
      : null;
  const aiMiniGameTarget = room?.miniGame?.targetScore ?? 6;

  useEffect(() => {
    if (!aiMiniGameId || completedAiMiniGameIdRef.current === aiMiniGameId) {
      return;
    }

    let cancelled = false;
    const target = Math.max(1, aiMiniGameTarget);
    const willWin = Math.random() < 0.55;
    const missDelta =
      1 + Math.floor(Math.random() * Math.min(3, Math.max(1, target - 1)));
    const finalScore = willWin ? target : Math.max(1, target - missDelta);

    void (async () => {
      // Wait min 1400ms AND intro voiceover + 400ms warm-up breath before starting ticks
      const readyOk = await waitCalmly(1400, 400, () => cancelled, 5500);
      if (!readyOk) return;

      // Flip MiniGameTvOverlay from 'ready' -> 'playing'
      actions.submitMiniGameScore(0, 0);

      const totalSteps = 6;
      let prevScore = 0;
      for (let step = 1; step <= totalSteps; step += 1) {
        await delayMs(620);
        if (cancelled) return;
        const nextScore =
          step === totalSteps
            ? finalScore
            : Math.min(
                finalScore,
                Math.max(prevScore, Math.round((finalScore * step) / totalSteps))
              );
        prevScore = nextScore;
        actions.submitMiniGameScore(nextScore, Math.min(1, nextScore / target));
      }

      // Calm celebration beat after final tick so kids soak in the score & confetti
      await delayMs(1300);
      if (cancelled || completedAiMiniGameIdRef.current === aiMiniGameId) return;

      completedAiMiniGameIdRef.current = aiMiniGameId;
      void actions.finishMiniGame(willWin, finalScore);
    })();

    return () => {
      cancelled = true;
    };
  }, [aiMiniGameId, aiMiniGameTarget, actions]);

  // 3) Auto-resolve Action Card after intro voice finishes + 3800ms calm reading time (~70% complete, ~30% skip)
  const aiActionCardId =
    room?.phase === 'action-card' && isActionCardAi && room.actionCard
      ? room.actionCard.id
      : null;

  useEffect(() => {
    if (!aiActionCardId || completedAiActionIdRef.current === aiActionCardId) {
      return;
    }
    let cancelled = false;

    void (async () => {
      const ok = await waitCalmly(0, 3800, () => cancelled, 5000);
      if (!ok || completedAiActionIdRef.current === aiActionCardId) return;
      completedAiActionIdRef.current = aiActionCardId;
      const completed = Math.random() < 0.7;
      void actions.completeActionCard(completed);
    })();

    return () => {
      cancelled = true;
    };
  }, [aiActionCardId, actions]);

  const winner: PlayerState | null = room?.winnerId
    ? (players.find((p) => p.id === room.winnerId) ?? currentPlayer)
    : null;

  const sortedStandings = useMemo(
    () => [...players].sort((a, b) => b.tileIndex - a.tileIndex),
    [players]
  );

  if (creatingRoom || !room) {
    return (
      <main className="tv-host-root tv-loading-screen">
        <div className="tv-loading-card">
          <div className="tv-loading-spinner" aria-hidden="true">
            🍭
          </div>
          <h1>Setting Up Candyland TV Board...</h1>
          {initError ? (
            <div role="alert" className="tv-error-box">
              <p>{initError}</p>
              <button
                type="button"
                className="tv-btn tv-btn-primary"
                onClick={onExit}
              >
                Back to Home
              </button>
            </div>
          ) : (
            <p>Preparing your magical 4-letter Room Code and Candy Castle!</p>
          )}
        </div>
      </main>
    );
  }

  // Full-screen TV Character Select when user opens roster picker on TV
  if (room.phase === 'lobby' && showCharSelect) {
    return (
      <div className="tv-host-root tv-charselect-wrap">
        <CharacterSelect
          characters={CHARACTERS}
          selectedPlayers={room.players}
          settings={room.settings}
          mode="tv"
          roomCode={room.roomCode}
          onPlayersChange={(nextPlayers) => void actions.updatePlayers(nextPlayers)}
          onSettingsChange={(nextSettings) =>
            void actions.updateSettings(nextSettings)
          }
          onStartGame={() => {
            setShowCharSelect(false);
            void actions.startGame();
          }}
          onBack={() => setShowCharSelect(false)}
        />
      </div>
    );
  }

  const isOnline = connectionStatus === 'connected';
  const isReconnecting = connectionStatus === 'reconnecting';

  return (
    <div className="tv-host-root">
      {/* Global Confetti & Fireworks Layer */}
      <CelebrationEffects event={room.celebration} />

      {/* Full-Bleed 16:9 Candyland Game Board Stage */}
      <main className="tv-board-canvas" aria-label="Candyland TV Game Stage">
        <BoardView
          tiles={BOARD_TILES}
          shortcuts={BOARD_SHORTCUTS}
          boardImageUrl={BOARD_IMAGE_URL}
          players={room.players}
          activePlayerId={
            room.phase !== 'lobby' ? (currentPlayer?.id ?? null) : null
          }
          movement={room.movement}
          cutscene={room.cutscene}
          activityLog={room.phase !== 'lobby' ? room.activityLog : undefined}
          onHopStep={handleHopStep}
          onMovementComplete={handleMovementComplete}
          onCutsceneComplete={handleCutsceneComplete}
        />
      </main>

      {/* Autoplay Audio Unlock Prompt (Important for TV Bro on Google TV) */}
      {!audioState.unlocked && !audioState.muted && (
        <div className="tv-audio-unlock-wrap">
          <button
            type="button"
            className="tv-audio-unlock-btn"
            onClick={handleUnlockAudio}
          >
            <Volume2 size={26} aria-hidden="true" />
            <span>Press OK / Click to Turn On TV Sound &amp; Narrator!</span>
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* PHASE 1: TV LOBBY OVERLAY (Room Code + Scannable QR + Roster)     */}
      {/* ================================================================= */}
      {room.phase === 'lobby' && (
        <section className="tv-lobby-overlay" aria-label="TV Lobby and Room Code">
          <div className="tv-lobby-card">
            <header className="tv-lobby-header">
              <div className="tv-lobby-brand">
                <span className="tv-lobby-kicker">
                  <Sparkles size={20} aria-hidden="true" />
                  GOOGLE TV BIG-SCREEN HOST
                </span>
                <h1 className="tv-lobby-title">Candyland Family Adventure</h1>
              </div>

              <div className="tv-lobby-top-controls">
                <span
                  className={`tv-sync-pill ${
                    isOnline
                      ? 'is-online'
                      : isReconnecting
                        ? 'is-reconnecting'
                        : 'is-local'
                  }`}
                >
                  {isReconnecting ? (
                    <WifiOff size={18} aria-hidden="true" />
                  ) : (
                    <Wifi size={18} aria-hidden="true" />
                  )}
                  <span>
                    {transportMode === 'firebase'
                      ? isOnline
                        ? 'Cloud Sync Live'
                        : 'Reconnecting...'
                      : 'Local Mirror Sync'}
                  </span>
                </span>

                <button
                  type="button"
                  className="tv-icon-btn"
                  aria-label={
                    audioState.muted ? 'Unmute TV audio' : 'Mute TV audio'
                  }
                  aria-pressed={audioState.muted}
                  onClick={() => {
                    soundEngine.toggleMute();
                  }}
                >
                  {audioState.muted ? (
                    <VolumeX size={24} aria-hidden="true" />
                  ) : (
                    <Volume2 size={24} aria-hidden="true" />
                  )}
                </button>

                {fullscreenSupported && (
                  <button
                    type="button"
                    className="tv-icon-btn"
                    aria-label={
                      isFullscreen ? 'Exit full screen' : 'Enter full screen'
                    }
                    aria-pressed={isFullscreen}
                    onClick={handleToggleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize2 size={22} aria-hidden="true" />
                    ) : (
                      <Maximize2 size={22} aria-hidden="true" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  className="tv-btn tv-btn-ghost"
                  onClick={openLeaveDialog}
                >
                  <LogOut size={20} aria-hidden="true" />
                  <span>Home</span>
                </button>
              </div>
            </header>

            <div className="tv-lobby-grid">
              {/* Left Column: Giant 4-Letter Room Code + Scannable QR Code */}
              <div className="tv-lobby-connect-panel">
                <div className="tv-room-code-block">
                  <span className="tv-room-code-label">ROOM CODE</span>
                  <div
                    className="tv-room-code-tiles"
                    aria-label={`Room code ${room.roomCode.split('').join(' ')}`}
                  >
                    {room.roomCode.split('').map((letter, i) => (
                      <span key={`${letter}-${i}`} className="tv-code-tile">
                        {letter}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="tv-qr-row">
                  <div className="tv-qr-frame">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={`QR code to join Candyland room ${room.roomCode} on your Pixel Tablet`}
                        className="tv-qr-img"
                      />
                    ) : (
                      <div className="tv-qr-placeholder" aria-hidden="true">
                        <QrCode size={72} />
                      </div>
                    )}
                  </div>

                  <div className="tv-qr-instructions">
                    <h2>Connect Pixel Tablet</h2>
                    <p>
                      Scan this QR code with the Pixel Tablet camera to join in{' '}
                      <strong>1 tap</strong>, or open{' '}
                      <strong className="tv-join-url">
                        {joinInfo?.displayHost}
                      </strong>{' '}
                      and enter <strong>{room.roomCode}</strong>.
                    </p>

                    <div
                      className={`tv-tablet-status ${
                        room.tabletConnected ? 'is-connected' : 'is-waiting'
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      <Tablet size={22} aria-hidden="true" />
                      <span>
                        {room.tabletConnected
                          ? 'Pixel Tablet Connected! Pick players on Tablet or TV'
                          : 'Waiting for Pixel Tablet (or play right from TV!)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Family Roster + D-Pad Friendly Launch Buttons */}
              <div className="tv-lobby-roster-panel">
                <div className="tv-roster-header">
                  <h2>Family Players ({room.players.length}/8)</h2>
                  <span className="tv-roster-hint">
                    Synced live with Tablet
                  </span>
                </div>

                {room.players.length === 0 ? (
                  <div className="tv-roster-empty">
                    <p>
                      No players picked yet! Choose family portraits on the
                      Pixel Tablet or right here on the TV.
                    </p>
                  </div>
                ) : (
                  <ol className="tv-roster-strip">
                    {room.players.map((player, idx) => (
                      <li
                        key={player.id}
                        className="tv-roster-chip"
                        style={
                          { '--player-color': player.color } as React.CSSProperties
                        }
                      >
                        <span className="tv-roster-order">#{idx + 1}</span>
                        <div className="tv-roster-avatar">
                          {!failedAvatars[player.id] ? (
                            <img
                              src={player.portraitUrl}
                              alt={player.name}
                              onError={() =>
                                setFailedAvatars((prev) => ({
                                  ...prev,
                                  [player.id]: true,
                                }))
                              }
                            />
                          ) : (
                            <span aria-hidden="true">
                              {player.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="tv-roster-name">{player.name}</span>
                      </li>
                    ))}
                  </ol>
                )}

                <div
                  ref={lobbyActionsRef}
                  className="tv-lobby-actions"
                  onKeyDown={(e) =>
                    handleSpatialKeyDown(e, lobbyActionsRef.current)
                  }
                >
                  <button
                    type="button"
                    className="tv-btn tv-btn-secondary"
                    autoFocus={room.players.length < 2}
                    onClick={() => {
                      soundEngine.playButtonTap();
                      setShowCharSelect(true);
                    }}
                  >
                    <Users size={26} aria-hidden="true" />
                    <span>
                      {room.players.length > 0
                        ? 'Edit Family Players'
                        : 'Choose Family Players'}
                    </span>
                  </button>

                  {room.players.length < 2 ? (
                    <button
                      type="button"
                      className="tv-btn tv-btn-accent"
                      onClick={handleQuickFamilyPreset}
                    >
                      <Sparkles size={26} aria-hidden="true" />
                      <span>Quick Pick: Wyatt, Emma, Rita &amp; Robert</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tv-btn tv-btn-start"
                      autoFocus
                      onClick={() => {
                        soundEngine.playStarChime();
                        void actions.startGame();
                      }}
                    >
                      <Play size={30} fill="currentColor" aria-hidden="true" />
                      <span>Start Adventure!</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================= */}
      {/* PHASE 2+: ACTIVE GAMEPLAY FLOATING NON-OBSTRUCTIVE TV HUD         */}
      {/* ================================================================= */}
      {room.phase !== 'lobby' && (
        <>
          <header className="tv-hud-bar" aria-label="Game status bar">
            {/* Active Player Portrait & Name */}
            {currentPlayer && (
              <div
                className="tv-turn-card"
                style={
                  {
                    '--player-color': currentPlayer.color,
                    '--player-accent': currentPlayer.accentColor,
                  } as React.CSSProperties
                }
              >
                <div className="tv-turn-avatar">
                  {!failedAvatars[currentPlayer.id] ? (
                    <img
                      src={currentPlayer.portraitUrl}
                      alt={currentPlayer.name}
                      onError={() =>
                        setFailedAvatars((prev) => ({
                          ...prev,
                          [currentPlayer.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <span aria-hidden="true">
                      {currentPlayer.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="tv-turn-copy">
                  <span className="tv-turn-kicker">
                    {currentPlayer.stuckTurns > 0
                      ? '🌀 STUCK IN LICORICE!'
                      : 'CURRENT TURN'}
                  </span>
                  {room.phase === 'victory' ? (
                    <span className="tv-turn-name font-display">
                      {currentPlayer.name}&apos;s Turn!
                    </span>
                  ) : (
                    <h1 className="tv-turn-name">
                      {currentPlayer.name}&apos;s Turn!
                    </h1>
                  )}
                </div>
                <span className="tv-turn-space">
                  {currentPlayer.tileIndex}/{LAST_TILE_INDEX}
                </span>
              </div>
            )}

            {/* Compact Turn Order Strip */}
            <ol
              className="tv-turn-strip"
              aria-label="Player turn order and progress"
            >
              {room.players.map((p, idx) => {
                const isCurrent = idx === room.currentPlayerIndex;
                return (
                  <li
                    key={p.id}
                    className={`tv-strip-token ${isCurrent ? 'is-current' : ''} ${
                      p.stuckTurns > 0 ? 'is-stuck' : ''
                    }`}
                    style={{ '--player-color': p.color } as React.CSSProperties}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <div className="tv-strip-pic">
                      {!failedAvatars[`tok-${p.id}`] ? (
                        <img
                          src={p.tokenUrl}
                          alt={p.name}
                          onError={() =>
                            setFailedAvatars((prev) => ({
                              ...prev,
                              [`tok-${p.id}`]: true,
                            }))
                          }
                        />
                      ) : (
                        <span aria-hidden="true">{p.name[0]}</span>
                      )}
                    </div>
                    <span className="tv-strip-label">{p.name}</span>
                  </li>
                );
              })}
            </ol>

            {/* Compact TV Controls & Room Chip */}
            <div className="tv-hud-controls">
              {room.phase === 'waiting-draw' &&
                (isCurrentPlayerAi ? (
                  <span className="tv-hud-ai-badge" role="status">
                    <span aria-hidden="true">🧙‍♂️</span>
                    <span>{currentPlayer?.name ?? 'Gnome'}&apos;s Turn</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="tv-hud-draw-btn"
                    {...tvHudDrawTapProps}
                  >
                    <Sparkles size={20} aria-hidden="true" />
                    <span>
                      {currentPlayer && currentPlayer.stuckTurns > 0
                        ? 'Wiggle Free'
                        : 'Draw Card'}
                    </span>
                  </button>
                ))}

              <button
                type="button"
                className={`tv-room-chip ${
                  room.tabletConnected ? 'is-tablet-linked' : ''
                }`}
                onClick={openQrDialog}
                aria-label={`Room code ${room.roomCode}. Open QR code to connect tablet`}
              >
                <span className="tv-room-chip-dot" aria-hidden="true" />
                <QrCode size={18} aria-hidden="true" />
                <span className="tv-room-chip-code">{room.roomCode}</span>
              </button>

              <button
                type="button"
                className="tv-icon-btn"
                aria-label={
                  audioState.bgmMuted
                    ? 'Turn background music on'
                    : 'Turn background music off'
                }
                aria-pressed={audioState.bgmMuted}
                onClick={() => soundEngine.toggleBgmMute()}
              >
                <Music size={22} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="tv-icon-btn"
                aria-label={
                  audioState.muted ? 'Unmute all TV audio' : 'Mute all TV audio'
                }
                aria-pressed={audioState.muted}
                onClick={() => soundEngine.toggleMute()}
              >
                {audioState.muted ? (
                  <VolumeX size={22} aria-hidden="true" />
                ) : (
                  <Volume2 size={22} aria-hidden="true" />
                )}
              </button>

              {fullscreenSupported && (
                <button
                  type="button"
                  className="tv-icon-btn"
                  aria-label={
                    isFullscreen ? 'Exit full screen' : 'Enter full screen'
                  }
                  aria-pressed={isFullscreen}
                  onClick={handleToggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 size={22} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={22} aria-hidden="true" />
                  )}
                </button>
              )}

              <button
                type="button"
                className="tv-icon-btn tv-icon-btn-exit"
                aria-label="Leave TV game"
                onClick={openLeaveDialog}
              >
                <LogOut size={22} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Bottom Floating Event Banner (Polite Live Region) */}
          {room.lastEventBanner &&
            room.phase !== 'victory' &&
            room.phase !== 'cutscene' && (
              <div
                className="tv-event-banner"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <span>{room.lastEventBanner}</span>
              </div>
            )}

          {/* =============================================================== */}
          {/* GIANT ANIMATED CARD REVEAL POPUP (phase === 'card-drawn')       */}
          {/* =============================================================== */}
          {room.phase === 'card-drawn' && room.currentCard && currentPlayer && (
            <aside
              className="tv-card-reveal-backdrop"
              aria-label={`${currentPlayer.name} drew ${room.currentCard.label}`}
            >
              <div
                className={`tv-card-reveal-card type-${room.currentCard.type}`}
                style={
                  {
                    '--player-color': currentPlayer.color,
                  } as React.CSSProperties
                }
              >
                <div className="tv-card-reveal-header">
                  <span className="tv-card-reveal-player">
                    {currentPlayer.name} drew...
                  </span>
                  {room.currentCard.type === 'double' && (
                    <span className="tv-card-double-tag">✨ DOUBLE HOP! ✨</span>
                  )}
                </div>

                {renderCardArtwork(room.currentCard)}

                <h2 className="tv-card-reveal-label">
                  {room.currentCard.label}
                </h2>
                {room.currentCard.subtitle && (
                  <p className="tv-card-reveal-sub">
                    {room.currentCard.subtitle}
                  </p>
                )}
              </div>
            </aside>
          )}

          {/* =============================================================== */}
          {/* LIVE MINI-GAME TV OVERLAY (phase === 'minigame')                */}
          {/* =============================================================== */}
          {room.phase === 'minigame' && room.miniGame && (
            <>
              {playMiniGameOnTv && !isMiniGameAi ? (
                <MiniGameHost
                  session={room.miniGame}
                  onScoreChange={actions.submitMiniGameScore}
                  onComplete={(won, finalScore) => {
                    setPlayMiniGameOnTv(false);
                    void actions.finishMiniGame(won, finalScore);
                  }}
                />
              ) : (
                <>
                  <MiniGameTvOverlay
                    session={room.miniGame}
                    isAiPlayer={isMiniGameAi}
                  />
                  {!room.tabletConnected && !isMiniGameAi && (
                    <div className="tv-fallback-bar">
                      <span>No Pixel Tablet connected?</span>
                      <button
                        type="button"
                        className="tv-btn tv-btn-accent tv-btn-sm"
                        onClick={() => setPlayMiniGameOnTv(true)}
                      >
                        Play Here on TV
                      </button>
                      <button
                        type="button"
                        className="tv-btn tv-btn-ghost tv-btn-sm"
                        onClick={() =>
                          void actions.finishMiniGame(
                            false,
                            room.miniGame?.score ?? 0
                          )
                        }
                      >
                        Skip (+1 Space)
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* =============================================================== */}
          {/* ACTION CARD TV OVERLAY (phase === 'action-card')                */}
          {/* =============================================================== */}
          {room.phase === 'action-card' && room.actionCard && (
            <>
              <ActionCardOverlay
                session={room.actionCard}
                mode="tv"
                isAiPlayer={isActionCardAi}
              />
              {!room.tabletConnected && !isActionCardAi && (
                <div className="tv-fallback-bar">
                  <span>Confirm right from TV:</span>
                  <button
                    type="button"
                    className="tv-btn tv-btn-start tv-btn-sm"
                    onClick={() => void actions.completeActionCard(true)}
                  >
                    Complete! (+{room.actionCard.card.bonusSpaces})
                  </button>
                  <button
                    type="button"
                    className="tv-btn tv-btn-ghost tv-btn-sm"
                    onClick={() => void actions.completeActionCard(false)}
                  >
                    Skip Card
                  </button>
                </div>
              )}
            </>
          )}

          {/* =============================================================== */}
          {/* CANDY CASTLE VICTORY FINALE OVERLAY (phase === 'victory')       */}
          {/* =============================================================== */}
          {room.phase === 'victory' && winner && (
            <section
              className="tv-victory-overlay"
              aria-label="Candy Castle Victory Celebration"
            >
              <div
                className="tv-victory-card"
                style={
                  {
                    '--winner-color': winner.color,
                    '--winner-accent': winner.accentColor,
                  } as React.CSSProperties
                }
              >
                <div className="tv-victory-crown" aria-hidden="true">
                  <Crown size={54} />
                </div>

                <div className="tv-victory-hero">
                  <div className="tv-victory-portrait-ring">
                    {!failedAvatars[winner.id] ? (
                      <img
                        src={winner.portraitUrl}
                        alt={winner.name}
                        className="tv-victory-portrait"
                        onError={() =>
                          setFailedAvatars((prev) => ({
                            ...prev,
                            [winner.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <span
                        className="tv-victory-fallback"
                        aria-hidden="true"
                      >
                        {winner.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="tv-victory-copy">
                    <span className="tv-victory-kicker">
                      🏰 CANDY CASTLE CHAMPION! 🏰
                    </span>
                    <h1 className="tv-victory-title">
                      Hooray, {winner.name} Won!!
                    </h1>
                    <p className="tv-victory-sub">
                      What a sweet Candyland family adventure!
                    </p>
                  </div>
                </div>

                {/* Family Standings Summary */}
                <ol className="tv-standings-grid">
                  {sortedStandings.map((p, idx) => (
                    <li
                      key={p.id}
                      className={`tv-standing-row ${
                        p.id === winner.id ? 'is-winner' : ''
                      }`}
                      style={
                        { '--player-color': p.color } as React.CSSProperties
                      }
                    >
                      <span className="tv-standing-rank">
                        {idx === 0 ? '🏆' : `#${idx + 1}`}
                      </span>
                      <span className="tv-standing-name">{p.name}</span>
                      <span className="tv-standing-stat">
                        Space {p.tileIndex}/{LAST_TILE_INDEX}
                      </span>
                      <span className="tv-standing-badges">
                        ⭐ {p.miniGamesWon} · 🎭 {p.actionCardsCompleted}
                      </span>
                    </li>
                  ))}
                </ol>

                <div
                  ref={victoryActionsRef}
                  className="tv-victory-actions"
                  onKeyDown={(e) =>
                    handleSpatialKeyDown(e, victoryActionsRef.current)
                  }
                >
                  <button
                    type="button"
                    className="tv-btn tv-btn-start"
                    autoFocus
                    onClick={() => {
                      soundEngine.playStarChime();
                      void actions.playAgain();
                    }}
                  >
                    <RotateCcw size={28} aria-hidden="true" />
                    <span>Play Again!</span>
                  </button>

                  <button
                    type="button"
                    className="tv-btn tv-btn-secondary"
                    onClick={() => {
                      soundEngine.playButtonTap();
                      void actions.returnToLobby();
                    }}
                  >
                    <Users size={26} aria-hidden="true" />
                    <span>Change Players</span>
                  </button>

                  <button
                    type="button"
                    className="tv-btn tv-btn-ghost"
                    onClick={openLeaveDialog}
                  >
                    <Trophy size={24} aria-hidden="true" />
                    <span>Back to Home</span>
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* NATIVE MODAL <dialog>: MID-GAME QR / TABLET RECONNECT POPUP       */}
      {/* ================================================================= */}
      <dialog
        ref={qrDialogRef}
        className="tv-modal-dialog"
        aria-labelledby={qrTitleId}
      >
        <div className="tv-modal-shell">
          <header className="tv-modal-header">
            <h1 id={qrTitleId} className="tv-modal-title">
              Connect Tablet Controller
            </h1>
            <button
              type="button"
              className="tv-icon-btn"
              aria-label="Close QR dialog"
              onClick={closeQrDialog}
            >
              <X size={24} aria-hidden="true" />
            </button>
          </header>

          <div className="tv-modal-qr-body">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`QR code for room ${room.roomCode}`}
                className="tv-modal-qr-img"
              />
            )}
            <div className="tv-modal-code-row">
              {room.roomCode.split('').map((ch, idx) => (
                <span key={`${ch}-${idx}`} className="tv-code-tile">
                  {ch}
                </span>
              ))}
            </div>
            <p className="tv-modal-desc">
              Scan with the Pixel Tablet or go to{' '}
              <strong>{joinInfo?.displayHost}</strong> and enter{' '}
              <strong>{room.roomCode}</strong>.
            </p>
            <button
              type="button"
              className="tv-btn tv-btn-primary"
              autoFocus
              onClick={closeQrDialog}
            >
              Back to Board
            </button>
          </div>
        </div>
      </dialog>

      {/* ================================================================= */}
      {/* NATIVE MODAL <dialog>: LEAVE TV HOST CONFIRMATION                 */}
      {/* ================================================================= */}
      <dialog
        ref={leaveDialogRef}
        className="tv-modal-dialog"
        aria-labelledby={leaveTitleId}
      >
        <div className="tv-modal-shell">
          <h1 id={leaveTitleId} className="tv-modal-title">
            Leave Candyland TV Board?
          </h1>
          <p className="tv-modal-desc">
            Returning to the home screen will disconnect this TV from room{' '}
            <strong>{room.roomCode}</strong>.
          </p>
          <div className="tv-modal-actions">
            <button
              type="button"
              className="tv-btn tv-btn-danger"
              onClick={() => handleLeaveDialogAction('leave')}
            >
              Leave Game
            </button>
            <button
              type="button"
              className="tv-btn tv-btn-start"
              autoFocus
              onClick={() => handleLeaveDialogAction('stay')}
            >
              Stay in Game
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
};

export default TvHostView;
