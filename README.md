# Crown Ludo 3D — Production Game Server

Authoritative, real-time multiplayer WebSocket and REST backend for **Crown Ludo 3D** mobile game.

## Features
- **Authoritative Dice & Movement:** Server validates all turns, dice rolls, token positions, and win conditions.
- **WebSocket Synchronization:** Low-latency match state broadcast with 15s turn timer and 30s reconnect grace period.
- **Matchmaking & Private Rooms:** 2-player and 4-player Quick Match queues, custom 6-digit room codes.
- **Persistence & Profiles:** Relational PostgreSQL database for player statistics, match history, and leaderboards.
- **Zero-Dependency Fallback:** Built-in in-memory fallback for Redis and database for zero-downtime free tier hosting.

## Deployment on Render
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run start`
- **Health Check Endpoint:** `/health`
- **Port:** `10000` (or `PORT` environment variable)
