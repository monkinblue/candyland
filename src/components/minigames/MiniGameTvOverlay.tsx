import { useEffect, useRef, useState } from 'react';
import type { MiniGameSession, MiniGameType } from '../../types/game';
import { fireCelebration } from '../CelebrationEffects';
import './MiniGameTvOverlay.css';

export interface MiniGameTvOverlayProps {
  session: MiniGameSession;
}

const TV_GAME_BADGE: Record<MiniGameType, { emoji: string; verb: string }> = {
  'catch-gumdrops': { emoji: '🍬', verb: 'Catching sparkling gumdrops!' },
  'shake-peppermint': { emoji: '🌳', verb: 'Shaking the peppermint tree!' },
  'trace-candy-cane': { emoji: '🍭', verb: 'Tracing the giant candy cane!' },
  'pop-lollipop': { emoji: '🫧', verb: 'Popping lollipop bubbles!' },
};

const RING_RADIUS = 64;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function MiniGameTvOverlay({ session }: MiniGameTvOverlayProps) {
  const durationSec = Math.max(3, session.durationSeconds || 10);
  const targetScore = Math.max(1, session.targetScore || (session.isKid ? 6 : 10));
  const progress = Math.max(0, Math.min(1, session.progress || session.score / targetScore));
  const hasReachedGoal = session.won === true || session.score >= targetScore;

  const [secondsRemaining, setSecondsRemaining] = useState<number>(durationSec);
  const [scoreBumpKey, setScoreBumpKey] = useState<number>(0);
  const [portraitFailed, setPortraitFailed] = useState<boolean>(false);

  const playStartedAtRef = useRef<number | null>(null);
  const prevScoreRef = useRef<number>(session.score);
  const celebratedGoalRef = useRef<boolean>(false);

  // Reset per mini-game session
  useEffect(() => {
    playStartedAtRef.current = null;
    prevScoreRef.current = 0;
    celebratedGoalRef.current = false;
    setSecondsRemaining(durationSec);
    setPortraitFailed(false);
  }, [session.id, durationSec]);

  // Animate bouncy score counter every time live score increments
  useEffect(() => {
    if (session.score !== prevScoreRef.current) {
      prevScoreRef.current = session.score;
      setScoreBumpKey((k) => k + 1);
    }
  }, [session.score]);

  // Trigger celebratory star confetti on TV the moment player crosses target goal!
  useEffect(() => {
    if (hasReachedGoal && !celebratedGoalRef.current) {
      celebratedGoalRef.current = true;
      return fireCelebration('minigame-win');
    }
    return undefined;
  }, [hasReachedGoal]);

  // Live SVG countdown ring synchronized when tablet flips status to 'playing'
  useEffect(() => {
    if (session.status === 'ready') {
      setSecondsRemaining(durationSec);
      playStartedAtRef.current = null;
      return undefined;
    }

    if (session.status === 'finished') {
      setSecondsRemaining(0);
      return undefined;
    }

    if (playStartedAtRef.current === null) {
      playStartedAtRef.current = performance.now();
    }

    let rafId = 0;
    const tick = (now: number) => {
      const start = playStartedAtRef.current ?? now;
      const elapsedSec = (now - start) / 1000;
      const rem = Math.max(0, durationSec - elapsedSec);
      setSecondsRemaining(rem);
      if (rem > 0) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [session.status, durationSec]);

  const badge = TV_GAME_BADGE[session.type];
  const timeFraction = Math.max(0, Math.min(1, secondsRemaining / durationSec));
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - timeFraction);
  const displaySec = Math.ceil(secondsRemaining);
  const isUrgent = session.status === 'playing' && displaySec <= 3 && displaySec > 0;

  return (
    <aside
      className="mgtv-backdrop"
      aria-label={`${session.playerName} playing ${session.title}`}
      style={{ '--player-accent': session.playerColor || '#ff5e99' } as React.CSSProperties}
    >
      <div className={`mgtv-card ${hasReachedGoal ? 'is-goal-reached' : ''}`}>
        {/* Top Ribbon */}
        <div className="mgtv-ribbon">
          <span className="mgtv-ribbon-star" aria-hidden="true">
            ⭐
          </span>
          <span>STAR MINI-GAME LIVE!</span>
          <span className="mgtv-ribbon-star" aria-hidden="true">
            ⭐
          </span>
        </div>

        {/* Center Main Grid */}
        <div className="mgtv-main">
          {/* Left: Player Portrait & Game Title */}
          <div className="mgtv-player-col">
            <div className="mgtv-portrait-frame">
              {!portraitFailed && session.playerPortraitUrl ? (
                <img
                  src={session.playerPortraitUrl}
                  alt={session.playerName}
                  className="mgtv-portrait-img"
                  onError={() => setPortraitFailed(true)}
                />
              ) : (
                <span className="mgtv-portrait-fallback" aria-hidden="true">
                  {session.playerName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="mgtv-game-emoji" aria-hidden="true">
                {badge.emoji}
              </span>
            </div>

            <div className="mgtv-player-info">
              <p className="mgtv-player-name">{session.playerName}</p>
              <h2 className="mgtv-game-title">{session.title}</h2>
              <p className="mgtv-game-subtitle">{badge.verb}</p>
            </div>
          </div>

          {/* Middle: Giant Animated Live Score Counter */}
          <div className="mgtv-score-col" aria-live="polite">
            <span className="mgtv-score-label">LIVE SCORE</span>
            <div key={scoreBumpKey} className="mgtv-score-value">
              {session.score}
            </div>
            <div className="mgtv-goal-pill">
              Goal: <strong>{targetScore}</strong> ⭐
            </div>
          </div>

          {/* Right: Live Countdown Ring */}
          <div className={`mgtv-timer-col ${isUrgent ? 'is-urgent' : ''}`}>
            <svg className="mgtv-ring-svg" viewBox="0 0 156 156" aria-hidden="true">
              <circle className="mgtv-ring-bg" cx="78" cy="78" r={RING_RADIUS} />
              <circle
                className="mgtv-ring-fg"
                cx="78"
                cy="78"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="mgtv-ring-center">
              {session.status === 'ready' ? (
                <span className="mgtv-ring-ready">GET READY!</span>
              ) : (
                <>
                  <span className="mgtv-ring-sec">{displaySec}</span>
                  <span className="mgtv-ring-unit">SEC</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bouncy Progress Meter Racing Toward the Win Star */}
        <div className="mgtv-meter-section">
          <div className="mgtv-meter-track">
            <div
              className={`mgtv-meter-fill ${hasReachedGoal ? 'is-won' : ''}`}
              style={{ transform: `scaleX(${Math.max(0.03, progress)})` }}
            />
            <div
              className="mgtv-meter-runner-lane"
              style={{ transform: `translateX(${Math.min(100, progress * 100)}%)` }}
              aria-hidden="true"
            >
              <div className="mgtv-meter-runner">{badge.emoji}</div>
            </div>
          </div>

          <div
            className={`mgtv-win-star ${hasReachedGoal ? 'is-lit' : ''}`}
            aria-label={hasReachedGoal ? 'Win star reached!' : 'Win star goal'}
          >
            <span className="mgtv-win-star-icon" aria-hidden="true">
              ⭐
            </span>
            <span className="mgtv-win-star-bonus">+{session.bonusSpacesOnWin}</span>
          </div>
        </div>

        {/* Celebratory Burst Banner When Player Crosses the Win Star */}
        {hasReachedGoal ? (
          <div className="mgtv-win-banner" role="status" aria-live="assertive">
            🎉 WOOHOO {session.playerName.toUpperCase()}! +{session.bonusSpacesOnWin} BONUS SPACES UNLOCKED! 🎉
          </div>
        ) : (
          <p className="mgtv-cheer-footer">
            {session.status === 'ready'
              ? `Look at the tablet, ${session.playerName} — get your fingers ready!`
              : `Cheer for ${session.playerName}! Reach ${targetScore} stars for +${session.bonusSpacesOnWin} bonus spaces!`}
          </p>
        )}
      </div>
    </aside>
  );
}

export default MiniGameTvOverlay;
