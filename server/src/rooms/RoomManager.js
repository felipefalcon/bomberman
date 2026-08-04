export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.tickInterval = null;
    this.tileSize = 32;
    this.mapCols = 17;
    this.mapRows = 11;
    this.playerSpeed = 2.6;
    this.playerCollisionHalf = Math.floor(26 / 2);
    this.destructibleChance = 0.7;
    this.initialize();
    this.startSimulationLoop();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      socket.on('create-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
        socket.join(safeRoomId);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('join-room', ({ roomId, playerId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
        const safePlayerId = this.normalizePlayerId(playerId, room.players.size);

        if (room.players.size >= 4) {
          socket.emit('room-error', { message: 'Room is full' });
          return;
        }

        const existingPlayer = room.players.get(socket.id);
        if (existingPlayer) {
          existingPlayer.playerId = safePlayerId;
          existingPlayer.input = {};
          socket.join(safeRoomId);
          room.status = 'playing';
          this.broadcastRoomState(safeRoomId);
          return;
        }

        for (const [existingSocketId, existingPlayer] of Array.from(room.players.entries())) {
          if (existingPlayer.playerId === safePlayerId && existingSocketId !== socket.id) {
            room.players.delete(existingSocketId);
          }
        }

        const spawn = this.getSpawnPosition(safePlayerId, room.players.size);
        room.players.set(socket.id, {
          id: socket.id,
          playerId: safePlayerId,
          x: spawn.x,
          y: spawn.y,
          tx: Math.floor(spawn.x / 32),
          ty: Math.floor(spawn.y / 32),
          input: {},
        });
        socket.join(safeRoomId);
        room.status = 'playing';
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('leave-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        room.players.delete(socket.id);
        socket.leave(safeRoomId);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('player-input', ({ roomId, input }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        player.input = input || {};
      });

      socket.on('disconnect', () => {
        for (const [roomId, room] of this.rooms.entries()) {
          if (room.players.delete(socket.id)) {
            this.broadcastRoomState(roomId);
          }
        }
      });
    });
  }

  startSimulationLoop() {
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.status !== 'playing') continue;

        room.tick = (room.tick || 0) + 1;
        const deltaMs = Math.max(1, now - (room.lastTickAt || now));
        room.lastTickAt = now;
        const deltaTicks = Math.max(0.25, Math.min(8, deltaMs / 16.6667));

        for (const player of room.players.values()) {
          let moveX = Number(player.input?.x || 0);
          let moveY = Number(player.input?.y || 0);

          if (moveX !== 0 && moveY !== 0) {
            const inv = Math.SQRT1_2;
            moveX *= inv;
            moveY *= inv;
          }

          this.applyPlayerMovement(
            room,
            player,
            moveX * this.playerSpeed * deltaTicks,
            moveY * this.playerSpeed * deltaTicks,
          );

          player.tx = Math.floor(player.x / 32);
          player.ty = Math.floor(player.y / 32);
        }

        const uniquePlayers = Array.from(room.players.values()).reduce((acc, player) => {
          if (!acc.some((entry) => entry.playerId === player.playerId)) {
            acc.push({
              ...player,
              playerId: this.normalizePlayerId(player.playerId, acc.length),
            });
          }
          return acc;
        }, []);

        this.io.to(roomId).emit('snapshot', {
          roomId,
          players: uniquePlayers,
          monsters: this.getMonsterSnapshot(roomId, room),
          status: room.status,
          seed: this.getRoomSeed(roomId),
        });
        console.log('[server] snapshot', roomId, uniquePlayers.map((entry) => ({ playerId: entry.playerId, x: entry.x, y: entry.y, tx: entry.tx, ty: entry.ty })));
      }
    }, 100);
  }

  broadcastRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('room-state', {
      roomId,
      players: Array.from(room.players.values()),
      status: room.status,
      seed: this.getRoomSeed(roomId),
    });
  }

  getRoomSeed(roomId) {
    const normalized = String(roomId || 'room').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  getSpawnPosition(playerId, playerCount) {
    const normalizedId = this.normalizePlayerId(playerId, playerCount).toLowerCase();
    const tileSize = this.tileSize;
    const col = this.mapCols;
    const row = this.mapRows;

    if (normalizedId === 'player-1') {
      return { x: tileSize * 1 + tileSize / 2, y: tileSize * 1 + tileSize / 2 };
    }
    if (normalizedId === 'player-2') {
      return { x: tileSize * (col - 2) + tileSize / 2, y: tileSize * (row - 2) + tileSize / 2 };
    }
    if (normalizedId === 'player-3') {
      return { x: tileSize * (col - 2) + tileSize / 2, y: tileSize * 1 + tileSize / 2 };
    }
    if (normalizedId === 'player-4') {
      return { x: tileSize * 1 + tileSize / 2, y: tileSize * (row - 2) + tileSize / 2 };
    }

    const fallbackSpawns = [
      { x: tileSize * 1 + tileSize / 2, y: tileSize * 1 + tileSize / 2 },
      { x: tileSize * (col - 2) + tileSize / 2, y: tileSize * (row - 2) + tileSize / 2 },
      { x: tileSize * (col - 2) + tileSize / 2, y: tileSize * 1 + tileSize / 2 },
      { x: tileSize * 1 + tileSize / 2, y: tileSize * (row - 2) + tileSize / 2 },
    ];
    return fallbackSpawns[Math.max(0, Math.min(fallbackSpawns.length - 1, playerCount))];
  }

  normalizePlayerId(playerId, playerCount = 0) {
    const raw = String(playerId || '').trim();
    if (!raw) {
      return `player-${playerCount + 1}`;
    }

    const lowered = raw.toLowerCase();
    if (lowered === 'p1' || lowered === 'player1' || lowered === '1') {
      return 'player-1';
    }
    if (lowered === 'p2' || lowered === 'player2' || lowered === '2') {
      return 'player-2';
    }
    if (lowered.startsWith('player-')) {
      return lowered;
    }
    return raw;
  }

  getMonsterSnapshot(roomId, room) {
    return [];
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        status: 'waiting',
        tick: 0,
        lastTickAt: Date.now(),
        destructibleTiles: this.buildDestructibleTiles(roomId),
      });
    }

    return this.rooms.get(roomId);
  }

  applyPlayerMovement(room, player, dx, dy) {
    if (dx !== 0) {
      const nextX = player.x + dx;
      if (!this.collidesAt(room, nextX, player.y)) {
        player.x = nextX;
      }
    }

    if (dy !== 0) {
      const nextY = player.y + dy;
      if (!this.collidesAt(room, player.x, nextY)) {
        player.y = nextY;
      }
    }
  }

  collidesAt(room, centerX, centerY) {
    const h = this.playerCollisionHalf;
    const corners = [
      { x: centerX - h, y: centerY - h },
      { x: centerX + h, y: centerY - h },
      { x: centerX - h, y: centerY + h },
      { x: centerX + h, y: centerY + h },
    ];

    for (const corner of corners) {
      const tx = Math.floor(corner.x / this.tileSize);
      const ty = Math.floor(corner.y / this.tileSize);
      if (this.isTileBlocked(room, tx, ty)) {
        return true;
      }
    }

    return false;
  }

  isTileBlocked(room, tx, ty) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return true;
    if (tx < 0 || ty < 0 || tx >= this.mapCols || ty >= this.mapRows) return true;

    const isBorder = tx === 0 || ty === 0 || tx === this.mapCols - 1 || ty === this.mapRows - 1;
    if (isBorder) return true;

    const isPillar = tx % 2 === 0 && ty % 2 === 0;
    if (isPillar) return true;

    return room.destructibleTiles?.has(`${tx},${ty}`) || false;
  }

  buildDestructibleTiles(roomId) {
    const tiles = new Set();
    const randomValue = this.getRoomRandomValue(roomId);

    for (let ty = 1; ty < this.mapRows - 1; ty += 1) {
      for (let tx = 1; tx < this.mapCols - 1; tx += 1) {
        const isStartSafe = (tx === 1 && ty === 1) || (tx === 2 && ty === 1) || (tx === 1 && ty === 2)
          || (tx === this.mapCols - 2 && ty === this.mapRows - 2)
          || (tx === this.mapCols - 3 && ty === this.mapRows - 2)
          || (tx === this.mapCols - 2 && ty === this.mapRows - 3);
        const isClassicCrate = !isStartSafe && tx % 2 === 1 && ty % 2 === 1;

        if (isClassicCrate && randomValue < this.destructibleChance) {
          tiles.add(`${tx},${ty}`);
        }
      }
    }

    return tiles;
  }

  getRoomRandomValue(roomId) {
    // Mirrors current client seededRandom behavior (same value for each call for a room seed).
    const seedHash = String(this.getRoomSeed(roomId))
      .split('')
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0);
    const state = (seedHash * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  }
}
