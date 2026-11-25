import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { FastForward, Sparkles, Volume2, VolumeX } from 'lucide-react';
import {
  BoardCoord,
  BoardShortcut,
  BoardTile,
  CharacterId,
  CutsceneSession,
  MovementState,
  PlayerState,
} from '../types/game';
import {
  BOARD_IMAGE_URL,
  BOARD_SHORTCUTS,
  BOARD_TILES,
  START_COORD,
} from '../data/boardData';
import './BoardView.css';

export interface BoardViewProps {
  /** Board tiles (normalized 0..1 coordinates). Falls back to a built-in winding path if omitted. */
  tiles?: readonly BoardTile[];
  /** Shortcut bridges with waypoints. */
  shortcuts?: readonly BoardShortcut[];
  /** Path to the 16:9 board illustration. Defaults to '/images/board.png'. */
  boardImageUrl?: string;
  /** All players currently in the game. */
  players: readonly PlayerState[];
  /** ID of the player whose turn it currently is. */
  activePlayerId: CharacterId | null;
  /** Active hop-by-hop movement animation. */
  movement: MovementState | null;
  /** Active full-screen cutscene session. */
  cutscene: CutsceneSession | null;
  /** Fired on each hop step so host can trigger soundEngine.playHop / playShortcutWhoosh. */
  onHopStep?: (stepIndex: number, tileIndex: number, isShortcutGlide: boolean) => void;
  /** Fired once when the active movement finishes all hops + shortcut glide. */
  onMovementComplete?: (movementStartedAt: number) => void;
  /** Fired when the active cutscene ends or is skipped. */
  onCutsceneComplete?: (cutsceneId: string) => void;
  /** Optional className for outer stage wrapper. */
  className?: string;
}

const DEFAULT_BOARD_TILES: readonly BoardTile[] = BOARD_TILES;
const START_PAD_COORD: BoardCoord = START_COORD;

/**
 * Well-spaced bottom-left start pad slots around START_COORD so 2..8 starting
 * family members remain completely visible with zero face overlap or edge clipping.
 */
const START_PARADE_SLOTS: readonly BoardCoord[] = [
  { x: 0.042, y: 0.944 },
  { x: 0.088, y: 0.948 },
  { x: 0.134, y: 0.948 },
  { x: 0.040, y: 0.864 },
  { x: 0.180, y: 0.948 },
  { x: 0.040, y: 0.784 },
  { x: 0.226, y: 0.948 },
  { x: 0.272, y: 0.948 },
] as const;

/**
 * Computes a clean circular cluster offset so 2..8 tokens on the same tile
 * remain clearly distinguishable without overlapping faces.
 */
function getClusterOffset(slotIndex: number, totalOnTile: number): BoardCoord {
  if (totalOnTile <= 1) return { x: 0, y: 0 };
  if (totalOnTile === 2) {
    const sign = slotIndex === 0 ? -1 : 1;
    return { x: sign * 0.019, y: sign * -0.01 };
  }
  const radiusX = totalOnTile <= 4 ? 0.025 : 0.032;
  const radiusY = radiusX * (16 / 9) * 0.74;
  const angle = (slotIndex / totalOnTile) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * radiusX,
    y: Math.sin(angle) * radiusY,
  };
}

/**
 * Sample a smooth point along a polyline of waypoints for t in [0, 1].
 */
function sampleWaypoints(waypoints: readonly BoardCoord[], t: number): BoardCoord {
  if (waypoints.length === 0) return START_PAD_COORD;
  if (waypoints.length === 1) return waypoints[0];

  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (waypoints.length - 1);
  const segIndex = Math.min(Math.floor(scaled), waypoints.length - 2);
  const localT = scaled - segIndex;

  // Smoothstep ease within segment
  const eased = localT * localT * (3 - 2 * localT);
  const a = waypoints[segIndex];
  const b = waypoints[segIndex + 1];
  return {
    x: a.x + (b.x - a.x) * eased,
    y: a.y + (b.y - a.y) * eased,
  };
}

