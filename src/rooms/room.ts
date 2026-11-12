import WebSocket from 'ws';
import crypto from 'crypto';
import { GameState, Player, PlayerColor, MoveResult } from '../engine/types';
import * as ludoEngine from '../engine/ludoEngine';
import { DiceValidator } from '../engine/diceValidator';
import { config } from '../config';

export interface RoomClient {
  ws: WebSocket;
  playerId: string;
  name: string;
  playerColor?: PlayerColor;
  isHost: boolean;
  reconnectToken: string;
  isDisconnected: boolean;
  disconnectedAt?: number;
  lastPing: number;
}

export class GameRoom {
  public id: string;
  public roomCode: string;
  public playerCount: number;
  public isPrivate: boolean;
  public lifecycleState: 'LOBBY_WAITING' | 'ACTIVE_MATCH' | 'PLAYER_DISCONNECTED_GRACE' | 'FINISHED' = 'LOBBY_WAITING';
  public stateSeq: number = 0;
  public serverGameState: GameState | null = null;
  public clients: Map<string, RoomClient> = new Map(); // keyed by playerId
  public pendingRoll: { rollValue: number; legalMoves: number[]; playerColor: string; rolledAt: number } | null = null;
  public turnTimer: NodeJS.Timeout | null = null;
  public graceTimer: NodeJS.Timeout | null = null;
  public turnDurationMs: number = config.turnTimeoutMs;
  public gracePeriodMs: number = config.gracePeriodMs;
  public createdAt: number = Date.now();
  public lastActivity: number = Date.now();

  constructor(id: string, roomCode: string, playerCount: number = 2, isPrivate: boolean = true) {
    this.id = id;
    this.roomCode = roomCode;
    this.playerCount = playerCount;
    this.isPrivate = isPrivate;
  }

  public nextSeq(): number {
    this.stateSeq += 1;
    this.lastActivity = Date.now();
    return this.stateSeq;
  }

  public addClient(ws: WebSocket, playerId: string, name: string, isHost: boolean = false): RoomClient {
    let reconnectToken = crypto.randomBytes(24).toString('hex');
    const client: RoomClient = {
      ws,
      playerId,
      name,
      isHost,
      reconnectToken,
      isDisconnected: false,
      lastPing: Date.now(),
    };
    this.clients.set(playerId, client);
    this.lastActivity = Date.now();
    return client;
  }

  public getClientBySocket(ws: WebSocket): RoomClient | null {
    for (const c of this.clients.values()) {
      if (c.ws === ws) return c;
    }
    return null;
  }

  public getClientByToken(token: string): RoomClient | null {
    for (const c of this.clients.values()) {
      if (c.reconnectToken === token) return c;
    }
    return null;
  }

  public broadcast(type: string, payload: any, excludeWs: WebSocket | null = null): void {
    const message = JSON.stringify({
      event: type,
      type,
      payload,
      stateSeq: this.stateSeq,
      timestamp: Date.now(),
    });

    for (const client of this.clients.values()) {
      if (!client.isDisconnected && client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (e) {
          // Socket write failed
        }
      }
    }
  }

  public assignColors(): void {
    const colors: PlayerColor[] =
      this.playerCount === 2
        ? ['blue', 'green']
        : this.playerCount === 3
        ? ['blue', 'red', 'green']
        : ['blue', 'red', 'green', 'yellow'];

    let idx = 0;
    for (const client of this.clients.values()) {
      client.playerColor = colors[idx % colors.length];
      idx++;
    }
  }

