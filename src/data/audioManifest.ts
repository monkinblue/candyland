export type AudioCharacterId =
  | 'robert'
  | 'rita'
  | 'wyatt'
  | 'emma'
  | 'grandpa'
  | 'bapci'
  | 'papa'
  | 'nana'
  | 'mabel'
  | 'gina'
  | 'caroline'
  | 'ian'
  | 'emilia'
  | 'guest'
  | 'gnome';

export type CardColorId = 'red' | 'purple' | 'yellow' | 'blue' | 'orange' | 'green';

export interface VoiceClipMeta {
  readonly path: string;
  readonly text: string;
  readonly category: 'turn' | 'card' | 'landmark' | 'event' | 'victory';
}

export const VOICE_MANIFEST = {
  // Turn announcements (all 15 characters including Kozlowskis & AI Gnome)
  turn_robert: {
    path: '/audio/voice/turn_robert.mp3',
    text: "It's Robert's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_rita: {
    path: '/audio/voice/turn_rita.mp3',
    text: "It's Rita's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_wyatt: {
    path: '/audio/voice/turn_wyatt.mp3',
    text: "Yay! It's Wyatt's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_emma: {
    path: '/audio/voice/turn_emma.mp3',
    text: "Yay! It's Emma's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_grandpa: {
    path: '/audio/voice/turn_grandpa.mp3',
    text: "It's Grandpa's turn! Let's see what candy card you draw!",
    category: 'turn',
  },
  turn_bapci: {
    path: '/audio/voice/turn_bapci.mp3',
    text: "It's Bapci's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_papa: {
    path: '/audio/voice/turn_papa.mp3',
    text: "It's Papa's turn! Ready to draw a sweet card?",
    category: 'turn',
  },
  turn_nana: {
    path: '/audio/voice/turn_nana.mp3',
    text: "It's Nana's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_mabel: {
    path: '/audio/voice/turn_mabel.mp3',
    text: "Yay! It's Mabel's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_gina: {
    path: '/audio/voice/turn_gina.mp3',
    text: "It's Gina's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_caroline: {
    path: '/audio/voice/turn_caroline.mp3',
    text: "Yay! It's Caroline's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_ian: {
    path: '/audio/voice/turn_ian.mp3',
    text: "It's Ian's turn! Ready to draw a sweet card?",
    category: 'turn',
  },
  turn_emilia: {
    path: '/audio/voice/turn_emilia.mp3',
    text: "Yay! It's Emilia's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_guest: {
    path: '/audio/voice/turn_guest.mp3',
    text: "It's our Guest's turn! Tap to draw a sweet card!",
    category: 'turn',
  },
  turn_gnome: {
    path: '/audio/voice/turn_gnome.mp3',
    text: "Ooh, it's Gnome's turn! Watch our magical candy buddy go!",
    category: 'turn',
  },

  // Single & double color card draw announcements
  card_red: {
    path: '/audio/voice/card_red.mp3',
    text: 'One cherry red!',
    category: 'card',
  },
  card_purple: {
    path: '/audio/voice/card_purple.mp3',
    text: 'One plum purple!',
    category: 'card',
  },
  card_yellow: {
    path: '/audio/voice/card_yellow.mp3',
    text: 'One lemon yellow!',
    category: 'card',
  },
  card_blue: {
    path: '/audio/voice/card_blue.mp3',
    text: 'One blueberry blue!',
    category: 'card',
  },
  card_orange: {
    path: '/audio/voice/card_orange.mp3',
    text: 'One tangerine orange!',
    category: 'card',
  },
  card_green: {
    path: '/audio/voice/card_green.mp3',
    text: 'One minty green!',
    category: 'card',
  },
  card_double_red: {
    path: '/audio/voice/card_double_red.mp3',
    text: 'Ooh, double red! Hop ahead two red squares!',
    category: 'card',
  },
  card_double_purple: {
    path: '/audio/voice/card_double_purple.mp3',
    text: 'Ooh, double purple! Hop two purple spaces!',
    category: 'card',
  },
  card_double_yellow: {
    path: '/audio/voice/card_double_yellow.mp3',
    text: 'Woohoo, double yellow! Zoom right ahead!',
    category: 'card',
  },
  card_double_blue: {
    path: '/audio/voice/card_double_blue.mp3',
    text: 'Awesome, double blue! Double the hop!',
    category: 'card',
  },
  card_double_orange: {
    path: '/audio/voice/card_double_orange.mp3',
    text: 'Yay, double orange! Off you go!',
    category: 'card',
  },
  card_double_green: {
    path: '/audio/voice/card_double_green.mp3',
    text: 'Sweet, double green! Leap right ahead!',
    category: 'card',
  },

  // Landmark & special cards
  card_cupcake: {
    path: '/audio/voice/card_cupcake.mp3',
    text: 'Cupcake Commons! Zoom to the frosted cupcake!',
    category: 'landmark',
  },
  card_ice_cream: {
    path: '/audio/voice/card_ice_cream.mp3',
    text: 'Ice Cream Slopes! Scoop your way to the cone!',
    category: 'landmark',
  },
  card_gummy: {
    path: '/audio/voice/card_gummy.mp3',
    text: 'Gummy Hills! Bounce over to the gummy star!',
    category: 'landmark',
  },
  card_gingerbread: {
    path: '/audio/voice/card_gingerbread.mp3',
    text: 'Gingerbread House! Sweet cookie magic awaits!',
    category: 'landmark',
  },
  card_lollipop: {
    path: '/audio/voice/card_lollipop.mp3',
    text: 'Lollipop Woods! Swirl right to the giant lollipop!',
    category: 'landmark',
  },
  card_popsicle: {
    path: '/audio/voice/card_popsicle.mp3',
    text: 'Ice Palace! Glide over to the sparkling popsicle!',
    category: 'landmark',
  },
  card_chocolate: {
    path: '/audio/voice/card_chocolate.mp3',
    text: 'Chocolate Mountain! Almost to the castle!',
    category: 'landmark',
  },
  card_action: {
    path: '/audio/voice/card_action.mp3',
    text: 'Silly Action Card! Time for some family fun!',
    category: 'landmark',
  },

  // Game events
  event_welcome: {
    path: '/audio/voice/event_welcome.mp3',
    text: 'Welcome to Family Candyland! Let the sweet adventure begin!',
    category: 'event',
  },
  event_shortcut_peppermint: {
    path: '/audio/voice/event_shortcut_peppermint.mp3',
    text: 'Whoa! Peppermint Pass shortcut! Zoom right across the candy bridge!',
    category: 'event',
  },
  event_shortcut_gummy: {
    path: '/audio/voice/event_shortcut_gummy.mp3',
    text: 'Yay! Gummy Pass shortcut! Bounce all the way ahead!',
    category: 'event',
  },
  event_licorice_stuck: {
    path: '/audio/voice/event_licorice_stuck.mp3',
    text: "Uh oh! Sticky Licorice Lagoon! You're stuck for one turn!",
    category: 'event',
  },
  event_licorice_skip: {
    path: '/audio/voice/event_licorice_skip.mp3',
    text: 'Pop! You broke free from the sticky licorice! Ready for next turn!',
    category: 'event',
  },
  event_minigame_intro: {
    path: '/audio/voice/event_minigame_intro.mp3',
    text: 'Sparkle Star Mini-Game! Grab the tablet and get ready to play!',
    category: 'event',
  },
  event_minigame_win: {
    path: '/audio/voice/event_minigame_win.mp3',
    text: 'Superstar! You won the mini-game! Bonus candy spaces!',
    category: 'event',
  },
  event_minigame_try: {
    path: '/audio/voice/event_minigame_try.mp3',
    text: "Awesome try! Here's a sweet bonus hop!",
    category: 'event',
  },
  event_action_complete: {
    path: '/audio/voice/event_action_complete.mp3',
    text: 'Woohoo! Amazing job! Take your bonus hops!',
    category: 'event',
  },

  // Victory announcements (generic + all 15 characters)
  victory_generic: {
    path: '/audio/voice/victory_generic.mp3',
    text: 'Hooray! You reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_robert: {
    path: '/audio/voice/victory_robert.mp3',
    text: 'Hooray! Robert reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_rita: {
    path: '/audio/voice/victory_rita.mp3',
    text: 'Hooray! Rita reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_wyatt: {
    path: '/audio/voice/victory_wyatt.mp3',
    text: 'Hooray! Wyatt reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_emma: {
    path: '/audio/voice/victory_emma.mp3',
    text: 'Hooray! Emma reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_grandpa: {
    path: '/audio/voice/victory_grandpa.mp3',
    text: 'Hooray! Grandpa reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_bapci: {
    path: '/audio/voice/victory_bapci.mp3',
    text: 'Hooray! Bapci reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_papa: {
    path: '/audio/voice/victory_papa.mp3',
    text: 'Hooray! Papa reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_nana: {
    path: '/audio/voice/victory_nana.mp3',
    text: 'Hooray! Nana reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_mabel: {
    path: '/audio/voice/victory_mabel.mp3',
    text: 'Hooray! Mabel reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_gina: {
    path: '/audio/voice/victory_gina.mp3',
    text: 'Hooray! Gina reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_caroline: {
    path: '/audio/voice/victory_caroline.mp3',
    text: 'Hooray! Caroline reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_ian: {
    path: '/audio/voice/victory_ian.mp3',
    text: 'Hooray! Ian reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_emilia: {
    path: '/audio/voice/victory_emilia.mp3',
    text: 'Hooray! Emilia reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_guest: {
    path: '/audio/voice/victory_guest.mp3',
    text: 'Hooray! Our Guest reached Candy Castle and won the game!',
    category: 'victory',
  },
  victory_gnome: {
    path: '/audio/voice/victory_gnome.mp3',
    text: 'Hooray! The magical Candyland Gnome reached Candy Castle and won the game!',
    category: 'victory',
  },
} as const satisfies Record<string, VoiceClipMeta>;

