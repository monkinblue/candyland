import { useEffect, useRef, useState } from 'react';

export interface ShakePeppermintTreeProps {
  isKid: boolean;
  targetScore: number;
  durationSeconds?: number;
  isPlaying: boolean;
  playerColor?: string;
  onScoreChange: (score: number, progress: number) => void;
  onSfx?: (sfx: 'shake' | 'star') => void;
}

interface FallingPeppermint {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  radius: number;
  isGolden: boolean;
  scored: boolean;
}

interface LeafParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingPop {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}

interface CanopyMint {
  rx: number; // relative to canopy center (-1..1)
  ry: number;
  scale: number;
}

const CANOPY_MINTS: CanopyMint[] = [
  { rx: -0.58, ry: -0.1, scale: 0.9 },
  { rx: -0.25, ry: -0.45, scale: 1.05 },
  { rx: 0.18, ry: -0.5, scale: 0.95 },
  { rx: 0.56, ry: -0.15, scale: 1.0 },
  { rx: -0.35, ry: 0.25, scale: 0.95 },
  { rx: 0.04, ry: -0.04, scale: 1.1 },
  { rx: 0.4, ry: 0.24, scale: 0.9 },
];

export function ShakePeppermintTree({
  isKid,
  targetScore,
  isPlaying,
  playerColor = '#ff3b5c',
  onScoreChange,
  onSfx,
}: ShakePeppermintTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const propsRef = useRef({ isKid, targetScore, isPlaying, playerColor, onScoreChange, onSfx });
  propsRef.current = { isKid, targetScore, isPlaying, playerColor, onScoreChange, onSfx };

  const simRef = useRef({
    width: 800,
    height: 500,
    treeAngle: 0,
    treeVel: 0,
    treeScalePulse: 0,
    bucketPulse: 0,
    lastShakeAt: 0,
    lastAccelShakeAt: 0,
    shakeDirection: 1,
    falling: [] as FallingPeppermint[],
    particles: [] as LeafParticle[],
    pops: [] as FloatingPop[],
    caughtCount: 0,
    score: 0,
    nextId: 1,
    lastReportedScore: -1,
    lastReportTime: 0,
    pendingFlushTimer: null as number | null,
  });

  useEffect(() => {
    const sim = simRef.current;
    if (isPlaying) {
      sim.falling = [];
      sim.particles = [];
      sim.pops = [];
      sim.caughtCount = 0;
      sim.score = 0;
      sim.treeAngle = 0;
      sim.treeVel = 0;
      sim.treeScalePulse = 0;
      sim.bucketPulse = 0;
      sim.lastShakeAt = 0;
      sim.lastReportedScore = 0;
      sim.lastReportTime = performance.now();
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

    const triggerShake = (tapX?: number, tapY?: number) => {
      if (!propsRef.current.isPlaying) return;
      const now = performance.now();
      const minGap = propsRef.current.isKid ? 95 : 115;
      if (now - sim.lastShakeAt < minGap) return;
      sim.lastShakeAt = now;

      sim.shakeDirection *= -1;
      sim.treeVel += sim.shakeDirection * 6.8;
      sim.treeScalePulse = 1;

      const w = sim.width;
      const h = sim.height;
      const canopyX = w * 0.5;
      const canopyY = h * 0.34;
      const canopyR = Math.min(w * 0.34, h * 0.29);

      const spawnX =
        tapX !== undefined
          ? Math.max(canopyX - canopyR * 0.85, Math.min(canopyX + canopyR * 0.85, tapX))
          : canopyX + (Math.random() - 0.5) * canopyR * 1.4;
      const spawnY =
        tapY !== undefined
          ? Math.max(canopyY - canopyR * 0.65, Math.min(canopyY + canopyR * 0.6, tapY))
          : canopyY + (Math.random() - 0.5) * canopyR * 0.7;

      // Drop 1 swirling peppermint (kids occasionally get a bonus double-drop!)
      const dropCount = propsRef.current.isKid && Math.random() < 0.25 ? 2 : 1;
      for (let i = 0; i < dropCount; i++) {
        const isGolden = Math.random() < 0.14;
        const startX = spawnX + (i === 1 ? (Math.random() > 0.5 ? 28 : -28) : 0);
        // Aim gently toward bucket center so peppermints always arc cleanly into bucket
        const bucketCenterX = w * 0.5;
        const vx = (bucketCenterX - startX) * 1.55 + (Math.random() - 0.5) * 40;
        sim.falling.push({
          id: sim.nextId++,
          x: startX,
          y: spawnY,
          vx,
          vy: -70 - Math.random() * 55,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 6),
          radius: propsRef.current.isKid ? 24 : 21,
          isGolden,
          scored: false,
        });
      }

      // Rustling sugar leaves & sparkles
      const leafColors = ['#5be7c4', '#ff5e99', '#ffffff', '#ffd43b'];
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 140;
        sim.particles.push({
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          rot: Math.random() * Math.PI,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.3,
          color: leafColors[i % leafColors.length],
          size: 5 + Math.random() * 5,
        });
      }

      propsRef.current.onSfx?.('shake');
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      triggerShake(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!propsRef.current.isPlaying) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        triggerShake();
      }
    };

    // Optional Pixel Tablet / mobile accelerometer shake support!
    let lastAcc: { x: number; y: number; z: number } | null = null;
    const handleDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity ?? e.acceleration;
      if (!acc || (acc.x == null && acc.y == null && acc.z == null)) return;
      setMotionAvailable(true);

      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      if (lastAcc) {
        const delta = Math.abs(x - lastAcc.x) + Math.abs(y - lastAcc.y) + Math.abs(z - lastAcc.z);
        const now = performance.now();
        if (delta > 15 && now - sim.lastAccelShakeAt > 180) {
          sim.lastAccelShakeAt = now;
          triggerShake();
        }
      }
      lastAcc = { x, y, z };
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleDeviceMotion);
    }

    const drawPeppermintSwirl = (x: number, y: number, r: number, rot: number, isGolden: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      // Wrapper twists on sides
      ctx.fillStyle = isGolden ? 'rgba(255, 212, 59, 0.78)' : 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(-r * 1.42, -r * 0.45);
      ctx.lineTo(-r * 1.42, r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.9, 0);
      ctx.lineTo(r * 1.42, -r * 0.45);
      ctx.lineTo(r * 1.42, r * 0.45);
      ctx.closePath();
      ctx.fill();

      // Candy disc
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = isGolden ? '#fff7cc' : '#ffffff';
      ctx.fill();

      // 6 pinwheel peppermint wedges
      ctx.save();
      ctx.clip();
      ctx.fillStyle = isGolden ? '#ffbf2e' : '#ff3b5c';
      for (let i = 0; i < 6; i++) {
        const a0 = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r * 1.1, a0, a0 + Math.PI / 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isGolden ? '#d98a00' : '#ff3b5c';
      ctx.stroke();

      // Gloss dot
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.28, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const w = sim.width;
      const h = sim.height;

      // Spring-damper physics for tree canopy wobble
      const stiffness = 140;
      const damping = 10.5;
      const accel = -stiffness * sim.treeAngle - damping * sim.treeVel;
      sim.treeVel += accel * dt;
      sim.treeAngle += sim.treeVel * dt;
      sim.treeAngle = Math.max(-0.32, Math.min(0.32, sim.treeAngle));
      sim.treeScalePulse = Math.max(0, sim.treeScalePulse - dt * 5);
      sim.bucketPulse = Math.max(0, sim.bucketPulse - dt * 5);

      const bucketY = h - 54;
      const bucketX = w * 0.5;

      // Update falling peppermints
      for (let i = sim.falling.length - 1; i >= 0; i--) {
        const m = sim.falling[i];
        m.vy += 880 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += m.vrot * dt;

        // Land in bucket!
        if (m.y >= bucketY - 22) {
          sim.falling.splice(i, 1);
          const pts = m.isGolden ? 2 : 1;
          sim.score += pts;
          sim.caughtCount += 1;
          sim.bucketPulse = 1;

          // Bucket splash sparkles
          for (let s = 0; s < 10; s++) {
            const ang = -Math.PI * Math.random();
            const spd = 80 + Math.random() * 140;
            sim.particles.push({
              x: bucketX + (Math.random() - 0.5) * 60,
              y: bucketY - 20,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 40,
              rot: 0,
              life: 0,
              maxLife: 0.45,
              color: m.isGolden ? '#ffd43b' : s % 2 === 0 ? '#ff3b5c' : '#5be7c4',
              size: 5 + Math.random() * 4,
            });
          }
          sim.pops.push({
            x: bucketX + (Math.random() - 0.5) * 60,
            y: bucketY - 40,
            life: 0,
            text: m.isGolden ? '+2 ⭐' : '+1!',
            color: m.isGolden ? '#d98a00' : '#ff3b5c',
          });

          if (m.isGolden) {
            propsRef.current.onSfx?.('star');
          }
          reportScoreThrottled(sim.score, sim.score === propsRef.current.targetScore);
          setLiveAnnouncement(`Peppermint caught! Score ${sim.score}`);
        }
      }

      // Particles
      for (let i = sim.particles.length - 1; i >= 0; i--) {
        const p = sim.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          sim.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.rot += 5 * dt;
      }

      // Pops
      for (let i = sim.pops.length - 1; i >= 0; i--) {
        const p = sim.pops[i];
        p.life += dt;
        if (p.life >= 0.7) {
          sim.pops.splice(i, 1);
          continue;
        }
        p.y -= 72 * dt;
      }

      // --- DRAW ---
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#dffbf3');
      bg.addColorStop(0.55, '#fff4fa');
      bg.addColorStop(1, '#ffd9ec');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Rolling mint hills
      ctx.fillStyle = '#9cf0d5';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.quadraticCurveTo(w * 0.25, h - 105, w * 0.55, h - 62);
      ctx.quadraticCurveTo(w * 0.85, h - 110, w, h - 52);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Tree pivot at trunk base
      const trunkBaseX = w * 0.5;
      const trunkBaseY = h - 72;
      const canopyR = Math.min(w * 0.3, h * 0.26);
      const canopyOffsetY = -(h * 0.42);

      ctx.save();
      ctx.translate(trunkBaseX, trunkBaseY);
      ctx.rotate(sim.treeAngle);
      const pulse = 1 + sim.treeScalePulse * 0.05;
      ctx.scale(pulse, 1 / pulse);

      // Candy-cane striped trunk
      const trunkW = Math.max(46, canopyR * 0.42);
      const trunkH = Math.abs(canopyOffsetY) + 18;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-trunkW * 0.5, -trunkH, trunkW, trunkH + 14, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#ff3b5c';
      for (let sy = -trunkH - trunkW; sy < 40; sy += 34) {
        ctx.beginPath();
        ctx.moveTo(-trunkW, sy);
        ctx.lineTo(trunkW, sy - 26);
        ctx.lineTo(trunkW, sy - 10);
        ctx.lineTo(-trunkW, sy + 16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c9183b';
      ctx.beginPath();
      ctx.roundRect(-trunkW * 0.5, -trunkH, trunkW, trunkH + 14, 16);
      ctx.stroke();

      // Fluffy cotton-candy + peppermint canopy puffs
      const puffs = [
        { x: -canopyR * 0.65, y: canopyOffsetY + canopyR * 0.14, r: canopyR * 0.56, c: '#ff7eb3' },
        { x: canopyR * 0.65, y: canopyOffsetY + canopyR * 0.14, r: canopyR * 0.56, c: '#ff7eb3' },
        { x: -canopyR * 0.35, y: canopyOffsetY - canopyR * 0.32, r: canopyR * 0.6, c: '#ff5e99' },
        { x: canopyR * 0.35, y: canopyOffsetY - canopyR * 0.32, r: canopyR * 0.6, c: '#ff5e99' },
        { x: 0, y: canopyOffsetY - canopyR * 0.46, r: canopyR * 0.62, c: '#ff8ec0' },
        { x: 0, y: canopyOffsetY + canopyR * 0.08, r: canopyR * 0.68, c: '#ff6ba6' },
      ];
      for (const puff of puffs) {
        ctx.beginPath();
        ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
        ctx.fillStyle = puff.c;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.stroke();
      }

      // Hanging peppermint candies on canopy
      for (let i = 0; i < CANOPY_MINTS.length; i++) {
        const cm = CANOPY_MINTS[i];
        drawPeppermintSwirl(
          cm.rx * canopyR * 1.15,
          canopyOffsetY + cm.ry * canopyR * 1.05,
          Math.max(15, canopyR * 0.17) * cm.scale,
          sim.treeAngle * 3 + i,
          i === 5,
        );
      }

      // Friendly tap target prompt right on canopy if no shakes yet
      if (propsRef.current.isPlaying && sim.score === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(-84, canopyOffsetY - 22, 168, 44, 22);
        ctx.fill();
        ctx.font = '800 22px Fredoka, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c9183b';
        ctx.fillText('TAP ME! 🍬', 0, canopyOffsetY + 1);
      }

      ctx.restore();

      // Falling peppermints
      for (const m of sim.falling) {
        drawPeppermintSwirl(m.x, m.y, m.radius, m.rot, m.isGolden);
      }

      // Golden Candy Bucket at bottom center
      ctx.save();
      ctx.translate(bucketX, bucketY);
      const bScaleX = 1 + sim.bucketPulse * 0.14;
      const bScaleY = 1 - sim.bucketPulse * 0.12;
      ctx.scale(bScaleX, bScaleY);

      const bw = Math.min(130, w * 0.22);
      const bh = 58;

      // Piled peppermints peeking out of the bucket!
      const visiblePile = Math.min(9, sim.caughtCount);
      for (let i = 0; i < visiblePile; i++) {
        const px = ((i % 5) - 2) * (bw * 0.28);
        const py = -bh * 0.44 - Math.floor(i / 5) * 14;
        drawPeppermintSwirl(px, py, 14, i * 0.7, i % 4 === 3);
      }

      // Bucket body
      ctx.beginPath();
      ctx.moveTo(-bw * 0.86, -bh * 0.36);
      ctx.lineTo(bw * 0.86, -bh * 0.36);
      ctx.lineTo(bw * 0.68, bh * 0.48);
      ctx.quadraticCurveTo(0, bh * 0.65, -bw * 0.68, bh * 0.48);
      ctx.closePath();
      const bGrad = ctx.createLinearGradient(0, -bh * 0.4, 0, bh * 0.6);
      bGrad.addColorStop(0, '#ffd43b');
      bGrad.addColorStop(1, '#f59f00');
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#9c5c00';
      ctx.stroke();

      // Rim
      ctx.beginPath();
      ctx.roundRect(-bw * 0.96, -bh * 0.5, bw * 1.92, 18, 9);
      ctx.fillStyle = '#fff3bf';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#9c5c00';
      ctx.stroke();
      ctx.restore();

      // Particles
      for (const p of sim.particles) {
        const alpha = 1 - p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Floating "+1!"
      for (const p of sim.pops) {
        const alpha = 1 - p.life / 0.7;
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
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        window.removeEventListener('devicemotion', handleDeviceMotion);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mg-playfield"
      aria-label="Shake the Peppermint Tree playfield. Tap rapidly anywhere on the tree, shake the tablet, or press Space to drop peppermints."
    >
      <canvas ref={canvasRef} className="mg-canvas" tabIndex={0} />
      <div className="mg-sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>
      <div className="mg-hint-pill" aria-hidden="true">
        {motionAvailable
          ? '🌳 Tap the tree fast OR shake the tablet!'
          : '🌳 Tap the peppermint tree super fast!'}
      </div>
    </div>
  );
}

export default ShakePeppermintTree;
