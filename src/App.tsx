import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Home,
  Maximize2,
  Minimize2,
  Music,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  Card,
  DEFAULT_GAME_SETTINGS,
  GameRoomState,
  GameSettings,
  PlayerState,
  TILE_COLOR_META,
  ViewMode,
} from './types/game';
import {
  BOARD_IMAGE_URL,
  BOARD_SHORTCUTS,
  BOARD_TILES,
  LAST_TILE_INDEX,
} from './data/boardData';
import { CHARACTERS } from './data/characters';
import { ALL_ACTION_CARDS } from './data/actionCards';
import { getCutsceneVideoUrl } from './data/videoManifest';
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
  createPlayersFromCharacters,
  EngineContext,
  startGameState,
} from './engine/rules';
import {
  isValidRoomCode,
  sanitizeRoomCode,
  setDefaultEngineContext,
} from './services/firebaseSync';
import { isFirebaseConfigured } from './firebaseConfig';
import { soundEngine } from './audio/soundEngine';
import { BoardView } from './components/BoardView';
import { LandingScreen } from './components/LandingScreen';
import { CharacterSelect } from './components/CharacterSelect';
import { MiniGameHost } from './components/minigames/MiniGameHost';
import { MiniGameTvOverlay } from './components/minigames/MiniGameTvOverlay';
import { ActionCardOverlay } from './components/ActionCardOverlay';
import { CelebrationEffects } from './components/CelebrationEffects';
import { TvHostView } from './components/TvHostView';
import { TabletControllerView } from './components/TabletControllerView';
import { useFullscreen } from './utils/fullscreen';
import { useToddlerTap } from './utils/toddlerTap';
import './App.css';

const ENGINE_CONTEXT: EngineContext = {
  tiles: BOARD_TILES,
  shortcuts: BOARD_SHORTCUTS,
  actionCards: ALL_ACTION_CARDS,
  getVideoUrl: (type, playerId) => getCutsceneVideoUrl(type, playerId),
};

// Register full 71-tile board, shortcuts, action cards & cutscenes globally for Firebase Sync
setDefaultEngineContext(ENGINE_CONTEXT);

interface InitialRoute {
  mode: ViewMode;
  roomCode?: string;
}

function readInitialRoute(): InitialRoute {
  if (typeof window === 'undefined') {
    return { mode: 'landing' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawRoom = params.get('room');
  if (rawRoom) {
    const clean = sanitizeRoomCode(rawRoom);
    if (isValidRoomCode(clean)) {
      return { mode: 'tablet', roomCode: clean };
    }
  }

  const rawMode = params.get('mode')?.toLowerCase();
  if (rawMode === 'tv' || rawMode === 'tablet' || rawMode === 'mirror') {
    return { mode: rawMode };
  }

  return { mode: 'landing' };
}

function DrawnCardVisual({ card }: { card: Card }) {
  const colorMeta = card.color ? TILE_COLOR_META[card.color] : null;
  return (
    <div className="mirror-card-reveal-backdrop" role="status" aria-live="polite">
      <div className="mirror-drawn-card">
        {colorMeta ? (
          <div className="drawn-card-swatches" aria-hidden="true">
            <span
              className="drawn-card-swatch"
              style={{ backgroundColor: colorMeta.hex }}
            />
            {card.type === 'double' && (
              <span
                className="drawn-card-swatch"
                style={{ backgroundColor: colorMeta.hex }}
              />
            )}
          </div>
        ) : (
          <div className="drawn-card-emoji-badge" aria-hidden="true">
            {card.emoji ?? '🍬'}
          </div>
        )}

        <div className="drawn-card-label">{card.label}</div>
        {card.subtitle && <p className="drawn-card-subtitle">{card.subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Waits for at least `minMs`, yields briefly so sibling effects can queue voice clips,
 * waits for any active narrator voiceover to finish (capped at `maxVoiceWaitMs`),
 * and pauses for a calm `postVoiceBreathMs` before proceeding.
 */
async function waitCalmly(
  minMs: number,
  postVoiceBreathMs: number,
  isCancelled: () => boolean,
  maxVoiceWaitMs = 5500
): Promise<boolean> {
  const minDelay =
    minMs > 0
      ? new Promise<void>((resolve) => {
          window.setTimeout(resolve, minMs);
        })
      : Promise.resolve();

  // Yield briefly so the sibling voice-trigger effect queues the voice clip first
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 60);
  });
  if (isCancelled()) return false;

  await Promise.all([minDelay, soundEngine.waitForVoiceToFinish(maxVoiceWaitMs)]);
  if (isCancelled()) return false;

  if (postVoiceBreathMs > 0) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, postVoiceBreathMs);
    });
  }
  return !isCancelled();
}

