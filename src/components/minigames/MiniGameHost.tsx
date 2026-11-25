import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MiniGameSession, MiniGameType } from '../../types/game';
import { soundEngine } from '../../audio/soundEngine';
import { useToddlerTap } from '../../utils/toddlerTap';
import { fireCelebration } from '../CelebrationEffects';
import { CatchGumdrops } from './CatchGumdrops';
import { ShakePeppermintTree } from './ShakePeppermintTree';
import { TraceCandyCane } from './TraceCandyCane';
import { PopLollipopBubbles } from './PopLollipopBubbles';
import './MiniGameHost.css';

export interface MiniGameHostProps {
  session: MiniGameSession;
  /** Throttled (~100ms) live score callback so TV animates scores in real time */
  onScoreChange: (score: number, progress: number) => void;
  /** Fired once after the 10-second game and result banner conclude */
  onComplete: (won: boolean, finalScore: number) => void;
  /** Render inside a native top-layer modal <dialog> (default: true) */
  modal?: boolean;
}

type HostPhase = 'confirm' | 'ready' | 'go' | 'playing' | 'result';

interface MiniGameMeta {
  emoji: string;
  headline: string;
  kidInstruction: string;
  adultInstruction: string;
  accent: string;
}

const MINI_GAME_INSTRUCTIONS: Record<MiniGameType, MiniGameMeta> = {
  'catch-gumdrops': {
    emoji: '🍬',
    headline: 'Catch the Gumdrops!',
    kidInstruction: 'Slide the candy basket OR tap the falling gumdrops!',
    adultInstruction: 'Drag the basket (or tap gumdrops) to rack up sweet catches!',
    accent: '#ff5e99',
  },
  'shake-peppermint': {
    emoji: '🌳',
    headline: 'Shake the Peppermint Tree!',
    kidInstruction: 'Tap the tree super fast (or shake the tablet) to drop peppermints!',
    adultInstruction: 'Tap rapidly on the canopy or shake the tablet to fill the bucket!',
    accent: '#ff3b5c',
  },
  'trace-candy-cane': {
    emoji: '🍭',
    headline: 'Trace the Candy Cane!',
    kidInstruction: 'Slide your finger along all the glowing candy cane stars!',
    adultInstruction: 'Trace every glowing star along the candy cane — unlock Golden Bonus Canes!',
    accent: '#2ecc71',
  },
  'pop-lollipop': {
    emoji: '🫧',
    headline: 'Pop the Lollipop Bubbles!',
    kidInstruction: 'Tap and swipe the floating lollipop bubbles to POP them!',
    adultInstruction: 'Pop floating iridescent lollipop bubbles — rainbow bubbles score +2!',
    accent: '#9b51e0',
  },
};

