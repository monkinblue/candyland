import { useEffect, useRef, useState } from 'react';

export interface PopLollipopBubblesProps {
  isKid: boolean;
  targetScore: number;
  durationSeconds?: number;
  isPlaying: boolean;
  playerColor?: string;
  onScoreChange: (score: number, progress: number) => void;
  onSfx?: (sfx: 'pop' | 'star') => void;
}

interface LollipopBubble {
  id: number;
  x: number;
  y: number;
  vy: number;
  swayAmp: number;
  swaySpeed: number;
  swayPhase: number;
  radius: number;
  hue: number;
  swirlColor: string;
  isRainbow: boolean;
  spawnAnim: number;
}

interface PopRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: string;
}

interface PopSparkle {
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
  life: number;
  text: string;
  color: string;
}

const LOLLIPOP_COLORS = [
  { hue: 340, swirl: '#ff3b5c' },
  { hue: 278, swirl: '#9b51e0' },
  { hue: 46, swirl: '#ffbf2e' },
  { hue: 204, swirl: '#2ea8ff' },
  { hue: 26, swirl: '#ff8a2b' },
  { hue: 145, swirl: '#2ecc71' },
  { hue: 325, swirl: '#ff5e99' },
];

export function PopLollipopBubbles({
  isKid,
  targetScore,
  isPlaying,
  onScoreChange,
  onSfx,
}: PopLollipopBubblesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const propsRef = useRef({ isKid, targetScore, isPlaying, onScoreChange, onSfx });
  propsRef.current = { isKid, targetScore, isPlaying, onScoreChange, onSfx };

  const simRef = useRef({
    width: 800,
    height: 500,
    bubbles: [] as LollipopBubble[],
    ripples: [] as PopRipple[],
    sparkles: [] as PopSparkle[],
    pops: [] as FloatingPop[],
    activePointers: new Set<number>(),
    spawnTimer: 0,
    nextId: 1,
    score: 0,
    lastReportedScore: -1,
    lastReportTime: 0,
    pendingFlushTimer: null as number | null,
  });

  useEffect(() => {
    const sim = simRef.current;
    if (isPlaying) {
      sim.bubbles = [];
      sim.ripples = [];
      sim.sparkles = [];
      sim.pops = [];
      sim.score = 0;
      sim.lastReportedScore = 0;
      sim.lastReportTime = performance.now();
      sim.spawnTimer = 0.05;
    } else if (sim.score !== sim.lastReportedScore) {
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
      sim.width = w;
      sim.height = h;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const reportScoreThrottled = (newScore: number, force = false) => {
      const now = performance.now();
      const goal = Math.max(1, propsRef.current.targetScore);
      const progress = Math.min(1, newScore / goal);

      if (force || now - sim.lastReportTime >= 100) {
        if (sim.pendingFlushTimer !== null) {
          window.clearTimeout(sim.pendingFlushTimer);
          sim.pendingFlushTimer = null;
        }
        sim.lastReportTime = now;
        sim.lastReportedScore = newScore;
        propsRef.current.onScoreChange(newScore, progress);
      } else if (sim.pendingFlushTimer === null) {
        const delay = Math.max(16, 100 - (now - sim.lastReportTime));
        sim.pendingFlushTimer = window.setTimeout(() => {
          sim.pendingFlushTimer = null;
          sim.lastReportTime = performance.now();
          sim.lastReportedScore = sim.score;
          const g = Math.max(1, propsRef.current.targetScore);
          propsRef.current.onScoreChange(sim.score, Math.min(1, sim.score / g));
        }, delay);
      }
    };

    const spawnBubble = (initialY?: number) => {
      const kid = propsRef.current.isKid;
      const isRainbow = Math.random() < (kid ? 0.2 : 0.14);
      const palette = LOLLIPOP_COLORS[Math.floor(Math.random() * LOLLIPOP_COLORS.length)];
      const minR = kid ? 46 : 36;
      const maxR = kid ? 62 : 48;
      const radius = minR + Math.random() * (maxR - minR);
      const margin = radius + 18;
      const x = margin + Math.random() * Math.max(40, sim.width - margin * 2);
      const vy = kid
        ? 62 + Math.random() * 44
        : 92 + Math.random() * 62;

      sim.bubbles.push({
        id: sim.nextId++,
        x,
        y: initialY ?? sim.height + radius * 0.85,
        vy,
        swayAmp: 16 + Math.random() * 24,
        swaySpeed: 1.5 + Math.random() * 1.4,
        swayPhase: Math.random() * Math.PI * 2,
        radius: isRainbow ? radius * 1.1 : radius,
        hue: palette.hue,
        swirlColor: isRainbow ? '#ffbf2e' : palette.swirl,
        isRainbow,
        spawnAnim: 0,
      });
    };

    const popBubbleAt = (index: number) => {
      const b = sim.bubbles[index];
      if (!b) return;
      sim.bubbles.splice(index, 1);

      const pts = b.isRainbow ? 2 : 1;
      sim.score += pts;

      sim.ripples.push({
        x: b.x,
        y: b.y,
        radius: b.radius * 0.75,
        maxRadius: b.radius * 1.85,
        life: 0,
        color: b.isRainbow ? '#ffbf2e' : b.swirlColor,
      });

      const sparkCount = b.isRainbow ? 20 : 14;
      const rainbowColors = ['#ff3b5c', '#ffd43b', '#5be7c4', '#2ea8ff', '#9b51e0', '#ff5e99'];
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.35;
        const speed = 95 + Math.random() * 185;
        sim.sparkles.push({
          x: b.x,
          y: b.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 35,
          life: 0,
          maxLife: 0.42 + Math.random() * 0.25,
          size: 4 + Math.random() * 6,
          color: b.isRainbow
            ? rainbowColors[i % rainbowColors.length]
            : i % 2 === 0
              ? b.swirlColor
              : '#ffffff',
        });
      }

      sim.pops.push({
        x: b.x,
        y: b.y - 10,
        life: 0,
        text: b.isRainbow ? 'POP! +2 ⭐' : 'POP! +1',
        color: b.isRainbow ? '#d98a00' : b.swirlColor,
      });

      propsRef.current.onSfx?.(b.isRainbow ? 'star' : 'pop');
      reportScoreThrottled(sim.score, sim.score === propsRef.current.targetScore);
      setLiveAnnouncement(`Popped bubble! Score ${sim.score}`);
    };

    const tryPopAtPoint = (x: number, y: number) => {
      if (!propsRef.current.isPlaying) return;
      const forgivingPad = propsRef.current.isKid ? 24 : 14;
      for (let i = sim.bubbles.length - 1; i >= 0; i--) {
        const b = sim.bubbles[i];
        const dx = x - b.x;
        const dy = y - b.y;
        const hitR = b.radius + forgivingPad;
        if (dx * dx + dy * dy <= hitR * hitR) {
          popBubbleAt(i);
          return;
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sim.activePointers.add(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      tryPopAtPoint(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (!sim.activePointers.has(e.pointerId)) return;
      const rect = canvas.getBoundingClientRect();
      tryPopAtPoint(e.clientX - rect.left, e.clientY - rect.top);
    };

    const clearPointer = (e: PointerEvent) => {
      sim.activePointers.delete(e.pointerId);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (sim.bubbles.length > 0) {
          popBubbleAt(0);
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', clearPointer);
    canvas.addEventListener('pointercancel', clearPointer);
    window.addEventListener('keydown', handleKeyDown);

    const drawBubble = (b: LollipopBubble, nowSec: number) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      const popIn = Math.min(1, b.spawnAnim * 3.5);
      const wobble = 1 + Math.sin(nowSec * 3.8 + b.swayPhase) * 0.04;
      ctx.scale(popIn * wobble, popIn / wobble);

      const r = b.radius;

      // Iridescent soap-bubble body
      const grad = ctx.createRadialGradient(-r * 0.28, -r * 0.32, r * 0.1, 0, 0, r);
      if (b.isRainbow) {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        grad.addColorStop(0.45, 'rgba(255, 224, 130, 0.42)');
        grad.addColorStop(0.75, 'rgba(255, 118, 178, 0.46)');
        grad.addColorStop(1, 'rgba(91, 231, 196, 0.72)');
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        grad.addColorStop(0.5, `hsla(${b.hue}, 95%, 78%, 0.35)`);
        grad.addColorStop(0.85, `hsla(${(b.hue + 45) % 360}, 95%, 68%, 0.48)`);
        grad.addColorStop(1, `hsla(${b.hue}, 95%, 62%, 0.76)`);
      }

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();

      // Cute swirled lollipop inside the bubble!
      const lolliR = r * 0.4;
      // Lollipop stick
      ctx.beginPath();
      ctx.moveTo(0, lolliR * 0.75);
      ctx.lineTo(0, r * 0.72);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Lollipop head
      ctx.beginPath();
      ctx.arc(0, -r * 0.06, lolliR, 0, Math.PI * 2);
      ctx.fillStyle = b.swirlColor;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Inner white spiral swirl
      ctx.beginPath();
      for (let t = 0; t <= Math.PI * 4.2; t += 0.35) {
        const sr = (t / (Math.PI * 4.2)) * (lolliR * 0.8);
        const sx = Math.cos(t) * sr;
        const sy = -r * 0.06 + Math.sin(t) * sr;
        if (t === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();

      // Specular soap bubble highlight arcs
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.38, -r * 0.38, r * 0.22, r * 0.11, -0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 0.4, r * 0.34, r * 0.09, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nowSec = now / 1000;
      const w = sim.width;
      const h = sim.height;
      const playing = propsRef.current.isPlaying;
      const kid = propsRef.current.isKid;

      // Seed initial bubbles right when play begins so screen is immediately joyful!
      if (playing && sim.bubbles.length === 0 && sim.score === 0) {
        for (let i = 0; i < 4; i++) {
          spawnBubble(h * (0.48 + i * 0.14));
        }
      }

      if (playing) {
        sim.spawnTimer -= dt;
        const maxOnScreen = kid ? 9 : 11;
        if (sim.spawnTimer <= 0 && sim.bubbles.length < maxOnScreen) {
          spawnBubble();
          sim.spawnTimer = kid ? 0.52 + Math.random() * 0.22 : 0.38 + Math.random() * 0.18;
        }
      }

      for (let i = sim.bubbles.length - 1; i >= 0; i--) {
        const b = sim.bubbles[i];
        b.spawnAnim += dt;
        b.y -= b.vy * dt;
        b.x += Math.sin(nowSec * b.swaySpeed + b.swayPhase) * b.swayAmp * dt;
        b.x = Math.max(b.radius + 8, Math.min(w - b.radius - 8, b.x));
        if (b.y + b.radius < -24) {
          sim.bubbles.splice(i, 1);
        }
      }

      for (let i = sim.ripples.length - 1; i >= 0; i--) {
        const rp = sim.ripples[i];
        rp.life += dt;
        if (rp.life >= 0.32) {
          sim.ripples.splice(i, 1);
        }
      }

      for (let i = sim.sparkles.length - 1; i >= 0; i--) {
        const s = sim.sparkles[i];
        s.life += dt;
        if (s.life >= s.maxLife) {
          sim.sparkles.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 280 * dt;
      }

      for (let i = sim.pops.length - 1; i >= 0; i--) {
        const p = sim.pops[i];
        p.life += dt;
        if (p.life >= 0.68) {
          sim.pops.splice(i, 1);
          continue;
        }
        p.y -= 68 * dt;
      }

      // --- DRAW ---
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#c8e7ff');
      bg.addColorStop(0.5, '#f6dfff');
      bg.addColorStop(1, '#ffe5f2');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Soft ambient pastel bokeh circles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(w * 0.16, h * 0.24, 54, 0, Math.PI * 2);
      ctx.arc(w * 0.82, h * 0.18, 68, 0, Math.PI * 2);
      ctx.arc(w * 0.72, h * 0.78, 48, 0, Math.PI * 2);
      ctx.fill();

      // Bubbles
      for (const b of sim.bubbles) {
        drawBubble(b, nowSec);
      }

      // Pop ripples
      for (const rp of sim.ripples) {
        const t = rp.life / 0.32;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius + (rp.maxRadius - rp.radius) * t, 0, Math.PI * 2);
        ctx.lineWidth = 5 * (1 - t);
        ctx.strokeStyle = rp.color;
        ctx.stroke();
        ctx.restore();
      }

      // Sparkles
      for (const s of sim.sparkles) {
        const alpha = 1 - s.life / s.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Pop labels
      for (const p of sim.pops) {
        const alpha = 1 - p.life / 0.68;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 26px Fredoka, sans-serif';
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
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mg-playfield"
      aria-label="Pop Lollipop Bubbles playfield. Tap or swipe the floating lollipop bubbles, or press Space to pop them."
    >
      <canvas ref={canvasRef} className="mg-canvas" tabIndex={0} />
      <div className="mg-sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>
      <div className="mg-hint-pill" aria-hidden="true">
        🫧 Tap or swipe to POP the lollipop bubbles!
      </div>
    </div>
  );
}

export default PopLollipopBubbles;
