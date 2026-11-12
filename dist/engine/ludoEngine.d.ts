import { BOARD_SLOTS, GameState, MoveResult, Player, PlayerColor, Token } from './types';
export { BOARD_SLOTS };
export declare function initializeTokens(color: PlayerColor): Token[];
export declare function createInitialPlayer(id: string | number, name: string, color: PlayerColor, isBot: boolean, avatarEmoji?: string, avatarId?: string): Player;
export declare function createInitialGame(mode: GameState["mode"] | undefined, playerConfigs: {
    name: string;
    color: PlayerColor;
    isBot: boolean;
    avatarEmoji?: string;
    avatarId?: string;
}[], initialColor?: PlayerColor): GameState;
export declare function initialize2PlayerMatch(mode?: GameState['mode'], layout?: 'DIAGONAL' | 'OPPOSITE' | 'ADJACENT', humanColor?: PlayerColor): GameState;
export declare function initialize3PlayerMatch(mode?: GameState['mode'], humanColor?: PlayerColor): GameState;
export declare function initialize4PlayerMatch(mode?: GameState['mode'], humanColor?: PlayerColor): GameState;
export declare const applyTokenMove: (state: GameState, tokenId: number, _expectedColor?: PlayerColor) => MoveResult;
export declare const getMovableTokenIds: typeof getLegalMoves;
export declare function canTokenMove(token: Token, roll: number): boolean;
export declare function getLegalMoves(player: Player, roll: number): number[];
export declare function getNextActivePlayerIndex(players: Player[], currentIndex: number): number;
export declare function handleDiceRoll(state: GameState, roll: number): {
    nextState: GameState;
    autoPassed: boolean;
    legalMoves: number[];
    penaltyApplied?: boolean;
};
export declare function executeMove(state: GameState, tokenId: number): MoveResult;
export declare function selectBestBotToken(state: GameState, roll: number, legalMoves: number[]): number;
