import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import type { CreateTypes, Options as ConfettiOptions } from 'canvas-confetti';
import type { CelebrationEvent, CelebrationKind } from '../types/game';

/** Vibrant Candyland palette matching src/index.css tokens */
export const CANDY_CONFETTI_COLORS = [
  '#ff3b5c', // Candy Red
  '#ff5e99', // Frosting Pink
  '#9b51e0', // Grape Purple
  '#ffd43b', // Lemon Yellow
  '#2ea8ff', // Blueberry Blue
  '#ff8a2b', // Orange Sherbet
  '#2ecc71', // Mint Lime
  '#5be7c4', // Peppermint Aqua
  '#ffbf2e', // Castle Gold
];

const GOLD_RAINBOW_COLORS = [
  '#ffbf2e',
  '#ffd43b',
  '#fff2a6',
  '#ff5e99',
  '#5be7c4',
  '#2ea8ff',
  '#9b51e0',
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface FireCelebrationOptions {
  /** Optional custom confetti instance bound to a specific <canvas> (e.g. inside a modal <dialog>). */
  instance?: CreateTypes | null;
  /** Optional canvas element to bind if no instance is provided. */
  canvas?: HTMLCanvasElement | null;
}

/**
 * Fires a Candyland-themed canvas-confetti celebration sequence.
 * Returns a cleanup callback that cancels scheduled waves for multi-wave animations.
 */
export function fireCelebration(
  kind: CelebrationKind,
  options: FireCelebrationOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => {};
  if (prefersReducedMotion()) return () => {};

  const timers: number[] = [];
  let cancelled = false;

  const launcher: CreateTypes =
    options.instance ??
    (options.canvas
      ? confetti.create(options.canvas, { resize: true, useWorker: false })
      : (confetti as unknown as CreateTypes));

  const fire = (opts: ConfettiOptions) => {
    if (cancelled) return;
    try {
      void launcher({
        disableForReducedMotion: true,
        ...opts,
      });
    } catch {
      // Ignore canvas errors during rapid unmount/resize
    }
  };

  const schedule = (delayMs: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      if (!cancelled) fn();
    }, delayMs);
    timers.push(id);
  };

  switch (kind) {
    case 'card-reveal': {
      fire({
        particleCount: 28,
        spread: 62,
        startVelocity: 32,
        scalar: 0.95,
        ticks: 110,
        origin: { x: 0.5, y: 0.55 },
        colors: CANDY_CONFETTI_COLORS,
      });
      break;
    }

    case 'double-card': {
      fire({
        particleCount: 45,
        angle: 60,
        spread: 58,
        startVelocity: 40,
        scalar: 1.05,
        origin: { x: 0.25, y: 0.62 },
        colors: CANDY_CONFETTI_COLORS,
      });
      fire({
        particleCount: 45,
        angle: 120,
        spread: 58,
        startVelocity: 40,
        scalar: 1.05,
        origin: { x: 0.75, y: 0.62 },
        colors: CANDY_CONFETTI_COLORS,
      });
      schedule(180, () => {
        fire({
          particleCount: 35,
          spread: 85,
          startVelocity: 30,
          scalar: 1.15,
          shapes: ['star', 'circle'],
          origin: { x: 0.5, y: 0.45 },
          colors: GOLD_RAINBOW_COLORS,
        });
      });
      break;
    }

    case 'shortcut': {
      // Rainbow ribbon sweep across the board!
      const stops = [0.15, 0.32, 0.5, 0.68, 0.85];
      stops.forEach((x, idx) => {
        schedule(idx * 110, () => {
          fire({
            particleCount: 32,
            spread: 65,
            startVelocity: 38,
            scalar: 1.1,
            shapes: ['star', 'circle'],
            origin: { x, y: 0.55 - Math.abs(0.5 - x) * 0.35 },
            colors: CANDY_CONFETTI_COLORS,
          });
        });
      });
      break;
    }

    case 'minigame-win': {
      fire({
        particleCount: 70,
        spread: 95,
        startVelocity: 46,
        scalar: 1.15,
        shapes: ['star', 'circle', 'square'],
        origin: { x: 0.5, y: 0.58 },
        colors: GOLD_RAINBOW_COLORS,
      });
      schedule(240, () => {
        fire({
          particleCount: 42,
          angle: 65,
          spread: 60,
          startVelocity: 45,
          origin: { x: 0.08, y: 0.72 },
          colors: CANDY_CONFETTI_COLORS,
        });
        fire({
          particleCount: 42,
          angle: 115,
          spread: 60,
          startVelocity: 45,
          origin: { x: 0.92, y: 0.72 },
          colors: CANDY_CONFETTI_COLORS,
        });
      });
      schedule(560, () => {
        fire({
          particleCount: 50,
          spread: 110,
          startVelocity: 34,
          scalar: 1.25,
          shapes: ['star'],
          origin: { x: 0.5, y: 0.38 },
          colors: GOLD_RAINBOW_COLORS,
        });
      });
      break;
    }

    case 'action-complete': {
      fire({
        particleCount: 55,
        spread: 85,
        startVelocity: 42,
        scalar: 1.1,
        origin: { x: 0.5, y: 0.62 },
        colors: CANDY_CONFETTI_COLORS,
      });
      schedule(200, () => {
        fire({
          particleCount: 30,
          spread: 75,
          startVelocity: 30,
          scalar: 1.2,
          shapes: ['star', 'circle'],
          origin: { x: 0.5, y: 0.42 },
          colors: GOLD_RAINBOW_COLORS,
        });
      });
      break;
    }

    case 'victory': {
      // Epic multi-wave Candy Castle Victory Fireworks Finale! (~5.5 seconds)
      const fireCannonPair = (velocity: number, count: number) => {
        fire({
          particleCount: count,
          angle: 60,
          spread: 68,
          startVelocity: velocity,
          scalar: 1.2,
          ticks: 220,
          origin: { x: 0.04, y: 0.78 },
          colors: CANDY_CONFETTI_COLORS,
        });
        fire({
          particleCount: count,
          angle: 120,
          spread: 68,
          startVelocity: velocity,
          scalar: 1.2,
          ticks: 220,
          origin: { x: 0.96, y: 0.78 },
          colors: CANDY_CONFETTI_COLORS,
        });
      };

      const fireStarBurst = (x: number, y: number, count: number) => {
        fire({
          particleCount: count,
          spread: 360,
          startVelocity: 32,
          gravity: 0.75,
          decay: 0.92,
          scalar: 1.3,
          ticks: 190,
          shapes: ['star', 'circle'],
          origin: { x, y },
          colors: GOLD_RAINBOW_COLORS,
        });
      };

      // Wave 1: Grand castle cannon volley
      fireCannonPair(58, 65);
      schedule(220, () => fireStarBurst(0.5, 0.28, 70));

      // Wave 2: Left & right castle fireworks
      schedule(750, () => fireStarBurst(0.24, 0.34, 55));
      schedule(1150, () => fireStarBurst(0.76, 0.32, 55));

      // Wave 3: Center golden shower + side cannons
      schedule(1750, () => {
        fireCannonPair(54, 55);
        fireStarBurst(0.5, 0.22, 65);
      });

      // Wave 4: High shimmering candy rain
      schedule(2600, () => {
        fire({
          particleCount: 80,
          spread: 150,
          startVelocity: 26,
          gravity: 0.6,
          scalar: 1.15,
          ticks: 250,
          origin: { x: 0.5, y: 0.08 },
          colors: CANDY_CONFETTI_COLORS,
        });
      });

      // Wave 5: Triple firework salute
      schedule(3450, () => fireStarBurst(0.3, 0.28, 50));
      schedule(3900, () => fireStarBurst(0.7, 0.28, 50));
      schedule(4400, () => {
        fireCannonPair(62, 75);
        fireStarBurst(0.5, 0.3, 85);
      });
      break;
    }
  }

  return () => {
    cancelled = true;
    timers.forEach((id) => window.clearTimeout(id));
  };
}

