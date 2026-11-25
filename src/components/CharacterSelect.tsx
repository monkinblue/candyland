import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  CharacterDefinition,
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  PlayerState,
} from '../types/game';
import { createPlayersFromCharacters } from '../engine/rules';
import { soundEngine } from '../audio/soundEngine';
import { CHARACTERS } from '../data/characters';
import './CharacterSelect.css';

export interface CharacterSelectProps {
  /** Available family characters. Defaults to the 9 Candyland family characters. */
  characters?: readonly CharacterDefinition[];
  /** Current selected & ordered players (controlled for real-time TV/Tablet sync). */
  selectedPlayers: readonly PlayerState[];
  /** Game settings (e.g. Kid-Friendly Landmarks). */
  settings?: GameSettings;
  /** Optional mode hint to tune spacing for TV vs Tablet vs Mirror. */
  mode?: 'tv' | 'tablet' | 'mirror';
  /** Fired whenever players are added, removed, or reordered. */
  onPlayersChange: (players: PlayerState[]) => void;
  /** Fired when game rules settings are toggled. */
  onSettingsChange?: (settings: GameSettings) => void;
  /** Fired when clicking Start Adventure (enabled for 2..8 players). */
  onStartGame: () => void;
  /** Optional back button callback. */
  onBack?: () => void;
  /** Optional 4-letter Room Code badge shown in header. */
  roomCode?: string | null;
}

export const DEFAULT_FAMILY_CHARACTERS: readonly CharacterDefinition[] = CHARACTERS;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const OPTIMISTIC_SYNC_WINDOW_MS = 950;

