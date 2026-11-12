/**
 * 👑 ROYAL LUDO AUTHORITATIVE IN-MEMORY GAME SERVER ($0 Free Tier Compatible)
 * ==============================================================================
 * STRICT ZERO-COST & FREE-PLAY RULES ENFORCED (Astra 6 Rigor):
 * 1. Zero real-time database writes. All dice, moves, and timers are 100% in RAM.
 * 2. Server-Authoritative Dice: Cryptographically generated on server (crypto.randomInt).
 * 3. 15-Second Turn Timer: Server enforced with auto-pass and bot conversion on 3 strikes.
 * 4. 30-Second Seat Preservation: Player seat preserved in RAM on disconnect.
 * 5. Private Room Guard: Honest waiting overlay; no silent bot swaps in private rooms.
 * 6. Quick Matchmaking: Queue-based pairing for 2P and 4P matches with live position sync.
 * 7. State Sequencing: Monotonic stateSeq on every state mutation frame.
 * 8. Authentication & Anti-Spoofing: HS256 JWT verification via node:crypto, seat identity binding.
 * 9. WebSocket Security: Origin allowlist enforcement, token-bucket rate limiting, 16KB payload cap.
 * 10. Memory & DoS Guards: MAX_ROOMS and MAX_CONNECTIONS_PER_IP enforcement.
 * 11. Graceful Shutdown & Health Metrics: Structured logging, clean teardown, rich /health.
 * ==============================================================================
 */

const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server || WebSocket.WebSocketServer;
const http = require('http');
const crypto = require('crypto');
const diceValidator = require('./engine/diceValidator');

// M-02: Authoritative Headless Ludo Engine Startup Verification
let ludoEngine = null;
try {
  ludoEngine = require('./dist/engine/ludoEngine');
  console.log('👑 [M-02 Engine Loaded]: Headless Ludo Engine verified ready for authoritative match resolution.');
} catch (err) {
  console.warn('⚠️ [M-02 Engine Warning]: Compiled ludoEngine not found in ./dist/engine/ludoEngine. Run "npm run build:server" to compile.');
}

/**
 * Validates Origin header against configured allowlist.
 * Allows absent Origin (native mobile apps / non-browser clients).
 */
