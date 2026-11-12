/**
 * 👑 ROYAL LUDO AUTHORITATIVE DICE & MOVE VALIDATOR (M-03)
 * ==============================================================================
 * Cryptographically secure server-authoritative dice generation and move validation.
 * Uses Node.js crypto.randomInt (CS-PRNG) with optional RNG injection for testing.
 * ==============================================================================
 */

const crypto = require('crypto');
const ludoEngine = require('../dist/engine/ludoEngine');

/**
 * Generates an authoritative dice roll.
 * Enforces strict anti-frustration rule: if player already rolled 6 twice,
 * the 3rd roll is clamped to 1..5.
 *
 * @param {number} consecutiveSixes Current count of consecutive sixes rolled.
 * @param {Function} [rngSource=crypto.randomInt] Optional RNG function for deterministic testing.
 * @returns {number} Integer between 1 and 6 (or 1 and 5 when clamped).
 */
function generateAuthoritativeDiceRoll(consecutiveSixes = 0, rngSource = crypto.randomInt) {
  const safeConsecutive = Math.max(0, Math.floor(Number(consecutiveSixes) || 0));
  const maxRange = safeConsecutive >= 2 ? 6 : 7; // crypto.randomInt is exclusive of max: [1, 6) or [1, 7)
  const maxAllowed = safeConsecutive >= 2 ? 5 : 6;

  const raw = rngSource(1, maxRange);

  // Strict integer and bounds validation
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > maxAllowed) {
    throw new Error(`RNG produced invalid dice value: ${raw} (expected integer 1..${maxAllowed})`);
  }

  return raw;
}

/**
 * Validates player identity, turn ownership, pending roll, token ownership,
 * and legality of a move before executing it atomically on the server state.
 *
 * @param {Object} room In-memory room object.
 * @param {Object} ws Client WebSocket connection with bound playerColor.
 * @param {number} tokenId Token ID to move (0..3).
 * @returns {Object} Result object indicating success or failure with details.
 */
function validatePlayerMove(room, ws, tokenId) {
  if (!room || !room.serverGameState) {
    return { success: false, code: 'GAME_NOT_INITIALIZED', message: 'Game not initialized in room' };
  }

  const gameState = room.serverGameState;
  const activePlayer = gameState.players[gameState.activePlayerIndex];

  // 1. Authenticated Player Identity & Turn Verification
  if (!ws || !ws.playerColor) {
    return { success: false, code: 'UNAUTHENTICATED_SOCKET', message: 'Socket is not authenticated to a player color' };
  }

  // M-06: Autonomous bot guard - external client sockets cannot dispatch moves on behalf of bots
  if (activePlayer.isBot && !ws.isBot) {
    return {
      success: false,
      code: 'BOT_TURN_AUTONOMOUS',
      message: 'Active player is a bot and moves are controlled autonomously by the server',
    };
  }

  if (ws.playerColor !== activePlayer.color) {
    return {
      success: false,
      code: 'NOT_ACTIVE_PLAYER',
      message: `It is ${activePlayer.color}'s turn to move, but move was requested by ${ws.playerColor}`,
    };
  }

  // 2. Pending Dice Roll Verification
  if (!room.pendingRoll) {
    return { success: false, code: 'NO_PENDING_ROLL', message: 'No pending dice roll found for this turn' };
  }

  if (room.pendingRoll.turnSeq !== room.turnSeq) {
    return { success: false, code: 'STALE_PENDING_ROLL', message: 'Pending roll does not belong to the current turn sequence' };
  }

  if (room.pendingRoll.playerColor !== ws.playerColor) {
    return { success: false, code: 'ROLL_COLOR_MISMATCH', message: 'Pending roll was recorded for a different player color' };
  }

  // 3. Token Ownership & ID Verification
  const idNum = Number(tokenId);
  if (!Number.isInteger(idNum) || idNum < 0 || idNum > 3) {
    return { success: false, code: 'INVALID_TOKEN_ID', message: `Token ID must be an integer between 0 and 3, received: ${tokenId}` };
  }

  const targetToken = activePlayer.tokens.find((t) => t.id === idNum);
  if (!targetToken || targetToken.color !== ws.playerColor) {
    return { success: false, code: 'INVALID_TOKEN_OWNERSHIP', message: `Token ${idNum} does not belong to player ${ws.playerColor}` };
  }

  // 4. Move Legality Verification via Headless Engine
  const rolledValue = room.pendingRoll.rollValue;
  const legalMoves = ludoEngine.getLegalMoves(activePlayer, rolledValue);

  if (!legalMoves.includes(idNum)) {
    // REJECTION: pendingRoll remains intact! The player retains their roll to select a valid pawn.
    return {
      success: false,
      code: 'ILLEGAL_MOVE',
      message: `Token ${idNum} cannot legally move with rolled dice value ${rolledValue}`,
      legalMoves,
    };
  }

  // 5. Execution Phase (Pure immutable engine transformation)
  // Ensure the state passed to applyTokenMove reflects the verified pending roll
  const stateWithDice = {
    ...gameState,
    diceRoll: gameState.diceRoll ?? rolledValue,
    diceValue: gameState.diceValue ?? rolledValue,
  };
  const moveResult = ludoEngine.applyTokenMove(stateWithDice, idNum, ws.playerColor);

  // 6. Atomic Commit Phase: commit state and consume pending roll simultaneously
  const consumedRoll = room.pendingRoll.rollValue;
  room.serverGameState = moveResult.nextState;
  room.pendingRoll = null; // Atomically consumed

  // If no extra turn was awarded and the game is not over, advance turn sequence
  const isGameOver = moveResult.nextState.gameStatus === 'FINISHED' || (moveResult.nextState.winners && moveResult.nextState.winners.length >= (gameState.players.length - 1));
  if (!moveResult.extraTurn && !isGameOver) {
    room.turnSeq++;
  }

  return {
    success: true,
    moveResult,
    consumedRoll,
    isGameOver,
    hasKilled: moveResult.hasKilled,
    reachedHome: moveResult.reachedHome,
    extraTurn: moveResult.extraTurn,
  };
}