function playersSignature(list: readonly PlayerState[]): string {
  return list.map((p) => p.id).join(',');
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({
  characters = DEFAULT_FAMILY_CHARACTERS,
  selectedPlayers,
  settings = DEFAULT_GAME_SETTINGS,
  mode = 'mirror',
  onPlayersChange,
  onSettingsChange,
  onStartGame,
  onBack,
  roomCode,
}) => {
  const [failedPortraits, setFailedPortraits] = useState<Record<string, boolean>>({});
  const [failedTokens, setFailedTokens] = useState<Record<string, boolean>>({});

  // Optimistic local roster state + synchronous ref so rapid taps accumulate cleanly
  // even while live Firebase RTDB transactions are in flight (~150-300ms round-trip).
  const [localPlayers, setLocalPlayers] = useState<PlayerState[]>(() => [
    ...selectedPlayers,
  ]);
  const localPlayersRef = useRef<PlayerState[]>(localPlayers);
  const pendingSyncUntilRef = useRef<number>(0);

  const incomingSig = playersSignature(selectedPlayers);

  useEffect(() => {
    const localSig = playersSignature(localPlayersRef.current);
    if (incomingSig === localSig) {
      pendingSyncUntilRef.current = 0;
      return;
    }

    const now = Date.now();
    const remainingMs = pendingSyncUntilRef.current - now;
    if (remainingMs <= 0) {
      const next = [...selectedPlayers];
      localPlayersRef.current = next;
      setLocalPlayers(next);
      return;
    }

    // Wait for our optimistic burst to settle before adopting an external remote roster
    const timer = window.setTimeout(() => {
      if (Date.now() >= pendingSyncUntilRef.current) {
        const next = [...selectedPlayers];
        localPlayersRef.current = next;
        setLocalPlayers(next);
      }
    }, remainingMs + 80);

    return () => window.clearTimeout(timer);
  }, [incomingSig, selectedPlayers]);

  const canStart =
    localPlayers.length >= MIN_PLAYERS && localPlayers.length <= MAX_PLAYERS;
  const isAtMax = localPlayers.length >= MAX_PLAYERS;

  const reindexPlayers = (list: PlayerState[]): PlayerState[] =>
    list.map((player, idx) => ({ ...player, turnOrder: idx }));

  const commitLocalPlayers = (next: PlayerState[]) => {
    const reindexed = reindexPlayers(next);
    localPlayersRef.current = reindexed;
    pendingSyncUntilRef.current = Date.now() + OPTIMISTIC_SYNC_WINDOW_MS;
    setLocalPlayers(reindexed);
    onPlayersChange(reindexed);
  };

  const handleToggleCharacter = (char: CharacterDefinition) => {
    soundEngine.playButtonTap();
    const current = localPlayersRef.current;
    if (current.some((p) => p.id === char.id)) {
      commitLocalPlayers(current.filter((p) => p.id !== char.id));
      return;
    }
    if (current.length >= MAX_PLAYERS) return;
    const [newPlayer] = createPlayersFromCharacters([char]);
    commitLocalPlayers([...current, newPlayer]);
  };

  const handleMovePlayer = (index: number, delta: -1 | 1) => {
    const current = localPlayersRef.current;
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    soundEngine.playButtonTap();
    const copy = [...current];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    commitLocalPlayers(copy);
  };

  const handleRemovePlayer = (id: PlayerState['id']) => {
    soundEngine.playButtonTap();
    const current = localPlayersRef.current;
    commitLocalPlayers(current.filter((p) => p.id !== id));
  };

  const handleToggleKidLandmarks = () => {
    if (!onSettingsChange) return;
    soundEngine.playButtonTap();
    onSettingsChange({
      ...settings,
      kidFriendlyLandmarks: !settings.kidFriendlyLandmarks,
    });
  };

  const handleStartClick = () => {
    if (!canStart) return;
    soundEngine.playStarChime();
    onStartGame();
  };

  return (
    <main className={`char-select-page char-select-mode-${mode}`}>
      <div className="char-select-container">
        {/* Top Bar */}
        <header className="char-select-header">
          <div className="char-select-header-left">
            {onBack && (
              <button
                type="button"
                className="char-back-btn"
                onClick={() => {
                  soundEngine.playButtonTap();
                  onBack();
                }}
              >
                <ArrowLeft size={22} aria-hidden="true" />
                <span>Back</span>
              </button>
            )}
            <div>
              <h1 className="char-select-title">Choose Your Family Players</h1>
              <p className="char-select-subtitle">
                Pick 2 to 8 players — tap portraits to join, then arrange turn order!
              </p>
            </div>
          </div>

          <div className="char-select-header-right">
            {roomCode && (
              <div className="char-room-pill" aria-label={`Room code ${roomCode}`}>
                <span className="char-room-label">ROOM</span>
                <span className="char-room-code">{roomCode}</span>
              </div>
            )}
            <div className="char-count-pill" aria-live="polite">
              <Users size={20} aria-hidden="true" />
              <span>
                {localPlayers.length} / {MAX_PLAYERS} Selected
              </span>
            </div>
          </div>
        </header>

        {/* 9 Family Portrait Showcase Grid */}
        <section
          className="char-grid"
          aria-label="Family character roster"
        >
          {characters.map((char) => {
            const turnIndex = localPlayers.findIndex((p) => p.id === char.id);
            const isSelected = turnIndex !== -1;
            const disabled = !isSelected && isAtMax;
            const portraitBroken = Boolean(failedPortraits[char.id]);

            return (
              <button
                key={char.id}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                className={`char-card ${isSelected ? 'is-selected' : ''}`}
                style={
                  {
                    '--char-color': char.color,
                    '--char-accent': char.accentColor,
                  } as React.CSSProperties
                }
                onClick={() => handleToggleCharacter(char)}
              >
                {/* Turn Order Number Badge when selected */}
                {isSelected ? (
                  <span className="char-order-badge" aria-label={`Turn number ${turnIndex + 1}`}>
                    <Sparkles size={14} aria-hidden="true" />
                    <span>#{turnIndex + 1}</span>
                  </span>
                ) : (
                  <span className="char-join-hint">Tap to Join</span>
                )}

                {/* Kid / Adult Action Card Tier Pill */}
                <span
                  className={`char-tier-pill ${char.isKid ? 'is-kid' : 'is-adult'}`}
                >
                  {char.isKid ? '🌟 Kid' : '🎭 Adult'}
                </span>

                {/* Candyland Illustrated Portrait */}
                <div className="char-portrait-frame">
                  {!portraitBroken ? (
                    <img
                      src={char.portraitUrl}
                      alt={`${char.name} Candyland portrait`}
                      className="char-portrait-img"
                      draggable={false}
                      onError={() =>
                        setFailedPortraits((prev) => ({ ...prev, [char.id]: true }))
                      }
                    />
                  ) : (
                    <span className="char-portrait-fallback" aria-hidden="true">
                      {char.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="char-card-meta">
                  <span className="char-card-name">{char.name}</span>
                  <span className="char-card-role">{char.role}</span>
                </div>
              </button>
            );
          })}
        </section>

        {/* Bottom Dock: Turn Order Strip + Settings + Giant Start Adventure Button */}
        <section
          className="char-footer-dock"
          aria-label="Turn order and game start"
        >
          <div className="turn-order-panel">
            <div className="turn-order-heading-row">
              <h2 className="turn-order-heading">Turn Order</h2>
              {onSettingsChange && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.kidFriendlyLandmarks}
                  className={`kid-friendly-toggle ${
                    settings.kidFriendlyLandmarks ? 'is-on' : ''
                  }`}
                  onClick={handleToggleKidLandmarks}
                >
                  <ShieldCheck size={18} aria-hidden="true" />
                  <span>
                    Kid-Friendly Landmarks:{' '}
                    <strong>{settings.kidFriendlyLandmarks ? 'ON' : 'Classic'}</strong>
                  </span>
                </button>
              )}
            </div>

            {localPlayers.length === 0 ? (
              <p className="turn-order-empty">
                Tap at least 2 family portraits above to build your Candyland team!
              </p>
            ) : (
              <ol className="turn-order-list">
                {localPlayers.map((player, idx) => (
                  <li
                    key={player.id}
                    className="turn-order-chip"
                    style={{ '--chip-color': player.color } as React.CSSProperties}
                  >
                    <span className="turn-chip-num">{idx + 1}</span>
                    <div className="turn-chip-avatar">
                      {!failedTokens[player.id] ? (
                        <img
                          src={player.tokenUrl}
                          alt=""
                          onError={() =>
                            setFailedTokens((prev) => ({ ...prev, [player.id]: true }))
                          }
                        />
                      ) : (
                        <span aria-hidden="true">{player.name[0]}</span>
                      )}
                    </div>
                    <span className="turn-chip-name">{player.name}</span>

                    <div className="turn-chip-actions">
                      <button
                        type="button"
                        className="turn-chip-btn"
                        disabled={idx === 0}
                        aria-label={`Move ${player.name} earlier in turn order`}
                        onClick={() => handleMovePlayer(idx, -1)}
                      >
                        <ChevronLeft size={18} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="turn-chip-btn"
                        disabled={idx === localPlayers.length - 1}
                        aria-label={`Move ${player.name} later in turn order`}
                        onClick={() => handleMovePlayer(idx, 1)}
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="turn-chip-btn turn-chip-remove"
                        aria-label={`Remove ${player.name} from game`}
                        onClick={() => handleRemovePlayer(player.id)}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="char-start-column">
            <button
              type="button"
              className="char-start-btn"
              disabled={!canStart}
              onClick={handleStartClick}
            >
              <Play size={30} fill="currentColor" aria-hidden="true" />
              <span>Start Adventure!</span>
            </button>
            {!canStart && (
              <p className="char-start-hint" role="status" aria-live="polite">
                Select at least {MIN_PLAYERS} players to begin
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default CharacterSelect;