export type VoiceKey = keyof typeof VOICE_MANIFEST;

export const ALL_VOICE_KEYS: readonly VoiceKey[] = Object.keys(VOICE_MANIFEST) as VoiceKey[];

export function isVoiceKey(key: string | null | undefined): key is VoiceKey {
  return typeof key === 'string' && key in VOICE_MANIFEST;
}

const CHARACTER_SET = new Set<string>([
  'robert',
  'rita',
  'wyatt',
  'emma',
  'grandpa',
  'bapci',
  'papa',
  'nana',
  'mabel',
  'gina',
  'caroline',
  'ian',
  'emilia',
  'guest',
  'gnome',
]);

export function getTurnVoiceKey(characterId: string): VoiceKey {
  const id = characterId.toLowerCase();
  if (CHARACTER_SET.has(id)) {
    return `turn_${id}` as VoiceKey;
  }
  return 'turn_guest';
}

export function getVictoryVoiceKey(characterId?: string | null): VoiceKey {
  if (!characterId) return 'victory_generic';
  const id = characterId.toLowerCase();
  if (CHARACTER_SET.has(id)) {
    return `victory_${id}` as VoiceKey;
  }
  return 'victory_generic';
}

export function getColorCardVoiceKey(color: CardColorId, isDouble = false): VoiceKey {
  return (isDouble ? `card_double_${color}` : `card_${color}`) as VoiceKey;
}

export function getLandmarkCardVoiceKey(landmarkId: string): VoiceKey | null {
  const normalized = landmarkId.toLowerCase().replace(/-/g, '_');
  const key = `card_${normalized}`;
  if (key in VOICE_MANIFEST) {
    return key as VoiceKey;
  }
  return null;
}

export function getCardVoiceKey(card: {
  type: string;
  color?: string | null;
  landmark?: string | null;
}): VoiceKey | null {
  if ((card.type === 'single' || card.type === 'double') && card.color) {
    const candidate = card.type === 'double' ? `card_double_${card.color}` : `card_${card.color}`;
    return isVoiceKey(candidate) ? candidate : null;
  }
  if (card.type === 'landmark' && card.landmark) {
    return getLandmarkCardVoiceKey(card.landmark);
  }
  if (card.type === 'action') {
    return 'card_action';
  }
  if (card.type === 'licorice') {
    return 'event_licorice_stuck';
  }
  return null;
}
