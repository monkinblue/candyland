import type { BoardCoord, BoardShortcut, BoardTile, LandmarkId, ShortcutId } from '../types/game';

export const BOARD_IMAGE_URL = '/images/board.png';

/** Start pad coordinate (bottom-left rainbow welcome area before tile 1) */
export const START_COORD: BoardCoord = { x: 0.042, y: 0.925 };

/**
 * 71-tile winding serpentine Candyland board path mapped to normalized (0..1)
 * coordinates on the 16:9 widescreen board (`public/images/board.png`).
 *
 * Regions in exact travel order:
 * 1) Cupcake Commons (1-7)         + Peppermint Pass entrance at tile 3 -> tile 34
 * 2) Ice Cream Slopes (8-14)
 * 3) Gummy Hills (15-22)           + Gummy Pass entrance at tile 18 -> tile 47
 * 4) Gingerbread House (23-37)
 * 5) Licorice Lagoon (38-42)       + 2 Licorice Swirl trap tiles (39, 42)
 * 6) Lollipop Woods (43-48)
 * 7) Ice Palace (49-55)
 * 8) Chocolate Mountain (56-68)
 * 9) Candy Castle (69-71)          + Rainbow finish tile at tile 71
 */
export const BOARD_TILES: readonly BoardTile[] = [
  // 1..7: Cupcake Commons
  { index: 1, color: 'red', x: 0.085, y: 0.895, region: 'Cupcake Commons' },
  { index: 2, color: 'purple', x: 0.128, y: 0.855, region: 'Cupcake Commons' },
  {
    index: 3,
    color: 'yellow',
    x: 0.175,
    y: 0.820,
    region: 'Cupcake Commons',
    shortcutEntrance: 'peppermint-pass',
  },
  { index: 4, color: 'blue', x: 0.225, y: 0.805, region: 'Cupcake Commons' },
  {
    index: 5,
    color: 'orange',
    x: 0.275,
    y: 0.820,
    region: 'Cupcake Commons',
    landmark: 'cupcake',
  },
  { index: 6, color: 'green', x: 0.320, y: 0.860, region: 'Cupcake Commons' },
  { index: 7, color: 'red', x: 0.365, y: 0.895, region: 'Cupcake Commons' },

  // 8..14: Ice Cream Slopes
  { index: 8, color: 'purple', x: 0.418, y: 0.900, region: 'Ice Cream Slopes' },
  {
    index: 9,
    color: 'yellow',
    x: 0.468,
    y: 0.875,
    region: 'Ice Cream Slopes',
    isStarMiniGame: true,
  },
  { index: 10, color: 'blue', x: 0.515, y: 0.835, region: 'Ice Cream Slopes' },
  {
    index: 11,
    color: 'orange',
    x: 0.565,
    y: 0.820,
    region: 'Ice Cream Slopes',
    landmark: 'ice-cream',
  },
  { index: 12, color: 'green', x: 0.615, y: 0.840, region: 'Ice Cream Slopes' },
  { index: 13, color: 'red', x: 0.662, y: 0.880, region: 'Ice Cream Slopes' },
  { index: 14, color: 'purple', x: 0.712, y: 0.905, region: 'Ice Cream Slopes' },

  // 15..22: Gummy Hills
  { index: 15, color: 'yellow', x: 0.766, y: 0.905, region: 'Gummy Hills' },
  { index: 16, color: 'blue', x: 0.820, y: 0.890, region: 'Gummy Hills' },
  {
    index: 17,
    color: 'orange',
    x: 0.870,
    y: 0.855,
    region: 'Gummy Hills',
    landmark: 'gummy',
  },
  {
    index: 18,
    color: 'green',
    x: 0.902,
    y: 0.798,
    region: 'Gummy Hills',
    shortcutEntrance: 'gummy-pass',
  },
  { index: 19, color: 'red', x: 0.902, y: 0.728, region: 'Gummy Hills' },
  { index: 20, color: 'purple', x: 0.875, y: 0.668, region: 'Gummy Hills' },
  { index: 21, color: 'yellow', x: 0.825, y: 0.635, region: 'Gummy Hills' },
  {
    index: 22,
    color: 'blue',
    x: 0.768,
    y: 0.630,
    region: 'Gummy Hills',
    isStarMiniGame: true,
  },

  // 23..37: Lower-middle sweep into Gingerbread House
  { index: 23, color: 'orange', x: 0.710, y: 0.635, region: 'Ice Cream Slopes' },
  { index: 24, color: 'green', x: 0.652, y: 0.640, region: 'Ice Cream Slopes' },
  { index: 25, color: 'red', x: 0.594, y: 0.638, region: 'Ice Cream Slopes' },
  { index: 26, color: 'purple', x: 0.536, y: 0.632, region: 'Ice Cream Slopes' },
  { index: 27, color: 'yellow', x: 0.478, y: 0.625, region: 'Cupcake Commons' },
  { index: 28, color: 'blue', x: 0.420, y: 0.625, region: 'Cupcake Commons' },
  { index: 29, color: 'orange', x: 0.362, y: 0.630, region: 'Gingerbread House' },
  { index: 30, color: 'green', x: 0.304, y: 0.632, region: 'Gingerbread House' },
  { index: 31, color: 'red', x: 0.246, y: 0.622, region: 'Gingerbread House' },
  { index: 32, color: 'purple', x: 0.192, y: 0.595, region: 'Gingerbread House' },
  { index: 33, color: 'yellow', x: 0.145, y: 0.550, region: 'Gingerbread House' },
  { index: 34, color: 'blue', x: 0.125, y: 0.485, region: 'Gingerbread House' },
  {
    index: 35,
    color: 'orange',
    x: 0.162,
    y: 0.432,
    region: 'Gingerbread House',
    landmark: 'gingerbread',
  },
  { index: 36, color: 'green', x: 0.220, y: 0.422, region: 'Gingerbread House' },
  { index: 37, color: 'red', x: 0.278, y: 0.435, region: 'Gingerbread House' },

  // 38..42: Licorice Lagoon
  { index: 38, color: 'purple', x: 0.336, y: 0.448, region: 'Licorice Lagoon' },
  {
    index: 39,
    color: 'yellow',
    x: 0.394,
    y: 0.442,
    region: 'Licorice Lagoon',
    isLicoriceTrap: true,
  },
  { index: 40, color: 'blue', x: 0.452, y: 0.422, region: 'Licorice Lagoon' },
  { index: 41, color: 'orange', x: 0.510, y: 0.422, region: 'Licorice Lagoon' },
  {
    index: 42,
    color: 'green',
    x: 0.568,
    y: 0.445,
    region: 'Licorice Lagoon',
    isLicoriceTrap: true,
  },

  // 43..48: Lollipop Woods
  { index: 43, color: 'red', x: 0.626, y: 0.460, region: 'Lollipop Woods' },
  {
    index: 44,
    color: 'purple',
    x: 0.684,
    y: 0.452,
    region: 'Lollipop Woods',
    landmark: 'lollipop',
  },
  { index: 45, color: 'yellow', x: 0.742, y: 0.442, region: 'Lollipop Woods' },
  {
    index: 46,
    color: 'blue',
    x: 0.800,
    y: 0.448,
    region: 'Lollipop Woods',
    isStarMiniGame: true,
  },
  { index: 47, color: 'orange', x: 0.858, y: 0.452, region: 'Lollipop Woods' },
  { index: 48, color: 'green', x: 0.908, y: 0.420, region: 'Lollipop Woods' },

  // 49..55: Ice Palace
  { index: 49, color: 'red', x: 0.922, y: 0.352, region: 'Ice Palace' },
  { index: 50, color: 'purple', x: 0.905, y: 0.282, region: 'Ice Palace' },
  {
    index: 51,
    color: 'yellow',
    x: 0.858,
    y: 0.232,
    region: 'Ice Palace',
    landmark: 'popsicle',
  },
  { index: 52, color: 'blue', x: 0.800, y: 0.225, region: 'Ice Palace' },
  { index: 53, color: 'orange', x: 0.742, y: 0.252, region: 'Ice Palace' },
  { index: 54, color: 'green', x: 0.684, y: 0.280, region: 'Ice Palace' },
  {
    index: 55,
    color: 'red',
    x: 0.626,
    y: 0.295,
    region: 'Ice Palace',
  },

  // 56..68: Upper sweep & Chocolate Mountain
  { index: 56, color: 'purple', x: 0.568, y: 0.300, region: 'Candy Castle' },
  { index: 57, color: 'yellow', x: 0.510, y: 0.300, region: 'Candy Castle' },
  { index: 58, color: 'blue', x: 0.452, y: 0.295, region: 'Chocolate Mountain' },
  { index: 59, color: 'orange', x: 0.394, y: 0.285, region: 'Chocolate Mountain' },
  { index: 60, color: 'green', x: 0.336, y: 0.275, region: 'Chocolate Mountain' },
  { index: 61, color: 'red', x: 0.278, y: 0.272, region: 'Chocolate Mountain' },
  { index: 62, color: 'purple', x: 0.220, y: 0.272, region: 'Chocolate Mountain' },
  {
    index: 63,
    color: 'yellow',
    x: 0.162,
    y: 0.258,
    region: 'Chocolate Mountain',
    isStarMiniGame: true,
  },
  { index: 64, color: 'blue', x: 0.112, y: 0.215, region: 'Chocolate Mountain' },
  {
    index: 65,
    color: 'orange',
    x: 0.108,
    y: 0.145,
    region: 'Chocolate Mountain',
    landmark: 'chocolate',
  },
  { index: 66, color: 'green', x: 0.158, y: 0.102, region: 'Chocolate Mountain' },
  { index: 67, color: 'red', x: 0.218, y: 0.105, region: 'Chocolate Mountain' },
  { index: 68, color: 'purple', x: 0.278, y: 0.125, region: 'Chocolate Mountain' },

  // 69..71: Candy Castle Finish
  {
    index: 69,
    color: 'yellow',
    x: 0.340,
    y: 0.160,
    region: 'Candy Castle',
    isStarMiniGame: true,
  },
  { index: 70, color: 'blue', x: 0.405, y: 0.180, region: 'Candy Castle' },
  {
    index: 71,
    color: 'rainbow',
    x: 0.485,
    y: 0.175,
    region: 'Candy Castle',
    landmark: 'castle',
  },
] as const;

