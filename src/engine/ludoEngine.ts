import {
  COLOR_START_INDEX,
  SAFE_INDICES,
  TOTAL_STEPS_TO_HOME,
  TOTAL_STEPS_TO_GOAL,
  TOTAL_TRACK_TILES,
} from './boardCoordinates';
import {
  BOARD_SLOTS,
  GameState,
  MoveResult,
  Player,
  PlayerColor,
  Token,
  TokenState,
} from './types';

export { BOARD_SLOTS };

export function initializeTokens(color: PlayerColor): Token[] {
  return [0, 1, 2, 3].map((tokenIdx) => ({
    id: tokenIdx,
    color,
    state: 'HOME_YARD',
    boardIndex: -1,
    stepCount: 0,
  }));
}

export function createInitialPlayer(
  id: string | number,
  name: string,
  color: PlayerColor,
  isBot: boolean,
  avatarEmoji?: string,
  avatarId?: string
): Player {
  return {
    id,
    name,
    color,
    isBot,
    tokens: initializeTokens(color),
    isFinished: false,
    hasFinished: false,
    avatarEmoji,
    avatarId,
  };
}

export function createInitialGame(
  mode: GameState['mode'] = 'online_multiplayer',
  playerConfigs: { name: string; color: PlayerColor; isBot: boolean; avatarEmoji?: string; avatarId?: string }[],
  initialColor: PlayerColor = 'blue'
): GameState {
  const players = playerConfigs.map((p, idx) =>
    createInitialPlayer(`p-${idx}`, p.name, p.color, p.isBot, p.avatarEmoji, p.avatarId)
  );

  const startIndex = players.findIndex((p) => p.color === initialColor);
  const activeIdx = startIndex !== -1 ? startIndex : 0;
  const initialPlayer = players[activeIdx];

  return {
    mode,
    players,
    activePlayerIndex: activeIdx,
    diceRoll: null,
    diceValue: null,
    consecutiveSixes: 0,
    waitingForMove: false,
    turnPhase: initialPlayer?.isBot ? 'bot_thinking' : 'rolling',
    movableTokenIds: [],
    gameStatus: 'IN_PROGRESS',
    winners: [],
    lastCapturedPlayer: null,
    message: initialPlayer ? `${initialPlayer.name}'s turn to roll!` : 'Turn to roll!',
  };
}

export function initialize2PlayerMatch(
  mode: GameState['mode'] = 'online_multiplayer',
  layout: 'DIAGONAL' | 'OPPOSITE' | 'ADJACENT' = 'DIAGONAL',
  humanColor: PlayerColor = 'blue'
): GameState {
  const colors: PlayerColor[] =
    humanColor === 'blue' || humanColor === 'green'
      ? ['blue', 'green']
      : ['red', 'yellow'];

  const players: Player[] = colors.map((color, index) => ({
    id: index,
    color,
    name: color === humanColor ? 'You' : `Player ${color.toUpperCase()}`,
    isBot: false,
    isFinished: false,
    hasFinished: false,
    tokens: initializeTokens(color),
    avatarEmoji: color === 'blue' ? '👑' : '🎯',
  }));

  // Start with blue
  const blueIdx = players.findIndex((p) => p.color === 'blue');

  return {
    mode,
    players,
    activePlayerIndex: blueIdx !== -1 ? blueIdx : 0,
    diceRoll: null,
    diceValue: null,
    consecutiveSixes: 0,
    waitingForMove: false,
    turnPhase: 'rolling',
    movableTokenIds: [],
    gameStatus: 'IN_PROGRESS',
    winners: [],
    message: 'Game started! Blue rolls first.',
  };
}

export function initialize3PlayerMatch(
  mode: GameState['mode'] = 'online_multiplayer',
  humanColor: PlayerColor = 'blue'
): GameState {
  // Clockwise 3P: Red, Green, Blue
  const colors: PlayerColor[] = ['red', 'green', 'blue'];

  const players: Player[] = colors.map((color, index) => ({
    id: index,
    color,
    name: color === humanColor ? 'You' : `Player ${color.toUpperCase()}`,
    isBot: false,
    isFinished: false,
    hasFinished: false,
    tokens: initializeTokens(color),
    avatarEmoji: '👑',
  }));

  const blueIdx = players.findIndex((p) => p.color === 'blue');

  return {
    mode,
    players,
    activePlayerIndex: blueIdx !== -1 ? blueIdx : 0,
    diceRoll: null,
    diceValue: null,
    consecutiveSixes: 0,
    waitingForMove: false,
    turnPhase: 'rolling',
    movableTokenIds: [],
    gameStatus: 'IN_PROGRESS',
    winners: [],
    message: 'Game started! Blue rolls first.',
  };
}

