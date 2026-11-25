import { useEffect, useRef, useState } from 'react';

export interface TraceCandyCaneProps {
  isKid: boolean;
  targetScore: number;
  durationSeconds?: number;
  isPlaying: boolean;
  playerColor?: string;
  onScoreChange: (score: number, progress: number) => void;
  onSfx?: (sfx: 'sparkle' | 'star') => void;
}

interface TraceNode {
  nx: number; // normalized [0..1]
  ny: number; // normalized [0..1]
  lit: boolean;
  popAnim: number;
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/**
 * Generates normalized candy-cane centerline points (straight stem rising into classic J-hook).
 */
function buildCandyCaneNodes(count: number, mirrored: boolean): TraceNode[] {
  // Smooth dense polyline of a large candy cane centered cleanly in [0.22..0.78] x [0.15..0.85]
  const rawPts: Array<{ x: number; y: number }> = [];
  // Straight stem from bottom up to hook start
  const stemX = 0.36;
  const stemBottomY = 0.84;
  const hookCenterX = 0.52;
  const hookCenterY = 0.34;
  const hookR = 0.16;

  // Stem segment (bottom to hookCenterY)
  const stemSteps = 20;
  for (let i = 0; i <= stemSteps; i++) {
    const t = i / stemSteps;
    rawPts.push({
      x: stemX,
      y: stemBottomY + (hookCenterY - stemBottomY) * t,
    });
  }

  // Semicircle hook arc from PI (left) over top (1.5*PI) to 0.12*PI (past right)
  const arcSteps = 26;
  for (let i = 1; i <= arcSteps; i++) {
    const t = i / arcSteps;
    const angle = Math.PI + t * (Math.PI * 1.12);
    rawPts.push({
      x: hookCenterX + Math.cos(angle) * hookR,
      y: hookCenterY + Math.sin(angle) * hookR * 1.15,
    });
  }

  // Compute cumulative arc length to resample `count` evenly spaced glowing dots
  const cumLen = [0];
  for (let i = 1; i < rawPts.length; i++) {
    const dx = rawPts[i].x - rawPts[i - 1].x;
    const dy = rawPts[i].y - rawPts[i - 1].y;
    cumLen.push(cumLen[i - 1] + Math.hypot(dx, dy));
  }
  const totalLen = cumLen[cumLen.length - 1];

  const nodes: TraceNode[] = [];
  for (let k = 0; k < count; k++) {
    const targetDist = (k / Math.max(1, count - 1)) * totalLen;
    let idx = 0;
    while (idx < cumLen.length - 2 && cumLen[idx + 1] < targetDist) {
      idx++;
    }
    const segLen = Math.max(1e-5, cumLen[idx + 1] - cumLen[idx]);
    const frac = (targetDist - cumLen[idx]) / segLen;
    const x = rawPts[idx].x + (rawPts[idx + 1].x - rawPts[idx].x) * frac;
    const y = rawPts[idx].y + (rawPts[idx + 1].y - rawPts[idx].y) * frac;
    nodes.push({
      nx: mirrored ? 1 - x : x,
      ny: y,
      lit: false,
      popAnim: 0,
    });
  }
  return nodes;
}

/** Distance from point (px, py) to segment (ax, ay)-(bx, by) so fast finger swipes never miss! */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-4) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

