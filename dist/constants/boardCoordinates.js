"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOTAL_STEPS_TO_HOME = exports.COLOR_CONFIG = exports.YARD_COORDINATES = exports.CENTER_HOME_COORDINATES = exports.CENTER_HOME_SLOTS = exports.HOME_STRETCH_COORDINATES = exports.SAFE_INDICES = exports.COLOR_START_INDEX = exports.TRACK_COORDINATES = void 0;
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
exports.TRACK_COORDINATES = [
    // 0..5: Left Arm, Top Row (Moving Right towards Center)
    { row: 6, col: 0 }, // 0: Red Entrance Arrow (→)
    { row: 6, col: 1 }, // 1: RED START TILE (Safe)
    { row: 6, col: 2 }, // 2
    { row: 6, col: 3 }, // 3
    { row: 6, col: 4 }, // 4
    { row: 6, col: 5 }, // 5
    // 6..11: Top Arm, Left Column (Moving Up)
    { row: 5, col: 6 }, // 6
    { row: 4, col: 6 }, // 7
    { row: 3, col: 6 }, // 8
    { row: 2, col: 6 }, // 9: SAFE STAR (Top Arm)
    { row: 1, col: 6 }, // 10
    { row: 0, col: 6 }, // 11
    // 12: Top-most tile
    { row: 0, col: 7 }, // 12
    // 13..18: Top Arm, Right Column (Moving Down towards Center)
    { row: 0, col: 8 }, // 13: Green Entrance Arrow (↓)
    { row: 1, col: 8 }, // 14: GREEN START TILE (Safe)
    { row: 2, col: 8 }, // 15
    { row: 3, col: 8 }, // 16
    { row: 4, col: 8 }, // 17
    { row: 5, col: 8 }, // 18
    // 19..24: Right Arm, Top Row (Moving Right)
    { row: 6, col: 9 }, // 19
    { row: 6, col: 10 }, // 20
    { row: 6, col: 11 }, // 21
    { row: 6, col: 12 }, // 22: SAFE STAR (Right Arm)
    { row: 6, col: 13 }, // 23
    { row: 6, col: 14 }, // 24
    // 25: Right-most tile
    { row: 7, col: 14 }, // 25
    // 26..31: Right Arm, Bottom Row (Moving Left towards Center)
    { row: 8, col: 14 }, // 26: Yellow Entrance Arrow (←)
    { row: 8, col: 13 }, // 27: YELLOW START TILE (Safe)
    { row: 8, col: 12 }, // 28
    { row: 8, col: 11 }, // 29
    { row: 8, col: 10 }, // 30
    { row: 8, col: 9 }, // 31
    // 32..37: Bottom Arm, Right Column (Moving Down)
    { row: 9, col: 8 }, // 32
    { row: 10, col: 8 }, // 33
    { row: 11, col: 8 }, // 34
    { row: 12, col: 8 }, // 35: SAFE STAR (Bottom Arm)
    { row: 13, col: 8 }, // 36
    { row: 14, col: 8 }, // 37
    // 38: Bottom-most tile
    { row: 14, col: 7 }, // 38
    // 39..44: Bottom Arm, Left Column (Moving Up towards Center)
    { row: 14, col: 6 }, // 39: Blue Entrance Arrow (↑)
    { row: 13, col: 6 }, // 40: BLUE START TILE (Safe)
    { row: 12, col: 6 }, // 41
    { row: 11, col: 6 }, // 42
    { row: 10, col: 6 }, // 43
    { row: 9, col: 6 }, // 44
    // 45..50: Left Arm, Bottom Row (Moving Left)
    { row: 8, col: 5 }, // 45
    { row: 8, col: 4 }, // 46
    { row: 8, col: 3 }, // 47
    { row: 8, col: 2 }, // 48: SAFE STAR (Left Arm)
    { row: 8, col: 1 }, // 49
    { row: 8, col: 0 }, // 50
    // 51: Left-most tile (turns into Red Home Stretch)
    { row: 7, col: 0 }, // 51
];
/**
 * Starting track indices on the 52-tile track for each color
 */
exports.COLOR_START_INDEX = {
    red: 1, // row 6, col 1
    green: 14, // row 1, col 8
    yellow: 27, // row 8, col 13
    blue: 40, // row 13, col 6
};
/**
 * The 8 Universal Safe Spots (Stars):
 * - 4 Starting Squares (Colored)
 * - 4 Star Squares (White with Star Icon)
 */
exports.SAFE_INDICES = new Set([
    1, // Red Start
    9, // Star on Top Arm (Left col)
    14, // Green Start
    22, // Star on Right Arm (Top row)
    27, // Yellow Start
    35, // Star on Bottom Arm (Right col)
    40, // Blue Start
    48, // Star on Left Arm (Bottom row)
]);
/**
 * 5 Colored Home Stretch tiles leading into the central home triangle (step 52 to 56)
 */
