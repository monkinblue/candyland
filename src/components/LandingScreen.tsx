import React, { useState } from 'react';
import {
  Maximize2,
  Minimize2,
  MonitorPlay,
  Sparkles,
  TabletSmartphone,
  Users,
} from 'lucide-react';
import { ViewMode } from '../types/game';
import { CHARACTERS } from '../data/characters';
import { useFullscreen } from '../utils/fullscreen';
import { soundEngine } from '../audio/soundEngine';
import './LandingScreen.css';

export interface LandingScreenProps {
  /** Called when the user chooses a play mode (TV Host, Tablet Controller, or Mirror Mode). */
  onSelectMode: (mode: Exclude<ViewMode, 'landing'>) => void;
  /** Optional quick-join callback if a room code was entered directly. */
  onQuickJoinRoom?: (roomCode: string) => void;
  /** Whether online Firebase sync is configured (displays a helpful subtle pill). */
  isFirebaseConfigured?: boolean;
}

const PREVIEW_FAMILY = CHARACTERS;

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onSelectMode,
  isFirebaseConfigured = false,
}) => {
  const [hiddenTokens, setHiddenTokens] = useState<Record<string, boolean>>({});
  const { isSupported: canFullscreen, isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <main className="landing-page">
      {canFullscreen && (
        <button
          type="button"
          className="landing-fullscreen-btn"
          onClick={() => {
            soundEngine.playButtonTap();
            toggleFullscreen();
          }}
          aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? (
            <Minimize2 size={20} aria-hidden="true" />
          ) : (
            <Maximize2 size={20} aria-hidden="true" />
          )}
          <span>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
        </button>
      )}

      {/* Decorative pastel storybook sky backdrop */}
      <div className="landing-decor" aria-hidden="true">
        <span className="candy-orb candy-orb-1" />
        <span className="candy-orb candy-orb-2" />
        <span className="candy-orb candy-orb-3" />
        <span className="candy-orb candy-orb-4" />
      </div>

      <div className="landing-container">
        <header className="landing-header">
          <div className="landing-badge">
            <Sparkles size={18} aria-hidden="true" />
            <span>Interactive Family Board Game</span>
            <Sparkles size={18} aria-hidden="true" />
          </div>

          <h1 className="landing-title">
            <span className="landing-title-main">Candyland</span>
            <span className="landing-title-sub">Family Adventure</span>
          </h1>

          <p className="landing-lead">
            Race through Cupcake Commons, Lollipop Woods, and Chocolate Mountain to reach Candy Castle!
          </p>
        </header>

        <section
          className="landing-modes-grid"
          aria-label="Choose how to play"
        >
          {/* 1. Host on TV */}
          <button
            type="button"
            className="mode-card mode-card-tv"
            onClick={() => onSelectMode('tv')}
          >
            <span className="mode-card-badge">Google TV / Big Screen</span>
            <span className="mode-card-icon-wrap" aria-hidden="true">
              <MonitorPlay size={48} strokeWidth={2.2} />
            </span>
            <span className="mode-card-title">Host on TV</span>
            <span className="mode-card-desc">
              Full 16:9 magical board, Room Code &amp; QR, AI video cutscenes, and storybook voiceovers.
            </span>
            <span className="mode-card-cta">Launch TV Board →</span>
          </button>

          {/* 2. Join as Tablet Controller */}
          <button
            type="button"
            className="mode-card mode-card-tablet"
            onClick={() => onSelectMode('tablet')}
          >
            <span className="mode-card-badge">Pixel Tablet / Phone</span>
            <span className="mode-card-icon-wrap" aria-hidden="true">
              <TabletSmartphone size={48} strokeWidth={2.2} />
            </span>
            <span className="mode-card-title">Join as Tablet Controller</span>
            <span className="mode-card-desc">
              Enter the 4-letter code or scan the TV QR to draw cards &amp; play 10-second touch mini-games!
            </span>
            <span className="mode-card-cta">Join TV Room →</span>
          </button>

          {/* 3. Single-Screen / Mirror Mode */}
          <button
            type="button"
            className="mode-card mode-card-mirror"
            onClick={() => onSelectMode('mirror')}
          >
            <span className="mode-card-badge">All-in-One Play</span>
            <span className="mode-card-icon-wrap" aria-hidden="true">
              <Users size={48} strokeWidth={2.2} />
            </span>
            <span className="mode-card-title">Single-Screen / Mirror</span>
            <span className="mode-card-desc">
              Full board, giant draw button, touch mini-games &amp; silly family action cards all on one screen!
            </span>
            <span className="mode-card-cta">Play Together Here →</span>
          </button>
        </section>

        <footer className="landing-footer">
          <div className="landing-family-strip" aria-label="Starring the family">
            {PREVIEW_FAMILY.map((member) => (
              <div
                key={member.id}
                className="landing-family-avatar"
                style={{ '--avatar-color': member.color } as React.CSSProperties}
                title={member.name}
              >
                {!hiddenTokens[member.id] ? (
                  <img
                    src={`/images/tokens/${member.id}.png`}
                    alt={member.name}
                    loading="eager"
                    onError={() =>
                      setHiddenTokens((prev) => ({ ...prev, [member.id]: true }))
                    }
                  />
                ) : (
                  <span aria-hidden="true">{member.name[0]}</span>
                )}
              </div>
            ))}
          </div>

          <p className="landing-sync-note">
            {isFirebaseConfigured
              ? '☁️ Live Dual-Screen Cloud Sync Ready • Scan TV QR from any tablet'
              : '✨ Works locally & across browser tabs • Ready for TV + Tablet family fun'}
          </p>
        </footer>
      </div>
    </main>
  );
};

export default LandingScreen;