/**
 * Handles an authoritative 15-second timeout on the server without altering existing rules:
 * Clears pending rolls, records missed strike, converts to bot if 3 strikes reached,
 * and advances turn clockwise.
 *
 * @param {Object} room In-memory room object.
 * @returns {Object} Details of the timeout action taken.
 */
function executeAuthoritativeTimeout(room) {
  if (!room || !room.serverGameState) return null;

  room.pendingRoll = null; // Clear any pending roll

  const activePlayer = room.serverGameState.players[room.serverGameState.activePlayerIndex];
  const client = room.clients.find((c) => c.color === activePlayer.color);

  let convertedToBot = false;
  if (client) {
    client.missedStrikes = (client.missedStrikes || 0) + 1;
    if (client.missedStrikes >= 3 && !client.isBot) {
      client.isBot = true;
      client.name = `${client.name} (Bot)`;
      convertedToBot = true;
    }
  }

  // Synchronize bot identity into serverGameState.players
  let updatedPlayers = room.serverGameState.players;
  if (convertedToBot && client) {
    updatedPlayers = updatedPlayers.map((p) =>
      p.color === client.color ? { ...p, isBot: true, name: client.name } : p
    );
  }

  // Advance turn clockwise using existing headless engine
  const nextIndex = ludoEngine.getNextActivePlayerIndex(
    updatedPlayers,
    room.serverGameState.activePlayerIndex
  );

  room.serverGameState = {
    ...room.serverGameState,
    players: updatedPlayers,
    activePlayerIndex: nextIndex,
    diceRoll: null,
    diceValue: null,
    waitingForMove: false,
    movableTokenIds: [],
    consecutiveSixes: 0,
    turnPhase: updatedPlayers[nextIndex].isBot ? 'bot_thinking' : 'rolling',
  };

  room.turnSeq++; // Transition turn sequence
  const nextPlayer = updatedPlayers[nextIndex];

  return {
    timedOutColor: activePlayer.color,
    nextColor: nextPlayer.color,
    convertedToBot,
    client,
  };
}

/**
 * M-07: In-memory token bucket rate limiter for WebSocket connections.
 * Allows burst traffic up to burstCapacity, then throttles to refillRatePerSec.
 */
function createTokenBucket(burstCapacity = 15, refillRatePerSec = 5) {
  return {
    tokens: burstCapacity,
    lastRefill: Date.now(),
    consume(count = 1) {
      const now = Date.now();
      const elapsedSec = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(burstCapacity, this.tokens + elapsedSec * refillRatePerSec);
      this.lastRefill = now;
      if (this.tokens >= count) {
        this.tokens -= count;
        return true;
      }
      return false;
    },
  };
}

/**
 * M-07: Cryptographically secure token generator for seat reconnection.
 */
function generateSecureToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Signs an HS256 JWT using Node.js crypto (zero external npm dependencies).
 */
function signHS256Jwt(payload, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

/**
 * Verifies an HS256 JWT using timing-safe signature comparison and expiration checks.
 */
function verifyHS256Jwt(token, secret) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'MISSING_TOKEN' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, error: 'MALFORMED_JWT' };
  const [h, p, sig] = parts;

  let header;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'INVALID_JSON_HEADER' };
  }
  if (!header || header.alg !== 'HS256') {
    return { valid: false, error: 'UNSUPPORTED_ALG' };
  }

  let expectedSig;
  try {
    expectedSig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  } catch (err) {
    return { valid: false, error: 'HMAC_ERROR', message: err.message };
  }

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'INVALID_JSON_PAYLOAD' };
  }

  if (payload.exp && typeof payload.exp === 'number') {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds >= payload.exp) {
      return { valid: false, error: 'TOKEN_EXPIRED', payload };
    }
  }

  return { valid: true, payload };
}

module.exports = {
  generateAuthoritativeDiceRoll,
  validatePlayerMove,
  executeAuthoritativeTimeout,
  createTokenBucket,
  generateSecureToken,
  signHS256Jwt,
  verifyHS256Jwt,
  ludoEngine,
};
