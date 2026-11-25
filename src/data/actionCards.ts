import type { ActionCardItem } from '../types/game';

/**
 * Kid-friendly Action Cards crafted for ages 3–4 (Emma & Wyatt).
 * Short, joyful, active, easy to understand, and always encouraging.
 */
export const KID_ACTION_CARDS: readonly ActionCardItem[] = [
  {
    id: 'kid-gummy-dance',
    tier: 'kid',
    title: 'Gummy Bear Boogie!',
    prompt: 'Do your best silly gummy bear dance for 5 seconds!',
    emoji: '🧸',
    bonusSpaces: 1,
    category: 'dance',
  },
  {
    id: 'kid-frosting-frog',
    tier: 'kid',
    title: 'Frosting Frog Hops!',
    prompt: 'Hop like a happy frosting frog 3 big times!',
    emoji: '🐸',
    bonusSpaces: 1,
    category: 'movement',
  },
  {
    id: 'kid-rainbow-wave',
    tier: 'kid',
    title: 'Giant Rainbow Wave!',
    prompt: 'Give everyone in the room a giant two-handed rainbow wave!',
    emoji: '🌈',
    bonusSpaces: 1,
    category: 'social',
  },
  {
    id: 'kid-choco-dino',
    tier: 'kid',
    title: 'Chocolate Dinosaur!',
    prompt: 'Stomp your feet and roar like a giant chocolate dinosaur!',
    emoji: '🦕',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'kid-lollipop-spin',
    tier: 'kid',
    title: 'Lollipop Swirl!',
    prompt: 'Spin in a slow, happy swirl like a giant rainbow lollipop!',
    emoji: '🍭',
    bonusSpaces: 1,
    category: 'movement',
  },
  {
    id: 'kid-popsicle-freeze',
    tier: 'kid',
    title: 'Popsicle Statue!',
    prompt: 'Freeze like a chilly popsicle statue for 5 seconds — no giggling!',
    emoji: '🍧',
    bonusSpaces: 2,
    category: 'balance',
  },
  {
    id: 'kid-gummy-worm',
    tier: 'kid',
    title: 'Gummy Worm Wiggle!',
    prompt: 'Wiggle your whole body like a wiggly gummy worm!',
    emoji: '🐛',
    bonusSpaces: 1,
    category: 'dance',
  },
  {
    id: 'kid-bubblegum-bubble',
    tier: 'kid',
    title: 'Giant Bubblegum!',
    prompt: 'Puff your cheeks and blow a giant pretend bubblegum bubble — POP!',
    emoji: '🫧',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'kid-gingerbread-march',
    tier: 'kid',
    title: 'Gingerbread March!',
    prompt: 'March in place with big high knees like a gingerbread soldier!',
    emoji: '🍪',
    bonusSpaces: 1,
    category: 'movement',
  },
  {
    id: 'kid-ice-cream-lick',
    tier: 'kid',
    title: 'Wobbly Ice Cream!',
    prompt: 'Pretend to eat the tallest, wobbliest ice cream cone ever!',
    emoji: '🍦',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'kid-cupcake-sprinkles',
    tier: 'kid',
    title: 'Sprinkle Shake!',
    prompt: 'Shake your hands up high like rainbow sprinkles falling on a cupcake!',
    emoji: '🧁',
    bonusSpaces: 1,
    category: 'dance',
  },
  {
    id: 'kid-bunny-nose',
    tier: 'kid',
    title: 'Marshmallow Bunny!',
    prompt: 'Wiggle your nose like a fluffy marshmallow bunny and do 2 tiny hops!',
    emoji: '🐰',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'kid-cotton-candy-hug',
    tier: 'kid',
    title: 'Cotton Candy High-Five!',
    prompt: 'Give someone next to you a big sweet high-five or cotton candy hug!',
    emoji: '☁️',
    bonusSpaces: 1,
    category: 'social',
  },
  {
    id: 'kid-jellybean-tiptoe',
    tier: 'kid',
    title: 'Jellybean Tiptoe!',
    prompt: 'Tiptoe on your toes like a sneaky little jellybean for 5 steps!',
    emoji: '🍬',
    bonusSpaces: 2,
    category: 'balance',
  },
  {
    id: 'kid-peppermint-clap',
    tier: 'kid',
    title: 'Peppermint Cheer!',
    prompt: 'Clap your hands 5 times super fast and shout "YAY CANDYLAND!"',
    emoji: '🎉',
    bonusSpaces: 1,
    category: 'social',
  },
  {
    id: 'kid-candy-star',
    tier: 'kid',
    title: 'Sparkling Candy Star!',
    prompt: 'Stretch your arms and legs wide like a giant sparkling candy star!',
    emoji: '⭐',
    bonusSpaces: 1,
    category: 'movement',
  },
  {
    id: 'kid-silly-candy-face',
    tier: 'kid',
    title: 'Sour Lemon Face!',
    prompt: 'Make your funniest silly face like you just tasted a super sour lemon drop!',
    emoji: '😜',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'kid-royal-bow',
    tier: 'kid',
    title: 'Candy Castle Bow!',
    prompt: 'Give a fancy royal bow or curtsy to King Kandy and the whole family!',
    emoji: '👑',
    bonusSpaces: 2,
    category: 'social',
  },
] as const;

/**
 * Hilarious, playful Family/Adult Action Cards for parents and grandparents.
 */
