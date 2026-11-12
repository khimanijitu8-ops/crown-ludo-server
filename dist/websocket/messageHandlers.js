"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketMessageHandlers = void 0;
const ws_1 = __importDefault(require("ws"));
const roomManager_1 = require("../rooms/roomManager");
const matchmaker_1 = require("../matchmaking/matchmaker");
const diceValidator_1 = require("../engine/diceValidator");
const config_1 = require("../config");
class WebSocketMessageHandlers {
    static handleMessage(ws, rawMessage) {
        let parsed;
        try {
            parsed = JSON.parse(rawMessage);
        }
        catch (err) {
            this.sendError(ws, 'INVALID_JSON', 'Malformed JSON payload received.');
            return;
        }
        if (!parsed || typeof parsed !== 'object') {
            this.sendError(ws, 'INVALID_PAYLOAD', 'Payload must be a valid JSON object.');
            return;
        }
        const action = parsed.action || parsed.type;
        const payload = parsed.payload || {};
        if (!action || typeof action !== 'string') {
            this.sendError(ws, 'INVALID_ACTION', 'Missing or invalid action string.');
            return;
        }
        switch (action.toUpperCase()) {
            case 'PING':
                this.handlePing(ws, payload);
                break;
            case 'AUTHENTICATE':
                this.handleAuthenticate(ws, payload);
                break;
            case 'QUICK_MATCH':
                this.handleQuickMatch(ws, payload);
                break;
            case 'CANCEL_QUICK_MATCH':
                this.handleCancelQuickMatch(ws);
                break;
            case 'CREATE_ROOM':
                this.handleCreateRoom(ws, payload);
                break;
            case 'JOIN_ROOM':
                this.handleJoinRoom(ws, payload);
                break;
            case 'GAME_START':
                this.handleGameStart(ws, payload);
                break;
            case 'ROLL_DICE':
                this.handleRollDice(ws);
                break;
            case 'MOVE_TOKEN':
                this.handleMoveToken(ws, payload);
                break;
            case 'CHAT_MESSAGE':
                this.handleChatMessage(ws, payload);
                break;
            default:
                this.sendError(ws, 'UNKNOWN_ACTION', `Action "${action}" is not recognized.`);
        }
    }
    static handlePing(ws, payload) {
        const timestamp = payload.timestamp || Date.now();
        ws.send(JSON.stringify({ event: 'PONG', type: 'PONG', payload: { timestamp, serverTime: Date.now() } }));
    }
    static handleAuthenticate(ws, payload) {
        const token = payload.token || payload.authToken;
        const claimedId = payload.playerId;
        if (!token) {
            this.sendError(ws, 'AUTH_FAILED', 'Authentication token required.');
            return;
        }
        const result = diceValidator_1.DiceValidator.verifyHS256Jwt(token, config_1.config.jwtSecret);
        if (!result.valid || !result.payload) {
            const code = result.error === 'TOKEN_EXPIRED' ? 'AUTH_EXPIRED' : 'AUTH_FAILED';
            this.sendError(ws, code, 'Token verification failed.');
            return;
        }
        if (claimedId && result.payload.sub && claimedId !== result.payload.sub) {
            this.sendError(ws, 'IDENTITY_MISMATCH', 'Claimed playerId does not match token subject.');
            return;
        }
        ws.isAuthenticated = true;
        ws.authPlayerId = result.payload.sub;
        ws.authUsername = result.payload.username || 'Player';
        if (ws.idleAuthTimer) {
            clearTimeout(ws.idleAuthTimer);
            ws.idleAuthTimer = undefined;
        }
        ws.send(JSON.stringify({
            event: 'AUTHENTICATED',
            type: 'AUTHENTICATED',
            payload: {
                playerId: ws.authPlayerId,
                username: ws.authUsername,
                authenticated: true,
            },
        }));
    }
    static checkAuth(ws, candidateToken, claimedPlayerId) {
        if (ws.isAuthenticated)
            return true;
        if (candidateToken) {
            const res = diceValidator_1.DiceValidator.verifyHS256Jwt(candidateToken, config_1.config.jwtSecret);
            if (res.valid && res.payload) {
                if (claimedPlayerId && res.payload.sub && claimedPlayerId !== res.payload.sub) {
                    this.sendError(ws, 'IDENTITY_MISMATCH', 'Claimed playerId does not match token.');
                    return false;
                }
                ws.isAuthenticated = true;
                ws.authPlayerId = res.payload.sub;
                ws.authUsername = res.payload.username || 'Player';
                return true;
            }
            else {
                const code = res.error === 'TOKEN_EXPIRED' ? 'AUTH_EXPIRED' : 'AUTH_FAILED';
                this.sendError(ws, code, 'Invalid authentication token.');
                return false;
            }
        }
        if (config_1.config.authRequired || config_1.config.isProduction) {
            this.sendError(ws, 'AUTH_FAILED', 'Authentication required.');
            return false;
        }
        return true;
    }
    static handleQuickMatch(ws, payload) {
        if (!this.checkAuth(ws, payload.authToken, payload.playerId))
            return;
        // Check if socket is already in a room
        const currentRoom = roomManager_1.roomManager.findRoomBySocket(ws);
        if (currentRoom) {
            this.sendError(ws, 'ALREADY_IN_ROOM', 'Cannot queue for quick match while in a room.');
            return;
        }
        const playerCount = parseInt(payload.playerCount || '2', 10);
        const playerId = ws.authPlayerId || payload.playerId || `p_${Date.now()}`;
        const name = payload.name || ws.authUsername || 'Player';
        try {
            matchmaker_1.matchmaker.enqueue(ws, playerId, name, playerCount);
        }
        catch (err) {
            this.sendError(ws, err.message.split(':')[0] || 'MATCHMAKING_ERROR', err.message);
        }
    }
    static handleCancelQuickMatch(ws) {
        const removed = matchmaker_1.matchmaker.dequeue(ws);
        if (!removed) {
            this.sendError(ws, 'NOT_QUEUED', 'Socket was not in matchmaking queue.');
            return;
        }
        ws.send(JSON.stringify({ event: 'QUICK_MATCH_CANCELLED', type: 'QUICK_MATCH_CANCELLED', payload: { success: true } }));
    }
    static handleCreateRoom(ws, payload) {
        if (!this.checkAuth(ws, payload.authToken, payload.playerId))
            return;
        const currentRoom = roomManager_1.roomManager.findRoomBySocket(ws);
        if (currentRoom) {
            this.sendError(ws, 'ALREADY_IN_ROOM', 'Socket is already bound to a room.');
            return;
        }
        const playerCount = parseInt(payload.playerCount || '2', 10);
        if (![2, 3, 4].includes(playerCount)) {
            this.sendError(ws, 'INVALID_PAYLOAD', 'Player count must be 2, 3, or 4.');
            return;
        }
        const rawId = payload.roomId;
        if (rawId && (typeof rawId !== 'string' || !/^[A-Za-z0-9_-]{3,24}$/.test(rawId))) {
            this.sendError(ws, 'INVALID_PAYLOAD', 'Invalid room ID format.');
            return;
        }
        const playerId = ws.authPlayerId || payload.playerId || `p_${Date.now()}`;
        const name = payload.name || ws.authUsername || 'Host';
        try {
            const room = roomManager_1.roomManager.createRoom(rawId, playerCount, payload.isPrivate !== false);
            const client = room.addClient(ws, playerId, name, true);
            ws.send(JSON.stringify({
                event: 'ROOM_CREATED',
                type: 'ROOM_CREATED',
                payload: {
                    roomId: room.id,
                    roomCode: room.roomCode,
                    isHost: true,
                    playerCount: room.playerCount,
                    reconnectToken: client.reconnectToken,
                    players: [
                        {
                            playerId: client.playerId,
                            name: client.name,
                            isHost: true,
                        },
                    ],
                    stateSeq: room.stateSeq,
                },
            }));
        }
        catch (err) {
            const code = err.message.includes('ROOM_EXISTS') ? 'ROOM_EXISTS' : 'SERVER_BUSY';
            this.sendError(ws, code, err.message);
        }
    }
    static handleJoinRoom(ws, payload) {
        if (!this.checkAuth(ws, payload.authToken, payload.playerId))
            return;
        if (payload.isBot === true) {
            this.sendError(ws, 'INVALID_PAYLOAD', 'Clients cannot join as bots.');
            return;
        }
        const roomId = payload.roomId || payload.roomCode;
        if (!roomId) {
            this.sendError(ws, 'INVALID_PAYLOAD', 'Room ID or code required.');
            return;
        }
        const room = roomManager_1.roomManager.getRoomByCode(roomId);
        if (!room) {
            this.sendError(ws, 'ROOM_NOT_FOUND', `Room "${roomId}" not found.`);
            return;
        }
        const playerId = ws.authPlayerId || payload.playerId || `p_${Date.now()}`;
        const name = payload.name || ws.authUsername || 'Player';
        const reconnectToken = payload.reconnectToken;
        // Check reconnect attempt
        if (reconnectToken) {
            const existingClient = room.getClientByToken(reconnectToken);
            if (!existingClient) {
                this.sendError(ws, 'INVALID_RECONNECT_TOKEN', 'Reconnect token not recognized.');
                return;
            }
            if (existingClient.playerId !== playerId) {
                this.sendError(ws, 'IDENTITY_MISMATCH', 'PlayerId mismatch with reconnect token.');
                return;
            }
            room.handleReconnect(ws, existingClient);
            return;
        }
        // New joiner check
        if (room.lifecycleState !== 'LOBBY_WAITING') {
            this.sendError(ws, 'ROOM_ALREADY_STARTED', 'Match has already started.');
            return;
        }
        if (room.clients.size >= room.playerCount) {
            this.sendError(ws, 'ROOM_FULL', 'Room has reached max capacity.');
            return;
        }
        const client = room.addClient(ws, playerId, name, false);
        const joinPayload = {
            roomId: room.id,
            roomCode: room.roomCode,
            reconnectToken: client.reconnectToken,
            isHost: false,
            players: Array.from(room.clients.values()).map((c) => ({
                playerId: c.playerId,
                name: c.name,
                isHost: c.isHost,
            })),
            stateSeq: room.stateSeq,
        };
        ws.send(JSON.stringify({ event: 'ROOM_JOINED', type: 'ROOM_JOINED', payload: joinPayload }));
        room.broadcast('PLAYER_JOINED', { player: { playerId: client.playerId, name: client.name }, stateSeq: room.stateSeq }, ws);
    }
    static handleGameStart(ws, payload) {
        const room = roomManager_1.roomManager.findRoomBySocket(ws);
        if (!room) {
            this.sendError(ws, 'ROOM_NOT_FOUND', 'Socket is not in any room.');
            return;
        }
        const client = room.getClientBySocket(ws);
        if (!client || !client.isHost) {
            this.sendError(ws, 'HOST_ONLY_ACTION', 'Only the host can start the game.');
            return;
        }
        if (room.lifecycleState !== 'LOBBY_WAITING') {
            this.sendError(ws, 'ALREADY_STARTED', 'Game has already started.');
            return;
        }
        const gameState = room.startGame();
        room.broadcast('GAME_START', {
            roomId: room.id,
            serverGameState: gameState,
            stateSeq: room.stateSeq,
            players: Array.from(room.clients.values()).map((c) => ({
                playerId: c.playerId,
                name: c.name,
                color: c.playerColor,
                isHost: c.isHost,
            })),
        });
    }
    static handleRollDice(ws) {
        const room = roomManager_1.roomManager.findRoomBySocket(ws);
        if (!room) {
            this.sendError(ws, 'ROOM_NOT_FOUND', 'Socket is not in any room.');
            return;
        }
        if (room.lifecycleState !== 'ACTIVE_MATCH' || !room.serverGameState) {
            this.sendError(ws, 'INVALID_LIFECYCLE', 'Game is not in active match state.');
            return;
        }
        const client = room.getClientBySocket(ws);
        const activePlayer = room.serverGameState.players[room.serverGameState.activePlayerIndex];
        if (!client || client.playerColor !== activePlayer?.color) {
            this.sendError(ws, 'NOT_YOUR_TURN', 'It is not your turn to roll.');
            return;
        }
        if (room.pendingRoll) {
            this.sendError(ws, 'ALREADY_ROLLED', 'Dice has already been rolled. Move a token.');
            return;
        }
        room.rollDiceAuthoritative();
    }
    static handleMoveToken(ws, payload) {
        const room = roomManager_1.roomManager.findRoomBySocket(ws);
        if (!room) {
            this.sendError(ws, 'ROOM_NOT_FOUND', 'Socket is not in any room.');
            return;
        }
        if (room.lifecycleState !== 'ACTIVE_MATCH' || !room.serverGameState) {
            this.sendError(ws, 'INVALID_LIFECYCLE', 'Game is not in active match state.');
            return;
        }
        const client = room.getClientBySocket(ws);
        const activePlayer = room.serverGameState.players[room.serverGameState.activePlayerIndex];
        if (!client || client.playerColor !== activePlayer?.color) {
            this.sendError(ws, 'NOT_YOUR_TURN', 'It is not your turn to move.');
            return;
        }
        if (!room.pendingRoll) {
            this.sendError(ws, 'ROLL_REQUIRED', 'You must roll the dice before moving.');
            return;
        }
        const tokenId = parseInt(payload.tokenId, 10);
        if (isNaN(tokenId) || !room.pendingRoll.legalMoves.includes(tokenId)) {
            this.sendError(ws, 'INVALID_MOVE', `Token ${tokenId} cannot be moved legally with roll ${room.pendingRoll.rollValue}.`);
            return;
        }
        room.executeMoveAuthoritative(tokenId);
    }
    static handleChatMessage(ws, payload) {
        const room = roomManager_1.roomManager.findRoomBySocket(ws);
        if (!room) {
            this.sendError(ws, 'ROOM_NOT_FOUND', 'Socket is not in any room.');
            return;
        }
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text || text.length > 200) {
            this.sendError(ws, 'INVALID_CHAT_MESSAGE', 'Chat message must be between 1 and 200 characters.');
            return;
        }
        const chatType = payload.chatType || 'text';
        if (!['text', 'emoji'].includes(chatType)) {
            this.sendError(ws, 'INVALID_CHAT_MESSAGE', 'Invalid chatType specified.');
            return;
        }
        // Rate limiting: max 5 messages in 3 seconds
        const now = Date.now();
        ws.chatTimestamps = (ws.chatTimestamps || []).filter((t) => now - t < 3000);
        if (ws.chatTimestamps.length >= 5) {
            this.sendError(ws, 'RATE_LIMIT_EXCEEDED', 'Chat message rate limit exceeded.');
            return;
        }
        ws.chatTimestamps.push(now);
        const client = room.getClientBySocket(ws);
        room.broadcast('CHAT_MESSAGE', {
            senderId: client?.playerId,
            senderName: client?.name,
            senderColor: client?.playerColor,
            text,
            chatType,
            stateSeq: room.nextSeq(),
        });
    }
    static sendError(ws, code, message) {
        if (ws.readyState === ws_1.default.OPEN) {
            try {
                ws.send(JSON.stringify({ event: 'ERROR', type: 'ERROR', payload: { code, message } }));
            }
            catch { }
        }
    }
}
exports.WebSocketMessageHandlers = WebSocketMessageHandlers;
