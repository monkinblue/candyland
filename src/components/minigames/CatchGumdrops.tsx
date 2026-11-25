import { useEffect, useRef, useState } from 'react';

export interface CatchGumdropsProps {
  isKid: boolean;
  targetScore: number;
  durationSeconds?: number;
  isPlaying: boolean;
  playerColor?: string;
  onScoreChange: (score: number, progress: number) => void;
  onSfx?: (sfx: 'catch' | 'star') => void;
}

interface Gumdrop {
  id: number;
  x: number;
  y: number;
  vy: number;
  vx: number;
  radius: number;
  color: string;
  highlight: string;
  wobblePhase: number;
  isGolden: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingPop {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

const GUMDROP_PALETTE = [
  { fill: '#ff3b5c', highlight: '#ff9cb0' },
  { fill: '#9b51e0', highlight: '#d5b3ff' },
  { fill: '#ffd43b', highlight: '#fff3b0' },
  { fill: '#2ea8ff', highlight: '#a5dbff' },
  { fill: '#ff8a2b', highlight: '#ffc694' },
  { fill: '#2ecc71', highlight: '#9ef2be' },
  { fill: '#ff5e99', highlight: '#ffb8d2' },
];

export function CatchGumdrops({
  isKid,
  targetScore,
  isPlaying,
  playerColor = '#ff5e99',
  onScoreChange,
  onSfx,
}: CatchGumdropsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const propsRef = useRef({ isKid, targetScore, isPlaying, playerColor, onScoreChange, onSfx });
  propsRef.current = { isKid, targetScore, isPlaying, playerColor, onScoreChange, onSfx };

  // Mutable simulation state for rock-solid 60fps canvas animation
  const simRef = useRef({
    width: 800,
    height: 500,
    basketX: 400,
    targetBasketX: 400,
    basketSquash: 0,
    activePointerId: null as number | null,
    pointerOffsetX: 0,
    keysDown: { left: false, right: false },
    gumdrops: [] as Gumdrop[],
    sparkles: [] as Sparkle[],
    pops: [] as FloatingPop[],
    clouds: [
      { x: 0.14, y: 0.11, scale: 1.0, speed: 0.015 },
      { x: 0.48, y: 0.08, scale: 1.25, speed: 0.011 },
      { x: 0.82, y: 0.13, scale: 0.95, speed: 0.018 },
    ] as Cloud[],
    nextId: 1,
    spawnTimer: 0,
    score: 0,
    lastReportedScore: 0,
    lastReportTime: 0,
    pendingFlushTimer: null as number | null,
  });

  // Reset state when a new game starts
  useEffect(() => {
    const sim = simRef.current;
    if (isPlaying) {
      sim.gumdrops = [];
      sim.sparkles = [];
      sim.pops = [];
      sim.score = 0;
      sim.lastReportedScore = 0;
      sim.lastReportTime = performance.now();
      sim.spawnTimer = 0.08;
      sim.basketX = sim.width * 0.5;
      sim.targetBasketX = sim.width * 0.5;
      sim.basketSquash = 0;
    } else if (sim.score !== sim.lastReportedScore) {
      // Flush final score immediately when round stops
      sim.lastReportedScore = sim.score;
      const goal = Math.max(1, propsRef.current.targetScore);
      propsRef.current.onScoreChange(sim.score, Math.min(1, sim.score / goal));
    }
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sim = simRef.current;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.round(rect.width));
      const h = Math.max(240, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const prevW = sim.width || w;
      sim.width = w;
      sim.height = h;
      const ratio = sim.basketX / prevW;
      sim.basketX = Math.max(60, Math.min(w - 60, ratio * w));
      sim.targetBasketX = Math.max(60, Math.min(w - 60, sim.targetBasketX * (w / prevW)));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const reportScoreThrottled = (newScore: number, force = false) => {
      const now = performance.now();
      const goal = Math.max(1, propsRef.current.targetScore);
      const clamped = Math.min(goal, Math.max(0, newScore));
      const progress = Math.min(1, clamped / goal);

      if (force || now - sim.lastReportTime >= 100) {
        if (sim.pendingFlushTimer !== null) {
          window.clearTimeout(sim.pendingFlushTimer);
          sim.pendingFlushTimer = null;
        }
        sim.lastReportTime = now;
        sim.lastReportedScore = clamped;
        propsRef.current.onScoreChange(clamped, progress);
      } else if (sim.pendingFlushTimer === null) {
        const delay = Math.max(16, 100 - (now - sim.lastReportTime));
        sim.pendingFlushTimer = window.setTimeout(() => {
          sim.pendingFlushTimer = null;
          sim.lastReportTime = performance.now();
          const g = Math.max(1, propsRef.current.targetScore);
          const flushed = Math.min(g, Math.max(0, sim.score));
          sim.lastReportedScore = flushed;
          propsRef.current.onScoreChange(flushed, Math.min(1, flushed / g));
        }, delay);
      }
    };

    const emitCatchBurst = (x: number, y: number, color: string, points: number) => {
      const count = points > 1 ? 20 : 12;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 90 + Math.random() * 190;
        sim.sparkles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.25,
          size: 4 + Math.random() * 6,
          color: points > 1 ? '#ffd43b' : color,
        });
      }
      sim.pops.push({
        x,
        y: y - 16,
        vy: -78,
        life: 0,
        text: points > 1 ? `+${points} ⭐` : '+1!',
        color: points > 1 ? '#d98a00' : '#ff3b5c',
      });
    };

    const awardCatch = (g: Gumdrop) => {
      const goal = Math.max(1, propsRef.current.targetScore);
      if (sim.score >= goal) return;
      const pts = Math.min(g.isGolden ? 2 : 1, goal - sim.score);
      sim.score = Math.min(goal, sim.score + pts);
      sim.basketSquash = 1;
      emitCatchBurst(g.x, g.y, g.color, pts);
      propsRef.current.onSfx?.(g.isGolden ? 'star' : 'catch');
      reportScoreThrottled(sim.score, sim.score >= goal);
      setLiveAnnouncement(`Caught gumdrop! Score ${sim.score}`);
    };

    const spawnGumdrop = () => {
      const kid = propsRef.current.isKid;
      const margin = Math.max(46, sim.width * 0.09);
      const isGolden = Math.random() < (kid ? 0.2 : 0.14);
      const palette = GUMDROP_PALETTE[Math.floor(Math.random() * GUMDROP_PALETTE.length)];
      const baseRadius = kid
        ? Math.min(34, Math.max(24, sim.width * 0.042))
        : Math.min(28, Math.max(20, sim.width * 0.034));
      const baseSpeed = kid
        ? Math.max(135, sim.height * 0.34)
        : Math.max(185, sim.height * 0.46);

      sim.gumdrops.push({
        id: sim.nextId++,
        x: margin + Math.random() * Math.max(40, sim.width - margin * 2),
        y: sim.height * 0.12,
        vy: baseSpeed * (0.85 + Math.random() * 0.35),
        vx: (Math.random() - 0.5) * 28,
        radius: isGolden ? baseRadius * 1.15 : baseRadius,
        color: isGolden ? '#ffbf2e' : palette.fill,
        highlight: isGolden ? '#fff9c4' : palette.highlight,
        wobblePhase: Math.random() * Math.PI * 2,
        isGolden,
      });
    };

    const getBasketHalfWidth = () => {
      const kid = propsRef.current.isKid;
      const pct = kid ? 0.165 : 0.125;
      return Math.max(kid ? 68 : 52, Math.min(120, sim.width * pct));
    };

    const clampBasketX = (rawX: number) => {
      const half = getBasketHalfWidth();
      return Math.max(half + 10, Math.min(sim.width - half - 10, rawX));
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Extra 3-year-old friendliness: tapping directly on a falling gumdrop catches it!
      let tappedGumdrop = false;
      const tapPadding = propsRef.current.isKid ? 30 : 20;
      for (let i = sim.gumdrops.length - 1; i >= 0; i--) {
        const g = sim.gumdrops[i];
        const dx = x - g.x;
        const dy = y - g.y;
        const hitR = g.radius + tapPadding;
        if (dx * dx + dy * dy <= hitR * hitR) {
          sim.gumdrops.splice(i, 1);
          awardCatch(g);
          tappedGumdrop = true;
          break;
        }
      }

      // Also glide basket toward touch & capture pointer for smooth dragging
      const half = getBasketHalfWidth();
      const basketY = sim.height - 58;
      const grabbedBasket =
        Math.abs(x - sim.basketX) <= half + 24 && Math.abs(y - basketY) <= 58;

      sim.activePointerId = e.pointerId;
      sim.pointerOffsetX = grabbedBasket ? x - sim.basketX : 0;
      if (!tappedGumdrop) {
        sim.targetBasketX = clampBasketX(x - sim.pointerOffsetX);
      } else {
        sim.targetBasketX = clampBasketX(x);
      }

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unavailable
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (sim.activePointerId !== e.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      sim.targetBasketX = clampBasketX(x - sim.pointerOffsetX);
    };

    const clearPointer = (e: PointerEvent) => {
      if (sim.activePointerId === e.pointerId) {
        sim.activePointerId = null;
        sim.pointerOffsetX = 0;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        sim.keysDown.left = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        sim.keysDown.right = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        sim.keysDown.left = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        sim.keysDown.right = false;
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', clearPointer);
    canvas.addEventListener('pointercancel', clearPointer);
    canvas.addEventListener('lostpointercapture', clearPointer);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let rafId = 0;
    let lastTime = performance.now();

    const drawCloud = (cx: number, cy: number, scale: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(-34, 6, 22, 0, Math.PI * 2);
      ctx.arc(-10, -6, 28, 0, Math.PI * 2);
      ctx.arc(20, -2, 25, 0, Math.PI * 2);
      ctx.arc(42, 8, 19, 0, Math.PI * 2);
      ctx.fill();
      // Subtle cotton-candy pink underside tint
      ctx.fillStyle = 'rgba(255, 196, 224, 0.35)';
      ctx.beginPath();
      ctx.ellipse(4, 15, 50, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawGumdrop = (g: Gumdrop, nowSec: number) => {
      ctx.save();
      ctx.translate(g.x, g.y);
      const tilt = Math.sin(nowSec * 3.5 + g.wobblePhase) * 0.12;
      ctx.rotate(tilt);

      const r = g.radius;
      // Soft candy shadow
      ctx.shadowColor = 'rgba(74, 37, 17, 0.22)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;

      // Gumdrop dome silhouette
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, r * 0.58);
      ctx.quadraticCurveTo(-r * 1.02, -r * 0.15, -r * 0.55, -r * 0.78);
      ctx.quadraticCurveTo(0, -r * 1.18, r * 0.55, -r * 0.78);
      ctx.quadraticCurveTo(r * 1.02, -r * 0.15, r * 0.92, r * 0.58);
      ctx.quadraticCurveTo(0, r * 0.85, -r * 0.92, r * 0.58);
      ctx.closePath();

      const grad = ctx.createRadialGradient(-r * 0.28, -r * 0.36, r * 0.1, 0, 0, r * 1.15);
      grad.addColorStop(0, g.highlight);
      grad.addColorStop(0.55, g.color);
      grad.addColorStop(1, g.color);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();

      // Glossy sugar reflection
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.34, r * 0.22, r * 0.34, -0.35, 0, Math.PI * 2);
      ctx.fill();

      // Sugar crystal dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const dots = [
        [0.24, -0.15],
        [-0.1, 0.25],
        [0.36, 0.28],
        [-0.42, 0.12],
      ];
      for (const [dx, dy] of dots) {
        ctx.beginPath();
        ctx.arc(r * dx, r * dy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (g.isGolden) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(r * 0.82)}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', 0, 2);
      }

      ctx.restore();
    };

    const drawBasket = (x: number, y: number, halfW: number, squash: number) => {
      ctx.save();
      ctx.translate(x, y);
      const sx = 1 + squash * 0.16;
      const sy = 1 - squash * 0.14;
      ctx.scale(sx, sy);

      const h = 58;
      // Ground shadow
      ctx.fillStyle = 'rgba(74, 37, 17, 0.16)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.56, halfW * 0.92, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      // Basket body (candy-striped trapezoid with rounded bottom)
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.94, -h * 0.35);
      ctx.lineTo(halfW * 0.94, -h * 0.35);
      ctx.lineTo(halfW * 0.74, h * 0.42);
      ctx.quadraticCurveTo(0, h * 0.62, -halfW * 0.74, h * 0.42);
      ctx.closePath();

      const bodyGrad = ctx.createLinearGradient(0, -h * 0.35, 0, h * 0.55);
      bodyGrad.addColorStop(0, '#ff9a3c');
      bodyGrad.addColorStop(1, '#e66c19');
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Vertical candy stripes clipped inside basket
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 236, 200, 0.38)';
      for (let sxPos = -halfW; sxPos <= halfW; sxPos += 24) {
        ctx.fillRect(sxPos, -h * 0.4, 10, h * 1.1);
      }
      ctx.restore();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7a3309';
      ctx.stroke();

      // Frosted pink scalloped rim
      ctx.beginPath();
      ctx.roundRect(-halfW * 1.04, -h * 0.5, halfW * 2.08, 22, 12);
      ctx.fillStyle = propsRef.current.playerColor || '#ff5e99';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Cute smiling face on basket!
      ctx.fillStyle = '#4a2511';
      ctx.beginPath();
      ctx.arc(-18, 6, 4.5, 0, Math.PI * 2);
      ctx.arc(18, 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 10, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#4a2511';
      ctx.stroke();

      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nowSec = now / 1000;
      const w = sim.width;
      const h = sim.height;
      const playing = propsRef.current.isPlaying;
      const kid = propsRef.current.isKid;

      // Keyboard movement
      if (playing) {
        const keySpeed = w * 0.85;
        if (sim.keysDown.left) sim.targetBasketX = clampBasketX(sim.targetBasketX - keySpeed * dt);
        if (sim.keysDown.right) sim.targetBasketX = clampBasketX(sim.targetBasketX + keySpeed * dt);
      }

      // Smooth spring basket glide
      sim.basketX += (sim.targetBasketX - sim.basketX) * Math.min(1, dt * 18);
      sim.basketSquash = Math.max(0, sim.basketSquash - dt * 4.5);

      // Drift clouds
      for (const cloud of sim.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x > 1.15) cloud.x = -0.15;
      }

      // Spawn gumdrops
      if (playing) {
        sim.spawnTimer -= dt;
        if (sim.spawnTimer <= 0) {
          spawnGumdrop();
          sim.spawnTimer = kid ? 0.56 + Math.random() * 0.2 : 0.42 + Math.random() * 0.18;
        }
      }

      // Update falling gumdrops
      const basketY = h - 58;
      const basketHalfW = getBasketHalfWidth();
      for (let i = sim.gumdrops.length - 1; i >= 0; i--) {
        const g = sim.gumdrops[i];
        g.y += g.vy * dt;
        g.x += g.vx * dt;
        if (g.x < g.radius + 8 || g.x > w - g.radius - 8) {
          g.vx *= -1;
          g.x = Math.max(g.radius + 8, Math.min(w - g.radius - 8, g.x));
        }

        // Generous basket catch zone
        const catchWidth = basketHalfW + g.radius * 0.85;
        if (
          playing &&
          Math.abs(g.x - sim.basketX) <= catchWidth &&
          g.y + g.radius >= basketY - 34 &&
          g.y - g.radius <= basketY + 26
        ) {
          sim.gumdrops.splice(i, 1);
          awardCatch(g);
          continue;
        }

        if (g.y - g.radius > h + 20) {
          sim.gumdrops.splice(i, 1);
        }
      }

      // Update sparkles
      for (let i = sim.sparkles.length - 1; i >= 0; i--) {
        const s = sim.sparkles[i];
        s.life += dt;
        if (s.life >= s.maxLife) {
          sim.sparkles.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 380 * dt;
      }

      // Update floating pop labels
      for (let i = sim.pops.length - 1; i >= 0; i--) {
        const p = sim.pops[i];
        p.life += dt;
        if (p.life >= 0.75) {
          sim.pops.splice(i, 1);
          continue;
        }
        p.y += p.vy * dt;
      }

      // --- DRAW ---
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#c2f0ff');
      sky.addColorStop(0.55, '#fff0f7');
      sky.addColorStop(1, '#ffe4b5');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Soft rolling pastel frosting hills at bottom
      ctx.fillStyle = '#ffcae2';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w * 0.25, h - 78, w * 0.55, h - 32);
      ctx.quadraticCurveTo(w * 0.82, h - 84, w, h - 24);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Clouds
      for (const cloud of sim.clouds) {
        drawCloud(cloud.x * w, cloud.y * h + 16, cloud.scale);
      }

      // Gumdrops
      for (const g of sim.gumdrops) {
        drawGumdrop(g, nowSec);
      }

      // Basket
      drawBasket(sim.basketX, basketY, basketHalfW, sim.basketSquash);

      // Sparkles
      for (const s of sim.sparkles) {
        const alpha = 1 - s.life / s.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Floating "+1!" text
      for (const p of sim.pops) {
        const alpha = 1 - p.life / 0.75;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 28px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      if (sim.pendingFlushTimer !== null) {
        window.clearTimeout(sim.pendingFlushTimer);
        sim.pendingFlushTimer = null;
      }
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', clearPointer);
      canvas.removeEventListener('pointercancel', clearPointer);
      canvas.removeEventListener('lostpointercapture', clearPointer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mg-playfield"
      aria-label="Catch Gumdrops playfield. Drag or tap the basket or tap falling gumdrops. Use Left and Right arrow keys to move the basket."
    >
      <canvas ref={canvasRef} className="mg-canvas" tabIndex={0} />
      <div className="mg-sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>
      <div className="mg-hint-pill" aria-hidden="true">
        👆 Drag basket OR tap gumdrops!
      </div>
    </div>
  );
}

export default CatchGumdrops;
