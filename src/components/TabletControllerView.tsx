import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  FastForward,
  LogOut,
  RotateCcw,
  Sparkles,
  Trophy,
  Tv,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CHARACTERS } from '../data/characters';
import { LAST_TILE_INDEX, getTileByIndex } from '../data/boardData';
import {
  isValidRoomCode,
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
import { CharacterSelect } from './CharacterSelect';
import { CelebrationEffects } from './CelebrationEffects';
import { ActionCardOverlay } from './ActionCardOverlay';
import { MiniGameHost } from './minigames/MiniGameHost';
import './TabletControllerView.css';

export interface TabletControllerViewProps {
  /** Optional 4-letter room code parsed from `?room=CODE` QR scan. */
  initialRoomCode?: string;
  /** Called when the user leaves back to the Landing Screen. */
  onExit: () => void;
}

let cachedTabletDisplayTransition: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (cachedTabletDisplayTransition !== undefined) {
    return cachedTabletDisplayTransition;
  }
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
  cachedTabletDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedTabletDisplayTransition;
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

function renderTabletCardVisual(card: Card) {
  if ((card.type === 'single' || card.type === 'double') && card.color) {
    const meta = TILE_COLOR_META[card.color];
    const isDouble = card.type === 'double';
    return (
      <div className={`tab-card-swatches ${isDouble ? 'is-double' : ''}`}>
        <span
          className="tab-card-swatch"
          style={
            {
              '--swatch-hex': meta.hex,
              '--swatch-dark': meta.darkHex,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
        {isDouble && (
          <span
            className="tab-card-swatch"
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
      <div className="tab-card-emblem is-landmark" aria-hidden="true">
        <span>{lm.emoji}</span>
      </div>
    );
  }

  if (card.type === 'action') {
    return (
      <div className="tab-card-emblem is-action" aria-hidden="true">
        <span>{card.emoji ?? '🎭'}</span>
      </div>
    );
  }

  return (
    <div className="tab-card-emblem is-licorice" aria-hidden="true">
      <span>{card.emoji ?? '🌀'}</span>
    </div>
  );
}

export const TabletControllerView: React.FC<TabletControllerViewProps> = ({
  initialRoomCode,
  onExit,
}) => {
  const initialClean = initialRoomCode ? sanitizeRoomCode(initialRoomCode) : '';

  const [codeBoxes, setCodeBoxes] = useState<[string, string, string, string]>([
    initialClean[0] ?? '',
    initialClean[1] ?? '',
    initialClean[2] ?? '',
    initialClean[3] ?? '',
  ]);
  const [joinedRoomCode, setJoinedRoomCode] = useState<string | null>(null);
  const [joining, setJoining] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [drawingInFlight, setDrawingInFlight] = useState<boolean>(false);
  const [audioState, setAudioState] = useState<AudioEngineState>(() =>
    soundEngine.getState()
  );
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const boxRefs = useRef<Array<HTMLInputElement | null>>([
    null,
    null,
    null,
    null,
  ]);
  const leaveDialogRef = useRef<HTMLDialogElement | null>(null);
  const autoJoinAttemptedRef = useRef<string | null>(null);

  const codeLabelId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const leaveTitleId = useId();

  // Tablet uses tactile SFX ONLY (no BGM/voiceover echo with Google TV!)
  useEffect(() => {
    soundEngine.setAudioMode('tablet');
    const unsub = soundEngine.subscribe(setAudioState);
    return () => {
      unsub();
    };
  }, []);

  const attemptJoin = useCallback(async (rawCode: string) => {
    const clean = sanitizeRoomCode(rawCode);
    if (!isValidRoomCode(clean) || clean.length < 4) {
      setJoinError('Please enter all 4 letters shown on the TV.');
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      const found = await joinRoom(clean, 'tablet');
      if (!found) {
        setJoinError(
          `Oops! We couldn't find room "${clean}". Check the 4 letters on the TV and try again!`
        );
        soundEngine.playLicoriceSquish();
        return;
      }
      soundEngine.playStarChime();
      setJoinedRoomCode(found.roomCode);
    } catch (err) {
      setJoinError(
        err instanceof Error
          ? err.message
          : 'Could not connect to the TV room. Please try again.'
      );
    } finally {
      setJoining(false);
    }
  }, []);

  // Auto-join immediately when launched from QR code (`?room=CODE`)
  useEffect(() => {
    if (
      initialClean.length === 4 &&
      autoJoinAttemptedRef.current !== initialClean
    ) {
      autoJoinAttemptedRef.current = initialClean;
      void attemptJoin(initialClean);
    }
  }, [initialClean, attemptJoin]);

  const { room, loading, connectionStatus, transportMode, actions } =
    useGameRoom(joinedRoomCode, 'tablet');

  // Reset in-flight draw guard whenever phase changes
  useEffect(() => {
    setDrawingInFlight(false);
  }, [room?.phase, room?.lastEventId]);

  // Safety fallback if testing tablet solo without a live TV host connected
  useEffect(() => {
    if (!room || room.hostConnected) return;
    if (room.phase === 'card-drawn' && room.currentCard) {
      const t = window.setTimeout(() => {
        void actions.resolveDrawnCard();
      }, 2100);
      return () => window.clearTimeout(t);
    }
    if (room.phase === 'moving' && room.movement) {
      const t = window.setTimeout(() => {
        void actions.advanceMoveComplete();
      }, 1800);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [room, actions]);

  // Native <dialog> cancel/close handlers whenever room dialog is mounted
  // (per modern-web-guidance `dialog` + `animate-to-from-top-layer`)
  const hasLeaveDialog = Boolean(joinedRoomCode && !loading && room);
  const currentRoomPhase = room?.phase ?? null;

  useEffect(() => {
    if (!hasLeaveDialog) return;
    const dialog = leaveDialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      void closeAnimatedDialog(dialog, 'stay');
    };
    const handleClose = () => {
      const choice = dialog.returnValue;
      dialog.returnValue = '';
      if (choice === 'leave') {
        if (joinedRoomCode) {
          void leaveRoom(joinedRoomCode, 'tablet');
        }
        setJoinedRoomCode(null);
        onExit();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [hasLeaveDialog, currentRoomPhase, joinedRoomCode, onExit]);

  const openLeaveDialog = useCallback(() => {
    soundEngine.playButtonTap();
    const dialog = leaveDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const handleLeaveAction = useCallback((choice: 'stay' | 'leave') => {
    soundEngine.playButtonTap();
    const dialog = leaveDialogRef.current;
    if (dialog && dialog.open) {
      void closeAnimatedDialog(dialog, choice);
    }
  }, []);

  const handleBoxChange = (index: number, rawValue: string) => {
    setJoinError(null);
    const cleaned = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (cleaned.length > 1) {
      // Handle paste or multi-character autofill cleanly across all 4 boxes
      const chars = cleaned.slice(0, 4).split('');
      const next: [string, string, string, string] = [
        chars[0] ?? '',
        chars[1] ?? '',
        chars[2] ?? '',
        chars[3] ?? '',
      ];
      setCodeBoxes(next);
      const focusIdx = Math.min(3, chars.length);
      boxRefs.current[focusIdx]?.focus();
      return;
    }

    const next: [string, string, string, string] = [...codeBoxes] as [
      string,
      string,
      string,
      string,
    ];
    next[index] = cleaned;
    setCodeBoxes(next);

    if (cleaned && index < 3) {
      boxRefs.current[index + 1]?.focus();
    }
  };

  const handleBoxKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Backspace' && !codeBoxes[index] && index > 0) {
      event.preventDefault();
      const next: [string, string, string, string] = [...codeBoxes] as [
        string,
        string,
        string,
        string,
      ];
      next[index - 1] = '';
      setCodeBoxes(next);
      boxRefs.current[index - 1]?.focus();
    }
  };

  const handleJoinSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    soundEngine.playButtonTap();
    void attemptJoin(codeBoxes.join(''));
  };

  const handleDrawCardTap = async () => {
    if (drawingInFlight || !room || room.phase !== 'waiting-draw') return;
    setDrawingInFlight(true);
    const active = room.players[room.currentPlayerIndex];
    if (active && active.stuckTurns > 0) {
      soundEngine.playLicoriceSquish();
    } else {
      soundEngine.playCardFlip();
    }
    try {
      await actions.drawCard();
    } finally {
      // Phase transition clears drawingInFlight; safety unlock after 900ms
      window.setTimeout(() => setDrawingInFlight(false), 900);
    }
  };

  const enteredCode = codeBoxes.join('');

  // =========================================================================
  // SCREEN 1: JOIN ROOM SCREEN (Before Connected)
  // =========================================================================
  if (!joinedRoomCode) {
    return (
      <main className="tablet-root tablet-join-page">
        <header className="tablet-join-topbar">
          <button
            type="button"
            className="tab-pill-btn"
            onClick={() => {
              soundEngine.playButtonTap();
              onExit();
            }}
          >
            <ArrowLeft size={22} aria-hidden="true" />
            <span>Home</span>
          </button>

          <button
            type="button"
            className="tab-icon-btn"
            aria-label={
              audioState.muted ? 'Unmute touch sound effects' : 'Mute touch sound effects'
            }
            aria-pressed={audioState.muted}
            onClick={() => soundEngine.toggleMute()}
          >
            {audioState.muted ? (
              <VolumeX size={24} aria-hidden="true" />
            ) : (
              <Volume2 size={24} aria-hidden="true" />
            )}
          </button>
        </header>

        <section className="tablet-join-card" aria-labelledby={codeLabelId}>
          <div className="tab-join-badge">
            <Sparkles size={20} aria-hidden="true" />
            <span>PIXEL TABLET CONTROLLER</span>
          </div>

          <h1 id={codeLabelId} className="tab-join-title">
            Enter TV Room Code
          </h1>

          <p id={codeHintId} className="tab-join-hint">
            Type the 4 big candy letters shown on your TV screen (or scan the TV
            QR code).
          </p>

          <form
            className="tab-join-form"
            onSubmit={handleJoinSubmit}
            noValidate
          >
            <fieldset className="tab-code-fieldset">
              <legend className="tab-visually-hidden">
                Four-letter TV room code
              </legend>
              <div className="tab-code-boxes">
                {codeBoxes.map((char, idx) => (
                  <div key={idx} className="tab-code-slot">
                    <label
                      htmlFor={`room-letter-${idx + 1}`}
                      className="tab-visually-hidden"
                    >
                      Room code letter {idx + 1} of 4
                    </label>
                    <input
                      ref={(el) => {
                        boxRefs.current[idx] = el;
                      }}
                      id={`room-letter-${idx + 1}`}
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={4}
                      required
                      value={char}
                      aria-describedby={
                        joinError ? `${codeHintId} ${codeErrorId}` : codeHintId
                      }
                      aria-invalid={Boolean(joinError)}
                      className={`tab-code-input ${char ? 'has-char' : ''}`}
                      onChange={(e) => handleBoxChange(idx, e.target.value)}
                      onKeyDown={(e) => handleBoxKeyDown(idx, e)}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            {joinError && (
              <p
                id={codeErrorId}
                role="alert"
                className="tab-join-error"
              >
                {joinError}
              </p>
            )}

            <button
              type="submit"
              className="tab-join-submit-btn"
              disabled={joining || enteredCode.length < 4}
            >
              <Tv size={28} aria-hidden="true" />
              <span>{joining ? 'Connecting to TV...' : 'Join TV Game!'}</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  // Loading / Room Disappeared
  if (loading || !room) {
    return (
      <main className="tablet-root tablet-join-page">
        <div className="tablet-join-card">
          <h1 className="tab-join-title">
            {loading
              ? `Connecting to Room ${joinedRoomCode}...`
              : `Room ${joinedRoomCode} Not Found`}
          </h1>
          <p className="tab-join-hint">
            {loading
              ? 'Syncing with your Candyland TV board!'
              : 'The TV host may have closed this room. Try entering a new code!'}
          </p>
          {!loading && (
            <button
              type="button"
              className="tab-join-submit-btn"
              onClick={() => {
                setJoinedRoomCode(null);
                setCodeBoxes(['', '', '', '']);
              }}
            >
              Enter Another Code
            </button>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // SCREEN 2: LOBBY / SYNCED CHARACTER SELECT ON TABLET
  // =========================================================================
  if (room.phase === 'lobby') {
    return (
      <div className="tablet-root tablet-lobby-wrap">
        <CharacterSelect
          characters={CHARACTERS}
          selectedPlayers={room.players}
          settings={room.settings}
          mode="tablet"
          roomCode={room.roomCode}
          onPlayersChange={(nextPlayers) => void actions.updatePlayers(nextPlayers)}
          onSettingsChange={(nextSettings) =>
            void actions.updateSettings(nextSettings)
          }
          onStartGame={() => void actions.startGame()}
          onBack={openLeaveDialog}
        />

        {/* Shared Leave Confirmation Native <dialog> */}
        <dialog
          ref={leaveDialogRef}
          className="tab-modal-dialog"
          aria-labelledby={leaveTitleId}
        >
          <div className="tab-modal-shell">
            <h1 id={leaveTitleId} className="tab-modal-title">
              Leave Room {room.roomCode}?
            </h1>
            <p className="tab-modal-desc">
              You can rejoin anytime by scanning the QR code on the TV.
            </p>
            <div className="tab-modal-actions">
              <button
                type="button"
                className="tab-modal-btn is-danger"
                onClick={() => handleLeaveAction('leave')}
              >
                Leave Room
              </button>
              <button
                type="button"
                className="tab-modal-btn is-safe"
                autoFocus
                onClick={() => handleLeaveAction('stay')}
              >
                Stay in Game
              </button>
            </div>
          </div>
        </dialog>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 3: ACTIVE GAMEPLAY & VICTORY TABLET CONTROLLER
  // =========================================================================
  const players: readonly PlayerState[] = room.players;
  const currentPlayer: PlayerState | null =
    players.length > 0
      ? (players[room.currentPlayerIndex] ?? players[0])
      : null;
  const winner: PlayerState | null = room.winnerId
    ? (players.find((p) => p.id === room.winnerId) ?? currentPlayer)
    : null;

  const activeThemePlayer =
    room.phase === 'victory' ? winner : currentPlayer;
  const currentTile = currentPlayer
    ? getTileByIndex(currentPlayer.tileIndex)
    : null;
  const isStuck = Boolean(currentPlayer && currentPlayer.stuckTurns > 0);
  const isOnline =
    connectionStatus === 'connected' || connectionStatus === 'local';

  return (
    <div
      className={`tablet-root tablet-controller-shell phase-${room.phase}`}
      style={
        {
          '--player-color': activeThemePlayer?.color ?? '#ff5e99',
          '--player-accent': activeThemePlayer?.accentColor ?? '#ffe6f2',
        } as React.CSSProperties
      }
    >
      {/* Celebration Confetti on Victory */}
      <CelebrationEffects event={room.celebration} />

      {/* Top Compact Status & Parent Controls Bar */}
      <header className="tab-topbar">
        <div className="tab-topbar-left">
          <div
            className={`tab-room-pill ${isOnline ? 'is-ok' : 'is-warn'}`}
            aria-label={`Room ${room.roomCode}, ${
              isOnline ? 'connected' : 'reconnecting'
            }`}
          >
            {isOnline ? (
              <Wifi size={18} aria-hidden="true" />
            ) : (
              <WifiOff size={18} aria-hidden="true" />
            )}
            <span className="tab-room-pill-code">{room.roomCode}</span>
            <span className="tab-room-pill-mode">
              {transportMode === 'firebase' ? 'TV Live' : 'Local'}
            </span>
          </div>
        </div>

        <div className="tab-topbar-right">
          <button
            type="button"
            className="tab-icon-btn"
            aria-label={
              audioState.muted
                ? 'Unmute tablet touch sounds'
                : 'Mute tablet touch sounds'
            }
            aria-pressed={audioState.muted}
            onClick={() => soundEngine.toggleMute()}
          >
            {audioState.muted ? (
              <VolumeX size={24} aria-hidden="true" />
            ) : (
              <Volume2 size={24} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className="tab-pill-btn tab-leave-btn"
            onClick={openLeaveDialog}
          >
            <LogOut size={20} aria-hidden="true" />
            <span>Leave</span>
          </button>
        </div>
      </header>

      {/* Main Interactive Tablet Stage */}
      <main className="tab-stage">
        {/* =============================================================== */}
        {/* VICTORY CONTROLLER SCREEN                                       */}
        {/* =============================================================== */}
        {room.phase === 'victory' && winner ? (
          <section
            className="tab-victory-panel"
            aria-label="Victory celebration"
          >
            <div className="tab-victory-trophy" aria-hidden="true">
              <Trophy size={64} />
            </div>

            <div className="tab-victory-portrait-frame">
              {!failedImages[winner.id] ? (
                <img
                  src={winner.portraitUrl}
                  alt={winner.name}
                  className="tab-victory-portrait"
                  onError={() =>
                    setFailedImages((prev) => ({ ...prev, [winner.id]: true }))
                  }
                />
              ) : (
                <span className="tab-portrait-fallback" aria-hidden="true">
                  {winner.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>

            <h1 className="tab-victory-headline">
              HOORAY! {winner.name.toUpperCase()} WON!
            </h1>
            <p className="tab-victory-sub">
              🏰 Reached Candy Castle! Sweetest victory ever!
            </p>

            <div className="tab-victory-buttons">
              <button
                type="button"
                className="tab-big-playagain-btn"
                onClick={() => {
                  soundEngine.playStarChime();
                  void actions.playAgain();
                }}
              >
                <RotateCcw size={32} aria-hidden="true" />
                <span>Play Again!</span>
              </button>

              <button
                type="button"
                className="tab-secondary-action-btn"
                onClick={() => {
                  soundEngine.playButtonTap();
                  void actions.returnToLobby();
                }}
              >
                <Users size={24} aria-hidden="true" />
                <span>Change Players</span>
              </button>
            </div>
          </section>
        ) : (
          /* ============================================================= */
          /* TURN CONTROLLER SCREEN (Draw / Card Drawn / Moving / Cutscene)*/
          /* ============================================================= */
          currentPlayer && (
            <section
              className="tab-turn-stage"
              aria-label={`${currentPlayer.name}'s turn controls`}
            >
              {/* Giant Joyous Player Portrait + Name */}
              <div className="tab-hero-player">
                <div className="tab-portrait-ring">
                  {!failedImages[currentPlayer.id] ? (
                    <img
                      src={currentPlayer.portraitUrl}
                      alt={currentPlayer.name}
                      className="tab-portrait-img"
                      onError={() =>
                        setFailedImages((prev) => ({
                          ...prev,
                          [currentPlayer.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <span className="tab-portrait-fallback" aria-hidden="true">
                      {currentPlayer.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="tab-hero-copy">
                  <h1 className="tab-turn-headline">
                    {isStuck && room.phase === 'waiting-draw'
                      ? `${currentPlayer.name.toUpperCase()} IS STICKY!`
                      : `${currentPlayer.name.toUpperCase()}'S TURN!`}
                  </h1>
                  <p className="tab-space-pill">
                    Space {currentPlayer.tileIndex} of {LAST_TILE_INDEX}
                    {currentTile?.region ? ` · ${currentTile.region}` : ''}
                  </p>
                </div>
              </div>

              {/* Center Interactive Zone */}
              <div className="tab-action-zone">
                {/* WAITING FOR TAP TO DRAW CARD */}
                {room.phase === 'waiting-draw' && (
                  <button
                    type="button"
                    className={`tab-mega-draw-btn ${
                      isStuck ? 'is-licorice' : ''
                    }`}
                    disabled={drawingInFlight}
                    onClick={() => void handleDrawCardTap()}
                  >
                    <span className="tab-mega-sparkle-1" aria-hidden="true">
                      ✨
                    </span>
                    <span className="tab-mega-sparkle-2" aria-hidden="true">
                      ⭐
                    </span>
                    <span className="tab-mega-emoji" aria-hidden="true">
                      {isStuck ? '🌀' : '🃏'}
                    </span>
                    <span className="tab-mega-label">
                      {isStuck
                        ? 'TAP TO WIGGLE FREE!'
                        : 'TAP TO DRAW CARD!'}
                    </span>
                    <span className="tab-mega-sub">
                      {isStuck
                        ? 'Pop right out of sticky Licorice Lagoon!'
                        : 'Slap anywhere on this giant candy button!'}
                    </span>
                  </button>
                )}

                {/* CARD DRAWN OR HOPPING ON TV */}
                {(room.phase === 'card-drawn' || room.phase === 'moving') && (
                  <div
                    className="tab-drawn-card-panel"
                    role="status"
                    aria-live="polite"
                  >
                    {room.movement?.isBonusMove ? (
                      <div
                        className="tab-card-emblem is-bonus"
                        aria-hidden="true"
                      >
                        <span>🌟</span>
                      </div>
                    ) : room.currentCard ? (
                      renderTabletCardVisual(room.currentCard)
                    ) : null}

                    <h2 className="tab-drawn-title">
                      {room.movement?.isBonusMove
                        ? 'Bonus Candy Hops!'
                        : (room.currentCard?.label ?? 'Sweet Move!')}
                    </h2>

                    <div className="tab-watch-tv-pill">
                      <Tv size={24} aria-hidden="true" />
                      <span>
                        {room.movement?.shortcutUsed
                          ? `Look at the TV! ${currentPlayer.name} is zooming across the shortcut!`
                          : room.phase === 'moving'
                            ? `Look at the TV! ${currentPlayer.name} is hopping!`
                            : `Look at the TV! Showing ${currentPlayer.name}'s card!`}
                      </span>
                    </div>
                  </div>
                )}

                {/* AI VIDEO CUTSCENE PLAYING ON TV */}
                {room.phase === 'cutscene' && room.cutscene && (
                  <div
                    className="tab-cutscene-panel"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="tab-cutscene-emoji" aria-hidden="true">
                      🎬
                    </span>
                    <h2 className="tab-drawn-title">{room.cutscene.title}</h2>
                    <p className="tab-cutscene-sub">
                      Look up at the TV! {room.cutscene.subtitle}
                    </p>
                    <button
                      type="button"
                      className="tab-secondary-action-btn"
                      onClick={() => {
                        soundEngine.playButtonTap();
                        void actions.finishCutscene();
                      }}
                    >
                      <FastForward size={22} aria-hidden="true" />
                      <span>Skip Video on TV</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Family Turn Queue Strip */}
              <footer className="tab-queue-footer" aria-label="Turn order">
                <ol className="tab-queue-list">
                  {players.map((p, idx) => {
                    const active = idx === room.currentPlayerIndex;
                    return (
                      <li
                        key={p.id}
                        className={`tab-queue-chip ${active ? 'is-active' : ''}`}
                        style={
                          { '--chip-color': p.color } as React.CSSProperties
                        }
                        aria-current={active ? 'step' : undefined}
                      >
                        <div className="tab-queue-avatar">
                          {!failedImages[`tok-${p.id}`] ? (
                            <img
                              src={p.tokenUrl}
                              alt=""
                              onError={() =>
                                setFailedImages((prev) => ({
                                  ...prev,
                                  [`tok-${p.id}`]: true,
                                }))
                              }
                            />
                          ) : (
                            <span aria-hidden="true">{p.name[0]}</span>
                          )}
                        </div>
                        <span className="tab-queue-name">{p.name}</span>
                      </li>
                    );
                  })}
                </ol>
              </footer>
            </section>
          )
        )}
      </main>

      {/* ================================================================= */}
      {/* FULL-SCREEN INTERACTIVE TOUCH MINI-GAME HOST                      */}
      {/* ================================================================= */}
      {room.phase === 'minigame' && room.miniGame && (
        <MiniGameHost
          session={room.miniGame}
          onScoreChange={actions.submitMiniGameScore}
          onComplete={(won, finalScore) =>
            void actions.finishMiniGame(won, finalScore)
          }
          modal={true}
        />
      )}

      {/* ================================================================= */}
      {/* INTERACTIVE PARENT ACTION CARD OVERLAY                            */}
      {/* ================================================================= */}
      {room.phase === 'action-card' && room.actionCard && (
        <ActionCardOverlay
          session={room.actionCard}
          mode="tablet"
          onResolve={(completed) => void actions.completeActionCard(completed)}
        />
      )}

      {/* ================================================================= */}
      {/* NATIVE MODAL <dialog>: LEAVE ROOM CONFIRMATION                    */}
      {/* ================================================================= */}
      <dialog
        ref={leaveDialogRef}
        className="tab-modal-dialog"
        aria-labelledby={leaveTitleId}
      >
        <div className="tab-modal-shell">
          <h1 id={leaveTitleId} className="tab-modal-title">
            Leave Room {room.roomCode}?
          </h1>
          <p className="tab-modal-desc">
            The TV game will stay safe — you can rejoin anytime with code{' '}
            <strong>{room.roomCode}</strong>.
          </p>
          <div className="tab-modal-actions">
            <button
              type="button"
              className="tab-modal-btn is-danger"
              onClick={() => handleLeaveAction('leave')}
            >
              Leave Room
            </button>
            <button
              type="button"
              className="tab-modal-btn is-safe"
              autoFocus
              onClick={() => handleLeaveAction('stay')}
            >
              Stay in Game
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
};

export default TabletControllerView;