export function MiniGameHost({
  session,
  onScoreChange,
  onComplete,
  modal = true,
}: MiniGameHostProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const durationMs = Math.max(3, session.durationSeconds || 10) * 1000;
  const targetScore = Math.max(1, session.targetScore || (session.isKid ? 6 : 10));

  const [hostPhase, setHostPhase] = useState<HostPhase>('confirm');
  const [countdownLabel, setCountdownLabel] = useState<'SET...' | 'GO!'>('SET...');
  const [timeLeftMs, setTimeLeftMs] = useState<number>(durationMs);
  const [score, setScore] = useState<number>(0);
  const [portraitFailed, setPortraitFailed] = useState<boolean>(false);

  const scoreRef = useRef(0);
  const completedRef = useRef(false);
  const startTriggeredRef = useRef(false);
  const hostPhaseRef = useRef<HostPhase>('confirm');
  const countdownTimersRef = useRef<number[]>([]);
  const lastSyncRef = useRef(0);
  const onScoreChangeRef = useRef(onScoreChange);
  const onCompleteRef = useRef(onComplete);

  hostPhaseRef.current = hostPhase;
  onScoreChangeRef.current = onScoreChange;
  onCompleteRef.current = onComplete;

  const clearCountdownTimers = useCallback(() => {
    for (const id of countdownTimersRef.current) {
      window.clearTimeout(id);
    }
    countdownTimersRef.current = [];
  }, []);

  // Open native modal <dialog> cleanly (per modern-web-guidance `dialog` guide)
  useEffect(() => {
    if (!modal) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Fallback if already open in edge environments
      }
    }

    const preventDismiss = (e: Event) => {
      e.preventDefault();
    };
    dialog.addEventListener('cancel', preventDismiss);

    return () => {
      dialog.removeEventListener('cancel', preventDismiss);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [modal, session.id]);

  // Reset per new mini-game session and stay patiently in 'confirm' until user taps Ready!
  useEffect(() => {
    clearCountdownTimers();
    scoreRef.current = 0;
    completedRef.current = false;
    startTriggeredRef.current = false;
    hostPhaseRef.current = 'confirm';
    lastSyncRef.current = 0;
    setScore(0);
    setTimeLeftMs(durationMs);
    setHostPhase('confirm');
    setCountdownLabel('SET...');
    setPortraitFailed(false);

    return () => {
      clearCountdownTimers();
    };
  }, [session.id, durationMs, clearCountdownTimers]);

  // Triggered only after the player/parent explicitly taps "I'M READY! START! ▶"
  const handleConfirmReady = useCallback(() => {
    if (startTriggeredRef.current) return;
    startTriggeredRef.current = true;

    clearCountdownTimers();
    soundEngine.playButtonTap();
    hostPhaseRef.current = 'ready';
    setCountdownLabel('SET...');
    setHostPhase('ready');

    const tGo = window.setTimeout(() => {
      hostPhaseRef.current = 'go';
      setCountdownLabel('GO!');
      setHostPhase('go');
      soundEngine.playStarChime();
    }, 650);

    const tPlay = window.setTimeout(() => {
      hostPhaseRef.current = 'playing';
      setHostPhase('playing');
      // Immediately flip remote TV session status to 'playing' so both 10s timers start together
      onScoreChangeRef.current(0, 0);
    }, 1300);

    countdownTimersRef.current = [tGo, tPlay];
  }, [clearCountdownTimers]);

  // Authoritative 10-second play countdown
  useEffect(() => {
    if (hostPhase !== 'playing') return;

    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        setHostPhase('result');
        return;
      }
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [hostPhase, durationMs]);

  const finishNow = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const finalScore = Math.min(targetScore, Math.max(0, scoreRef.current));
    const won = finalScore >= targetScore;
    onCompleteRef.current(won, finalScore);
  }, [targetScore]);

  const readyTapProps = useToddlerTap(handleConfirmReady, hostPhase !== 'confirm');
  const continueTapProps = useToddlerTap(finishNow, hostPhase !== 'result');

  // Result banner celebration + relaxed auto-advance after 3.4s (still tappable anytime)
  useEffect(() => {
    if (hostPhase !== 'result') return;

    const finalScore = Math.min(targetScore, Math.max(0, scoreRef.current));
    const won = finalScore >= targetScore;
    const finalProgress = Math.min(1, finalScore / targetScore);

    // Flush final clamped score to TV
    onScoreChangeRef.current(finalScore, finalProgress);

    let cleanupConfetti: (() => void) | undefined;
    if (won) {
      soundEngine.playVictoryFanfare();
      cleanupConfetti = fireCelebration('minigame-win', {
        canvas: confettiCanvasRef.current,
      });
    } else {
      soundEngine.playStarChime();
    }

    const doneTimer = window.setTimeout(() => {
      finishNow();
    }, 3400);

    return () => {
      window.clearTimeout(doneTimer);
      cleanupConfetti?.();
    };
  }, [hostPhase, targetScore, finishNow]);

  const handleGameScoreChange = useCallback(
    (nextScore: number, progress: number) => {
      // Only accept score updates during active gameplay (ignore confirm/ready/go and post-win result)
      if (hostPhaseRef.current !== 'playing') {
        return;
      }

      const clampedScore = Math.min(targetScore, Math.max(0, nextScore));

      // Instant win: stop the clock and celebrate the moment targetScore is reached!
      if (clampedScore >= targetScore) {
        scoreRef.current = targetScore;
        setScore(targetScore);
        lastSyncRef.current = performance.now();
        hostPhaseRef.current = 'result';
        onScoreChangeRef.current(targetScore, 1);
        setHostPhase('result');
        return;
      }

      scoreRef.current = clampedScore;
      setScore(clampedScore);

      const now = performance.now();
      if (now - lastSyncRef.current >= 95) {
        lastSyncRef.current = now;
        onScoreChangeRef.current(clampedScore, Math.max(0, Math.min(1, progress)));
      }
    },
    [targetScore],
  );

  const handleSfx = useCallback(
    (sfx: 'catch' | 'shake' | 'sparkle' | 'pop' | 'star') => {
      const progress = Math.min(1, scoreRef.current / targetScore);
      switch (sfx) {
        case 'catch':
          soundEngine.playGumdropCatch();
          break;
        case 'shake':
          soundEngine.playTreeShake();
          break;
        case 'sparkle':
          soundEngine.playTraceSparkle(progress);
          break;
        case 'pop':
          soundEngine.playBubblePop();
          break;
        case 'star':
          soundEngine.playStarChime();
          break;
      }
    },
    [targetScore],
  );

  const meta = MINI_GAME_INSTRUCTIONS[session.type];
  const progress = Math.min(1, score / targetScore);
  const timeFraction = Math.max(0, Math.min(1, timeLeftMs / durationMs));
  const secondsDisplay = Math.ceil(timeLeftMs / 1000);
  const won = score >= targetScore;
  const bonusSpaces = won ? session.bonusSpacesOnWin : session.bonusSpacesOnTry;

  const content = (
    <div
      className="mg-host-shell"
      style={{ '--player-accent': session.playerColor || meta.accent } as React.CSSProperties}
    >
      {/* Top-layer confetti canvas so bursts render ON TOP of the modal <dialog> */}
      <canvas ref={confettiCanvasRef} className="mg-confetti-canvas" aria-hidden="true" />

      {/* Top HUD Header */}
      <header className="mg-hud">
        <div className="mg-player-chip">
          <div className="mg-avatar-ring">
            {!portraitFailed && session.playerPortraitUrl ? (
              <img
                src={session.playerPortraitUrl}
                alt={session.playerName}
                className="mg-avatar-img"
                onError={() => setPortraitFailed(true)}
              />
            ) : (
              <span className="mg-avatar-fallback" aria-hidden="true">
                {session.playerName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="mg-player-meta">
            <h1 id={titleId} className="mg-title">
              <span aria-hidden="true">{meta.emoji}</span> {session.title || meta.headline}
            </h1>
            <p className="mg-player-sub">
              {session.playerName}&apos;s Star Challenge
              {session.isKid ? ' · Kid Goal' : ''}
            </p>
          </div>
        </div>

        {/* Live Score + Goal Progress */}
        <div className="mg-score-panel" aria-live="polite">
          <div className="mg-score-numbers">
            <span className="mg-score-current">{score}</span>
            <span className="mg-score-divider">/</span>
            <span className="mg-score-goal">
              {targetScore} <span aria-hidden="true">⭐</span>
            </span>
          </div>
          <div
            className="mg-progress-track"
            role="progressbar"
            aria-label="Mini-game star progress"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={targetScore}
          >
            <div
              className={`mg-progress-fill ${won ? 'is-won' : ''}`}
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
        </div>

        {/* Countdown Timer Pill */}
        <div
          className={`mg-timer-pill ${secondsDisplay <= 3 && hostPhase === 'playing' ? 'is-urgent' : ''}`}
          aria-label={`${secondsDisplay} seconds remaining`}
        >
          <span className="mg-timer-num">{secondsDisplay}s</span>
        </div>
      </header>

      {/* Clear 10-Second Candy Countdown Bar */}
      <div className="mg-timebar-track" aria-hidden="true">
        <div
          className={`mg-timebar-fill ${secondsDisplay <= 3 && hostPhase === 'playing' ? 'is-urgent' : ''}`}
          style={{ transform: `scaleX(${timeFraction})` }}
        />
      </div>

      {/* Main Interactive Touch Playfield */}
      <div className="mg-stage">
        {session.type === 'catch-gumdrops' && (
          <CatchGumdrops
            isKid={session.isKid}
            targetScore={targetScore}
            durationSeconds={session.durationSeconds}
            isPlaying={hostPhase === 'playing'}
            playerColor={session.playerColor}
            onScoreChange={handleGameScoreChange}
            onSfx={handleSfx}
          />
        )}
        {session.type === 'shake-peppermint' && (
          <ShakePeppermintTree
            isKid={session.isKid}
            targetScore={targetScore}
            durationSeconds={session.durationSeconds}
            isPlaying={hostPhase === 'playing'}
            playerColor={session.playerColor}
            onScoreChange={handleGameScoreChange}
            onSfx={handleSfx}
          />
        )}
        {session.type === 'trace-candy-cane' && (
          <TraceCandyCane
            isKid={session.isKid}
            targetScore={targetScore}
            durationSeconds={session.durationSeconds}
            isPlaying={hostPhase === 'playing'}
            playerColor={session.playerColor}
            onScoreChange={handleGameScoreChange}
            onSfx={handleSfx}
          />
        )}
        {session.type === 'pop-lollipop' && (
          <PopLollipopBubbles
            isKid={session.isKid}
            targetScore={targetScore}
            durationSeconds={session.durationSeconds}
            isPlaying={hostPhase === 'playing'}
            playerColor={session.playerColor}
            onScoreChange={handleGameScoreChange}
            onSfx={handleSfx}
          />
        )}

        {/* Patient Pass-the-Tablet Ready Gate + Snappy "SET... GO!" Countdown */}
        {(hostPhase === 'confirm' || hostPhase === 'ready' || hostPhase === 'go') && (
          <div className="mg-intro-overlay" role="status" aria-live="assertive">
            <div className="mg-intro-card">
              <div className="mg-intro-hero">
                {!portraitFailed && session.playerPortraitUrl ? (
                  <img
                    src={session.playerPortraitUrl}
                    alt={session.playerName}
                    className="mg-intro-portrait"
                    onError={() => setPortraitFailed(true)}
                  />
                ) : (
                  <div className="mg-intro-emoji" aria-hidden="true">
                    {meta.emoji}
                  </div>
                )}
                <span className="mg-intro-badge-icon" aria-hidden="true">
                  {meta.emoji}
                </span>
              </div>
              <p className="mg-intro-player">
                {hostPhase === 'confirm'
                  ? `Pass the tablet to ${session.playerName}!`
                  : `${session.playerName}'s Turn!`}
              </p>
              <h2 className="mg-intro-title">{session.title || meta.headline}</h2>
              <p className="mg-intro-instructions">
                {session.isKid ? meta.kidInstruction : meta.adultInstruction}
              </p>

              {hostPhase === 'confirm' ? (
                <>
                  <div className="mg-intro-goal-pill">
                    Goal: <strong>{targetScore} ⭐</strong> in {session.durationSeconds || 10}s for{' '}
                    <strong>+{session.bonusSpacesOnWin} Bonus Spaces!</strong>
                  </div>
                  <button
                    type="button"
                    className="mg-ready-start-btn"
                    {...readyTapProps}
                    autoFocus
                  >
                    I&apos;M READY! START! ▶
                  </button>
                </>
              ) : (
                <div className={`mg-countdown-badge ${hostPhase === 'go' ? 'is-go' : ''}`}>
                  {countdownLabel}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Result Celebration Banner */}
        {hostPhase === 'result' && (
          <div className="mg-result-overlay" role="status" aria-live="assertive">
            <div className={`mg-result-card ${won ? 'is-win' : 'is-try'}`}>
              <div className="mg-result-emoji" aria-hidden="true">
                {won ? '🏆✨' : '🍬💖'}
              </div>
              <h2 className="mg-result-headline">
                {won
                  ? `YOU WON! +${bonusSpaces} BONUS SPACES!`
                  : `GREAT TRY! +${bonusSpaces} SWEET ${bonusSpaces === 1 ? 'SPACE' : 'SPACES'}!`}
              </h2>
              <p className="mg-result-score">
                {session.playerName} scored <strong>{score}</strong> {score === 1 ? 'point' : 'points'}!
              </p>
              <button
                type="button"
                className="mg-continue-btn"
                {...continueTapProps}
                autoFocus
              >
                Hop Forward! +{bonusSpaces} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!modal) {
    return <section className="mg-inline-root" aria-labelledby={titleId}>{content}</section>;
  }

  return (
    <dialog
      ref={dialogRef}
      className="mg-host-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'none' } as Record<string, string>)}
    >
      {content}
    </dialog>
  );
}

export default MiniGameHost;
