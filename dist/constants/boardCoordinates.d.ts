import { PlayerColor } from '../types/ludo';
export interface GridCoord {
    row: number;
    col: number;
}
/**
 * EXACT LUDO KING BOARD LAYOUT:
 *
 * - Top-Left Yard (rows 0..5, cols 0..5): RED
 * - Top-Right Yard (rows 0..5, cols 9..14): GREEN
 * - Bottom-Right Yard (rows 9..14, cols 9..14): YELLOW
 * - Bottom-Left Yard (rows 9..14, cols 0..5): BLUE
 *
 * Clockwise Track (52 tiles):
 * Starts at Red entrance (row 6, col 0) and moves clockwise around the cross.
 */
export declare const TRACK_COORDINATES: GridCoord[];
/**
 * Starting track indices on the 52-tile track for each color
 */
export declare const COLOR_START_INDEX: Record<PlayerColor, number>;
/**
 * The 8 Universal Safe Spots (Stars):
 * - 4 Starting Squares (Colored)
 * - 4 Star Squares (White with Star Icon)
 */
export declare const SAFE_INDICES: Set<number>;
/**
 * 5 Colored Home Stretch tiles leading into the central home triangle (step 52 to 56)
 */
export declare const HOME_STRETCH_COORDINATES: Record<PlayerColor, GridCoord[]>;
/**
 * Center Finish (Home triangle) position (step 57)
 * Each player's 4 pawns have dedicated slots inside their colored triangle pointing to the trophy.
 */
export declare const CENTER_HOME_SLOTS: Record<PlayerColor, GridCoord[]>;
export declare const CENTER_HOME_COORDINATES: Record<PlayerColor, GridCoord>;
/**
 * 4 Yard slots for each player base (where pawns sit when in base):
 * - RED: Top-Left (rows 0..5, cols 0..5)
 * - GREEN: Top-Right (rows 0..5, cols 9..14)
 * - YELLOW: Bottom-Right (rows 9..14, cols 9..14)
 * - BLUE: Bottom-Left (rows 9..14, cols 0..5)
 */
export declare const YARD_COORDINATES: Record<PlayerColor, GridCoord[]>;
/**
 * Authentic Ludo King color styling matching actual app
 */
export declare const COLOR_CONFIG: Record<PlayerColor, {
    name: string;
    primary: string;
    dark: string;
    light: string;
    badgeBg: string;
    border: string;
    diceColor: string;
    pawnGradient: [string, string];
}>;
export declare const TOTAL_STEPS_TO_HOME = 57;
