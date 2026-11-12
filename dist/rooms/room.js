"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const ws_1 = __importDefault(require("ws"));
const crypto_1 = __importDefault(require("crypto"));
const ludoEngine = __importStar(require("../engine/ludoEngine"));
const diceValidator_1 = require("../engine/diceValidator");
const config_1 = require("../config");
class GameRoom {
    id;
    roomCode;
    playerCount;
    isPrivate;
    lifecycleState = 'LOBBY_WAITING';
    stateSeq = 0;
    serverGameState = null;
    clients = new Map(); // keyed by playerId
    pendingRoll = null;
    turnTimer = null;
    graceTimer = null;
    turnDurationMs = config_1.config.turnTimeoutMs;
    gracePeriodMs = config_1.config.gracePeriodMs;
    createdAt = Date.now();
    lastActivity = Date.now();
    constructor(id, roomCode, playerCount = 2, isPrivate = true) {
        this.id = id;
        this.roomCode = roomCode;
        this.playerCount = playerCount;
        this.isPrivate = isPrivate;
    }
    nextSeq() {
        this.stateSeq += 1;
        this.lastActivity = Date.now();
        return this.stateSeq;
    }
    addClient(ws, playerId, name, isHost = false) {
        let reconnectToken = crypto_1.default.randomBytes(24).toString('hex');
        const client = {
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
    getClientBySocket(ws) {
        for (const c of this.clients.values()) {
            if (c.ws === ws)
                return c;
        }
        return null;
    }
    getClientByToken(token) {
        for (const c of this.clients.values()) {
            if (c.reconnectToken === token)
                return c;
        }
        return null;
    }
    broadcast(type, payload, excludeWs = null) {
        const message = JSON.stringify({
            event: type,
            type,
            payload,
            stateSeq: this.stateSeq,
            timestamp: Date.now(),
        });
        for (const client of this.clients.values()) {
            if (!client.isDisconnected && client.ws !== excludeWs && client.ws.readyState === ws_1.default.OPEN) {
                try {
                    client.ws.send(message);
                }
                catch (e) {
                    // Socket write failed
                }
            }
        }
    }
    assignColors() {
        const colors = this.playerCount === 2
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
    startGame() {
        this.assignColors();
        if (this.playerCount === 2) {
            this.serverGameState = ludoEngine.initialize2PlayerMatch('online_multiplayer', 'DIAGONAL', 'blue');
        }
        else if (this.playerCount === 3) {
            this.serverGameState = ludoEngine.initialize3PlayerMatch('online_multiplayer', 'blue');
        }
        else {
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
    startTurnTimer() {
        this.clearTurnTimer();
        this.turnTimer = setTimeout(() => {
            this.handleTurnTimeout();
        }, this.turnDurationMs);
    }
    clearTurnTimer() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
    }
    handleTurnTimeout() {
        if (!this.serverGameState || this.lifecycleState !== 'ACTIVE_MATCH')
            return;
        if (this.pendingRoll) {
            // Auto move the best legal token
            const botTokenId = ludoEngine.selectBestBotToken(this.serverGameState, this.pendingRoll.rollValue, this.pendingRoll.legalMoves);
            this.executeMoveAuthoritative(botTokenId, true);
        }
        else {
            // Auto roll
            this.rollDiceAuthoritative(true);
        }
    }
    rollDiceAuthoritative(isAuto = false) {
        if (!this.serverGameState || this.lifecycleState !== 'ACTIVE_MATCH')
            return null;
        const rollValue = diceValidator_1.DiceValidator.generateAuthoritativeRoll();
        const activePlayer = this.serverGameState.players[this.serverGameState.activePlayerIndex];
        if (!activePlayer)
            return null;
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
    executeMoveAuthoritative(tokenId, isAuto = false) {
        if (!this.serverGameState || !this.pendingRoll)
            return null;
        const activePlayer = this.serverGameState.players[this.serverGameState.activePlayerIndex];
        if (!activePlayer)
            return null;
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
    handleDisconnect(client) {
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
    handleGracePeriodExpiration(client) {
        if (!client.isDisconnected)
            return;
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
    handleReconnect(ws, client) {
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
        }
        catch { }
        this.broadcast('PLAYER_RECONNECTED', {
            playerId: client.playerId,
            playerColor: client.playerColor,
            stateSeq: seq,
        }, ws);
    }
    cleanup() {
        this.clearTurnTimer();
        if (this.graceTimer) {
            clearTimeout(this.graceTimer);
            this.graceTimer = null;
        }
        this.lifecycleState = 'FINISHED';
    }
}
exports.GameRoom = GameRoom;
