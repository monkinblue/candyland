import {
  Card,
  DEFAULT_GAME_SETTINGS,
  GameSettings,
  LANDMARK_META,
  LandmarkId,
  TILE_COLOR_META,
  TILE_COLORS,
} from '../types/game';

const LANDMARK_CARDS: readonly LandmarkId[] = [
  'cupcake',
  'ice-cream',
  'gummy',
  'gingerbread',
  'lollipop',
  'popsicle',
  'chocolate',
] as const;

let cardSequence = 0;

function makeCardId(prefix: string): string {
  cardSequence += 1;
  return `${prefix}-${cardSequence}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Pure Fisher-Yates shuffle returning a new array.
 */
export function shuffleCards<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/**
 * Builds a balanced Candyland deck containing:
 * - 36 Single Color cards (6 per color)
 * - 18 Double Color cards (3 per color)
 * - 7 Magical Landmark cards
 * - 6 Silly Family Action cards (when enabled)
 * - 2 Licorice Swirl trap cards
 *
 * Ensures the opening 4 cards of a brand new deck are cheerful color cards
 * so every game starts smoothly for young kids.
 */
export function createDeck(
  settings: GameSettings = DEFAULT_GAME_SETTINGS,
  rng: () => number = Math.random
): Card[] {
  const cards: Card[] = [];

  // Single color cards (6 each)
  for (const color of TILE_COLORS) {
    const meta = TILE_COLOR_META[color];
    for (let i = 0; i < 6; i += 1) {
      cards.push({
        id: makeCardId(`single-${color}`),
        type: 'single',
        color,
        landmark: null,
        label: `1 ${meta.label}`,
        subtitle: `Hop to the next ${meta.label.toLowerCase()} space!`,
        emoji: null,
      });
    }
  }

  // Double color cards (3 each)
  for (const color of TILE_COLORS) {
    const meta = TILE_COLOR_META[color];
    for (let i = 0; i < 3; i += 1) {
      cards.push({
        id: makeCardId(`double-${color}`),
        type: 'double',
        color,
        landmark: null,
        label: `Double ${meta.label}!`,
        subtitle: `Leap ahead 2 ${meta.label.toLowerCase()} spaces!`,
        emoji: '✨',
      });
    }
  }

  // Pink Candy Landmark cards (1 each of the 7 board candy landmarks — can jump forward or backward!)
  for (const landmark of LANDMARK_CARDS) {
    const meta = LANDMARK_META[landmark];
    cards.push({
      id: makeCardId(`landmark-${landmark}`),
      type: 'landmark',
      color: null,
      landmark,
      label: meta.label,
      subtitle: `Jump forward or back to ${meta.regionName}!`,
      emoji: meta.emoji,
    });
  }

  // Action cards mixed into the deck
  if (settings.enableActionCards) {
    for (let i = 0; i < 6; i += 1) {
      cards.push({
        id: makeCardId('action'),
        type: 'action',
        color: null,
        landmark: null,
        label: 'Silly Action Card!',
        subtitle: 'Act it out for bonus spaces!',
        emoji: '🎭',
      });
    }
  }

  // Playful Licorice Swirl trap cards
  for (let i = 0; i < 2; i += 1) {
    cards.push({
      id: makeCardId('licorice'),
      type: 'licorice',
      color: null,
      landmark: null,
      label: 'Licorice Swirl!',
      subtitle: 'Uh-oh! Sticky Licorice Lagoon trap!',
      emoji: '🌀',
    });
  }

  const shuffled = shuffleCards(cards, rng);

  // Guarantee the top 4 cards of a fresh deck aren't licorice traps
  for (let topIdx = 0; topIdx < Math.min(4, shuffled.length); topIdx += 1) {
    if (shuffled[topIdx].type === 'licorice') {
      const swapIdx = shuffled.findIndex(
        (c, idx) => idx >= 4 && (c.type === 'single' || c.type === 'double')
      );
      if (swapIdx !== -1) {
        const tmp = shuffled[topIdx];
        shuffled[topIdx] = shuffled[swapIdx];
        shuffled[swapIdx] = tmp;
      }
    }
  }

  return shuffled;
}

export interface DrawDeckResult {
  card: Card;
  deck: Card[];
  discardPile: Card[];
  reshuffled: boolean;
}

/**
 * Draws the top card from the deck. If the deck is empty, automatically
 * reshuffles the discard pile cleanly (or regenerates a fresh deck if both are empty).
 */
export function drawFromDeck(
  currentDeck: readonly Card[],
  currentDiscard: readonly Card[],
  settings: GameSettings = DEFAULT_GAME_SETTINGS,
  rng: () => number = Math.random
): DrawDeckResult {
  let workingDeck = [...currentDeck];
  let workingDiscard = [...currentDiscard];
  let reshuffled = false;

  if (workingDeck.length === 0) {
    if (workingDiscard.length > 0) {
      workingDeck = shuffleCards(workingDiscard, rng);
      workingDiscard = [];
      reshuffled = true;
    } else {
      workingDeck = createDeck(settings, rng);
      reshuffled = true;
    }
  }

  const [card, ...remainingDeck] = workingDeck;
  workingDiscard.push(card);

  return {
    card,
    deck: remainingDeck,
    discardPile: workingDiscard,
    reshuffled,
  };
}

/**
 * Maps a drawn Card to its matching ElevenLabs narrator voice key.
 */
export function getVoiceKeyForCard(card: Card): string {
  if (card.type === 'single' && card.color) {
    return `card_${card.color}`;
  }
  if (card.type === 'double' && card.color) {
    return `card_double_${card.color}`;
  }
  if (card.type === 'landmark' && card.landmark) {
    const normalized = card.landmark.replace('-', '_');
    return `card_${normalized}`;
  }
  if (card.type === 'action') {
    return 'card_action';
  }
  return 'event_licorice_stuck';
}
