import { useEffect, useId, useRef, useState } from 'react';
import type { ActionCardSession } from '../types/game';
import { soundEngine } from '../audio/soundEngine';
import { useToddlerTap } from '../utils/toddlerTap';
import { fireCelebration } from './CelebrationEffects';
import './ActionCardOverlay.css';

export interface ActionCardOverlayProps {
  session: ActionCardSession;
  mode: 'tv' | 'tablet' | 'mirror';
  /** Called when parent/player confirms completion (true) or skips (false). */
  onResolve?: (completed: boolean) => void;
}

export function ActionCardOverlay({
  session,
  mode,
  onResolve,
}: ActionCardOverlayProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resolvedRef = useRef(false);
  const resolveTimerRef = useRef<number | null>(null);

  const [portraitFailed, setPortraitFailed] = useState(false);
  const [completing, setCompleting] = useState(false);

  const isInteractive = mode === 'tablet' || mode === 'mirror';
  const { card } = session;
  const bonusSpaces = Math.max(1, card.bonusSpaces || 1);

  // Reset per action card session and ring playful bell
  useEffect(() => {
    resolvedRef.current = false;
    if (resolveTimerRef.current !== null) {
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
    setPortraitFailed(false);
    setCompleting(false);
    soundEngine.playActionBell();
    return () => {
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };
  }, [session.id]);

  // Open native modal <dialog> for interactive tablet / mirror confirmation
  useEffect(() => {
    if (!isInteractive) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Ignore if already open
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
  }, [isInteractive, session.id]);

  const handleComplete = () => {
    if (resolvedRef.current || !onResolve) return;
    resolvedRef.current = true;
    setCompleting(true);
    soundEngine.playVictoryFanfare();
    fireCelebration('action-complete', {
      canvas: confettiCanvasRef.current,
    });
    // Short celebratory beat so kids see sparkles before transitioning to bonus hop
    resolveTimerRef.current = window.setTimeout(() => {
      resolveTimerRef.current = null;
      onResolve(true);
    }, 550);
  };

  const handleSkip = () => {
    if (resolvedRef.current || !onResolve) return;
    resolvedRef.current = true;
    soundEngine.playButtonTap();
    onResolve(false);
  };

  const completeTapProps = useToddlerTap(handleComplete, completing);

  const tierLabel = card.tier === 'kid' ? '🌟 KID ACTION CARD' : '🎭 FAMILY ACTION CARD';

  const cardBody = (
    <div
      className={`ac-card ac-mode-${mode} ${card.tier === 'kid' ? 'is-kid-tier' : 'is-adult-tier'}`}
      style={{ '--player-accent': session.playerColor || '#ff5e99' } as React.CSSProperties}
    >
      <canvas ref={confettiCanvasRef} className="ac-confetti-canvas" aria-hidden="true" />

      {/* Top Tier & Bonus Pill Row */}
      <div className="ac-header-row">
        <span className="ac-tier-pill">{tierLabel}</span>
        <span className="ac-bonus-pill">
          +{bonusSpaces} {bonusSpaces === 1 ? 'BONUS SPACE' : 'BONUS SPACES'}!
        </span>
      </div>

      {/* Player Portrait + Name */}
      <div className="ac-player-banner">
        <div className="ac-portrait-ring">
          {!portraitFailed && session.playerPortraitUrl ? (
            <img
              src={session.playerPortraitUrl}
              alt={session.playerName}
              className="ac-portrait-img"
              onError={() => setPortraitFailed(true)}
            />
          ) : (
            <span className="ac-portrait-fallback" aria-hidden="true">
              {session.playerName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="ac-player-copy">
          <span className="ac-player-kicker">IT&apos;S ACTION TIME!</span>
          <span className="ac-player-name">{session.playerName}&apos;s Challenge</span>
        </div>
      </div>

      {/* Big Animated Illustration Emoji + Prompt */}
      <div className="ac-prompt-box">
        <div className="ac-emoji-stage" aria-hidden="true">
          <span className="ac-emoji-glyph">{card.emoji}</span>
        </div>
        <h1 id={titleId} className="ac-card-title">
          {card.title}
        </h1>
        <p className="ac-card-prompt">{card.prompt}</p>
      </div>

      {/* Interactive Parent / Player Confirmation Controls (Tablet & Mirror) */}
      {isInteractive ? (
        <div className="ac-actions">
          <button
            type="button"
            className={`ac-complete-btn ${completing ? 'is-celebrating' : ''}`}
            {...completeTapProps}
            disabled={completing}
            autoFocus
          >
            <span className="ac-complete-icon" aria-hidden="true">
              {completing ? '🎉' : '✅'}
            </span>
            <span>
              {completing
                ? 'AWESOME JOB!'
                : `COMPLETE! (+${bonusSpaces} ${bonusSpaces === 1 ? 'Space' : 'Spaces'})`}
            </span>
          </button>

          <button
            type="button"
            className="ac-skip-btn"
            onClick={handleSkip}
            disabled={completing}
          >
            Skip Card
          </button>
        </div>
      ) : (
        <div className="ac-tv-footer" role="status">
          <span className="ac-tv-pulse-dot" aria-hidden="true" />
          <span>Tap COMPLETE on the Tablet when {session.playerName} finishes!</span>
        </div>
      )}
    </div>
  );

  // TV mode: non-interactive spectator overlay over the board
  if (!isInteractive) {
    return (
      <aside className="ac-tv-backdrop" aria-labelledby={titleId}>
        {cardBody}
      </aside>
    );
  }

  // Tablet & Mirror mode: native top-layer modal <dialog>
  return (
    <dialog
      ref={dialogRef}
      className="ac-modal-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'none' } as Record<string, string>)}
    >
      {cardBody}
    </dialog>
  );
}

export default ActionCardOverlay;