interface MirrorModeProps {
  onExit: () => void;
}

const MirrorMode: React.FC<MirrorModeProps> = ({ onExit }) => {
  const defaultPlayers = useMemo(
    () => createPlayersFromCharacters(CHARACTERS.slice(0, 4)),
    []
  );

  const [room, setRoom] = useState<GameRoomState>(() =>
    createInitialRoomState('LOCAL', defaultPlayers, DEFAULT_GAME_SETTINGS)
  );

  const [audioState, setAudioState] = useState(() => soundEngine.getState());
  const {
    isSupported: canFullscreen,
    isFullscreen,
    toggleFullscreen,
  } = useFullscreen();
  const victoryDialogRef = useRef<HTMLDialogElement | null>(null);
  const victoryTitleId = useId();
  const lastSpokenEventRef = useRef<string | null>(null);

  // Configure Mirror audio mode (full BGM + narrator voiceovers + SFX)
  useEffect(() => {
    soundEngine.setAudioMode('mirror');
    const unsub = soundEngine.subscribe(setAudioState);
    return () => {
      unsub();
      soundEngine.setCutsceneDucking(false);
      soundEngine.stopVoice();
      soundEngine.stopBgm();
    };
  }, []);

  // Duck BGM smoothly and silence lingering narration during full-screen HD video cutscenes
  useEffect(() => {
    const isCutscene = room.phase === 'cutscene';
    soundEngine.setCutsceneDucking(isCutscene);
    if (isCutscene && room.cutscene?.videoUrl) {
      soundEngine.stopVoice();
    }
  }, [room.phase, room.cutscene?.videoUrl]);

  // Trigger ElevenLabs narrator voiceovers & event SFX once per unique state event
  useEffect(() => {
    if (!room.lastEventId || lastSpokenEventRef.current === room.lastEventId) {
      return;
    }
    lastSpokenEventRef.current = room.lastEventId;

    const isVideoCutscene = room.phase === 'cutscene' && Boolean(room.cutscene?.videoUrl);

    if (room.phase === 'card-drawn' && room.currentCard) {
      soundEngine.playCardReveal(
        room.currentCard.type === 'double' || room.currentCard.type === 'landmark'
      );
    } else if (room.phase === 'minigame') {
      soundEngine.playStarChime();
    } else if (room.phase === 'victory') {
      soundEngine.playVictoryFanfare();
    } else if (room.cutscene?.type === 'licorice-stuck' && !isVideoCutscene) {
      soundEngine.playLicoriceSquish();
    }

    if (room.lastVoiceKey && !isVideoCutscene) {
      void soundEngine.playVoiceIfValid(room.lastVoiceKey, { interrupt: true });
    }
  }, [room.lastEventId, room.lastVoiceKey, room.phase, room.currentCard, room.cutscene]);

  // Calm voice-aware transition from 'card-drawn' reveal popup -> movement / action card
  const drawnCardType = room.currentCard?.type ?? null;
  useEffect(() => {
    if (room.phase !== 'card-drawn') return;
    let cancelled = false;
    const isSpecialCard =
      drawnCardType === 'landmark' ||
      drawnCardType === 'action' ||
      drawnCardType === 'licorice';
    void (async () => {
      const ok = await waitCalmly(
        isSpecialCard ? 2600 : 2200,
        350,
        () => cancelled,
        5500
      );
      if (!ok) return;
      setRoom((prev) => applyResolveDrawnCard(prev, ENGINE_CONTEXT));
    })();
    return () => {
      cancelled = true;
    };
  }, [room.phase, room.lastEventId, drawnCardType]);

  // Manage native Victory <dialog>
  useEffect(() => {
    const dialog = victoryDialogRef.current;
    if (!dialog) return;
    if (room.phase === 'victory') {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          // Ignore if already open
        }
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [room.phase]);

  const handlePlayersChange = useCallback((players: PlayerState[]) => {
    setRoom((prev) => ({ ...prev, players, updatedAt: Date.now() }));
  }, []);

  const handleSettingsChange = useCallback((settings: GameSettings) => {
    setRoom((prev) => ({ ...prev, settings, updatedAt: Date.now() }));
  }, []);

  const handleStartGame = useCallback(() => {
    void soundEngine.unlock().then(() => soundEngine.startBgm());
    setRoom((prev) => startGameState(prev));
  }, []);

  const handleDrawCard = useCallback(() => {
    void soundEngine.unlock().then(() => soundEngine.startBgm());
    soundEngine.playCardFlip();
    setRoom((prev) => applyDrawCard(prev));
  }, []);

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
    setRoom((prev) => applyMoveComplete(prev, ENGINE_CONTEXT));
  }, []);

  const handleCutsceneComplete = useCallback(() => {
    setRoom((prev) => applyCutsceneComplete(prev));
  }, []);

  const handleMiniGameScore = useCallback((score: number, progress: number) => {
    setRoom((prev) => applyMiniGameScore(prev, score, progress));
  }, []);

  const handleMiniGameComplete = useCallback((won: boolean, finalScore: number) => {
    setRoom((prev) => applyMiniGameComplete(prev, won, finalScore, ENGINE_CONTEXT));
  }, []);

  const handleActionCardResolve = useCallback((completed: boolean) => {
    setRoom((prev) => applyActionCardComplete(prev, completed, ENGINE_CONTEXT));
  }, []);

  const handlePlayAgain = useCallback(() => {
    soundEngine.playStarChime();
    setRoom((prev) => applyPlayAgain(prev));
  }, []);

  const handleReturnToLobby = useCallback(() => {
    soundEngine.stopVoice();
    soundEngine.playButtonTap();
    setRoom((prev) => ({
      ...prev,
      phase: 'lobby',
      winnerId: null,
      movement: null,
      miniGame: null,
      actionCard: null,
      cutscene: null,
      currentCard: null,
      lastVoiceKey: null,
      updatedAt: Date.now(),
    }));
  }, []);

  const currentPlayer = room.players[room.currentPlayerIndex] ?? room.players[0];
  const isAiTurn = Boolean(currentPlayer?.isAi);
  const canDraw = room.phase === 'waiting-draw' && !isAiTurn;
  const drawTapProps = useToddlerTap(handleDrawCard, !canDraw);
  const playAgainTapProps = useToddlerTap(handlePlayAgain, room.phase !== 'victory');

  const miniGamePlayer = room.miniGame
    ? room.players.find((p) => p.id === room.miniGame?.playerId)
    : null;
  const isAiMiniGame = Boolean(miniGamePlayer?.isAi);

  const actionCardPlayer = room.actionCard
    ? room.players.find((p) => p.id === room.actionCard?.playerId)
    : null;
  const isAiActionCard = Boolean(actionCardPlayer?.isAi);

  // Gnome AI auto-draw on waiting-draw (calm voice-aware turn intro)
  useEffect(() => {
    if (room.phase !== 'waiting-draw' || !isAiTurn) return;
    let cancelled = false;
    void (async () => {
      const ok = await waitCalmly(1800, 500, () => cancelled, 5500);
      if (!ok) return;
      handleDrawCard();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    room.phase,
    room.turnNumber,
    room.currentPlayerIndex,
    room.lastEventId,
    isAiTurn,
    handleDrawCard,
  ]);

  // Gnome AI automated mini-game simulation (calm warm-up, 620ms ticks, 1300ms celebration beat)
  const activeMiniGameId = room.miniGame?.id ?? null;
  const activeMiniGameTarget = room.miniGame?.targetScore ?? 6;
  useEffect(() => {
    if (room.phase !== 'minigame' || !activeMiniGameId || !isAiMiniGame) return;

    const targetScore = Math.max(1, activeMiniGameTarget);
    const willWin = Math.random() < 0.55;
    const shortBy = Math.min(targetScore - 1, 1 + Math.floor(Math.random() * 3));
    const finalScore = willWin ? targetScore : Math.max(1, targetScore - shortBy);

    const totalTicks = 7;
    let tick = 0;
    let currentScore = 0;
    let cancelled = false;
    let intervalId: number | null = null;
    const timers: number[] = [];

    void (async () => {
      const ok = await waitCalmly(1400, 400, () => cancelled, 5500);
      if (!ok) return;

      intervalId = window.setInterval(() => {
        if (cancelled) return;
        tick += 1;
        if (tick >= totalTicks) {
          if (intervalId !== null) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
          currentScore = finalScore;
          handleMiniGameScore(finalScore, Math.min(1, finalScore / targetScore));
          if (willWin) {
            soundEngine.playVictoryFanfare();
          } else {
            soundEngine.playStarChime();
          }
          const doneTimer = window.setTimeout(() => {
            if (!cancelled) {
              handleMiniGameComplete(willWin, finalScore);
            }
          }, 1300);
          timers.push(doneTimer);
          return;
        }

        const ideal = Math.round((finalScore * tick) / totalTicks);
        const jitter = Math.random() < 0.35 ? 1 : 0;
        currentScore = Math.max(currentScore, Math.min(finalScore, ideal + jitter));
        handleMiniGameScore(currentScore, Math.min(1, currentScore / targetScore));
        soundEngine.playGumdropCatch();
      }, 620);
    })();

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [
    room.phase,
    activeMiniGameId,
    activeMiniGameTarget,
    isAiMiniGame,
    handleMiniGameScore,
    handleMiniGameComplete,
  ]);

  // Gnome AI automated action-card resolution (voice finish + 3800ms calm reading time)
  const activeActionCardId = room.actionCard?.id ?? null;
  useEffect(() => {
    if (room.phase !== 'action-card' || !activeActionCardId || !isAiActionCard) return;
    let cancelled = false;
    const completed = Math.random() < 0.7;
    void (async () => {
      const ok = await waitCalmly(0, 3800, () => cancelled, 5000);
      if (!ok) return;
      handleActionCardResolve(completed);
    })();
    return () => {
      cancelled = true;
    };
  }, [room.phase, activeActionCardId, isAiActionCard, handleActionCardResolve]);

  if (room.phase === 'lobby') {
    return (
      <CharacterSelect
        characters={CHARACTERS}
        selectedPlayers={room.players}
        settings={room.settings}
        mode="mirror"
        onPlayersChange={handlePlayersChange}
        onSettingsChange={handleSettingsChange}
        onStartGame={handleStartGame}
        onBack={onExit}
      />
    );
  }

  const winner = room.winnerId
    ? room.players.find((p) => p.id === room.winnerId) ?? currentPlayer
    : null;

  const isStuck = Boolean(currentPlayer && currentPlayer.stuckTurns > 0);

  return (
    <div className="mirror-shell">
      <CelebrationEffects event={room.celebration} />

      {/* Top HUD Bar */}
      <header className="mirror-topbar">
        <div className="mirror-topbar-left">
          <button
            type="button"
            className="mirror-icon-btn"
            onClick={() => {
              soundEngine.playButtonTap();
              onExit();
            }}
            aria-label="Return to home screen"
          >
            <Home size={18} aria-hidden="true" />
            <span>Home</span>
          </button>

          <button
            type="button"
            className="mirror-icon-btn"
            onClick={handleReturnToLobby}
            aria-label="Change family players"
          >
            <Users size={18} aria-hidden="true" />
            <span>Players</span>
          </button>
        </div>

        {/* Centralized Polite Live Region Banner */}
        <div className="mirror-banner-live" role="status" aria-live="polite">
          {room.lastEventBanner ?? `It's ${currentPlayer?.name ?? 'your'}'s turn!`}
        </div>

        <div className="mirror-topbar-right">
          <div className="mirror-turn-strip" aria-label="Player turn order">
            {room.players.map((p, idx) => (
              <div
                key={p.id}
                className={`mirror-mini-token ${
                  idx === room.currentPlayerIndex ? 'is-current' : ''
                }`}
                style={{ '--player-color': p.color } as React.CSSProperties}
                title={`${p.name} (Space ${p.tileIndex})`}
              >
                <img src={p.tokenUrl} alt={p.name} />
              </div>
            ))}
          </div>

          <button
            type="button"
            className={`mirror-icon-btn ${audioState.bgmMuted ? 'is-muted' : ''}`}
            onClick={() => {
              void soundEngine.unlock();
              soundEngine.toggleBgmMute();
            }}
            aria-label={audioState.bgmMuted ? 'Turn music on' : 'Turn music off'}
            aria-pressed={!audioState.bgmMuted}
          >
            <Music size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`mirror-icon-btn ${audioState.muted ? 'is-muted' : ''}`}
            onClick={() => {
              void soundEngine.unlock();
              soundEngine.toggleMute();
            }}
            aria-label={audioState.muted ? 'Unmute game audio' : 'Mute game audio'}
            aria-pressed={!audioState.muted}
          >
            {audioState.muted ? (
              <VolumeX size={18} aria-hidden="true" />
            ) : (
              <Volume2 size={18} aria-hidden="true" />
            )}
          </button>

          {canFullscreen && (
            <button
              type="button"
              className="mirror-icon-btn"
              onClick={() => {
                soundEngine.playButtonTap();
                toggleFullscreen();
              }}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={18} aria-hidden="true" />
              ) : (
                <Maximize2 size={18} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main 16:9 Animated Board Stage */}
      <main className="mirror-board-area">
        <BoardView
          tiles={BOARD_TILES}
          shortcuts={BOARD_SHORTCUTS}
          boardImageUrl={BOARD_IMAGE_URL}
          players={room.players}
          activePlayerId={currentPlayer?.id ?? null}
          movement={room.movement}
          cutscene={room.cutscene}
          activityLog={room.activityLog}
          onHopStep={handleHopStep}
          onMovementComplete={handleMovementComplete}
          onCutsceneComplete={handleCutsceneComplete}
        />

        {room.phase === 'card-drawn' && room.currentCard && (
          <DrawnCardVisual card={room.currentCard} />
        )}
      </main>

      {/* Bottom Compact Tactile Kid Controller Dock */}
      {currentPlayer && (
        <footer
          className="mirror-control-dock"
          style={
            { '--active-player-color': currentPlayer.color } as React.CSSProperties
          }
        >
          <div className="mirror-player-info">
            <div className="mirror-player-portrait">
              <img
                src={currentPlayer.portraitUrl}
                alt={currentPlayer.name}
              />
            </div>
            <div className="mirror-player-copy">
              <span className="mirror-turn-label">
                {currentPlayer.name.toUpperCase()}&apos;S TURN!
              </span>
              <span className="mirror-space-meta">
                Space {currentPlayer.tileIndex} of {LAST_TILE_INDEX}
                {isStuck ? ' • Stuck in Licorice Lagoon!' : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`mirror-draw-btn ${isStuck ? 'is-stuck-btn' : ''}`}
            disabled={!canDraw}
            {...drawTapProps}
          >
            {isAiTurn ? (
              <span>🧙‍♂️ {currentPlayer.name} is taking his turn! ✨</span>
            ) : canDraw ? (
              isStuck ? (
                <>
                  <Sparkles size={28} aria-hidden="true" />
                  <span>WIGGLE FREE!</span>
                </>
              ) : (
                <>
                  <Play size={28} fill="currentColor" aria-hidden="true" />
                  <span>TAP TO DRAW CARD!</span>
                </>
              )
            ) : room.phase === 'moving' ? (
              <span>{currentPlayer.name} is hopping! ✨</span>
            ) : room.phase === 'card-drawn' ? (
              <span>{room.currentCard?.label ?? 'Card Drawn!'}</span>
            ) : (
              <span>Get Ready...</span>
            )}
          </button>
        </footer>
      )}

      {/* Touch Mini-Game Modal (or Automated AI Spectator Overlay for Gnome) */}
      {room.phase === 'minigame' &&
        room.miniGame &&
        (isAiMiniGame ? (
          <MiniGameTvOverlay session={room.miniGame} isAiPlayer />
        ) : (
          <MiniGameHost
            session={room.miniGame}
            onScoreChange={handleMiniGameScore}
            onComplete={handleMiniGameComplete}
            modal
          />
        ))}

      {/* Interactive Silly Family Action Card Modal (or Spectator Overlay for Gnome) */}
      {room.phase === 'action-card' && room.actionCard && (
        <ActionCardOverlay
          session={room.actionCard}
          mode={isAiActionCard ? 'tv' : 'mirror'}
          isAiPlayer={isAiActionCard}
          onResolve={isAiActionCard ? undefined : handleActionCardResolve}
        />
      )}

      {/* Native <dialog> Candy Castle Victory Celebration */}
      <dialog
        ref={victoryDialogRef}
        className="victory-dialog"
        aria-labelledby={victoryTitleId}
        {...({ closedby: 'none' } as Record<string, string>)}
        onCancel={(event) => event.preventDefault()}
      >
        {winner && (
          <div className="victory-dialog-body">
            <div className="victory-crown-badge">
              <Trophy size={22} aria-hidden="true" />
              <span>CANDY CASTLE CHAMPION!</span>
            </div>

            <img
              src={winner.portraitUrl}
              alt={winner.name}
              className="victory-portrait"
            />

            <h1 id={victoryTitleId} className="victory-title">
              Hooray, {winner.name} Won!! 🎉
            </h1>
            <p className="victory-subtitle">
              What a sweet Candyland family adventure!
            </p>

            <div className="victory-stats">
              <span className="victory-stat-pill">
                ⭐ {winner.miniGamesWon} Mini-Game{winner.miniGamesWon === 1 ? '' : 's'} Won
              </span>
              <span className="victory-stat-pill">
                🎭 {winner.actionCardsCompleted} Action Card
                {winner.actionCardsCompleted === 1 ? '' : 's'} Completed
              </span>
            </div>

            <div className="victory-actions">
              <button
                type="button"
                className="victory-btn victory-btn-primary"
                autoFocus
                {...playAgainTapProps}
              >
                <RotateCcw size={22} aria-hidden="true" />
                <span>Play Again!</span>
              </button>
              <button
                type="button"
                className="victory-btn victory-btn-secondary"
                onClick={handleReturnToLobby}
              >
                <Users size={22} aria-hidden="true" />
                <span>Pick New Players</span>
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
};

export function App() {
  const initialRoute = useMemo(() => readInitialRoute(), []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialRoute.mode);
  const [initialRoomCode, setInitialRoomCode] = useState<string | undefined>(
    initialRoute.roomCode
  );

  // Update SPA document title on view transitions (accessibility 2.4.2)
  useEffect(() => {
    const titles: Record<ViewMode, string> = {
      landing: 'Candyland Family Adventure',
      tv: 'TV Host Board | Candyland Family Adventure',
      tablet: 'Tablet Controller | Candyland Family Adventure',
      mirror: 'Play Together | Candyland Family Adventure',
    };
    document.title = titles[viewMode];
  }, [viewMode]);

  const handleExitToLanding = useCallback(() => {
    soundEngine.stopVoice();
    soundEngine.stopBgm();
    setInitialRoomCode(undefined);
    setViewMode('landing');
    if (typeof window !== 'undefined' && window.location.search) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  const handleSelectMode = useCallback((mode: Exclude<ViewMode, 'landing'>) => {
    void soundEngine.unlock();
    soundEngine.playButtonTap();
    setViewMode(mode);
  }, []);

  return (
    <div className="app-shell">
      {viewMode === 'landing' && (
        <LandingScreen
          onSelectMode={handleSelectMode}
          isFirebaseConfigured={isFirebaseConfigured}
        />
      )}

      {viewMode === 'tv' && (
        <TvHostView
          initialRoomCode={initialRoomCode}
          onExit={handleExitToLanding}
        />
      )}

      {viewMode === 'tablet' && (
        <TabletControllerView
          initialRoomCode={initialRoomCode}
          onExit={handleExitToLanding}
        />
      )}

      {viewMode === 'mirror' && <MirrorMode onExit={handleExitToLanding} />}
    </div>
  );
}

export default App;