export function TraceCandyCane({
  isKid,
  targetScore,
  isPlaying,
  onScoreChange,
  onSfx,
}: TraceCandyCaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [caneLevel, setCaneLevel] = useState(1);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const propsRef = useRef({ isKid, targetScore, isPlaying, onScoreChange, onSfx });
  propsRef.current = { isKid, targetScore, isPlaying, onScoreChange, onSfx };

  const simRef = useRef({
    width: 800,
    height: 500,
    nodes: buildCandyCaneNodes(isKid ? 6 : 8, false),
    isGoldenCane: false,
    caneNumber: 1,
    bannerTimer: 0,
    bannerText: '',
    activePointerId: null as number | null,
    prevPointer: null as { x: number; y: number } | null,
    trail: [] as TrailPoint[],
    sparkles: [] as Sparkle[],
    score: 0,
    lastReportedScore: 0,
    lastReportTime: 0,
    pendingFlushTimer: null as number | null,
    respawnTimer: null as number | null,
  });

  useEffect(() => {
    const sim = simRef.current;
    if (isPlaying) {
      if (sim.respawnTimer !== null) {
        window.clearTimeout(sim.respawnTimer);
        sim.respawnTimer = null;
      }
      sim.isGoldenCane = false;
      sim.caneNumber = 1;
      sim.nodes = buildCandyCaneNodes(propsRef.current.isKid ? 6 : 8, false);
      sim.trail = [];
      sim.sparkles = [];
      sim.bannerTimer = 0;
      sim.bannerText = '';
      sim.score = 0;
      sim.lastReportedScore = 0;
      sim.lastReportTime = performance.now();
      setCaneLevel(1);
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

    const spawnSparkles = (x: number, y: number, golden: boolean, count = 12) => {
      const palette = golden
        ? ['#ffbf2e', '#ffd43b', '#ffffff', '#ff8a2b']
        : ['#ff3b5c', '#5be7c4', '#ffd43b', '#ff5e99', '#ffffff'];
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 75 + Math.random() * 170;
        sim.sparkles.push({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 40,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.25,
          color: palette[i % palette.length],
          size: 4 + Math.random() * 6,
        });
      }
    };

    const getNodePixel = (n: TraceNode) => {
      const padX = sim.width * 0.06;
      const usableW = sim.width - padX * 2;
      const size = Math.min(usableW, sim.height);
      const offsetX = (sim.width - size) * 0.5;
      const offsetY = (sim.height - size) * 0.5;
      return {
        x: offsetX + n.nx * size,
        y: offsetY + n.ny * size,
        scale: size / 460,
      };
    };

    const checkCaneComplete = () => {
      if (!sim.nodes.every((n) => n.lit)) return;
      const goal = Math.max(1, propsRef.current.targetScore);

      for (const n of sim.nodes) {
        const p = getNodePixel(n);
        spawnSparkles(p.x, p.y, true, 8);
      }

      if (sim.score >= goal) {
        return;
      }

      // Bonus point for finishing the full candy cane (clamped to targetScore)
      sim.score = Math.min(goal, sim.score + 1);
      propsRef.current.onSfx?.('star');
      reportScoreThrottled(sim.score, true);

      if (sim.score >= goal) {
        return;
      }

      sim.bannerText = sim.isGoldenCane ? '✨ GOLDEN CANE COMPLETE! +1 ✨' : '🌟 GOLDEN BONUS CANE! 🌟';
      sim.bannerTimer = 1.1;

      if (sim.respawnTimer !== null) {
        window.clearTimeout(sim.respawnTimer);
      }
      sim.respawnTimer = window.setTimeout(() => {
        sim.respawnTimer = null;
        if (!propsRef.current.isPlaying || sim.score >= Math.max(1, propsRef.current.targetScore)) {
          return;
        }
        sim.isGoldenCane = true;
        sim.caneNumber += 1;
        setCaneLevel(sim.caneNumber);
        sim.nodes = buildCandyCaneNodes(
          propsRef.current.isKid ? 6 : 8,
          sim.caneNumber % 2 === 0,
        );
      }, 420);
    };

    const lightNode = (node: TraceNode) => {
      const goal = Math.max(1, propsRef.current.targetScore);
      if (node.lit || sim.score >= goal) return;
      node.lit = true;
      node.popAnim = 1;
      const p = getNodePixel(node);
      spawnSparkles(p.x, p.y, sim.isGoldenCane, 12);
      sim.score = Math.min(goal, sim.score + 1);
      propsRef.current.onSfx?.('sparkle');
      reportScoreThrottled(sim.score, sim.score >= goal);
      setLiveAnnouncement(`Lit candy cane dot! Score ${sim.score}`);
      checkCaneComplete();
    };

    const testTouchSegment = (x1: number, y1: number, x2: number, y2: number) => {
      if (!propsRef.current.isPlaying) return;
      const hitRadius = propsRef.current.isKid
        ? Math.max(58, Math.min(82, sim.width * 0.1))
        : Math.max(44, Math.min(64, sim.width * 0.075));

      for (const node of sim.nodes) {
        if (node.lit) continue;
        const p = getNodePixel(node);
        if (distToSegment(p.x, p.y, x1, y1, x2, y2) <= hitRadius) {
          lightNode(node);
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      sim.activePointerId = e.pointerId;
      sim.prevPointer = { x, y };
      sim.trail.push({ x, y, life: 0 });
      testTouchSegment(x, y, x, y);

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture unavailable
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (sim.activePointerId !== e.pointerId) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const prev = sim.prevPointer ?? { x, y };
      sim.trail.push({ x, y, life: 0 });
      testTouchSegment(prev.x, prev.y, x, y);
      sim.prevPointer = { x, y };
    };

    const clearPointer = (e: PointerEvent) => {
      if (sim.activePointerId === e.pointerId) {
        sim.activePointerId = null;
        sim.prevPointer = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        const nextUnlit = sim.nodes.find((n) => !n.lit);
        if (nextUnlit) lightNode(nextUnlit);
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', clearPointer);
    canvas.addEventListener('pointercancel', clearPointer);
    canvas.addEventListener('lostpointercapture', clearPointer);
    window.addEventListener('keydown', handleKeyDown);

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const nowSec = now / 1000;
      const w = sim.width;
      const h = sim.height;

      for (const n of sim.nodes) {
        n.popAnim = Math.max(0, n.popAnim - dt * 3.5);
      }
      sim.bannerTimer = Math.max(0, sim.bannerTimer - dt);

      for (let i = sim.trail.length - 1; i >= 0; i--) {
        sim.trail[i].life += dt;
        if (sim.trail[i].life > 0.35) sim.trail.splice(i, 1);
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
        s.vy += 260 * dt;
      }

      // --- DRAW ---
      const bg = ctx.createLinearGradient(0, 0, w, h);
      if (sim.isGoldenCane) {
        bg.addColorStop(0, '#fff4cc');
        bg.addColorStop(0.5, '#ffe5f1');
        bg.addColorStop(1, '#dcf7ff');
      } else {
        bg.addColorStop(0, '#e3f4ff');
        bg.addColorStop(0.5, '#fff0f6');
        bg.addColorStop(1, '#e8fdf2');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Compute pixel path for candy cane body
      const pixelPts = sim.nodes.map(getNodePixel);
      const scale = pixelPts[0]?.scale ?? 1;
      const caneThickness = Math.max(36, 48 * scale);

      if (pixelPts.length >= 2) {
        const traceSmoothPath = () => {
          ctx.beginPath();
          ctx.moveTo(pixelPts[0].x, pixelPts[0].y);
          for (let i = 1; i < pixelPts.length - 1; i++) {
            const xc = (pixelPts[i].x + pixelPts[i + 1].x) * 0.5;
            const yc = (pixelPts[i].y + pixelPts[i + 1].y) * 0.5;
            ctx.quadraticCurveTo(pixelPts[i].x, pixelPts[i].y, xc, yc);
          }
          const last = pixelPts[pixelPts.length - 1];
          ctx.lineTo(last.x, last.y);
        };

        // Soft candy cane outer glow
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        traceSmoothPath();
        ctx.lineWidth = caneThickness + 16;
        ctx.strokeStyle = sim.isGoldenCane
          ? 'rgba(255, 191, 46, 0.42)'
          : 'rgba(255, 94, 153, 0.28)';
        ctx.stroke();

        // White sugar coat base
        traceSmoothPath();
        ctx.lineWidth = caneThickness;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Candy stripes dashed along path
        traceSmoothPath();
        ctx.lineWidth = caneThickness - 6;
        ctx.setLineDash([18 * scale, 18 * scale]);
        ctx.strokeStyle = sim.isGoldenCane ? '#ffbf2e' : '#ff4d6d';
        ctx.stroke();
        ctx.setLineDash([]);

        // Lit glowing segments overlay
        let lastLitEnd = -1;
        for (let i = 0; i < sim.nodes.length; i++) {
          if (sim.nodes[i].lit) lastLitEnd = i;
        }
        if (lastLitEnd >= 1) {
          ctx.beginPath();
          ctx.moveTo(pixelPts[0].x, pixelPts[0].y);
          for (let i = 1; i <= lastLitEnd; i++) {
            ctx.lineTo(pixelPts[i].x, pixelPts[i].y);
          }
          ctx.lineWidth = caneThickness * 0.34;
          ctx.strokeStyle = sim.isGoldenCane
            ? 'rgba(255, 240, 120, 0.92)'
            : 'rgba(91, 231, 196, 0.85)';
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw glowing trace dots along the candy cane
      const firstUnlitIdx = sim.nodes.findIndex((n) => !n.lit);
      for (let i = 0; i < sim.nodes.length; i++) {
        const node = sim.nodes[i];
        const p = pixelPts[i];
        const isNextGuide = i === firstUnlitIdx;
        const baseR = (propsRef.current.isKid ? 24 : 20) * Math.max(0.82, Math.min(1.25, scale));
        const pulseR = isNextGuide
          ? baseR * (1.12 + Math.sin(nowSec * 5.5) * 0.14)
          : baseR * (1 + node.popAnim * 0.38);

        ctx.save();
        ctx.translate(p.x, p.y);

        // Halo ring on next recommended dot
        if (isNextGuide && propsRef.current.isPlaying) {
          ctx.beginPath();
          ctx.arc(0, 0, pulseR + 10, 0, Math.PI * 2);
          ctx.strokeStyle = sim.isGoldenCane
            ? 'rgba(255, 191, 46, 0.75)'
            : 'rgba(255, 59, 92, 0.65)';
          ctx.lineWidth = 4;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
        if (node.lit) {
          ctx.fillStyle = sim.isGoldenCane ? '#ffbf2e' : '#2ecc71';
        } else {
          ctx.fillStyle = isNextGuide ? '#ffd43b' : '#ffffff';
        }
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = node.lit ? '#ffffff' : '#ff3b5c';
        ctx.stroke();

        // Star or sparkle icon inside dot
        ctx.fillStyle = node.lit ? '#ffffff' : '#ff3b5c';
        ctx.font = `800 ${Math.round(pulseR * 0.95)}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.lit ? '★' : '✦', 0, 1);

        ctx.restore();
      }

      // Rainbow frosting finger trail
      if (sim.trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < sim.trail.length; i++) {
          const prev = sim.trail[i - 1];
          const curr = sim.trail[i];
          if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 90) continue;
          const alpha = Math.max(0, 1 - curr.life / 0.35);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.lineWidth = 14 * alpha;
          ctx.strokeStyle = `hsla(${(i * 22 + nowSec * 120) % 360}, 95%, 62%, ${alpha * 0.85})`;
          ctx.stroke();
        }
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

      // Golden bonus cane celebration ribbon
      if (sim.bannerTimer > 0 && sim.bannerText) {
        const alpha = Math.min(1, sim.bannerTimer * 2);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 26px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(sim.bannerText, w * 0.5, 42);
        ctx.fillStyle = '#d98a00';
        ctx.fillText(sim.bannerText, w * 0.5, 42);
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
      if (sim.respawnTimer !== null) {
        window.clearTimeout(sim.respawnTimer);
        sim.respawnTimer = null;
      }
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', clearPointer);
      canvas.removeEventListener('pointercancel', clearPointer);
      canvas.removeEventListener('lostpointercapture', clearPointer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mg-playfield"
      aria-label="Trace the Candy Cane playfield. Slide your finger or tap along the glowing candy cane dots, or press Space."
    >
      <canvas ref={canvasRef} className="mg-canvas" tabIndex={0} />
      <div className="mg-sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>
      <div className="mg-hint-pill" aria-hidden="true">
        {caneLevel > 1
          ? `✨ Golden Bonus Cane #${caneLevel}! Trace the stars!`
          : '🍬 Slide your finger along the glowing stars!'}
      </div>
    </div>
  );
}

export default TraceCandyCane;