  public startGame(): GameState {
    this.assignColors();

    if (this.playerCount === 2) {
      this.serverGameState = ludoEngine.initialize2PlayerMatch('online_multiplayer', 'DIAGONAL', 'blue');
    } else if (this.playerCount === 3) {
      this.serverGameState = ludoEngine.initialize3PlayerMatch('online_multiplayer', 'blue');
    } else {
      this.serverGameState = ludoEngine.initialize4PlayerMatch('online_multiplayer', 'blue');
    }

    // Bind real player names and IDs to the GameState
    for (const client of this.clients.values()) {
      const p = this.serverGameState.players.find((pl) => pl.color === client.playerColor);
      if (p) {
        p.id = client.playerId;
        p.name = client.name;
        p.isBot = false;
      }
    }

    this.lifecycleState = 'ACTIVE_MATCH';
    this.nextSeq();
    this.startTurnTimer();
    return this.serverGameState;
  }

  public startTurnTimer(): void {
    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, this.turnDurationMs);
  }

  public clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  public handleTurnTimeout(): void {
    if (!this.serverGameState || this.lifecycleState !== 'ACTIVE_MATCH') return;

    if (this.pendingRoll) {
      // Auto move the best legal token
      const botTokenId = ludoEngine.selectBestBotToken(
        this.serverGameState,
        this.pendingRoll.rollValue,
        this.pendingRoll.legalMoves
      );
      this.executeMoveAuthoritative(botTokenId, true);
    } else {
      // Auto roll
      this.rollDiceAuthoritative(true);
    }
  }

  public rollDiceAuthoritative(isAuto: boolean = false): { rollValue: number; legalMoves: number[] } | null {
    if (!this.serverGameState || this.lifecycleState !== 'ACTIVE_MATCH') return null;

    const rollValue = DiceValidator.generateAuthoritativeRoll();
    const activePlayer = this.serverGameState.players[this.serverGameState.activePlayerIndex];
    if (!activePlayer) return null;

    const rollResult = ludoEngine.handleDiceRoll(this.serverGameState, rollValue);
    this.serverGameState = rollResult.nextState;
    const seq = this.nextSeq();

    if (rollResult.autoPassed) {
      this.pendingRoll = null;
      this.broadcast('DICE_ROLLED', {
        playerColor: activePlayer.color,
        rollValue,
        legalMoves: [],
        remainingTurnTimeMs: 0,
        stateSeq: seq,
        autoPassed: true,
      });

      this.broadcast('TURN_CHANGED', {
        currentTurn: this.serverGameState.players[this.serverGameState.activePlayerIndex]?.color,
        turnDurationMs: this.turnDurationMs,
        stateSeq: seq,
      });

      this.startTurnTimer();
      return { rollValue, legalMoves: [] };
    }

    const legalMoves = ludoEngine.getLegalMoves(activePlayer, rollValue);
    this.pendingRoll = {
      rollValue,
      legalMoves,
      playerColor: activePlayer.color,
      rolledAt: Date.now(),
    };

    this.broadcast('DICE_ROLLED', {
      playerColor: activePlayer.color,
      rollValue,
      legalMoves,
      remainingTurnTimeMs: this.turnDurationMs,
      stateSeq: seq,
      autoPassed: false,
    });

    this.startTurnTimer();
    return { rollValue, legalMoves };
  }

  public executeMoveAuthoritative(tokenId: number, isAuto: boolean = false): MoveResult | null {
    if (!this.serverGameState || !this.pendingRoll) return null;

    const activePlayer = this.serverGameState.players[this.serverGameState.activePlayerIndex];
    if (!activePlayer) return null;

    const moveResult = ludoEngine.executeMove(this.serverGameState, tokenId);
    this.serverGameState = moveResult.nextState;
    this.pendingRoll = null;
    const seq = this.nextSeq();

    this.broadcast('TOKEN_MOVED', {
      playerColor: activePlayer.color,
      tokenId,
      captured: moveResult.hasKilled,
      extraTurn: moveResult.extraTurn,
      reachedHome: moveResult.reachedHome,
      killedInfo: moveResult.killedInfo,
      serverGameState: this.serverGameState,
      stateSeq: seq,
    });

    if (this.serverGameState.gameStatus === 'FINISHED') {
      this.lifecycleState = 'FINISHED';
      this.clearTurnTimer();
      this.broadcast('MATCH_FINISHED', {
        winnerColor: this.serverGameState.winners[0],
        winnerName: this.serverGameState.players.find((p) => p.color === this.serverGameState?.winners[0])?.name || 'Winner',
        finalScores: this.serverGameState.players.map((p) => ({
          color: p.color,
          name: p.name,
          rank: p.finishRank || 0,
        })),
        stateSeq: seq,
      });
      return moveResult;
    }

    this.broadcast('TURN_CHANGED', {
      currentTurn: this.serverGameState.players[this.serverGameState.activePlayerIndex]?.color,
      turnDurationMs: this.turnDurationMs,
      stateSeq: seq,
    });

    this.startTurnTimer();
    return moveResult;
  }

  public handleDisconnect(client: RoomClient): void {
    client.isDisconnected = true;
    client.disconnectedAt = Date.now();

    this.broadcast('PLAYER_DISCONNECTED_GRACE', {
      playerId: client.playerId,
      name: client.name,
      playerColor: client.playerColor,
      gracePeriodMs: this.gracePeriodMs,
      stateSeq: this.nextSeq(),
    });

    if (this.lifecycleState === 'ACTIVE_MATCH') {
      this.lifecycleState = 'PLAYER_DISCONNECTED_GRACE';
      this.graceTimer = setTimeout(() => {
        this.handleGracePeriodExpiration(client);
      }, this.gracePeriodMs);
    }
  }

  public handleGracePeriodExpiration(client: RoomClient): void {
    if (!client.isDisconnected) return;

    // Convert disconnected player to bot
    if (this.serverGameState) {
      const p = this.serverGameState.players.find((pl) => pl.color === client.playerColor);
      if (p) {
        p.isBot = true;
        p.name = `${client.name} (Bot)`;
      }
    }

    this.lifecycleState = 'ACTIVE_MATCH';
    this.broadcast('PLAYER_LEFT_PERMANENT', {
      playerId: client.playerId,
      playerColor: client.playerColor,
      convertedToBot: true,
      stateSeq: this.nextSeq(),
    });

    // Resume turn timer if it was the disconnected player's turn
    if (this.serverGameState?.players[this.serverGameState.activePlayerIndex]?.color === client.playerColor) {
      this.handleTurnTimeout();
    }
  }

  public handleReconnect(ws: WebSocket, client: RoomClient): void {
    client.ws = ws;
    client.isDisconnected = false;
    client.disconnectedAt = undefined;

    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    if (this.serverGameState) {
      const p = this.serverGameState.players.find((pl) => pl.color === client.playerColor);
      if (p) {
        p.isBot = false;
        p.name = client.name;
      }
    }

    this.lifecycleState = 'ACTIVE_MATCH';
    const seq = this.nextSeq();

    // Send full snapshot directly to reconnected client
    const snapshot = {
      roomId: this.id,
      playerColor: client.playerColor,
      reconnectToken: client.reconnectToken,
      players: Array.from(this.clients.values()).map((c) => ({
        playerId: c.playerId,
        name: c.name,
        color: c.playerColor,
        isHost: c.isHost,
      })),
      serverGameState: this.serverGameState,
      pendingRoll: this.pendingRoll,
      remainingTurnTimeMs: this.turnDurationMs,
      turnDurationMs: this.turnDurationMs,
      stateSeq: seq,
    };

    try {
      ws.send(JSON.stringify({ event: 'RECONNECT_SUCCESS', type: 'RECONNECT_SUCCESS', payload: snapshot }));
    } catch {}

    this.broadcast('PLAYER_RECONNECTED', {
      playerId: client.playerId,
      playerColor: client.playerColor,
      stateSeq: seq,
    }, ws);
  }

  public cleanup(): void {
    this.clearTurnTimer();
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    this.lifecycleState = 'FINISHED';
  }
}
