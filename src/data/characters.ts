import type { CharacterDefinition, CharacterId } from '../types/game';

export type { CharacterDefinition, CharacterId };

export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'wyatt',
    name: 'Wyatt',
    role: 'Candy Explorer (Age 4)',
    isKid: true,
    color: '#ef4444',
    accentColor: '#fecaca',
    portraitUrl: '/images/portraits/wyatt.png',
    tokenUrl: '/images/tokens/wyatt.png',
    tagline: 'Super-fast Peppermint Pass champion!',
  },
  {
    id: 'emma',
    name: 'Emma',
    role: 'Rainbow Princess (Age 3)',
    isKid: true,
    color: '#a855f7',
    accentColor: '#e9d5ff',
    portraitUrl: '/images/portraits/emma.png',
    tokenUrl: '/images/tokens/emma.png',
    tagline: 'Sparkly queen of Candy Castle!',
  },
  {
    id: 'robert',
    name: 'Robert',
    role: 'Dad',
    isKid: false,
    color: '#22c55e',
    accentColor: '#86efac',
    portraitUrl: '/images/portraits/robert.png',
    tokenUrl: '/images/tokens/robert.png',
    tagline: 'Fearless guide of Chocolate Mountain!',
  },
  {
    id: 'rita',
    name: 'Rita',
    role: 'Mom',
    isKid: false,
    color: '#ec4899',
    accentColor: '#fbcfe8',
    portraitUrl: '/images/portraits/rita.png',
    tokenUrl: '/images/tokens/rita.png',
    tagline: 'Sweetest champion of Cupcake Commons!',
  },
  {
    id: 'grandpa',
    name: 'Grandpa',
    role: 'Grandpa',
    isKid: false,
    color: '#2563eb',
    accentColor: '#bfdbfe',
    portraitUrl: '/images/portraits/grandpa.png',
    tokenUrl: '/images/tokens/grandpa.png',
    tagline: 'Cool cruiser of Ice Cream Slopes!',
  },
  {
    id: 'bapci',
    name: 'Bapci',
    role: 'Grandma',
    isKid: false,
    color: '#06b6d4',
    accentColor: '#a5f3fc',
    portraitUrl: '/images/portraits/bapci.png',
    tokenUrl: '/images/tokens/bapci.png',
    tagline: 'Sparkling star of the Ice Palace!',
  },
  {
    id: 'papa',
    name: 'Papa',
    role: 'Grandpa',
    isKid: false,
    color: '#f97316',
    accentColor: '#fed7aa',
    portraitUrl: '/images/portraits/papa.png',
    tokenUrl: '/images/tokens/papa.png',
    tagline: 'Captain of Gummy Hills adventures!',
  },
  {
    id: 'nana',
    name: 'Nana',
    role: 'Grandma',
    isKid: false,
    color: '#eab308',
    accentColor: '#fef08a',
    portraitUrl: '/images/portraits/nana.png',
    tokenUrl: '/images/tokens/nana.png',
    tagline: 'Sunshine cheerleader of Lollipop Woods!',
  },
  {
    id: 'guest',
    name: 'Guest',
    role: 'Gingerbread Friend',
    isKid: true,
    color: '#14b8a6',
    accentColor: '#99f6e4',
    portraitUrl: '/images/portraits/guest.png',
    tokenUrl: '/images/tokens/guest.png',
    tagline: 'Friendly gingerbread explorer ready to play!',
  },
] as const;

export const CHARACTER_MAP: Record<CharacterId, CharacterDefinition> =
  CHARACTERS.reduce(
    (acc, ch) => {
      acc[ch.id] = ch;
      return acc;
    },
    {} as Record<CharacterId, CharacterDefinition>
  );

export function getCharacter(id: CharacterId): CharacterDefinition {
  return CHARACTER_MAP[id];
}
