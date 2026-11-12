import WebSocket from 'ws';
import { roomManager } from '../rooms/roomManager';
import { GameRoom } from '../rooms/room';

export interface QueueEntry {
  ws: WebSocket;
  playerId: string;
  name: string;
  playerCount: number;
  queuedAt: number;
}

export class Matchmaker {
  public queues: Record<number, QueueEntry[]> = {
    2: [],
    3: [],
    4: [],
  };

  public enqueue(ws: WebSocket, playerId: string, name: string, playerCount: number): { queued: boolean; matchedRoom?: GameRoom } {
    if (![2, 3, 4].includes(playerCount)) {
      throw new Error('INVALID_PLAYER_COUNT: Player count must be 2, 3, or 4.');
    }

    // Check if already in queue
    if (this.isInQueue(ws, playerId)) {
      throw new Error('ALREADY_QUEUED: Player is already in matchmaking queue.');
    }

    const queue = this.queues[playerCount];
    queue.push({
      ws,
      playerId,
      name,
      playerCount,
      queuedAt: Date.now(),
    });

    // Check if enough players to form a room
    if (queue.length >= playerCount) {
      const matched = queue.splice(0, playerCount);
      const room = roomManager.createRoom(undefined, playerCount, false);

      matched.forEach((item, idx) => {
        room.addClient(item.ws, item.playerId, item.name, idx === 0);
      });

      // Start game immediately
      const gameState = room.startGame();

      // Notify all matched players
      matched.forEach((item) => {
        const client = room.clients.get(item.playerId);
        const joinPayload = {
          roomId: room.id,
          roomCode: room.roomCode,
          playerColor: client?.playerColor,
          reconnectToken: client?.reconnectToken,
          isHost: client?.isHost,
          players: Array.from(room.clients.values()).map((c) => ({
            playerId: c.playerId,
            name: c.name,
            color: c.playerColor,
            isHost: c.isHost,
          })),
          serverGameState: gameState,
          stateSeq: room.stateSeq,
        };

        if (item.ws.readyState === WebSocket.OPEN) {
          try {
            item.ws.send(JSON.stringify({ event: 'ROOM_JOINED', type: 'ROOM_JOINED', payload: joinPayload }));
            item.ws.send(JSON.stringify({ event: 'GAME_START', type: 'GAME_START', payload: joinPayload }));
          } catch {}
        }
      });

      return { queued: true, matchedRoom: room };
    }

    return { queued: true };
  }

  public dequeue(ws: WebSocket): boolean {
    let removed = false;
    for (const count of [2, 3, 4]) {
      const idx = this.queues[count].findIndex((item) => item.ws === ws);
      if (idx !== -1) {
        this.queues[count].splice(idx, 1);
        removed = true;
      }
    }
    return removed;
  }

  public isInQueue(ws: WebSocket, playerId: string): boolean {
    for (const count of [2, 3, 4]) {
      if (this.queues[count].some((item) => item.ws === ws || item.playerId === playerId)) {
        return true;
      }
    }
    return false;
  }

  public getQueueSizes(): Record<number, number> {
    return {
      2: this.queues[2].length,
      3: this.queues[3].length,
      4: this.queues[4].length,
    };
  }
}

export const matchmaker = new Matchmaker();