export function initialize4PlayerMatch(
  mode: GameState['mode'] = 'online_multiplayer',
  humanColor: PlayerColor = 'blue'
): GameState {
  const colorOrder: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

  const players: Player[] = colorOrder.map((color, index) => ({
    id: index,
    color,
    name: color === humanColor ? 'You' : `Player ${color.toUpperCase()}`,
    isBot: false,
    isFinished: false,
    hasFinished: false,
    tokens: initializeTokens(color),
    avatarEmoji: '👑',
  }));

  const blueIdx = players.findIndex((p) => p.color === 'blue');

  return {
    mode,
    players,
    activePlayerIndex: blueIdx !== -1 ? blueIdx : 0,
    diceRoll: null,
    diceValue: null,
    consecutiveSixes: 0,
    waitingForMove: false,
    turnPhase: 'rolling',
    movableTokenIds: [],
    gameStatus: 'IN_PROGRESS',
    winners: [],
    message: 'Game started! Blue rolls first.',
  };
}

export const applyTokenMove = (
  state: GameState,
  tokenId: number,
  _expectedColor?: PlayerColor
): MoveResult => executeMove(state, tokenId);

export const getMovableTokenIds = getLegalMoves;

export function canTokenMove(token: Token, roll: number): boolean {
  if (token.state === 'FINISHED' || token.state === 'home') return false;

  if (token.state === 'HOME_YARD' || token.state === 'yard') {
    return roll === 6;
  }

  // Exact home completion: total steps to goal is 57
  return token.stepCount + roll <= TOTAL_STEPS_TO_GOAL;
}

export function getLegalMoves(player: Player, roll: number): number[] {
  if (!player || !player.tokens) return [];
  const legal: number[] = [];
  player.tokens.forEach((t) => {
    if (canTokenMove(t, roll)) {
      legal.push(t.id);
    }
  });
  return legal;
}

export function getNextActivePlayerIndex(players: Player[], currentIndex: number): number {
  if (!players || players.length === 0) return 0;
  let next = (currentIndex + 1) % players.length;
  let checks = 0;
  while (players[next].isFinished && checks < players.length) {
    next = (next + 1) % players.length;
    checks++;
  }
  return next;
}

export function handleDiceRoll(state: GameState, roll: number): {
  nextState: GameState;
  autoPassed: boolean;
  legalMoves: number[];
  penaltyApplied?: boolean;
} {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return { nextState: state, autoPassed: false, legalMoves: [] };

  let consecutiveSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;

  // Rule of three consecutive 6s: forfeit turn
  if (consecutiveSixes >= 3) {
    const nextIdx = getNextActivePlayerIndex(state.players, state.activePlayerIndex);
    return {
      nextState: {
        ...state,
        diceRoll: roll,
        diceValue: roll,
        consecutiveSixes: 0,
        waitingForMove: false,
        activePlayerIndex: nextIdx,
        turnPhase: state.players[nextIdx]?.isBot ? 'bot_thinking' : 'rolling',
        movableTokenIds: [],
        message: 'Three 6s in a row! Turn forfeited.',
      },
      autoPassed: true,
      penaltyApplied: true,
      legalMoves: [],
    };
  }

  const legalMoves = getLegalMoves(activePlayer, roll);

  if (legalMoves.length === 0) {
    // No moves possible -> auto advance turn
    const nextIdx = getNextActivePlayerIndex(state.players, state.activePlayerIndex);
    return {
      nextState: {
        ...state,
        diceRoll: roll,
        diceValue: roll,
        consecutiveSixes: 0,
        waitingForMove: false,
        activePlayerIndex: nextIdx,
        turnPhase: state.players[nextIdx]?.isBot ? 'bot_thinking' : 'rolling',
        movableTokenIds: [],
        message: 'No legal moves available. Turn passed.',
      },
      autoPassed: true,
      legalMoves: [],
    };
  }

  return {
    nextState: {
      ...state,
      diceRoll: roll,
      diceValue: roll,
      consecutiveSixes,
      waitingForMove: true,
      turnPhase: 'moving',
      movableTokenIds: legalMoves,
      message: `${activePlayer.name} rolled a ${roll}! Select a token to move.`,
    },
    autoPassed: false,
    legalMoves,
  };
}

