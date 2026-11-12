export const BOARD_SLOTS = ['red', 'green', 'yellow', 'blue'] as const;
export type PlayerColor = typeof BOARD_SLOTS[number];

export type GameMode = 'vs_computer' | 'pass_and_play' | 'online_multiplayer';

export type TokenState =
  | 'HOME_YARD'
  | 'ACTIVE_TRACK'
  | 'HOME_COLUMN'
  | 'FINISHED'
  | 'yard'
  | 'track'
  | 'home_stretch'
  | 'home';

export interface Token {
  id: number; // 0, 1, 2, 3
  color: PlayerColor;
  state: TokenState;
  boardIndex: number; // 0 to 51 when on track, -1 otherwise
  stepCount: number;  // 0 (Yard), 1 (Start), 52-56 (Home Column), 57 (Finished)
}

export interface Player {
  id: number | string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  isFinished: boolean;
  hasFinished?: boolean;
  finishRank?: number;
  tokens: Token[];
  avatarEmoji?: string;
  avatarId?: string;
}

export type TurnPhase = 'rolling' | 'moving' | 'bot_thinking' | 'game_over';

export interface GameState {
  mode: GameMode;
  players: Player[];
  activePlayerIndex: number;
  diceRoll: number | null;
  diceValue: number | null;
  consecutiveSixes: number;
  waitingForMove: boolean;
  turnPhase: TurnPhase;
  movableTokenIds: number[];
  gameStatus: 'IN_PROGRESS' | 'FINISHED';
  winners: PlayerColor[];
  roomCode?: string;
  isHost?: boolean;
  betAmount?: number;
  potAmount?: number;
  lastCapturedPlayer?: PlayerColor | null;
  message: string;
}

export interface MoveResult {
  nextState: GameState;
  hasKilled: boolean;
  reachedHome: boolean;
  extraTurn: boolean;
  killedInfo?: {
    victimColor: PlayerColor;
    victimTokenId?: number;
    boardIndex: number;
  } | null;
}
