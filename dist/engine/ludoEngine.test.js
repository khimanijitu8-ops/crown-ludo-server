"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ludoEngine_1 = require("./ludoEngine");
function assert(condition, msg) {
    if (!condition) {
        console.error(`❌ FAILED: ${msg}`);
        throw new Error(`Test failed: ${msg}`);
    }
    else {
        console.log(`✅ PASSED: ${msg}`);
    }
}
console.log('--- STARTING LUDO ENGINE TESTS ---');
// TEST 1: Board Slots
assert(JSON.stringify(ludoEngine_1.BOARD_SLOTS) === JSON.stringify(['red', 'green', 'yellow', 'blue']), 'BOARD_SLOTS are canonical [red, green, yellow, blue]');
// TEST 2: 4-Player Match Clockwise Seating & Turn Order
const match4P = (0, ludoEngine_1.initialize4PlayerMatch)('vs_computer', 'blue');
assert(match4P.players.length === 4, '4-player match has exactly 4 players');
assert(match4P.players[0].color === 'red', 'Slot 0 is Red');
assert(match4P.players[1].color === 'green', 'Slot 1 is Green');
assert(match4P.players[2].color === 'yellow', 'Slot 2 is Yellow');
assert(match4P.players[3].color === 'blue', 'Slot 3 is Blue');
assert(match4P.activePlayerIndex === 3, 'Human Blue starts at index 3');
// Check Clockwise Turn Progression: Blue (3) -> Red (0) -> Green (1) -> Yellow (2) -> Blue (3)
const afterBlue = (0, ludoEngine_1.getNextActivePlayerIndex)(match4P.players, 3);
assert(afterBlue === 0, 'After Blue (3), next player is Red (0) - Zero diagonal skips');
assert(match4P.players[afterBlue].color === 'red', 'Next player color is Red');
const afterRed = (0, ludoEngine_1.getNextActivePlayerIndex)(match4P.players, 0);
assert(afterRed === 1, 'After Red (0), next player is Green (1)');
assert(match4P.players[afterRed].color === 'green', 'Next player color is Green');
const afterGreen = (0, ludoEngine_1.getNextActivePlayerIndex)(match4P.players, 1);
assert(afterGreen === 2, 'After Green (1), next player is Yellow (2)');
assert(match4P.players[afterGreen].color === 'yellow', 'Next player color is Yellow');
const afterYellow = (0, ludoEngine_1.getNextActivePlayerIndex)(match4P.players, 2);
assert(afterYellow === 3, 'After Yellow (2), next player is Blue (3)');
assert(match4P.players[afterYellow].color === 'blue', 'Next player color is Blue');
// TEST 3: 2-Player Match Diagonal Seating & Strict Alternation
const match2P = (0, ludoEngine_1.initialize2PlayerMatch)('vs_computer', 'DIAGONAL', 'blue');
assert(match2P.players.length === 2, '2-player match has exactly 2 players');
assert(match2P.players[0].color === 'blue', 'Player 0 is Blue');
assert(match2P.players[1].color === 'green', 'Player 1 is Green');
assert(match2P.activePlayerIndex === 0, 'Blue starts at index 0');
const next2P_1 = (0, ludoEngine_1.getNextActivePlayerIndex)(match2P.players, 0);
assert(next2P_1 === 1, '2-Player turn alternates 0 -> 1 (Green)');
const next2P_2 = (0, ludoEngine_1.getNextActivePlayerIndex)(match2P.players, 1);
assert(next2P_2 === 0, '2-Player turn alternates 1 -> 0 (Blue)');
// TEST 4: Dice Roll 6 Unlocks Yard Token
const blueP = match2P.players[0];
const legalMovesOn6 = (0, ludoEngine_1.getLegalMoves)(blueP, 6);
assert(legalMovesOn6.length === 4, 'Rolling a 6 makes all 4 yard tokens legal to deploy');
const legalMovesOn5 = (0, ludoEngine_1.getLegalMoves)(blueP, 5);
assert(legalMovesOn5.length === 0, 'Rolling a 5 with all tokens in yard yields 0 legal moves');
// TEST 5: Anti-Frustration Rule - 3rd Consecutive 6 is Strictly Clamped to 1..5
const playerWithTrackToken = {
    ...blueP,
    tokens: [
        { id: 0, color: 'blue', state: 'ACTIVE_TRACK', boardIndex: 40, stepCount: 1 },
        ...blueP.tokens.slice(1),
    ],
};
let rollState = { ...match2P, players: [playerWithTrackToken, match2P.players[1]], consecutiveSixes: 2 };
const rollResult = (0, ludoEngine_1.handleDiceRoll)(rollState, 6);
assert(rollResult.nextState.diceValue !== null &&
    rollResult.nextState.diceValue >= 1 &&
    rollResult.nextState.diceValue <= 5, 'Anti-frustration: 3rd consecutive 6 is automatically converted to 1..5');
assert(rollResult.penaltyApplied === false, 'Penalty is never applied because 3rd six is prevented');
// TEST 6: No Valid Moves -> Auto Pass Turn (Even on 6 if all tokens overshoot)
const stuckTokenPlayer = {
    ...blueP,
    tokens: [
        { id: 0, color: 'blue', state: 'HOME_COLUMN', boardIndex: -1, stepCount: 55 },
        { id: 1, color: 'blue', state: 'FINISHED', boardIndex: -1, stepCount: 57 },
        { id: 2, color: 'blue', state: 'FINISHED', boardIndex: -1, stepCount: 57 },
        { id: 3, color: 'blue', state: 'FINISHED', boardIndex: -1, stepCount: 57 },
    ]
};
// Token 0 needs 57 - 55 = 2 to finish. A roll of 6 overshoots (55 + 6 = 61 > 57)
const movesStuckOn6 = (0, ludoEngine_1.getLegalMoves)(stuckTokenPlayer, 6);
assert(movesStuckOn6.length === 0, 'Roll of 6 overshooting home produces 0 legal moves');
const stuckState = {
    ...match2P,
    players: [stuckTokenPlayer, match2P.players[1]],
    activePlayerIndex: 0
};
const rollStuckResult = (0, ludoEngine_1.handleDiceRoll)(stuckState, 6);
assert(rollStuckResult.legalMoves.length === 0, 'handleDiceRoll identifies 0 legal moves');
assert(rollStuckResult.nextState.waitingForMove === false, 'waitingForMove is false when no legal moves');
assert(rollStuckResult.nextState.consecutiveSixes === 0, 'consecutiveSixes is reset');
assert(rollStuckResult.nextState.activePlayerIndex === 1, 'Turn immediately passes to next player (1) when no legal moves');
assert(rollStuckResult.nextState.turnPhase === 'bot_thinking', 'Next player phase is bot_thinking');
// TEST 7: Exact Roll to Finish
const movesStuckOn2 = (0, ludoEngine_1.getLegalMoves)(stuckTokenPlayer, 2);
assert(movesStuckOn2.length === 1 && movesStuckOn2[0] === 0, 'Roll of exact 2 allows finishing token 0');
console.log('--- ALL ENGINE UNIT TESTS PASSED SUCCESSFULLY! ---');