/**
 * Build a smooth SVG quadratic path string from normalized waypoints in a 1600x900 viewBox.
 */
function buildSvgPath(waypoints: readonly BoardCoord[]): string {
  if (waypoints.length < 2) return '';
  const pts = waypoints.map((p) => ({ x: p.x * 1600, y: p.y * 900 }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(1);
    const midY = ((prev.y + curr.y) / 2).toFixed(1);
    if (i === 1) {
      d += ` L ${midX} ${midY}`;
    } else {
      d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${midX} ${midY}`;
    }
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Probe whether the browser truly supports discrete `display` + `overlay` top-layer exit transitions.
 * Follows modern-web-guidance `animate-to-from-top-layer` fallback strategy.
 */
let cachedDisplayTransitionSupport: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) {
    return cachedDisplayTransitionSupport;
  }
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedDisplayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedDisplayTransitionSupport;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.CSS?.supports?.('overlay', 'auto')) &&
    canTransitionDisplay()
  );
}

async function closeTopLayerDialog(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise<void>((resolve) => setTimeout(resolve, 450)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  if (dialog.open) {
    dialog.close();
  }
}

export const BoardView: React.FC<BoardViewProps> = ({
  tiles = DEFAULT_BOARD_TILES,
  shortcuts = BOARD_SHORTCUTS,
  boardImageUrl = BOARD_IMAGE_URL,
  players,
  activePlayerId,
  movement,
  cutscene,
  onHopStep,
  onMovementComplete,
  onCutsceneComplete,
  className = '',
}) => {
  const effectiveTiles = tiles && tiles.length > 0 ? tiles : DEFAULT_BOARD_TILES;
  const tileMap = useMemo(() => {
    const map = new Map<number, BoardTile>();
    for (const tile of effectiveTiles) {
      map.set(tile.index, tile);
    }
    return map;
  }, [effectiveTiles]);

  const startCoord = useMemo<BoardCoord>(() => {
    if (effectiveTiles === DEFAULT_BOARD_TILES) return START_PAD_COORD;
    const first = effectiveTiles[0];
    if (!first) return START_PAD_COORD;
    // Place start pad slightly before tile 1 for custom tile arrays
    const second = effectiveTiles[1];
    if (second) {
      const dx = first.x - second.x;
      const dy = first.y - second.y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: Math.max(0.04, Math.min(0.96, first.x + (dx / len) * 0.045)),
        y: Math.max(0.05, Math.min(0.95, first.y + (dy / len) * 0.045)),
      };
    }
    return {
      x: Math.max(0.04, first.x - 0.045),
      y: Math.min(0.94, first.y + 0.025),
    };
  }, [effectiveTiles]);

  const getCoordForTile = useCallback(
    (tileIndex: number): BoardCoord => {
      if (tileIndex <= 0) return startCoord;
      const tile = tileMap.get(tileIndex);
      if (tile) return { x: tile.x, y: tile.y };
      const last = effectiveTiles[effectiveTiles.length - 1];
      return last ? { x: last.x, y: last.y } : startCoord;
    },
    [effectiveTiles, startCoord, tileMap]
  );

  // Track board image load error so fallback art looks crisp
  const [boardImgFailed, setBoardImgFailed] = useState(false);
  const [failedTokens, setFailedTokens] = useState<Record<string, boolean>>({});

  // Live animated override for the currently hopping/gliding player
  const [animPlayerId, setAnimPlayerId] = useState<CharacterId | null>(null);
  const [animCoord, setAnimCoord] = useState<BoardCoord | null>(null);
  const [animHopTick, setAnimHopTick] = useState(0);
  const [isShortcutGliding, setIsShortcutGliding] = useState(false);

  const completedMovementRef = useRef<number | null>(null);
  const onHopStepRef = useRef(onHopStep);
  const onMovementCompleteRef = useRef(onMovementComplete);
  onHopStepRef.current = onHopStep;
  onMovementCompleteRef.current = onMovementComplete;

  // Execute smooth hop-by-hop + curved shortcut glide animation whenever `movement` changes
  useEffect(() => {
    if (!movement) {
      setAnimPlayerId(null);
      setAnimCoord(null);
      setIsShortcutGliding(false);
      return;
    }

    const moveKey = movement.startedAt;
    if (completedMovementRef.current === moveKey) {
      return;
    }

    let cancelled = false;
    const timeouts: number[] = [];
    let rafId = 0;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const finishMove = () => {
      if (cancelled) return;
      completedMovementRef.current = moveKey;
      setIsShortcutGliding(false);
      setAnimCoord(getCoordForTile(movement.toTile));
      onMovementCompleteRef.current?.(moveKey);
    };

    const fullPath = movement.path.length > 0 ? movement.path : [movement.toTile];

    // Reduced-motion fast path: jump directly to destination
    if (prefersReducedMotion) {
      setAnimPlayerId(movement.playerId);
      setAnimCoord(getCoordForTile(movement.toTile));
      const t = window.setTimeout(finishMove, 220);
      timeouts.push(t);
      return () => {
        cancelled = true;
        timeouts.forEach((id) => window.clearTimeout(id));
      };
    }

    setAnimPlayerId(movement.playerId);
    setAnimCoord(getCoordForTile(movement.fromTile));

    const hasShortcutGlide =
      Boolean(movement.shortcutUsed) && movement.shortcutWaypoints.length >= 2;
    const normalSteps = hasShortcutGlide ? fullPath.slice(0, -1) : fullPath;
    const stepDurationMs = normalSteps.length > 8 ? 240 : 320;

    let stepIdx = 0;

    const runShortcutGlide = () => {
      if (cancelled) return;
      setIsShortcutGliding(true);
      onHopStepRef.current?.(normalSteps.length, movement.toTile, true);

      const startTime = performance.now();
      const glideDuration = 950;
      const waypoints = movement.shortcutWaypoints;

      const tick = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startTime) / glideDuration);
        setAnimCoord(sampleWaypoints(waypoints, progress));
        if (progress < 1) {
          rafId = window.requestAnimationFrame(tick);
        } else {
          const settle = window.setTimeout(finishMove, 260);
          timeouts.push(settle);
        }
      };

      rafId = window.requestAnimationFrame(tick);
    };

    const runNextHop = () => {
      if (cancelled) return;
      if (stepIdx >= normalSteps.length) {
        if (hasShortcutGlide) {
          const pauseBeforeGlide = window.setTimeout(runShortcutGlide, 240);
          timeouts.push(pauseBeforeGlide);
        } else {
          const settle = window.setTimeout(finishMove, 260);
          timeouts.push(settle);
        }
        return;
      }

      const targetTileIndex = normalSteps[stepIdx];
      const nextCoord = getCoordForTile(targetTileIndex);
      setAnimCoord(nextCoord);
      setAnimHopTick((v) => v + 1);
      onHopStepRef.current?.(stepIdx, targetTileIndex, false);
      stepIdx += 1;

      const timer = window.setTimeout(runNextHop, stepDurationMs);
      timeouts.push(timer);
    };

    const kickOff = window.setTimeout(runNextHop, 160);
    timeouts.push(kickOff);

    return () => {
      cancelled = true;
      timeouts.forEach((id) => window.clearTimeout(id));
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [movement, getCoordForTile]);

  // Native <dialog> cutscene controller
  const cutsceneDialogRef = useRef<HTMLDialogElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cutsceneTitleId = useId();
  const [videoFailed, setVideoFailed] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [autoplayBlockedNotice, setAutoplayBlockedNotice] = useState(false);
  const completedCutsceneRef = useRef<string | null>(null);
  const onCutsceneCompleteRef = useRef(onCutsceneComplete);
  onCutsceneCompleteRef.current = onCutsceneComplete;

  const dismissCutscene = useCallback(
    async (session: CutsceneSession | null) => {
      const dialog = cutsceneDialogRef.current;
      if (dialog && dialog.open) {
        await closeTopLayerDialog(dialog);
      }
      if (session && completedCutsceneRef.current !== session.id) {
        completedCutsceneRef.current = session.id;
        onCutsceneCompleteRef.current?.(session.id);
      }
    },
    []
  );

  useEffect(() => {
    const dialog = cutsceneDialogRef.current;
    if (!dialog) return;

    if (cutscene) {
      setVideoFailed(false);
      setAutoplayBlockedNotice(false);
      setIsVideoMuted(false);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      void closeTopLayerDialog(dialog);
    }
  }, [cutscene]);

  // Intercept native cancel (Esc / back) so top-layer exit animates smoothly
  useEffect(() => {
    const dialog = cutsceneDialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      void dismissCutscene(cutscene);
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [cutscene, dismissCutscene]);

  // Attempt unmuted playback; fall back cleanly to muted playback if browser blocks autoplay
  useEffect(() => {
    if (!cutscene) return;
    if (!cutscene.videoUrl || videoFailed) {
      // Auto-advance storybook cutscene fallback after 3.8s
      const timer = window.setTimeout(() => {
        void dismissCutscene(cutscene);
      }, 3800);
      return () => window.clearTimeout(timer);
    }

    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.muted = false;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay with sound was blocked (common on TV Bro before user tap)
        video.muted = true;
        setIsVideoMuted(true);
        setAutoplayBlockedNotice(true);
        video.play().catch(() => {
          setVideoFailed(true);
        });
      });
    }

    // Safety cap: never hang longer than 14 seconds on a stalled video
    const safetyTimer = window.setTimeout(() => {
      void dismissCutscene(cutscene);
    }, 14000);

    return () => window.clearTimeout(safetyTimer);
  }, [cutscene, videoFailed, dismissCutscene]);

  const handleToggleCutsceneMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsVideoMuted(nextMuted);
    if (!nextMuted) {
      setAutoplayBlockedNotice(false);
    }
  };

  // Group non-moving players by tileIndex to compute clean cluster offsets
  const tileClusters = useMemo(() => {
    const groups = new Map<number, CharacterId[]>();
    for (const player of players) {
      const list = groups.get(player.tileIndex) ?? [];
      list.push(player.id);
      groups.set(player.tileIndex, list);
    }
    return groups;
  }, [players]);

  const starTiles = useMemo(
    () => effectiveTiles.filter((t) => t.isStarMiniGame),
    [effectiveTiles]
  );

  const licoriceTiles = useMemo(
    () => effectiveTiles.filter((t) => t.isLicoriceTrap),
    [effectiveTiles]
  );

  const destinationTileCoord = useMemo(() => {
    if (!movement) return null;
    return getCoordForTile(movement.toTile);
  }, [movement, getCoordForTile]);

  return (
    <div className={`board-viewport ${className}`.trim()}>
      <div
        className="board-stage"
        role="region"
        aria-label="Candyland game board"
      >
        {/* High-res 16:9 Storybook Board Artwork */}
        {!boardImgFailed ? (
          <img
            src={boardImageUrl}
            alt="Candyland magical game board winding from Cupcake Commons through Lollipop Woods and Chocolate Mountain to Candy Castle"
            className="board-artwork"
            draggable={false}
            onError={() => setBoardImgFailed(true)}
          />
        ) : (
          <div className="board-artwork-fallback" aria-hidden="true">
            <svg className="board-fallback-svg" viewBox="0 0 1600 900">
              {effectiveTiles.map((tile) => (
                <circle
                  key={tile.index}
                  cx={tile.x * 1600}
                  cy={tile.y * 900}
                  r={18}
                  fill={tile.color === 'rainbow' ? '#ffbf2e' : `var(--candy-${tile.color})`}
                  stroke="#ffffff"
                  strokeWidth={4}
                />
              ))}
            </svg>
          </div>
        )}

        {/* Interactive Overlay Layer: Shortcuts, Star Mini-Games, Licorice Traps, Target Beacon */}
        <svg
          className="board-svg-overlay"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Shortcut Bridges */}
          {shortcuts.map((shortcut) => {
            const isActiveShortcut = movement?.shortcutUsed === shortcut.id;
            const d = buildSvgPath(shortcut.waypoints);
            if (!d) return null;
            return (
              <g
                key={shortcut.id}
                className={`board-shortcut-group ${isActiveShortcut ? 'is-active' : ''}`}
              >
                <path d={d} className="board-shortcut-glow" />
                <path d={d} className="board-shortcut-dash" />
              </g>
            );
          })}

          {/* Pulsing Star Mini-Game Rings */}
          {starTiles.map((tile) => (
            <g
              key={`star-${tile.index}`}
              transform={`translate(${(tile.x * 1600).toFixed(1)}, ${(tile.y * 900).toFixed(1)})`}
              className="board-star-marker"
            >
              <circle r="26" className="board-star-pulse" />
              <circle r="19" className="board-star-ring" />
              <text
                x="0"
                y="7"
                textAnchor="middle"
                className="board-star-glyph"
              >
                ★
              </text>
            </g>
          ))}

          {/* Licorice Lagoon Sticky Swirl Markers */}
          {licoriceTiles.map((tile) => (
            <g
              key={`licorice-${tile.index}`}
              transform={`translate(${(tile.x * 1600).toFixed(1)}, ${(tile.y * 900).toFixed(1)})`}
              className="board-licorice-marker"
            >
              <circle r="21" className="board-licorice-ring" />
            </g>
          ))}

          {/* Destination Beacon while a player is hopping */}
          {destinationTileCoord && (
            <g
              transform={`translate(${(destinationTileCoord.x * 1600).toFixed(1)}, ${(destinationTileCoord.y * 900).toFixed(1)})`}
              className="board-target-beacon"
            >
              <circle r="30" className="board-target-ring" />
            </g>
          )}
        </svg>

        {/* Family Circular Player Tokens */}
        <div className="board-tokens-layer">
          {players.map((player) => {
            const isActive = player.id === activePlayerId;
            const isMoving = animPlayerId === player.id && animCoord !== null;

            let coord: BoardCoord;
            if (isMoving && animCoord) {
              coord = animCoord;
            } else if (player.tileIndex === 0) {
              const cluster = tileClusters.get(0) ?? [player.id];
              const slotIndex = Math.max(0, cluster.indexOf(player.id));
              coord =
                START_PARADE_SLOTS[slotIndex] ?? {
                  x: Math.min(0.95, 0.042 + slotIndex * 0.046),
                  y: 0.948,
                };
            } else {
              const baseCoord = getCoordForTile(player.tileIndex);
              const cluster = tileClusters.get(player.tileIndex) ?? [player.id];
              const slotIndex = Math.max(0, cluster.indexOf(player.id));
              const offset = getClusterOffset(slotIndex, cluster.length);
              coord = {
                x: Math.max(0.036, Math.min(0.964, baseCoord.x + offset.x)),
                y: Math.max(0.052, Math.min(0.948, baseCoord.y + offset.y)),
              };
            }

            const tokenFailed = Boolean(failedTokens[player.id]);
            const tokenStyle = {
              '--tx': coord.x,
              '--ty': coord.y,
              '--player-color': player.color,
              '--player-accent': player.accentColor,
              zIndex: isMoving ? 40 : isActive ? 30 : 15 + player.turnOrder,
            } as React.CSSProperties;

            return (
              <div
                key={player.id}
                className={[
                  'board-token',
                  isActive ? 'is-active' : '',
                  isMoving ? 'is-moving' : '',
                  isMoving && isShortcutGliding ? 'is-gliding' : '',
                  player.stuckTurns > 0 ? 'is-stuck' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={tokenStyle}
                aria-label={`${player.name} on space ${player.tileIndex}${
                  player.stuckTurns > 0 ? ', stuck in Licorice Lagoon' : ''
                }`}
              >
                <div
                  key={isMoving ? `hop-${animHopTick}` : 'idle'}
                  className={`board-token-inner ${isMoving && !isShortcutGliding ? 'is-hopping' : ''}`}
                >
                  {isActive && <span className="board-token-halo" aria-hidden="true" />}

                  <div className="board-token-disc">
                    {!tokenFailed ? (
                      <img
                        src={player.tokenUrl}
                        alt={player.name}
                        className="board-token-img"
                        draggable={false}
                        onError={() =>
                          setFailedTokens((prev) => ({ ...prev, [player.id]: true }))
                        }
                      />
                    ) : (
                      <span className="board-token-initial" aria-hidden="true">
                        {player.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {player.stuckTurns > 0 && (
                    <span
                      className="board-token-stuck-badge"
                      title="Stuck in Licorice Lagoon"
                      aria-hidden="true"
                    >
                      🌀
                    </span>
                  )}

                  {isActive && (
                    <span className="board-token-nametag">{player.name}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Native Full-Screen Top-Layer <dialog> for AI Video Cutscenes */}
      <dialog
        ref={cutsceneDialogRef}
        className="cutscene-dialog"
        aria-labelledby={cutsceneTitleId}
      >
        {cutscene && (
          <div className={`cutscene-shell cutscene-theme-${cutscene.type}`}>
            <div className="cutscene-media-stage">
              {cutscene.videoUrl && !videoFailed ? (
                <video
                  ref={videoRef}
                  src={cutscene.videoUrl}
                  className="cutscene-video"
                  playsInline
                  autoPlay
                  onEnded={() => void dismissCutscene(cutscene)}
                  onError={() => setVideoFailed(true)}
                />
              ) : (
                <div className="cutscene-storybook-fallback">
                  <div className="cutscene-sparkles" aria-hidden="true">
                    <Sparkles size={44} />
                  </div>
                  <img
                    src={cutscene.playerPortraitUrl}
                    alt={cutscene.playerName}
                    className="cutscene-fallback-portrait"
                  />
                  <div className="cutscene-fallback-badge">✨ Special Candyland Moment! ✨</div>
                </div>
              )}
            </div>

            {/* Captions & Accessible Title Bar */}
            <div className="cutscene-caption-bar">
              <div className="cutscene-caption-text">
                <h1 id={cutsceneTitleId} className="cutscene-title">
                  {cutscene.title}
                </h1>
                <p className="cutscene-subtitle">{cutscene.subtitle}</p>
              </div>

              <div className="cutscene-controls">
                {cutscene.videoUrl && !videoFailed && (
                  <button
                    type="button"
                    className={`cutscene-btn cutscene-btn-sound ${
                      autoplayBlockedNotice ? 'is-attention' : ''
                    }`}
                    onClick={handleToggleCutsceneMute}
                    aria-label={isVideoMuted ? 'Unmute cutscene audio' : 'Mute cutscene audio'}
                  >
                    {isVideoMuted ? <VolumeX size={24} aria-hidden="true" /> : <Volume2 size={24} aria-hidden="true" />}
                    <span>{isVideoMuted ? 'Tap for Sound' : 'Sound On'}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="cutscene-btn cutscene-btn-skip"
                  autoFocus
                  onClick={() => void dismissCutscene(cutscene)}
                >
                  <FastForward size={24} aria-hidden="true" />
                  <span>Skip Cutscene</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
};

export default BoardView;
