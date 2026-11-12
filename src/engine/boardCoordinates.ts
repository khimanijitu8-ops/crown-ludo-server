import { PlayerColor } from './types';

export const SAFE_INDICES = [1, 9, 14, 22, 27, 35, 40, 48];

export const COLOR_START_INDEX: Record<PlayerColor, number> = {
  red: 1,
  green: 14,
  yellow: 27,
  blue: 40,
};

export const COLOR_HOME_ENTRY_INDEX: Record<PlayerColor, number> = {
  red: 51,
  green: 12,
  yellow: 25,
  blue: 38,
};

export const TOTAL_TRACK_TILES = 52;
export const TOTAL_STEPS_TO_HOME = 51;
export const TOTAL_STEPS_TO_GOAL = 57;