exports.HOME_STRETCH_COORDINATES = {
    red: [
        { row: 7, col: 1 },
        { row: 7, col: 2 },
        { row: 7, col: 3 },
        { row: 7, col: 4 },
        { row: 7, col: 5 },
    ],
    green: [
        { row: 1, col: 7 },
        { row: 2, col: 7 },
        { row: 3, col: 7 },
        { row: 4, col: 7 },
        { row: 5, col: 7 },
    ],
    yellow: [
        { row: 7, col: 13 },
        { row: 7, col: 12 },
        { row: 7, col: 11 },
        { row: 7, col: 10 },
        { row: 7, col: 9 },
    ],
    blue: [
        { row: 13, col: 7 },
        { row: 12, col: 7 },
        { row: 11, col: 7 },
        { row: 10, col: 7 },
        { row: 9, col: 7 },
    ],
};
/**
 * Center Finish (Home triangle) position (step 57)
 * Each player's 4 pawns have dedicated slots inside their colored triangle pointing to the trophy.
 */
exports.CENTER_HOME_SLOTS = {
    red: [
        { row: 6.8, col: 6.3 },
        { row: 7.2, col: 6.3 },
        { row: 6.6, col: 6.6 },
        { row: 7.4, col: 6.6 },
    ],
    green: [
        { row: 6.3, col: 6.8 },
        { row: 6.3, col: 7.2 },
        { row: 6.6, col: 6.6 },
        { row: 6.6, col: 7.4 },
    ],
    yellow: [
        { row: 6.8, col: 7.7 },
        { row: 7.2, col: 7.7 },
        { row: 6.6, col: 7.4 },
        { row: 7.4, col: 7.4 },
    ],
    blue: [
        { row: 7.7, col: 6.8 },
        { row: 7.7, col: 7.2 },
        { row: 7.4, col: 6.6 },
        { row: 7.4, col: 7.4 },
    ],
};
exports.CENTER_HOME_COORDINATES = {
    red: { row: 7, col: 6.4 },
    green: { row: 6.4, col: 7 },
    yellow: { row: 7, col: 7.6 },
    blue: { row: 7.6, col: 7 },
};
/**
 * 4 Yard slots for each player base (where pawns sit when in base):
 * - RED: Top-Left (rows 0..5, cols 0..5)
 * - GREEN: Top-Right (rows 0..5, cols 9..14)
 * - YELLOW: Bottom-Right (rows 9..14, cols 9..14)
 * - BLUE: Bottom-Left (rows 9..14, cols 0..5)
 */
exports.YARD_COORDINATES = {
    red: [
        { row: 1.5, col: 1.5 },
        { row: 1.5, col: 3.5 },
        { row: 3.5, col: 1.5 },
        { row: 3.5, col: 3.5 },
    ],
    green: [
        { row: 1.5, col: 10.5 },
        { row: 1.5, col: 12.5 },
        { row: 3.5, col: 10.5 },
        { row: 3.5, col: 12.5 },
    ],
    yellow: [
        { row: 10.5, col: 10.5 },
        { row: 10.5, col: 12.5 },
        { row: 12.5, col: 10.5 },
        { row: 12.5, col: 12.5 },
    ],
    blue: [
        { row: 10.5, col: 1.5 },
        { row: 10.5, col: 3.5 },
        { row: 12.5, col: 1.5 },
        { row: 12.5, col: 3.5 },
    ],
};
/**
 * Authentic Ludo King color styling matching actual app
 */
exports.COLOR_CONFIG = {
    red: {
        name: 'Red',
        primary: '#EA2027',
        dark: '#B7151B',
        light: '#FFD2D4',
        badgeBg: 'rgba(234, 32, 39, 0.15)',
        border: '#B7151B',
        diceColor: '#EA2027',
        pawnGradient: ['#FF5E62', '#EA2027'],
    },
    green: {
        name: 'Green',
        primary: '#009432',
        dark: '#006B24',
        light: '#C8F7C5',
        badgeBg: 'rgba(0, 148, 50, 0.15)',
        border: '#006B24',
        diceColor: '#009432',
        pawnGradient: ['#26DE81', '#009432'],
    },
    yellow: {
        name: 'Yellow',
        primary: '#FFC312',
        dark: '#C79100',
        light: '#FFF3B0',
        badgeBg: 'rgba(255, 195, 18, 0.15)',
        border: '#C79100',
        diceColor: '#FFC312',
        pawnGradient: ['#FED330', '#D980FA'],
    },
    blue: {
        name: 'Blue',
        primary: '#0984E3',
        dark: '#0652DD',
        light: '#D0E8FF',
        badgeBg: 'rgba(9, 132, 227, 0.15)',
        border: '#0652DD',
        diceColor: '#0984E3',
        pawnGradient: ['#48DBFB', '#0984E3'],
    },
};
exports.TOTAL_STEPS_TO_HOME = 57;