export function executeMove(state: GameState, tokenId: number): MoveResult {
  const activePlayer = state.players[state.activePlayerIndex];
  const token = activePlayer?.tokens.find((t) => t.id === tokenId);
  const roll = state.diceRoll ?? state.diceValue ?? 0;

  if (!activePlayer || !token || !canTokenMove(token, roll)) {
    return {
      nextState: state,
      hasKilled: false,
      reachedHome: false,
      extraTurn: false,
      killedInfo: null,
    };
  }

  // Clone players deeply
  const updatedPlayers: Player[] = JSON.parse(JSON.stringify(state.players));
  const player = updatedPlayers[state.activePlayerIndex];
  const movingToken = player.tokens.find((t) => t.id === tokenId)!;

  let hasKilled = false;
  let reachedHome = false;
  let killedInfo: MoveResult['killedInfo'] = null;

  if (movingToken.state === 'HOME_YARD' || movingToken.state === 'yard') {
    movingToken.state = 'ACTIVE_TRACK';
    movingToken.stepCount = 1;
    movingToken.boardIndex = COLOR_START_INDEX[player.color];
  } else {
    movingToken.stepCount += roll;

    if (movingToken.stepCount === TOTAL_STEPS_TO_GOAL) {
      movingToken.state = 'FINISHED';
      movingToken.boardIndex = -1;
      reachedHome = true;
    } else if (movingToken.stepCount > TOTAL_STEPS_TO_HOME) {
      movingToken.state = 'HOME_COLUMN';
      movingToken.boardIndex = -1;
    } else {
      movingToken.state = 'ACTIVE_TRACK';
      movingToken.boardIndex = (COLOR_START_INDEX[player.color] + (movingToken.stepCount - 1)) % TOTAL_TRACK_TILES;
    }
  }

  // Check captures if on active track and not a safe cell
  if (movingToken.state === 'ACTIVE_TRACK' && !SAFE_INDICES.includes(movingToken.boardIndex)) {
    for (const otherPlayer of updatedPlayers) {
      if (otherPlayer.color === player.color) continue;
      for (const otherToken of otherPlayer.tokens) {
        if (otherToken.state === 'ACTIVE_TRACK' && otherToken.boardIndex === movingToken.boardIndex) {
          // Capture victim
          otherToken.state = 'HOME_YARD';
          otherToken.stepCount = 0;
          otherToken.boardIndex = -1;
          hasKilled = true;
          killedInfo = {
            victimColor: otherPlayer.color,
            victimTokenId: otherToken.id,
            boardIndex: movingToken.boardIndex,
          };
          break;
        }
      }
      if (hasKilled) break;
    }
  }

  // Check if player finished all 4 tokens
  const allFinished = player.tokens.every((t) => t.state === 'FINISHED');
  if (allFinished && !player.isFinished) {
    player.isFinished = true;
    player.hasFinished = true;
  }

  const winners = [...state.winners];
  if (allFinished && !winners.includes(player.color)) {
    winners.push(player.color);
    player.finishRank = winners.length;
  }

  const gameOver = updatedPlayers.filter((p) => !p.isFinished).length <= 1;
  const extraTurn = !gameOver && (roll === 6 || hasKilled || reachedHome);

  const nextActiveIndex = extraTurn
    ? state.activePlayerIndex
    : getNextActivePlayerIndex(updatedPlayers, state.activePlayerIndex);

  const nextState: GameState = {
    ...state,
    players: updatedPlayers,
    activePlayerIndex: nextActiveIndex,
    diceRoll: null,
    diceValue: null,
    consecutiveSixes: extraTurn && roll === 6 ? state.consecutiveSixes : 0,
    waitingForMove: false,
    turnPhase: gameOver ? 'game_over' : updatedPlayers[nextActiveIndex]?.isBot ? 'bot_thinking' : 'rolling',
    movableTokenIds: [],
    gameStatus: gameOver ? 'FINISHED' : 'IN_PROGRESS',
    winners,
    lastCapturedPlayer: killedInfo ? killedInfo.victimColor : null,
    message: gameOver
      ? `Game over! Winner: ${winners[0]}`
      : extraTurn
      ? `${player.name} gets a bonus turn!`
      : `${updatedPlayers[nextActiveIndex]?.name}'s turn to roll!`,
  };

  return {
    nextState,
    hasKilled,
    reachedHome,
    extraTurn,
    killedInfo,
  };
}

export function selectBestBotToken(state: GameState, roll: number, legalMoves: number[]): number {
  if (legalMoves.length === 0) return 0;
  if (legalMoves.length === 1) return legalMoves[0];

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return legalMoves[0];

  // Priority 1: Tokens that can capture an opponent
  for (const tid of legalMoves) {
    const res = executeMove(state, tid);
    if (res.hasKilled) return tid;
  }

  // Priority 2: Tokens that can reach home
  for (const tid of legalMoves) {
    const res = executeMove(state, tid);
    if (res.reachedHome) return tid;
  }

  // Priority 3: Bring token out of yard on 6
  if (roll === 6) {
    const yardToken = activePlayer.tokens.find((t) => (t.state === 'HOME_YARD' || t.state === 'yard') && legalMoves.includes(t.id));
    if (yardToken) return yardToken.id;
  }

  // Priority 4: Furthest token
  let bestId = legalMoves[0];
  let maxStep = -1;
  for (const tid of legalMoves) {
    const t = activePlayer.tokens.find((tok) => tok.id === tid);
    if (t && t.stepCount > maxStep) {
      maxStep = t.stepCount;
      bestId = tid;
    }
  }

  return bestId;
}