export const ADULT_ACTION_CARDS: readonly ActionCardItem[] = [
  {
    id: 'adult-king-kandy-song',
    tier: 'adult',
    title: 'King Kandy Opera!',
    prompt: 'Sing the chorus of a silly song in your grandest King Kandy royal voice!',
    emoji: '👑',
    bonusSpaces: 2,
    category: 'voice',
  },
  {
    id: 'adult-duke-balance',
    tier: 'adult',
    title: 'Duke of Swirl Balance!',
    prompt: 'Balance on one foot for 8 seconds like the majestic Duke of Swirl!',
    emoji: '🦩',
    bonusSpaces: 2,
    category: 'balance',
  },
  {
    id: 'adult-slomo-jacks',
    tier: 'adult',
    title: 'Slow-Mo Sugar Rush!',
    prompt: 'Do 5 dramatic slow-motion jumping jacks complete with sound effects!',
    emoji: '⚡',
    bonusSpaces: 2,
    category: 'movement',
  },
  {
    id: 'adult-youngest-cheer',
    tier: 'adult',
    title: 'VIP Kid Cheer!',
    prompt: 'Give the youngest player a piggyback ride, giant high-five, or royal bow!',
    emoji: '🙌',
    bonusSpaces: 1,
    category: 'social',
  },
  {
    id: 'adult-candy-puns',
    tier: 'adult',
    title: 'Sweet Compliments!',
    prompt: 'Compliment every player in the room using a cheesy candy pun!',
    emoji: '🍬',
    bonusSpaces: 2,
    category: 'social',
  },
  {
    id: 'adult-licorice-story',
    tier: 'adult',
    title: 'Tiny Bedtime Tale!',
    prompt: 'Tell a dramatic 5-second bedtime story about Lord Licorice!',
    emoji: '📖',
    bonusSpaces: 1,
    category: 'voice',
  },
  {
    id: 'adult-gummy-disco',
    tier: 'adult',
    title: 'Gummy Bear Disco!',
    prompt: 'Bust out your absolute best retro disco dance move for 5 seconds!',
    emoji: '🕺',
    bonusSpaces: 1,
    category: 'dance',
  },
  {
    id: 'adult-tongue-twister',
    tier: 'adult',
    title: 'Peppermint Twister!',
    prompt: 'Say "Pink peppermint popsicles pop" 3 times fast without laughing!',
    emoji: '🗣️',
    bonusSpaces: 2,
    category: 'voice',
  },
  {
    id: 'adult-ice-cream-mime',
    tier: 'adult',
    title: 'Melting Cone Mime!',
    prompt: 'Mime trying to eat a melting triple-scoop ice cream cone with zero words!',
    emoji: '🍦',
    bonusSpaces: 1,
    category: 'pretend',
  },
  {
    id: 'adult-gingerbread-run',
    tier: 'adult',
    title: 'Gingerbread Sprint!',
    prompt: 'Run in place in fast-motion while shouting "You can\'t catch me!"',
    emoji: '🍪',
    bonusSpaces: 1,
    category: 'movement',
  },
  {
    id: 'adult-marshmallow-laugh',
    tier: 'adult',
    title: 'Royal Belly Laugh!',
    prompt: 'Deliver your jolliest King Kandy royal belly laugh for 4 full seconds!',
    emoji: '😂',
    bonusSpaces: 1,
    category: 'voice',
  },
  {
    id: 'adult-candy-speech',
    tier: 'adult',
    title: 'Candy Champion!',
    prompt: 'Give a passionate 5-second speech defending why your favorite candy rules all!',
    emoji: '🎤',
    bonusSpaces: 1,
    category: 'voice',
  },
  {
    id: 'adult-frosting-hero',
    tier: 'adult',
    title: 'Frosting Superhero!',
    prompt: 'Strike your grandest superhero pose and hold completely still for 6 seconds!',
    emoji: '🦸',
    bonusSpaces: 1,
    category: 'balance',
  },
  {
    id: 'adult-lollipop-twirl',
    tier: 'adult',
    title: 'Ballroom Lollipop!',
    prompt: 'Do an exaggerated royal ballroom twirl and blow a kiss to Candy Castle!',
    emoji: '🍭',
    bonusSpaces: 1,
    category: 'dance',
  },
  {
    id: 'adult-family-wave',
    tier: 'adult',
    title: 'Candyland Stadium Wave!',
    prompt: 'Lead everyone in the room in doing a synchronized Candyland stadium wave!',
    emoji: '🌊',
    bonusSpaces: 2,
    category: 'social',
  },
  {
    id: 'adult-licorice-walk',
    tier: 'adult',
    title: 'Sticky Licorice Walk!',
    prompt: 'Take 4 giant exaggerated sticky-footed steps as if wading through licorice!',
    emoji: '🦶',
    bonusSpaces: 2,
    category: 'pretend',
  },
] as const;

export const ALL_ACTION_CARDS: readonly ActionCardItem[] = [
  ...KID_ACTION_CARDS,
  ...ADULT_ACTION_CARDS,
] as const;

export function getActionCardsForTier(isKid: boolean): readonly ActionCardItem[] {
  return isKid ? KID_ACTION_CARDS : ADULT_ACTION_CARDS;
}

export function getActionCardById(id: string): ActionCardItem | undefined {
  return ALL_ACTION_CARDS.find((card) => card.id === id);
}

/**
 * Selects an age-appropriate Action Card automatically using `isKid`.
 * Avoids repeating cards in `usedIds` until all cards in that tier have been seen.
 */
export function pickActionCard(
  isKid: boolean,
  usedIds: readonly string[] = [],
  rng: () => number = Math.random,
): ActionCardItem {
  const pool = getActionCardsForTier(isKid);
  const usedSet = new Set(usedIds);
  const fresh = pool.filter((card) => !usedSet.has(card.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const rawIndex = Math.floor(rng() * candidates.length);
  const safeIndex = Math.max(0, Math.min(candidates.length - 1, rawIndex));
  return candidates[safeIndex];
}