export const BOARD_SHORTCUTS: readonly BoardShortcut[] = [
  {
    id: 'peppermint-pass',
    name: 'Peppermint Pass',
    fromTile: 3,
    toTile: 34,
    waypoints: [
      { x: 0.175, y: 0.820 },
      { x: 0.105, y: 0.765 },
      { x: 0.075, y: 0.665 },
      { x: 0.085, y: 0.560 },
      { x: 0.125, y: 0.485 },
    ],
  },
  {
    id: 'gummy-pass',
    name: 'Gummy Pass',
    fromTile: 18,
    toTile: 47,
    waypoints: [
      { x: 0.902, y: 0.798 },
      { x: 0.945, y: 0.720 },
      { x: 0.955, y: 0.625 },
      { x: 0.930, y: 0.525 },
      { x: 0.858, y: 0.452 },
    ],
  },
] as const;

export const LAST_TILE_INDEX = BOARD_TILES[BOARD_TILES.length - 1].index;

export function getTileByIndex(tileIndex: number): BoardTile | null {
  if (tileIndex <= 0) return null;
  return BOARD_TILES[tileIndex - 1] ?? null;
}

export function getCoordForTile(tileIndex: number): BoardCoord {
  if (tileIndex <= 0) return START_COORD;
  const tile = getTileByIndex(tileIndex);
  return tile ? { x: tile.x, y: tile.y } : BOARD_TILES[BOARD_TILES.length - 1];
}

export function getShortcutFromTile(tileIndex: number): BoardShortcut | null {
  return BOARD_SHORTCUTS.find((s) => s.fromTile === tileIndex) ?? null;
}

export function getShortcutById(id: ShortcutId): BoardShortcut | null {
  return BOARD_SHORTCUTS.find((s) => s.id === id) ?? null;
}

export function getLandmarkTile(landmark: LandmarkId): BoardTile | null {
  return BOARD_TILES.find((t) => t.landmark === landmark) ?? null;
}