function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true; // Native mobile apps omit Origin header
  if (!allowedOrigins || allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Creates and starts an authoritative Royal Ludo game server instance.
 * Cleanly encapsulated for zero-port-conflict integration testing.
 *
 * @param {Object} [config] Configuration options
 * @param {number} [config.port] Port to bind (0 for ephemeral)
 * @param {string|null} [config.jwtSecret] Secret key for HS256 JWT verification
 * @param {boolean} [config.authRequired] Whether JWT authentication is strictly required
 * @param {string[]} [config.allowedOrigins] Allowed Origin header values
 * @param {number} [config.maxRooms=100] Maximum concurrent active rooms in memory
 * @param {number} [config.maxConnectionsPerIp=20] Connection limit per client IP
 * @param {number} [config.heartbeatIntervalMs=15000] Ping/pong keepalive frequency
 * @param {number} [config.turnTimeoutMs=15000] Authoritative turn timeout (15s)
 * @param {number} [config.gracePeriodMs=30000] Reconnect seat preservation window (30s)
 * @param {number} [config.cleanupSweepIntervalMs=300000] Periodic room reaper sweep (5 min)
 * @param {number} [config.idleAuthTimeoutMs=10000] Idle connection disconnect timeout (10s)
 * @param {boolean} [config.logEnabled=true] Whether structured JSON logging is enabled
 * @returns {Object} Server instance controller
 */
function createGameServer(config = {}) {
  const isProduction = process.env.NODE_ENV === 'production' || config.isProduction === true;
  const port = config.port !== undefined ? config.port : (process.env.PORT || 8080);
  const jwtSecret = config.jwtSecret || process.env.SUPABASE_JWT_SECRET || process.env.AUTH_JWT_SECRET || null;
  const authRequired = config.authRequired !== undefined
    ? Boolean(config.authRequired)
    : (isProduction || process.env.AUTH_REQUIRED === 'true');

  // P0 Fail-Closed Production Requirement: Refuse startup if mandatory JWT secret is missing in production
  if (authRequired && !jwtSecret) {
    const fatalAuthError = 'FATAL_AUTH_CONFIG_ERROR: Production environment or authRequired=true requires SUPABASE_JWT_SECRET / AUTH_JWT_SECRET. Refusing server startup to prevent unauthenticated gameplay.';
    if (config.failFastOnMissingAuth !== false && isProduction) {
      throw new Error(fatalAuthError);
    } else {
      console.warn(`[WARN] ${fatalAuthError}`);
    }
  }

  const allowedOrigins = config.allowedOrigins ||
    (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : ['*']);

  const maxRooms = config.maxRooms || parseInt(process.env.MAX_ROOMS || '100', 10);
  const maxConnectionsPerIp = config.maxConnectionsPerIp || parseInt(process.env.MAX_CONNECTIONS_PER_IP || '20', 10);
  const heartbeatIntervalMs = config.heartbeatIntervalMs || 15000;
  const turnTimeoutMs = config.turnTimeoutMs || 15000;
  const gracePeriodMs = config.gracePeriodMs || 30000;
  const cleanupSweepIntervalMs = config.cleanupSweepIntervalMs || 300000;
  const idleAuthTimeoutMs = config.idleAuthTimeoutMs || 10000;
  const logEnabled = config.logEnabled !== undefined ? config.logEnabled : true;

  function log(level, event, meta = {}) {
    if (!logEnabled) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...meta,
    };
    console.log(JSON.stringify(record));
  }

  // State storage in RAM
  const rooms = new Map();
  const quickMatchQueues = {
    2: [],
    4: [],
  };
  const ipConnections = new Map();
  let isShuttingDown = false;

  // HTTP Server & Rich /health Endpoint
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const activeRooms = Array.from(rooms.values()).filter(r => r.lifecycleState === 'ACTIVE_MATCH').length;
      const waitingRooms = Array.from(rooms.values()).filter(r => r.lifecycleState === 'LOBBY_WAITING').length;
      const graceRooms = Array.from(rooms.values()).filter(r => r.lifecycleState === 'PLAYER_DISCONNECTED_GRACE').length;

      res.writeHead(isShuttingDown ? 503 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isShuttingDown ? 'shutting_down' : 'ok',
        uptime: Math.floor(process.uptime()),
        activeRooms,
        waitingRooms,
        graceRooms,
        totalRooms: rooms.size,
        queueSizes: {
          '2P': quickMatchQueues[2].length,
          '4P': quickMatchQueues[4].length,
        },
        totalConnections: wss ? wss.clients.size : 0,
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        shuttingDown: isShuttingDown,
        environment: isProduction ? 'production' : 'development',
        authRequired,
        hasJwtSecret: Boolean(jwtSecret),
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('👑 Royal Ludo Game Server is Running Live & Authoritative!');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  // Handle WebSocket Upgrade with Origin Validation
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers['origin'];
    if (!isOriginAllowed(origin, allowedOrigins)) {
      log('warn', 'WS_ORIGIN_REJECTED', { origin, allowed: allowedOrigins });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // ---------------------------------------------------------------------------
  // HELPERS: Broadcast, Room Generation & Queue Management
  // ---------------------------------------------------------------------------

  function broadcastToRoom(roomId, message, excludeSocket = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const client of room.clients) {
      if (client.ws !== excludeSocket && client.ws && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
        } catch (err) {
          log('error', 'BROADCAST_SEND_FAILED', { roomId, error: err.message });
        }
      }
    }
  }

  function generateUniqueRoomId() {
    let roomId;
    let attempts = 0;
    do {
      const code = crypto.randomInt(100000, 1000000); // 100000..999999
      roomId = `LK-${code}`;
      attempts++;
      if (attempts > 10000) {
        throw new Error('Collision ceiling reached: unable to allocate unique roomId');
      }
    } while (rooms.has(roomId));
    return roomId;
  }

  function sanitizeString(val, maxLen = 32, fallback = '') {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, maxLen);
  }

  function removeFromQueues(ws) {
    let removed = false;
    let removedPlayerCount = null;
    for (const count of [2, 4]) {
      const idx = quickMatchQueues[count].findIndex(item => item.ws === ws);
      if (idx !== -1) {
        quickMatchQueues[count].splice(idx, 1);
        removed = true;
        removedPlayerCount = count;
        // Notify remaining in queue of their new position
        quickMatchQueues[count].forEach((item, posIdx) => {
          if (item.ws && item.ws.readyState === WebSocket.OPEN) {
            try {
              item.ws.send(JSON.stringify({
                event: 'QUICK_MATCH_QUEUED',
                payload: {
                  playerCount: count,
                  position: posIdx + 1,
                  queueSize: quickMatchQueues[count].length,
                },
              }));
            } catch {}
          }
        });
      }
    }
    return { removed, playerCount: removedPlayerCount };
  }

  function isInQueue(ws) {
    return quickMatchQueues[2].some(item => item.ws === ws) ||
           quickMatchQueues[4].some(item => item.ws === ws);
  }

  function authenticateSocket(ws, tokenCandidate, claimedPlayerId) {
    if (authRequired && !jwtSecret) {
      return {
        success: false,
        code: 'AUTH_FAILED',
        message: 'Authentication required: Server authentication secret is missing. Unauthenticated gameplay is disabled.',
      };
    }

    if (jwtSecret) {
      if (!tokenCandidate) {
        if (authRequired || isProduction) {
          return { success: false, code: 'AUTH_FAILED', message: 'Authentication required: authToken must be provided' };
        }
        // Dev fallback ONLY when explicitly not in production AND not authRequired
        const effectiveId = claimedPlayerId || ws.authPlayerId || `player_${Date.now()}_${crypto.randomInt(10000, 99999)}`;
        ws.authPlayerId = effectiveId;
        ws.isVerifiedAuth = false;
        return { success: true, playerId: effectiveId, isVerified: false };
      }

      const verifyResult = diceValidator.verifyHS256Jwt(tokenCandidate, jwtSecret);
      if (!verifyResult.valid) {
        if (verifyResult.error === 'TOKEN_EXPIRED') {
          return { success: false, code: 'AUTH_EXPIRED', message: 'Authentication token has expired' };
        }
        return { success: false, code: 'AUTH_FAILED', message: `Authentication failed: ${verifyResult.error}` };
      }

      const verifiedSub = String(verifyResult.payload.sub || verifyResult.payload.id);
      if (claimedPlayerId && claimedPlayerId !== verifiedSub) {
        return {
          success: false,
          code: 'IDENTITY_MISMATCH',
          message: 'Claimed playerId does not match authenticated token identity',
        };
      }

      ws.authPlayerId = verifiedSub;
      ws.isVerifiedAuth = true;
      return { success: true, playerId: verifiedSub, isVerified: true };
    }

    // No JWT secret configured and not authRequired (strictly disallowed in production)
    if (isProduction || authRequired) {
      return {
        success: false,
        code: 'AUTH_FAILED',
        message: 'Authentication required: unauthenticated player identities are strictly disabled in production',
      };
    }

    const fallbackId = claimedPlayerId || ws.authPlayerId || `player_${Date.now()}_${crypto.randomInt(10000, 99999)}`;
    ws.authPlayerId = fallbackId;
    ws.isVerifiedAuth = false;
    return { success: true, playerId: fallbackId, isVerified: false };
  }

  function processQuickMatch(playerCount) {
    // Purge dead sockets
    quickMatchQueues[playerCount] = quickMatchQueues[playerCount].filter(
      item => item.ws && item.ws.readyState === WebSocket.OPEN
    );

    while (quickMatchQueues[playerCount].length >= playerCount) {
      if (rooms.size >= maxRooms) {
        log('warn', 'MAX_ROOMS_REACHED_QUICK_MATCH', { maxRooms, current: rooms.size });
        break;
      }

      const matched = quickMatchQueues[playerCount].splice(0, playerCount);
      // Double check all sockets in matched batch are still OPEN
      const validMatched = matched.filter(item => item.ws && item.ws.readyState === WebSocket.OPEN);
      if (validMatched.length < playerCount) {
        // Return surviving sockets to the front of queue
        quickMatchQueues[playerCount].unshift(...validMatched);
        break;
      }

      const roomId = generateUniqueRoomId();
      const colors = playerCount === 2 ? ['blue', 'green'] : ['blue', 'green', 'yellow', 'red'];
      const initialGameState = playerCount === 2
        ? ludoEngine.initialize2PlayerMatch('online_multiplayer', 'DIAGONAL', 'blue')
        : ludoEngine.initialize4PlayerMatch('online_multiplayer', 'blue');

      // Synchronize client names and human flags into serverGameState.players
      matched.forEach((item, idx) => {
        const color = colors[idx];
        const seat = initialGameState.players.find(p => p.color === color);
        if (seat) {
          seat.name = item.name;
          seat.id = item.playerId;
          seat.isBot = false;
        }
      });

      const clients = matched.map((item, idx) => {
        const color = colors[idx];
        const reconnectToken = diceValidator.generateSecureToken(16);
        item.ws.playerColor = color;
        item.ws.roomId = roomId;
        if (item.ws.idleTimeout) {
          clearTimeout(item.ws.idleTimeout);
          item.ws.idleTimeout = null;
        }
        return {
          id: item.playerId,
          name: item.name,
          color,
          isBot: false,
          isVerifiedAuth: Boolean(item.ws.isVerifiedAuth),
          ws: item.ws,
          disconnectedAt: null,
          reconnectToken,
          graceTimer: null,
          missedStrikes: 0,
        };
      });

      const room = {
        id: roomId,
        isPrivate: false,
        playerCount,
        clients,
        activePlayerColor: 'blue',
        turnTimer: null,
        serverGameState: initialGameState,
        turnSeq: 1,
        timerSeq: 0,
        stateSeq: 0,
        pendingRoll: null,
        isGameOver: false,
        lifecycleState: 'ACTIVE_MATCH',
        createdAt: Date.now(),
        turnStartTime: Date.now(),
      };
      rooms.set(roomId, room);

      log('info', 'QUICK_MATCH_ROOM_CREATED', { roomId, playerCount });

      // Sanitized public players list (NO reconnectToken leaked!)
      const publicPlayers = clients.map(c => ({ name: c.name, color: c.color, isBot: c.isBot }));

      // Send individual ROOM_JOINED with each player's secret reconnectToken
      for (const client of clients) {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            event: 'ROOM_JOINED',
            payload: {
              roomId,
              playerColor: client.color,
              reconnectToken: client.reconnectToken,
              playerCount,
              isPrivate: false,
              players: publicPlayers,
              stateSeq: room.stateSeq,
            },
          }));
        }
      }

      // Start turn timer and broadcast GAME_START
      startServerTurnTimer(roomId);
      broadcastToRoom(roomId, {
        event: 'GAME_START',
        payload: {
          roomId,
          playerCount,
          players: publicPlayers,
          serverGameState: room.serverGameState,
          activePlayerColor: 'blue',
          stateSeq: room.stateSeq,
        },
      });

      // Update remaining in queue
      quickMatchQueues[playerCount].forEach((item, posIdx) => {
        if (item.ws && item.ws.readyState === WebSocket.OPEN) {
          try {
            item.ws.send(JSON.stringify({
              event: 'QUICK_MATCH_QUEUED',
              payload: {
                playerCount,
                position: posIdx + 1,
                queueSize: quickMatchQueues[playerCount].length,
              },
            }));
          } catch {}
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // SERVER TURN TIMER & AUTONOMOUS BOT LOOP
  // ---------------------------------------------------------------------------

  function startServerTurnTimer(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.isGameOver || room.lifecycleState === 'MATCH_FINISHED' || room.lifecycleState === 'PERMANENT_DEPARTURE') return;

    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }

    const timerInstanceSeq = ++room.timerSeq;
    const turnInstanceSeq = room.turnSeq;
    room.turnStartTime = Date.now();

    const activePlayer = room.serverGameState
      ? room.serverGameState.players[room.serverGameState.activePlayerIndex]
      : null;

    if (!activePlayer) return;

    // -----------------------------------------------------------------
    // M-06: AUTONOMOUS SERVER BOT EXECUTION LOOP
    // -----------------------------------------------------------------
    if (activePlayer.isBot) {
      // Phase A: Bot Roll Phase (no roll yet for this turn)
      if (!room.pendingRoll) {
        room.turnTimer = setTimeout(() => {
          if (room.timerSeq !== timerInstanceSeq || room.turnSeq !== turnInstanceSeq || room.isGameOver) {
            return;
          }

          const currentActive = room.serverGameState
            ? room.serverGameState.players[room.serverGameState.activePlayerIndex]
            : null;
          if (!currentActive || !currentActive.isBot) return;

          const consecutiveSixes = room.serverGameState.consecutiveSixes || 0;
          const rolledVal = diceValidator.generateAuthoritativeDiceRoll(consecutiveSixes);
          const rollResult = ludoEngine.handleDiceRoll(room.serverGameState, rolledVal);

          if (rollResult.legalMoves.length === 0) {
            room.serverGameState = rollResult.nextState;
            room.pendingRoll = null;
            room.turnSeq++;
            const nextActiveColor = rollResult.nextState.players[rollResult.nextState.activePlayerIndex].color;
            room.activePlayerColor = nextActiveColor;

            room.stateSeq++;
            broadcastToRoom(roomId, {
              event: 'DICE_ROLLED',
              payload: {
                playerColor: currentActive.color,
                rolledValue: rolledVal,
                isAutoPass: true,
                stateSeq: room.stateSeq,
              },
            });

            const passTimerSeq = ++room.timerSeq;
            const passTurnSeq = room.turnSeq;
            room.turnTimer = setTimeout(() => {
              if (room.timerSeq !== passTimerSeq || room.turnSeq !== passTurnSeq || room.isGameOver) return;
              room.stateSeq++;
              broadcastToRoom(roomId, {
                event: 'TURN_PASSED',
                payload: { nextColor: nextActiveColor, reason: 'NO_LEGAL_MOVES', stateSeq: room.stateSeq },
              });
              startServerTurnTimer(roomId);
            }, 800);
          } else {
            room.serverGameState = rollResult.nextState;
            room.pendingRoll = {
              rollValue: rollResult.nextState.diceRoll,
              playerColor: currentActive.color,
              turnSeq: room.turnSeq,
              rolledAt: Date.now(),
            };

            room.stateSeq++;
            broadcastToRoom(roomId, {
              event: 'DICE_ROLLED',
              payload: {
                playerColor: currentActive.color,
                rolledValue: rollResult.nextState.diceRoll,
                movableTokenIds: rollResult.legalMoves,
                stateSeq: room.stateSeq,
              },
            });

            startServerTurnTimer(roomId);
          }
        }, 1200);
        return;
      }

      // Phase B: Bot Move Phase (pending roll exists)
      room.turnTimer = setTimeout(() => {
        if (room.timerSeq !== timerInstanceSeq || room.turnSeq !== turnInstanceSeq || room.isGameOver) {
          return;
        }

        const currentActive = room.serverGameState
          ? room.serverGameState.players[room.serverGameState.activePlayerIndex]
          : null;
        if (!currentActive || !currentActive.isBot || !room.pendingRoll) return;

        const rolledVal = room.pendingRoll.rollValue;
        const legalMoves = ludoEngine.getLegalMoves(currentActive, rolledVal);

        if (legalMoves.length === 0) {
          room.pendingRoll = null;
          room.turnSeq++;
          const nextIndex = ludoEngine.getNextActivePlayerIndex(
            room.serverGameState.players,
            room.serverGameState.activePlayerIndex
          );
          room.serverGameState = {
            ...room.serverGameState,
            activePlayerIndex: nextIndex,
            diceRoll: null,
            diceValue: null,
            waitingForMove: false,
            movableTokenIds: [],
          };
          const nextColor = room.serverGameState.players[nextIndex].color;
          room.activePlayerColor = nextColor;
          room.stateSeq++;
          broadcastToRoom(roomId, {
            event: 'TURN_PASSED',
            payload: { nextColor, reason: 'NO_LEGAL_MOVES', stateSeq: room.stateSeq },
          });
          startServerTurnTimer(roomId);
          return;
        }

        const bestTokenId = ludoEngine.selectBestBotToken(room.serverGameState, rolledVal, legalMoves);
        const validation = diceValidator.validatePlayerMove(
          room,
          { playerColor: currentActive.color, isBot: true },
          bestTokenId
        );

        if (!validation.success) {
          log('warn', 'BOT_MOVE_VALIDATION_FAILED', { validation, roomId });
          return;
        }

        const nextActiveColor = room.serverGameState.players[room.serverGameState.activePlayerIndex].color;
        room.activePlayerColor = nextActiveColor;

        room.stateSeq++;
        broadcastToRoom(roomId, {
          event: 'TOKEN_MOVED',
          payload: {
            playerColor: currentActive.color,
            tokenId: bestTokenId,
            diceValue: validation.consumedRoll,
            isTurnEnd: !validation.extraTurn,
            currentGameState: room.serverGameState,
            hasKilled: validation.hasKilled,
            reachedHome: validation.reachedHome,
            extraTurn: validation.extraTurn,
            stateSeq: room.stateSeq,
          },
        });

        if (validation.isGameOver) {
          if (room.turnTimer) clearTimeout(room.turnTimer);
          room.turnTimer = null;
          room.isGameOver = true;
          room.lifecycleState = 'MATCH_FINISHED';
          room.finishedAt = Date.now();
          room.stateSeq++;
          broadcastToRoom(roomId, {
            event: 'MATCH_FINISHED',
            payload: { winners: room.serverGameState.winners, stateSeq: room.stateSeq },
          });

          setTimeout(() => {
            if (rooms.get(roomId) === room && room.lifecycleState === 'MATCH_FINISHED') {
              rooms.delete(roomId);
            }
          }, 60000);
        } else {
          startServerTurnTimer(roomId);
        }
      }, 1000);
      return;
    }

    // -----------------------------------------------------------------
    // M-03/M-05: HUMAN PLAYER 15-SECOND AUTHORITATIVE TURN TIMER
    // -----------------------------------------------------------------
    room.turnTimer = setTimeout(() => {
      if (room.timerSeq !== timerInstanceSeq || room.turnSeq !== turnInstanceSeq || room.isGameOver) {
        return;
      }

      const timeoutResult = diceValidator.executeAuthoritativeTimeout(room);
      if (!timeoutResult) return;

      if (timeoutResult.convertedToBot) {
        room.stateSeq++;
        broadcastToRoom(roomId, {
          event: 'PLAYER_CONVERTED_TO_BOT',
          payload: {
            playerColor: timeoutResult.client.color,
            name: timeoutResult.client.name,
            stateSeq: room.stateSeq,
          },
        });
      }

      room.stateSeq++;
      broadcastToRoom(roomId, {
        event: 'TURN_PASSED',
        payload: { nextColor: timeoutResult.nextColor, reason: 'TIMEOUT_15S', stateSeq: room.stateSeq },
      });

      startServerTurnTimer(roomId);
    }, turnTimeoutMs);
  }

  // ---------------------------------------------------------------------------
  // WEBSOCKET CLIENT CONNECTION LIFECYCLE
  // ---------------------------------------------------------------------------

  wss.on('connection', (ws, req) => {
    // Determine remote IP for DoS tracking
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    ws.remoteIp = rawIp;

    const currentIpCount = ipConnections.get(rawIp) || 0;
    if (currentIpCount >= maxConnectionsPerIp) {
      log('warn', 'IP_CONNECTION_LIMIT_EXCEEDED', { ip: rawIp, count: currentIpCount, limit: maxConnectionsPerIp });
      ws.close(4029, 'TOO_MANY_CONNECTIONS_PER_IP');
      return;
    }
    ipConnections.set(rawIp, currentIpCount + 1);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Check optional handshake token in query params or Authorization header
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const queryToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('authToken');
      const authHeader = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      const initialToken = queryToken || authHeader;
      if (initialToken && jwtSecret) {
        const verifyRes = diceValidator.verifyHS256Jwt(initialToken, jwtSecret);
        if (verifyRes.valid) {
          ws.authPlayerId = String(verifyRes.payload.sub || verifyRes.payload.id);
        }
      }
    } catch {}

    let currentRoomId = null;
    let playerInfo = null;

    ws.on('error', (err) => {
      log('error', 'WS_SOCKET_ERROR', { error: err.message, ip: ws.remoteIp });
    });

    // M-07 S-06 / S-07: Per-Socket Token Bucket Rate Limiters
    ws.rateLimiter = diceValidator.createTokenBucket(15, 5);      // General action bucket
    ws.chatRateLimiter = diceValidator.createTokenBucket(5, 1);  // Chat bucket: max burst 5, 1 msg/s

    // M-07 S-09: 10-Second Idle Connection Timeout
    ws.idleTimeout = setTimeout(() => {
      if (!ws.roomId && !isInQueue(ws)) {
        ws.close(4001, 'IDLE_TIMEOUT');
      }
    }, idleAuthTimeoutMs);
    if (ws.idleTimeout.unref) ws.idleTimeout.unref();

    ws.on('message', (raw) => {
      try {
        // Enforce general action rate limiter
        if (ws.rateLimiter && !ws.rateLimiter.consume(1)) {
          ws.send(JSON.stringify({
            event: 'ERROR',
            payload: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded: burst limit 15, refill 5/sec' },
          }));
          return;
        }

        let data;
        try {
          data = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({
            event: 'ERROR',
            payload: { code: 'INVALID_JSON', message: 'Payload must be valid JSON' },
          }));
          return;
        }

        const { action, payload } = data;
        if (!action || typeof action !== 'string') {
          ws.send(JSON.stringify({
            event: 'ERROR',
            payload: { code: 'INVALID_ACTION', message: 'Action string required' },
          }));
          return;
        }

        switch (action) {
          // -------------------------------------------------------------
          // APP HEARTBEAT
          // -------------------------------------------------------------
          case 'PING': {
            ws.send(JSON.stringify({
              event: 'PONG',
              payload: { serverTime: Date.now() },
            }));
            break;
          }

          // -------------------------------------------------------------
          // EXPLICIT AUTHENTICATE HANDSHAKE
          // -------------------------------------------------------------
          case 'AUTHENTICATE': {
            const tokenCandidate = payload?.authToken || payload?.token;
            const authRes = authenticateSocket(ws, tokenCandidate, payload?.playerId);
            if (!authRes.success) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: authRes.code, message: authRes.message },
              }));
              return;
            }
            ws.send(JSON.stringify({
              event: 'AUTHENTICATED',
              payload: { playerId: authRes.playerId },
            }));
            break;
          }

          // -------------------------------------------------------------
          // QUICK MATCHMAKING
          // -------------------------------------------------------------
          case 'QUICK_MATCH': {
            if (ws.roomId) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ALREADY_IN_ROOM', message: `Socket is already bound to room ${ws.roomId}` },
              }));
              return;
            }

            if (isInQueue(ws)) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ALREADY_QUEUED', message: 'Socket is already in a matchmaking queue' },
              }));
              return;
            }

            if (rooms.size >= maxRooms) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'SERVER_BUSY', message: 'Maximum room capacity reached; please retry shortly' },
              }));
              return;
            }

            // Auth verification
            const tokenCandidate = payload?.authToken || payload?.token;
            const authRes = authenticateSocket(ws, tokenCandidate, payload?.playerId);
            if (!authRes.success) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: authRes.code, message: authRes.message },
              }));
              return;
            }

            const pCount = Number(payload?.playerCount);
            if (pCount !== 2 && pCount !== 4) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_PLAYER_COUNT', message: 'Quick match playerCount must be 2 or 4' },
              }));
              return;
            }

            // Defuse idle timeout while waiting in matchmaking queue
            if (ws.idleTimeout) {
              clearTimeout(ws.idleTimeout);
              ws.idleTimeout = null;
            }

            const clientName = sanitizeString(payload?.name, 32, 'Player');
            const clientPlayerId = authRes.playerId;

            quickMatchQueues[pCount].push({
              ws,
              name: clientName,
              playerId: clientPlayerId,
              queuedAt: Date.now(),
            });

            ws.send(JSON.stringify({
              event: 'QUICK_MATCH_QUEUED',
              payload: {
                playerCount: pCount,
                position: quickMatchQueues[pCount].length,
                queueSize: quickMatchQueues[pCount].length,
              },
            }));

            processQuickMatch(pCount);
            break;
          }

          case 'CANCEL_QUICK_MATCH': {
            const { removed, playerCount: removedCount } = removeFromQueues(ws);
            if (removed) {
              ws.send(JSON.stringify({
                event: 'QUICK_MATCH_CANCELLED',
                payload: { playerCount: removedCount },
              }));
              // Re-arm idle timeout
              ws.idleTimeout = setTimeout(() => {
                if (!ws.roomId && !isInQueue(ws)) {
                  ws.close(4001, 'IDLE_TIMEOUT');
                }
              }, idleAuthTimeoutMs);
              if (ws.idleTimeout.unref) ws.idleTimeout.unref();
            } else {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_IN_QUEUE', message: 'Socket is not in a matchmaking queue' },
              }));
            }
            break;
          }

          // -------------------------------------------------------------
          // ROOM CREATION
          // -------------------------------------------------------------
          case 'CREATE_ROOM': {
            if (ws.roomId) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ALREADY_IN_ROOM', message: `Socket is already bound to room ${ws.roomId}. Disconnect or leave before creating another room.` },
              }));
              return;
            }

            if (isInQueue(ws)) {
              removeFromQueues(ws);
            }

            if (rooms.size >= maxRooms) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'SERVER_BUSY', message: 'Maximum room capacity reached; please retry shortly' },
              }));
              return;
            }

            // Auth verification
            const tokenCandidate = payload?.authToken || payload?.token;
            const authRes = authenticateSocket(ws, tokenCandidate, payload?.playerId);
            if (!authRes.success) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: authRes.code, message: authRes.message },
              }));
              return;
            }

            const pCount = payload && payload.playerCount ? Number(payload.playerCount) : 2;
            if (pCount !== 2 && pCount !== 4) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_PAYLOAD', message: 'playerCount must be 2 or 4' },
              }));
              return;
            }

            let roomId;
            if (payload && payload.roomId) {
              if (typeof payload.roomId !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(payload.roomId.trim())) {
                ws.send(JSON.stringify({
                  event: 'ERROR',
                  payload: { code: 'INVALID_PAYLOAD', message: 'Invalid roomId format: 3-32 alphanumeric/hyphen characters required' },
                }));
                return;
              }
              const requestedId = payload.roomId.trim();
              if (rooms.has(requestedId)) {
                ws.send(JSON.stringify({
                  event: 'ERROR',
                  payload: { code: 'ROOM_EXISTS', message: `Room ${requestedId} already exists` },
                }));
                return;
              }
              roomId = requestedId;
            } else {
              roomId = generateUniqueRoomId();
            }

            currentRoomId = roomId;

            if (ws.idleTimeout) {
              clearTimeout(ws.idleTimeout);
              ws.idleTimeout = null;
            }

            const hostReconnectToken = diceValidator.generateSecureToken(16);
            const hostName = sanitizeString(payload?.name, 32, 'Host');
            const hostPlayerId = authRes.playerId;

            playerInfo = {
              id: hostPlayerId,
              name: hostName,
              color: 'blue',
              isBot: false,
              isVerifiedAuth: authRes.isVerified,
              ws,
              disconnectedAt: null,
              reconnectToken: hostReconnectToken,
              graceTimer: null,
              missedStrikes: 0,
            };
            ws.playerColor = 'blue';
            ws.roomId = roomId;

            const initialGameState = pCount === 2
              ? ludoEngine.initialize2PlayerMatch('online_multiplayer', 'DIAGONAL', 'blue')
              : ludoEngine.initialize4PlayerMatch('online_multiplayer', 'blue');

            const hostSeat = initialGameState.players.find(p => p.color === 'blue');
            if (hostSeat) {
              hostSeat.name = hostName;
              hostSeat.id = hostPlayerId;
              hostSeat.isBot = false;
            }

            const room = {
              id: roomId,
              isPrivate: Boolean(payload?.isPrivate !== false),
              playerCount: pCount,
              clients: [playerInfo],
              activePlayerColor: 'blue',
              turnTimer: null,
              serverGameState: initialGameState,
              turnSeq: 1,
              timerSeq: 0,
              stateSeq: 0,
              pendingRoll: null,
              isGameOver: false,
              lifecycleState: 'LOBBY_WAITING',
              createdAt: Date.now(),
            };
            rooms.set(roomId, room);

            ws.send(JSON.stringify({
              event: 'ROOM_CREATED',
              payload: {
                roomId,
                playerColor: 'blue',
                reconnectToken: hostReconnectToken,
                playerCount: pCount,
                isPrivate: room.isPrivate,
                stateSeq: room.stateSeq,
              },
            }));
            break;
          }

          // -------------------------------------------------------------
          // ROOM JOIN & RECONNECT
          // -------------------------------------------------------------
          case 'JOIN_ROOM': {
            if (!payload || typeof payload !== 'object') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_PAYLOAD', message: 'Payload object required' },
              }));
              return;
            }

            const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : null;
            if (!roomId) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_PAYLOAD', message: 'roomId string required' },
              }));
              return;
            }

            if (ws.roomId && ws.roomId !== roomId) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ALREADY_IN_ROOM', message: `Socket is already bound to room ${ws.roomId}. Disconnect or leave before joining a different room.` },
              }));
              return;
            }

            // Anti-spoofing: Clients cannot dictate isBot (only server converts to bot)
            if (payload.isBot !== undefined && payload.isBot !== false) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_PAYLOAD', message: 'Client cannot specify isBot; bots are server-controlled' },
              }));
              return;
            }

            const room = rooms.get(roomId);
            if (!room) {
              ws.send(JSON.stringify({ event: 'ERROR', payload: { message: 'Room not found' } }));
              return;
            }

            // Reject late joins to concluded rooms
            if (room.lifecycleState === 'MATCH_FINISHED' || room.lifecycleState === 'PERMANENT_DEPARTURE') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ROOM_CLOSED', message: 'Room is already finished or departed' },
              }));
              return;
            }

            // Auth verification
            const tokenCandidate = payload?.authToken || payload?.token;
            const authRes = authenticateSocket(ws, tokenCandidate, payload?.playerId);
            if (!authRes.success) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: authRes.code, message: authRes.message },
              }));
              return;
            }

            currentRoomId = roomId;

            // 1. RECONNECTION VERIFICATION & THEFT GUARD
            let existingClient = null;
            if (payload.reconnectToken) {
              existingClient = room.clients.find(c => c.reconnectToken === payload.reconnectToken);
              if (!existingClient) {
                ws.send(JSON.stringify({
                  event: 'ERROR',
                  payload: { code: 'INVALID_RECONNECT_TOKEN', message: 'Seat recovery denied: invalid or unrecognized reconnect token' },
                }));
                return;
              }

              // Cross-player seat theft guard: ensure reconnectToken belongs to THIS authenticated player!
              if (authRes.isVerified || (existingClient.isVerifiedAuth && authRequired) || (payload.playerId && existingClient.id)) {
                const callerId = authRes.isVerified ? authRes.playerId : payload.playerId;
                if (callerId && existingClient.id && existingClient.id !== callerId) {
                  ws.send(JSON.stringify({
                    event: 'ERROR',
                    payload: { code: 'IDENTITY_MISMATCH', message: 'Seat recovery denied: reconnect token belongs to a different player identity' },
                  }));
                  return;
                }
              }
            } else {
              // Anti-spoofing: Reconnection to existing seat strictly requires reconnectToken
              const claimedSeat = room.clients.find(c => {
                if (room.lifecycleState === 'LOBBY_WAITING') {
                  // In lobby: only block if exact playerId matches an existing seat (allow duplicate display names)
                  return Boolean(authRes.playerId && c.id === authRes.playerId);
                } else {
                  // Active match / grace period: block hijacking by either playerId OR display name without token
                  return (authRes.playerId && c.id === authRes.playerId) ||
                         (payload.name && c.name === payload.name);
                }
              });
              if (claimedSeat) {
                ws.send(JSON.stringify({
                  event: 'ERROR',
                  payload: { code: 'INVALID_RECONNECT_TOKEN', message: 'Seat recovery denied: reconnectToken is required to reclaim an existing seat' },
                }));
                return;
              }
            }

            if (existingClient) {
              if (existingClient.disconnectedAt || existingClient.ws !== ws) {
                if (existingClient.ws && existingClient.ws !== ws) {
                  try { existingClient.ws.close(); } catch {}
                }
                existingClient.ws = ws;
                existingClient.disconnectedAt = null;
                if (existingClient.graceTimer) {
                  clearTimeout(existingClient.graceTimer);
                  existingClient.graceTimer = null;
                }
                playerInfo = existingClient;
                ws.playerColor = existingClient.color;
                ws.roomId = roomId;

                if (ws.idleTimeout) {
                  clearTimeout(ws.idleTimeout);
                  ws.idleTimeout = null;
                }

                if (room.serverGameState && !room.isGameOver && room.lifecycleState === 'PLAYER_DISCONNECTED_GRACE') {
                  room.lifecycleState = 'ACTIVE_MATCH';
                }

                room.stateSeq++;
                broadcastToRoom(roomId, {
                  event: 'PLAYER_RECONNECTED',
                  payload: {
                    playerColor: existingClient.color,
                    name: existingClient.name,
                    stateSeq: room.stateSeq,
                  },
                });

                const activeColor = room.serverGameState
                  ? room.serverGameState.players[room.serverGameState.activePlayerIndex].color
                  : room.activePlayerColor;

                const elapsedTurnMs = room.turnStartTime ? Math.max(0, Date.now() - room.turnStartTime) : 0;
                const remainingTurnTimeMs = Math.max(0, turnTimeoutMs - elapsedTurnMs);

                let pendingRollPayload = null;
                if (room.pendingRoll && room.pendingRoll.turnSeq === room.turnSeq && room.serverGameState) {
                  const activePlayerObj = room.serverGameState.players[room.serverGameState.activePlayerIndex];
                  const legalMoves = (activePlayerObj && activePlayerObj.color === room.pendingRoll.playerColor)
                    ? ludoEngine.getLegalMoves(activePlayerObj, room.pendingRoll.rollValue)
                    : [];
                  pendingRollPayload = {
                    rollValue: room.pendingRoll.rollValue,
                    playerColor: room.pendingRoll.playerColor,
                    turnSeq: room.pendingRoll.turnSeq,
                    legalMoves,
                  };
                }

                const turnPhase = pendingRollPayload ? 'moving' : (room.serverGameState?.turnPhase || 'rolling');

                ws.send(JSON.stringify({
                  event: 'RECONNECT_SUCCESS',
                  payload: {
                    roomId,
                    playerColor: existingClient.color,
                    reconnectToken: existingClient.reconnectToken,
                    activePlayerColor: activeColor,
                    gameStateSnapshot: room.serverGameState,
                    serverGameState: room.serverGameState,
                    turnSeq: room.turnSeq,
                    remainingTurnTimeMs,
                    turnDurationMs: turnTimeoutMs,
                    pendingRoll: pendingRollPayload,
                    turnPhase,
                    stateSeq: room.stateSeq,
                  },
                }));
                return;
              } else if (existingClient.ws === ws) {
                // Re-acknowledge active socket
                ws.send(JSON.stringify({
                  event: 'ROOM_JOINED',
                  payload: {
                    roomId,
                    playerColor: existingClient.color,
                    reconnectToken: existingClient.reconnectToken,
                    players: room.clients.map(c => ({ name: c.name, color: c.color, isBot: c.isBot })),
                    playerCount: room.playerCount,
                    isPrivate: room.isPrivate,
                    stateSeq: room.stateSeq,
                  },
                }));
                return;
              }
            }

            // 2. NEW PLAYER JOIN
            if (room.lifecycleState !== 'LOBBY_WAITING') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'MATCH_ALREADY_STARTED', message: 'Cannot join room: match is already in progress' },
              }));
              return;
            }

            if (room.clients.length >= room.playerCount) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ROOM_FULL', message: 'Room is already full' },
              }));
              return;
            }

            const colorPalette = ['blue', 'green', 'yellow', 'red'];
            const assignedColor = colorPalette[room.clients.length];
            const guestReconnectToken = diceValidator.generateSecureToken(16);
            const guestName = sanitizeString(payload.name, 32, 'Player');
            const guestPlayerId = authRes.playerId;

            playerInfo = {
              id: guestPlayerId,
              name: guestName,
              color: assignedColor,
              isBot: false,
              isVerifiedAuth: authRes.isVerified,
              ws,
              disconnectedAt: null,
              reconnectToken: guestReconnectToken,
              graceTimer: null,
              missedStrikes: 0,
            };
            ws.playerColor = assignedColor;
            ws.roomId = roomId;

            if (ws.idleTimeout) {
              clearTimeout(ws.idleTimeout);
              ws.idleTimeout = null;
            }

            room.clients.push(playerInfo);

            if (room.serverGameState && room.serverGameState.players) {
              const seat = room.serverGameState.players.find(p => p.color === assignedColor);
              if (seat) {
                seat.name = guestName;
                seat.id = guestPlayerId;
                seat.isBot = false;
              }
            }

            room.stateSeq++;

            // Broadcast PLAYER_JOINED (never leak reconnectToken!)
            broadcastToRoom(roomId, {
              event: 'PLAYER_JOINED',
              payload: {
                playerColor: assignedColor,
                name: guestName,
                isBot: false,
                stateSeq: room.stateSeq,
              },
            });

            // Send ROOM_JOINED only to the joining player with their secret reconnectToken
            const publicPlayers = room.clients.map(c => ({ name: c.name, color: c.color, isBot: c.isBot }));
            ws.send(JSON.stringify({
              event: 'ROOM_JOINED',
              payload: {
                roomId,
                playerColor: assignedColor,
                reconnectToken: guestReconnectToken,
                players: publicPlayers,
                playerCount: room.playerCount,
                isPrivate: room.isPrivate,
                stateSeq: room.stateSeq,
              },
            }));
            break;
          }

          // -------------------------------------------------------------
          // GAME START (Host Only, Once Only, Full Room Only)
          // -------------------------------------------------------------
          case 'GAME_START': {
            const room = rooms.get(currentRoomId || ws.roomId);
            if (!room) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_IN_ROOM', message: 'Socket is not bound to a room' },
              }));
              return;
            }

            if (!room.clients.some(c => c.ws === ws)) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'UNAUTHENTICATED_SOCKET', message: 'Socket is not an authorized participant in this room' },
              }));
              return;
            }

            if (room.lifecycleState === 'ACTIVE_MATCH') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ALREADY_STARTED', message: 'Match is already in progress' },
              }));
              return;
            }

            if (room.lifecycleState !== 'LOBBY_WAITING') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_LIFECYCLE', message: `Cannot start match in ${room.lifecycleState} state` },
              }));
              return;
            }

            if (ws.playerColor !== 'blue') {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'HOST_ONLY_ACTION', message: 'Only the room host can start the match' },
              }));
              return;
            }

            if (room.clients.length < room.playerCount) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ROOM_NOT_FULL', message: `Cannot start match: waiting for players (${room.clients.length}/${room.playerCount})` },
              }));
              return;
            }

            room.lifecycleState = 'ACTIVE_MATCH';
            room.stateSeq++;
            startServerTurnTimer(room.id);

            const publicPlayers = room.clients.map(c => ({ name: c.name, color: c.color, isBot: c.isBot }));
            broadcastToRoom(room.id, {
              event: 'GAME_START',
              payload: {
                roomId: room.id,
                playerCount: room.playerCount,
                players: publicPlayers,
                serverGameState: room.serverGameState,
                activePlayerColor: room.activePlayerColor || 'blue',
                stateSeq: room.stateSeq,
              },
            });
            break;
          }

          // -------------------------------------------------------------
          // AUTHORITATIVE DICE ROLL
          // -------------------------------------------------------------
          case 'ROLL_DICE': {
            const room = rooms.get(currentRoomId || ws.roomId);
            if (!room || !room.serverGameState) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_IN_ROOM', message: 'Socket is not in an active room' },
              }));
              return;
            }

            if (!room.clients.some(c => c.ws === ws)) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'UNAUTHENTICATED_SOCKET', message: 'Socket is not an authorized participant in this room' },
              }));
              return;
            }

            if (room.lifecycleState !== 'ACTIVE_MATCH' || room.isGameOver) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_LIFECYCLE', message: 'Dice rolls are only permitted during an ACTIVE_MATCH' },
              }));
              return;
            }

            const activePlayer = room.serverGameState.players[room.serverGameState.activePlayerIndex];
            if (activePlayer && activePlayer.isBot) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'BOT_TURN_AUTONOMOUS', message: 'Bots are controlled autonomously by the server' },
              }));
              return;
            }

            if (ws.playerColor !== activePlayer.color) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_ACTIVE_PLAYER', message: `NOT_YOUR_TURN: It is ${activePlayer.color}'s turn to roll` },
              }));
              return;
            }

            if (room.pendingRoll) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'ROLL_ALREADY_PENDING', message: 'ROLL_ALREADY_PENDING: Move pawn before rolling again' },
              }));
              return;
            }

            const consecutiveSixes = room.serverGameState.consecutiveSixes || 0;
            const rolledVal = diceValidator.generateAuthoritativeDiceRoll(consecutiveSixes);
            const rollResult = ludoEngine.handleDiceRoll(room.serverGameState, rolledVal);

            if (rollResult.legalMoves.length === 0) {
              room.serverGameState = rollResult.nextState;
              room.pendingRoll = null;
              room.turnSeq++;
              const nextActiveColor = rollResult.nextState.players[rollResult.nextState.activePlayerIndex].color;
              room.activePlayerColor = nextActiveColor;

              room.stateSeq++;
              broadcastToRoom(room.id, {
                event: 'DICE_ROLLED',
                payload: {
                  playerColor: ws.playerColor,
                  rolledValue: rolledVal,
                  isAutoPass: true,
                  stateSeq: room.stateSeq,
                },
              });

              room.stateSeq++;
              broadcastToRoom(room.id, {
                event: 'TURN_PASSED',
                payload: { nextColor: nextActiveColor, reason: 'NO_LEGAL_MOVES', stateSeq: room.stateSeq },
              });

              startServerTurnTimer(room.id);
            } else {
              room.serverGameState = rollResult.nextState;
              room.pendingRoll = {
                rollValue: rollResult.nextState.diceRoll,
                playerColor: ws.playerColor,
                turnSeq: room.turnSeq,
                rolledAt: Date.now(),
              };

              room.stateSeq++;
              broadcastToRoom(room.id, {
                event: 'DICE_ROLLED',
                payload: {
                  playerColor: ws.playerColor,
                  rolledValue: rollResult.nextState.diceRoll,
                  movableTokenIds: rollResult.legalMoves,
                  stateSeq: room.stateSeq,
                },
              });

              startServerTurnTimer(room.id);
            }
            break;
          }

          // -------------------------------------------------------------
          // AUTHORITATIVE TOKEN MOVE
          // -------------------------------------------------------------
          case 'MOVE_TOKEN': {
            const room = rooms.get(currentRoomId || ws.roomId);
            if (!room || !room.serverGameState) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_IN_ROOM', message: 'Socket is not in an active room' },
              }));
              return;
            }

            if (!room.clients.some(c => c.ws === ws)) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'UNAUTHENTICATED_SOCKET', message: 'Socket is not an authorized participant in this room' },
              }));
              return;
            }

            if (room.lifecycleState !== 'ACTIVE_MATCH' || room.isGameOver) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_LIFECYCLE', message: 'Moves are only permitted during an ACTIVE_MATCH' },
              }));
              return;
            }

            const activePlayer = room.serverGameState.players[room.serverGameState.activePlayerIndex];
            if (activePlayer && activePlayer.isBot) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'BOT_TURN_AUTONOMOUS', message: 'Bots are controlled autonomously by the server' },
              }));
              return;
            }

            const validation = diceValidator.validatePlayerMove(room, ws, payload?.tokenId);
            if (!validation.success) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: validation.code, message: validation.message, legalMoves: validation.legalMoves },
              }));
              return;
            }

            const nextActiveColor = room.serverGameState.players[room.serverGameState.activePlayerIndex].color;
            room.activePlayerColor = nextActiveColor;

            room.stateSeq++;
            broadcastToRoom(room.id, {
              event: 'TOKEN_MOVED',
              payload: {
                playerColor: ws.playerColor,
                tokenId: payload.tokenId,
                diceValue: validation.consumedRoll,
                isTurnEnd: !validation.extraTurn,
                currentGameState: room.serverGameState,
                hasKilled: validation.hasKilled,
                reachedHome: validation.reachedHome,
                extraTurn: validation.extraTurn,
                stateSeq: room.stateSeq,
              },
            });

            if (validation.isGameOver) {
              if (room.turnTimer) clearTimeout(room.turnTimer);
              room.turnTimer = null;
              room.isGameOver = true;
              room.lifecycleState = 'MATCH_FINISHED';
              room.finishedAt = Date.now();

              room.stateSeq++;
              broadcastToRoom(room.id, {
                event: 'MATCH_FINISHED',
                payload: { winners: room.serverGameState.winners, stateSeq: room.stateSeq },
              });

              setTimeout(() => {
                if (rooms.get(room.id) === room && room.lifecycleState === 'MATCH_FINISHED') {
                  rooms.delete(room.id);
                }
              }, 60000);
            } else {
              startServerTurnTimer(room.id);
            }
            break;
          }

          // -------------------------------------------------------------
          // RATE-LIMITED CHAT RELAY
          // -------------------------------------------------------------
          case 'CHAT_MESSAGE': {
            const room = rooms.get(currentRoomId || ws.roomId);
            if (!room) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'NOT_IN_ROOM', message: 'Socket is not in an active room' },
              }));
              return;
            }

            if (!playerInfo) {
              playerInfo = room.clients.find(c => c.ws === ws);
            }
            if (!playerInfo) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'UNAUTHENTICATED_SOCKET', message: 'Socket is not bound to a player seat in this room' },
              }));
              return;
            }

            const rawText = payload?.text;
            if (typeof rawText !== 'string' || !rawText.trim() || rawText.trim().length > 200) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'INVALID_CHAT_MESSAGE', message: 'Chat text must be between 1 and 200 characters' },
              }));
              return;
            }

            if (ws.chatRateLimiter && !ws.chatRateLimiter.consume(1)) {
              ws.send(JSON.stringify({
                event: 'ERROR',
                payload: { code: 'RATE_LIMIT_EXCEEDED', message: 'Chat rate limit exceeded (burst limit 5, refill 1/sec)' },
              }));
              return;
            }

            let chatType = 'text';
            if (payload?.chatType !== undefined) {
              if (payload.chatType === 'emoji' || payload.chatType === 'text') {
                chatType = payload.chatType;
              } else {
                ws.send(JSON.stringify({
                  event: 'ERROR',
                  payload: { code: 'INVALID_CHAT_MESSAGE', message: 'chatType must be either "text" or "emoji"' },
                }));
                return;
              }
            }

            const sanitizedText = rawText.trim().slice(0, 200);
            room.stateSeq++;

            // Broadcast chat with trusted server-attached identity
            broadcastToRoom(room.id, {
              event: 'CHAT_MESSAGE',
              payload: {
                playerColor: ws.playerColor,
                name: playerInfo.name,
                text: sanitizedText,
                chatType,
                timestamp: Date.now(),
                stateSeq: room.stateSeq,
              },
            });
            break;
          }

          // -------------------------------------------------------------
          // CLIENT REJECTIONS: CLIENT CANNOT INJECT MATCH_FINISHED
          // -------------------------------------------------------------
          case 'MATCH_FINISHED': {
            ws.send(JSON.stringify({
              event: 'ERROR',
              payload: { code: 'UNAUTHORIZED_ACTION', message: 'Client cannot declare match finished; match evaluation is strictly server-authoritative' },
            }));
            break;
          }

          default: {
            ws.send(JSON.stringify({
              event: 'ERROR',
              payload: { code: 'UNKNOWN_ACTION', message: `Unrecognized action: ${action}` },
            }));
            break;
          }
        }
      } catch (e) {
        log('error', 'CLIENT_MESSAGE_HANDLER_EXCEPTION', { error: e.message, stack: e.stack });
      }
    });

    ws.on('close', () => {
      // Purge socket from matchmaking queues if queued
      removeFromQueues(ws);

      // Decrement IP connection tracker
      const currentCount = ipConnections.get(ws.remoteIp) || 1;
      if (currentCount <= 1) {
        ipConnections.delete(ws.remoteIp);
      } else {
        ipConnections.set(ws.remoteIp, currentCount - 1);
      }

      if (ws.idleTimeout) {
        clearTimeout(ws.idleTimeout);
        ws.idleTimeout = null;
      }

      const activeRoomId = currentRoomId || ws.roomId;
      if (activeRoomId && rooms.has(activeRoomId)) {
        const room = rooms.get(activeRoomId);
        if (!playerInfo) {
          playerInfo = room.clients.find(c => c.ws === ws || (ws.playerColor && c.color === ws.playerColor));
        }
        if (!playerInfo) return;

        playerInfo.disconnectedAt = Date.now();
        playerInfo.ws = null;

        if (!room.isGameOver) {
          room.lifecycleState = 'PLAYER_DISCONNECTED_GRACE';
        }

        room.stateSeq++;
        broadcastToRoom(activeRoomId, {
          event: 'PLAYER_DISCONNECTED_GRACE',
          payload: {
            playerColor: playerInfo.color,
            name: playerInfo.name,
            graceSeconds: Math.floor(gracePeriodMs / 1000),
            isPrivateRoom: room.isPrivate,
            stateSeq: room.stateSeq,
          },
        });

        // 30-Second Seat Preservation in RAM
        playerInfo.graceTimer = setTimeout(() => {
          if (!rooms.has(activeRoomId)) return;
          if (playerInfo.disconnectedAt) {
            if (room.isPrivate) {
              // Private Room: Show honest waiting overlay; do not silently replace with bot
              room.stateSeq++;
              broadcastToRoom(activeRoomId, {
                event: 'PLAYER_LEFT_PERMANENT',
                payload: {
                  playerColor: playerInfo.color,
                  name: playerInfo.name,
                  stateSeq: room.stateSeq,
                },
              });

              // Check if all human players have departed from private room
              const anyActiveHuman = room.clients.some(
                c => c.ws !== null && c.ws.readyState === WebSocket.OPEN && !c.isBot
              );
              if (!anyActiveHuman) {
                if (room.turnTimer) {
                  clearTimeout(room.turnTimer);
                  room.turnTimer = null;
                }
                for (const c of room.clients) {
                  if (c.graceTimer) clearTimeout(c.graceTimer);
                }
                room.lifecycleState = 'PERMANENT_DEPARTURE';
                rooms.delete(activeRoomId);
              }
            } else {
              // Public Quick Match: Convert to Server Bot
              playerInfo.isBot = true;
              playerInfo.name = `${playerInfo.name} (Bot)`;
              if (room.serverGameState && room.serverGameState.players) {
                room.serverGameState.players = room.serverGameState.players.map((p) =>
                  p.color === playerInfo.color ? { ...p, isBot: true, name: playerInfo.name } : p
                );
              }

              room.stateSeq++;
              broadcastToRoom(activeRoomId, {
                event: 'PLAYER_CONVERTED_TO_BOT',
                payload: {
                  playerColor: playerInfo.color,
                  name: playerInfo.name,
                  stateSeq: room.stateSeq,
                },
              });

              if (!room.isGameOver) {
                room.lifecycleState = 'ACTIVE_MATCH';
              }

              // If active turn belongs to converted bot, trigger autonomous loop
              const activePlayer = room.serverGameState
                ? room.serverGameState.players[room.serverGameState.activePlayerIndex]
                : null;
              if (activePlayer && activePlayer.color === playerInfo.color) {
                startServerTurnTimer(activeRoomId);
              }
            }
          }
        }, gracePeriodMs);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // NATIVE WEBSOCKET HEARTBEAT SWEEPER (15s Unref'd)
  // ---------------------------------------------------------------------------
  const heartbeatInterval = setInterval(() => {
    for (const clientWs of wss.clients) {
      if (clientWs.isAlive === false) {
        log('warn', 'HEARTBEAT_TIMEOUT_TERMINATING_SOCKET', {
          ip: clientWs.remoteIp,
          roomId: clientWs.roomId,
        });
        clientWs.terminate();
      } else {
        clientWs.isAlive = false;
        clientWs.ping();
      }
    }
  }, heartbeatIntervalMs);
  if (heartbeatInterval.unref) heartbeatInterval.unref();

  // ---------------------------------------------------------------------------
  // PERIODIC ROOM CLEANUP SWEEPER (5 min Unref'd)
  // ---------------------------------------------------------------------------
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [rId, r] of rooms.entries()) {
      if (r.lifecycleState === 'ACTIVE_MATCH' || r.lifecycleState === 'PLAYER_DISCONNECTED_GRACE' || (!r.isGameOver && r.serverGameState)) {
        continue;
      }
      if (r.lifecycleState === 'MATCH_FINISHED' && r.finishedAt && (now - r.finishedAt >= 60000)) {
        rooms.delete(rId);
        continue;
      }
      if (r.lifecycleState === 'LOBBY_WAITING' && r.createdAt && (now - r.createdAt > 10 * 60 * 1000)) {
        rooms.delete(rId);
        continue;
      }
      if (r.lifecycleState === 'PERMANENT_DEPARTURE') {
        rooms.delete(rId);
        continue;
      }
    }
  }, cleanupSweepIntervalMs);
  if (cleanupInterval.unref) cleanupInterval.unref();

  // ---------------------------------------------------------------------------
  // GRACEFUL SHUTDOWN HANDLER
  // ---------------------------------------------------------------------------
  async function shutdown() {
    if (isShuttingDown) return Promise.resolve();
    isShuttingDown = true;
    log('info', 'SERVER_SHUTDOWN_STARTING', { rooms: rooms.size });

    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);

    // Notify all active rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.turnTimer) clearTimeout(room.turnTimer);
      for (const c of room.clients) {
        if (c.graceTimer) clearTimeout(c.graceTimer);
      }
      broadcastToRoom(roomId, {
        event: 'SERVER_SHUTDOWN',
        payload: { message: 'Server is shutting down' },
      });
    }

    // Clear matchmaking queues and notify queued sockets
    for (const count of [2, 4]) {
      quickMatchQueues[count].forEach(item => {
        try {
          item.ws.send(JSON.stringify({
            event: 'SERVER_SHUTDOWN',
            payload: { message: 'Server is shutting down' },
          }));
        } catch {}
      });
      quickMatchQueues[count].length = 0;
    }

    // Allow frames to flush across sockets before closing
    await new Promise(r => setTimeout(r, 50));

    // Close all connected sockets
    for (const clientWs of wss.clients) {
      try {
        clientWs.close(1001, 'SERVER_SHUTDOWN');
      } catch {}
    }

    return new Promise((resolve) => {
      wss.close(() => {
        server.close(() => {
          log('info', 'SERVER_SHUTDOWN_COMPLETE');
          resolve();
        });
      });
    });
  }

  // Bind server
  const readyPromise = new Promise((resolve, reject) => {
    server.listen(port, () => {
      const boundPort = server.address().port;
      log('info', 'SERVER_LISTENING', { port: boundPort });
      resolve(boundPort);
    });
    server.on('error', reject);
  });

  return {
    server,
    wss,
    rooms,
    quickMatchQueues,
    ipConnections,
    shutdown,
    getPort: () => server.address() ? server.address().port : null,
    ready: readyPromise,
  };
}

module.exports = {
  createGameServer,
};

// Start automatically when executed directly
if (require.main === module) {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.AUTH_JWT_SECRET;
  if (isProd && !secret) {
    console.error('FATAL: NODE_ENV=production requires SUPABASE_JWT_SECRET or AUTH_JWT_SECRET. Refusing server startup.');
    process.exit(1);
  }
  const instance = createGameServer({ port: process.env.PORT || 8080 });
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, initiating graceful shutdown...');
    instance.shutdown().then(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('Received SIGINT, initiating graceful shutdown...');
    instance.shutdown().then(() => process.exit(0));
  });
}