/**
 * Fires a quick localized candy-sparkle burst (useful for interactive pops & taps).
 */
export function fireCandyBurst(
  origin: { x: number; y: number } = { x: 0.5, y: 0.5 },
  instance?: CreateTypes | null,
): void {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  const launcher = instance ?? (confetti as unknown as CreateTypes);
  try {
    void launcher({
      particleCount: 16,
      spread: 55,
      startVelocity: 24,
      scalar: 0.85,
      ticks: 70,
      origin,
      colors: CANDY_CONFETTI_COLORS,
      disableForReducedMotion: true,
    });
  } catch {
    // Ignore transient canvas errors
  }
}

export interface CelebrationEffectsProps {
  /** Reactive celebration event from GameRoomState.celebration */
  event?: CelebrationEvent | null;
  /** Optional direct kind trigger when not passing a full CelebrationEvent */
  kind?: CelebrationKind | null;
  /** Key that increments/changes to re-trigger `kind` */
  triggerKey?: string | number | null;
  /** Set true to suppress confetti bursts */
  disabled?: boolean;
  /** Custom z-index for the fixed confetti canvas layer */
  zIndex?: number;
}

/**
 * Full-viewport non-blocking Candyland celebration particle canvas.
 * Reacts to `GameRoomState.celebration` (deduplicated by `event.id`) or `kind` + `triggerKey`.
 */
export function CelebrationEffects({
  event = null,
  kind = null,
  triggerKey = null,
  disabled = false,
  zIndex,
}: CelebrationEffectsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<CreateTypes | null>(null);
  const lastFiredIdRef = useRef<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const instance = confetti.create(canvas, {
      resize: true,
      useWorker: false,
    });
    instanceRef.current = instance;

    return () => {
      try {
        instance.reset();
      } catch {
        // Safe cleanup
      }
      instanceRef.current = null;
    };
  }, []);

  const resolvedKind = event?.kind ?? kind ?? null;
  const resolvedId = event
    ? `evt:${event.id}:${event.timestamp}`
    : kind
      ? `kind:${kind}:${triggerKey ?? 'once'}`
      : null;

  useEffect(() => {
    if (disabled || !resolvedKind || !resolvedId) return;
    if (lastFiredIdRef.current === resolvedId) return;
    lastFiredIdRef.current = resolvedId;

    const cleanup = fireCelebration(resolvedKind, {
      instance: instanceRef.current,
      canvas: canvasRef.current,
    });

    return () => {
      cleanup();
    };
  }, [disabled, resolvedKind, resolvedId]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="candyland-celebration-canvas"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: zIndex ?? 'var(--z-celebration, 90)',
      }}
    />
  );
}

export default CelebrationEffects;
