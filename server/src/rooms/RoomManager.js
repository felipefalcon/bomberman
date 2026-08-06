export class RoomManager {
  static FACING_DIRECTION_MAP = new Map([
    ['up', { dx: 0, dy: -1 }],
    ['left', { dx: -1, dy: 0 }],
    ['right', { dx: 1, dy: 0 }],
    ['down', { dx: 0, dy: 1 }],
  ]);
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.tickTimeout = null;
    this.tileSize = 32;
    this.mapCols = 17;
    this.mapRows = 11;
    this.playerSpeed = 2.6;
    this.playerCollisionHalf = Math.floor(26 / 2);
    this.simulationStepMs = 16;
    this.destructibleChance = 0.7;
    this.bombSlideSpeed = 4;
    this.bombThrowSpeed = 4;
    this.bombThrowDistance = 2;
    this.bombFollowSpeed = 2;
    this.landMineTriggerTicks = 140;
    this.bombFuseTicks = 180;
    this.explosionDuration = 20;
    this.playerDamageBlinkDurationTicks = 120;
    this.playerDamageBlinkIntervalTicks = 10;
    this.powerupSpawnChance = 0.8;
    this.powerupImmuneTicks = 10;
    this.SQRT1_2 = Math.SQRT1_2;
    this.playerPositionsCache = new Map();
    this.uniquePlayersPool = new Map();
    this.setPool = [];
    this.normalizePlayerIdCache = new Map();
    this.wallTiles = new Set();
    this.spawnPositions = new Map([
      ['player-1', { x: this.tileSize * 1 + this.tileSize / 2, y: this.tileSize * 1 + this.tileSize / 2 }],
      ['player-4', { x: this.tileSize * (this.mapCols - 2) + this.tileSize / 2, y: this.tileSize * (this.mapRows - 2) + this.tileSize / 2 }],
      ['player-2', { x: this.tileSize * (this.mapCols - 2) + this.tileSize / 2, y: this.tileSize * 1 + this.tileSize / 2 }],
      ['player-3', { x: this.tileSize * 1 + this.tileSize / 2, y: this.tileSize * (this.mapRows - 2) + this.tileSize / 2 }],
    ]);
    this.tileRandomCache = new Map();
    this.metrics = {
      tickCount: 0,
      totalTickTime: 0,
      playerUpdateTime: 0,
      bombUpdateTime: 0,
      explosionUpdateTime: 0,
      powerupUpdateTime: 0,
      snapshotEmitTime: 0,
      maxTickTime: 0,
    };
    this.powerupWeights = {
      range: 25,
      pierce: 15,
      bomb: 25,
      speed: 20,
      kick_bomb: 8,
      throw_bomb: 8,
      cross_block: 5,
      cross_bomb: 5,
      follower_bomb: 3,
      land_mine: 3,
      extra_life: 2,
    };
    this.initializeWallTiles();
    this.initialize();
    this.startSimulationLoop();
  }

  getPooledSet() {
    let set = this.setPool.pop();
    if (!set) {
      set = new Set();
    }
    return set;
  }

  releasePooledSet(set) {
    set.clear();
    if (this.setPool.length < 10) {
      this.setPool.push(set);
    }
  }

  initializeWallTiles() {
    for (let tx = 0; tx < this.mapCols; tx++) {
      for (let ty = 0; ty < this.mapRows; ty++) {
        if (this.isWallTile(tx, ty)) {
          this.wallTiles.add(`${tx},${ty}`);
        }
      }
    }
  }

  initialize() {
    this.io.on('connection', (socket) => {
      socket.on('ping', ({ clientTime }) => {
        socket.emit('pong', {
          clientTime,
          serverTime: Date.now(),
        });
      });

      socket.on('create-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
        if (room.status === 'finished') {
          this.resetRoomForNextMatch(safeRoomId, room);
        }
        if (!room.hostSocketId) {
          room.hostSocketId = socket.id;
        }
        socket.join(safeRoomId);
        this.handleRoomCountdown(safeRoomId, room);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('join-room', ({ roomId, playerId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
        if (room.status === 'finished') {
          this.resetRoomForNextMatch(safeRoomId, room);
        }
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
          this.handleRoomCountdown(safeRoomId, room);
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
          lives: 3,
          maxBombs: 1,
          activeBombs: 0,
          explosionRange: 1,
          speedPowerups: 0,
          canPierceBlocks: false,
          hasKickBomb: false,
          hasThrowBomb: false,
          hasCrossBlock: false,
          hasCrossBomb: false,
          hasFollowerBomb: false,
          hasLandMine: false,
          lastBombCommandTs: 0,
          lastFacing: 'down',
          lastAcceptedInputTick: 0,
          lastInputSeq: 0,
          inputCooldownTicks: 0,
          damageBlinkTicks: 0,
        });
        if (!room.hostSocketId) {
          room.hostSocketId = socket.id;
        }
        socket.join(safeRoomId);
        this.handleRoomCountdown(safeRoomId, room);
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('leave-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        room.players.delete(socket.id);
        if (room.hostSocketId === socket.id) {
          room.hostSocketId = Array.from(room.players.keys())[0] || null;
        }
        socket.leave(safeRoomId);
        if (room.players.size < 2) {
          this.setRoomWaiting(room);
        } else if (room.status !== 'playing') {
          this.handleRoomCountdown(safeRoomId, room);
        }
        this.broadcastRoomState(safeRoomId);
      });

      socket.on('player-input', ({ roomId, input }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.rooms.get(safeRoomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!room || room.status !== 'playing') return;
        if (!player) return;

        const normalizedInput = this.normalizeInput(input || {}, player);
        player.input = normalizedInput;

        // Send ack with timestamp
        socket.emit('input-ack', {
          tick: input.tick,
          processedAt: Date.now(),
        });

        const bombTs = Number(player.input?.bomb?.timestamp || 0);
        if (Number.isFinite(bombTs) && bombTs > 0 && bombTs !== player.lastBombCommandTs) {
          const placed = this.handleBombCommand(room, player);
          if (placed) {
            this.emitSnapshot(safeRoomId, room);
          }
        }
      });

      socket.on('disconnect', () => {
        for (const [roomId, room] of this.rooms.entries()) {
          if (room.players.delete(socket.id)) {
            if (room.hostSocketId === socket.id) {
              room.hostSocketId = Array.from(room.players.keys())[0] || null;
            }
            if (room.players.size < 2) {
              this.setRoomWaiting(room);
            } else if (room.status !== 'playing') {
              this.handleRoomCountdown(roomId, room);
            }
            this.broadcastRoomState(roomId);
          }
        }
      });
    });
  }

  startSimulationLoop() {
    const loop = () => {
      const tickStart = Date.now();
      const now = tickStart;
      const roomsNeedingSnapshot = new Set();
      const roomsNeedingBroadcast = new Set();

      // Player update
      const playerStart = Date.now();
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.status === 'countdown') {
          if (room.countdownEndsAt && now >= room.countdownEndsAt) {
            room.status = 'playing';
            room.countdownStartedAt = null;
            room.countdownEndsAt = null;
            room.tick = 0;
            room.lastTickAt = now;
            roomsNeedingBroadcast.add(roomId);
            roomsNeedingSnapshot.add(roomId);
          } else {
            roomsNeedingBroadcast.add(roomId);
            roomsNeedingSnapshot.add(roomId);
          }
        }

        if (room.status !== 'playing') continue;

        room.tick = (room.tick || 0) + 1;
        const deltaMs = Math.max(1, now - (room.lastTickAt || now));
        room.lastTickAt = now;
        const deltaTicks = Math.max(0.25, Math.min(8, deltaMs / 16.6667));

        for (const player of room.players.values()) {
          const lives = Number(player.lives || 0);
          const damageBlinkTicks = Number(player.damageBlinkTicks || 0);
          const inputTick = Number(player.input?.tick || room.tick || 0);

          player.damageBlinkTicks = Math.max(0, damageBlinkTicks - deltaTicks);

          if (lives <= 0) {
            player.input = {};
            continue;
          }

          if (Number.isFinite(inputTick) && inputTick <= player.lastAcceptedInputTick) {
            continue;
          }

          let moveX = Number(player.input?.x || 0);
          let moveY = Number(player.input?.y || 0);
          const playerMoveSpeed = this.getPlayerMoveSpeed(player);

          if (moveX !== 0 && moveY !== 0) {
            const inv = this.SQRT1_2;
            moveX *= inv;
            moveY *= inv;
          }

          this.applyPlayerMovement(
            room,
            player,
            moveX * playerMoveSpeed * deltaTicks,
            moveY * playerMoveSpeed * deltaTicks,
          );
          this.alignPlayerToTileCenter(player, moveX, moveY);

          if (Math.abs(moveX) > Math.abs(moveY) && Math.abs(moveX) > 0) {
            player.lastFacing = moveX > 0 ? 'right' : 'left';
          } else if (Math.abs(moveY) > 0) {
            player.lastFacing = moveY > 0 ? 'down' : 'up';
          }

          player.tx = Math.floor(player.x / this.tileSize);
          player.ty = Math.floor(player.y / this.tileSize);
          this.playerPositionsCache.set(player.id, { tx: player.tx, ty: player.ty });
          this.releaseBombPassThrough(room, player);
          if (this.shouldAcceptBombCommand(player)) {
            this.handleBombCommand(room, player);
          }
          player.lastAcceptedInputTick = inputTick;
        }

        this.updateBombs(room, deltaTicks);
        this.updateExplosions(room, deltaTicks);
        this.updatePowerups(room, deltaTicks);
        this.updateMatchEndState(room);
        roomsNeedingSnapshot.add(roomId);
      }
      this.metrics.playerUpdateTime += Date.now() - playerStart;

      // Snapshot emit
      const snapshotStart = Date.now();
      // Emitir broadcasts em batch
      for (const roomId of roomsNeedingBroadcast) {
        this.broadcastRoomState(roomId);
      }

      // Emitir snapshots em batch
      for (const roomId of roomsNeedingSnapshot) {
        const room = this.rooms.get(roomId);
        if (room) {
          let uniquePlayers = this.uniquePlayersPool.get(roomId);
          if (!uniquePlayers || uniquePlayers.length < 4) {
            uniquePlayers = new Array(4);
            this.uniquePlayersPool.set(roomId, uniquePlayers);
          }

          const seenPlayerIds = new Set();
          let playerCount = 0;
          for (const player of room.players.values()) {
            if (!seenPlayerIds.has(player.playerId)) {
              seenPlayerIds.add(player.playerId);
              const inputX = Number(player.input?.x || 0);
              const inputY = Number(player.input?.y || 0);
              // Não re-normalizar IDs válidos - usar o playerId já armazenado
              const normalizedPlayerId = this.normalizePlayerId(player.playerId, 0);
              uniquePlayers[playerCount] = {
                id: player.id,
                playerId: normalizedPlayerId,
                x: Math.round(player.x),
                y: Math.round(player.y),
                lives: player.lives,
                maxBombs: player.maxBombs,
                explosionRange: player.explosionRange,
                speedPowerups: player.speedPowerups || 0,
                canPierceBlocks: player.canPierceBlocks || false,
                hasKickBomb: player.hasKickBomb || false,
                hasThrowBomb: player.hasThrowBomb || false,
                hasCrossBlock: player.hasCrossBlock || false,
                hasCrossBomb: player.hasCrossBomb || false,
                hasFollowerBomb: player.hasFollowerBomb || false,
                hasLandMine: player.hasLandMine || false,
                damageBlinkTicks: Number(player.damageBlinkTicks || 0),
                isBlinking: Number(player.damageBlinkTicks || 0) > 0,
                facing: player.lastFacing || 'down',
                moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
              };
              playerCount++;
            }
          }

          const validPlayers = uniquePlayers.slice(0, playerCount);
          this.emitSnapshot(roomId, room, validPlayers);
        }
      }
      this.metrics.snapshotEmitTime += Date.now() - snapshotStart;

      // Update metrics
      const tickTime = Date.now() - tickStart;
      this.metrics.tickCount++;
      this.metrics.totalTickTime += tickTime;
      this.metrics.maxTickTime = Math.max(this.metrics.maxTickTime, tickTime);

      const elapsed = Date.now() - tickStart;
      const delay = Math.max(0, this.simulationStepMs - elapsed);
      this.tickTimeout = setTimeout(loop, delay);
    };

    this.tickTimeout = setTimeout(loop, this.simulationStepMs);
  }

  emitSnapshot(roomId, room, uniquePlayers = null) {
    const players = uniquePlayers || (() => {
      const result = [];
      const seenPlayerIds = new Set();
      for (const player of room.players.values()) {
        if (!seenPlayerIds.has(player.playerId)) {
          seenPlayerIds.add(player.playerId);
          const inputX = Number(player.input?.x || 0);
          const inputY = Number(player.input?.y || 0);
          // Não re-normalizar IDs válidos - usar o playerId já armazenado
          const normalizedPlayerId = this.normalizePlayerId(player.playerId, 0);
          result.push({
            id: player.id,
            playerId: normalizedPlayerId,
            x: Math.round(player.x),
            y: Math.round(player.y),
            lives: player.lives,
            maxBombs: player.maxBombs,
            explosionRange: player.explosionRange,
            damageBlinkTicks: Number(player.damageBlinkTicks || 0),
            isBlinking: Number(player.damageBlinkTicks || 0) > 0,
            facing: player.lastFacing || 'down',
            moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
          });
        }
      }
      return result;
    })();

    this.io.to(roomId).emit('snapshot', {
      roomId,
      tick: Number.isFinite(room?.tick) ? room.tick : 0,
      players,
      monsters: [],
      bombs: room.bombs.map((bomb) => ({
        id: bomb.id,
        tx: bomb.tx,
        ty: bomb.ty,
        timer: bomb.timer,
        x: bomb.x,
        y: bomb.y,
        isVisible: bomb.isVisible !== false,
        isFollower: !!bomb.isFollower,
        isLandMine: !!bomb.isLandMine,
        isSliding: !!bomb.isSliding,
        isThrowing: !!bomb.isThrowing,
        isTriggered: !!bomb.isTriggered,
        triggerTimer: Number.isFinite(bomb.triggerTimer) ? bomb.triggerTimer : 0,
      })),
      explosions: room.explosions.map((explosion) => ({
        id: explosion.id,
        tx: explosion.tx,
        ty: explosion.ty,
        timer: explosion.timer,
        isCenter: !!explosion.isCenter,
      })),
      powerups: room.powerups.map((powerup) => ({
        id: powerup.id,
        tx: powerup.tx,
        ty: powerup.ty,
        type: powerup.type,
        immuneTicks: powerup.immuneTicks,
      })),
      destructibleTiles: Array.from(room.destructibleTiles.values()),
      status: room.status,
      winnerPlayerId: room.winnerPlayerId || null,
      seed: room.seed,
    });
  }

  broadcastRoomState(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.io.to(roomId).emit('room-state', this.buildRoomStatePayload(roomId, room));
  }

  buildRoomStatePayload(roomId, room) {
    const countdownSeconds = room.status === 'countdown' && Number.isFinite(room.countdownEndsAt)
      ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
      : 0;

    return {
      roomId,
      players: Array.from(room.players.values()),
      status: room.status,
      seed: room.seed,
      playerCount: room.players.size,
      minPlayers: 2,
      maxPlayers: 4,
      canStart: room.players.size >= 2,
      countdownSeconds,
      hostSocketId: room.hostSocketId || null,
      winnerPlayerId: room.winnerPlayerId || null,
    };
  }

  handleRoomCountdown(roomId, room) {
    if (room.status === 'finished') return;
    if (room.status === 'playing') return;

    if (room.players.size < 2) {
      this.setRoomWaiting(room);
      return;
    }

    if (room.status !== 'countdown') {
      room.status = 'countdown';
      room.countdownStartedAt = Date.now();
      room.countdownEndsAt = room.countdownStartedAt + 5000;
    }

    this.broadcastRoomState(roomId);
    this.emitSnapshot(roomId, room);
  }

  setRoomWaiting(room) {
    if (room.status === 'finished') return;
    room.status = 'waiting';
    room.countdownStartedAt = null;
    room.countdownEndsAt = null;
  }

  resetRoomForNextMatch(roomId, room) {
    room.matchNonce = this.buildNextMatchNonce(room.matchNonce);
    room.status = 'waiting';
    room.tick = 0;
    room.lastTickAt = Date.now();
    room.countdownStartedAt = null;
    room.countdownEndsAt = null;
    room.winnerPlayerId = null;
    room.destructibleTiles = this.buildDestructibleTiles(roomId, room.matchNonce);
    room.bombs = [];
    room.explosions = [];
    room.powerups = [];
    room.nextBombId = 1;
    room.nextExplosionId = 1;
    room.nextPowerupId = 1;
    this.resetPlayersForNextMatch(room);
  }

  resetPlayersForNextMatch(room) {
    const players = Array.from(room.players.values());
    players.forEach((player, index) => {
      const safePlayerId = this.normalizePlayerId(player.playerId, index);
      const spawn = this.getSpawnPosition(safePlayerId, index);

      player.playerId = safePlayerId;
      player.x = spawn.x;
      player.y = spawn.y;
      player.tx = Math.floor(spawn.x / this.tileSize);
      player.ty = Math.floor(spawn.y / this.tileSize);
      player.input = {};
      player.lives = 3;
      player.maxBombs = 1;
      player.activeBombs = 0;
      player.explosionRange = 1;
      player.speedPowerups = 0;
      player.canPierceBlocks = false;
      player.hasKickBomb = false;
      player.hasThrowBomb = false;
      player.hasCrossBlock = false;
      player.hasCrossBomb = false;
      player.hasFollowerBomb = false;
      player.hasLandMine = false;
      player.lastBombCommandTs = 0;
      player.lastFacing = 'down';
      player.lastAcceptedInputTick = 0;
      player.lastInputSeq = 0;
      player.inputCooldownTicks = 0;
      player.damageBlinkTicks = 0;
    });
  }

  buildNextMatchNonce(previousNonce = 0) {
    const current = Number.isFinite(Number(previousNonce)) ? Number(previousNonce) : 0;
    const timePart = Date.now() & 0x7fffffff;
    const randomPart = Math.floor(Math.random() * 0x7fffffff);
    return (current + timePart + randomPart + 1) >>> 0;
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
    return this.spawnPositions.get(normalizedId) || this.spawnPositions.get('player-1');
  }

  normalizePlayerId(playerId, playerCount = 0) {
    const cacheKey = `${playerId}:${playerCount}`;
    if (this.normalizePlayerIdCache.has(cacheKey)) {
      return this.normalizePlayerIdCache.get(cacheKey);
    }

    const raw = String(playerId || '').trim();
    let result;

    if (!raw) {
      result = `player-${playerCount + 1}`;
    } else {
      const lowered = raw.toLowerCase();
      if (lowered === 'p1' || lowered === 'player1' || lowered === '1') {
        result = 'player-1';
      } else if (lowered === 'p2' || lowered === 'player2' || lowered === '2') {
        result = 'player-2';
      } else if (lowered === 'p3' || lowered === 'player3' || lowered === '3') {
        result = 'player-3';
      } else if (lowered === 'p4' || lowered === 'player4' || lowered === '4') {
        result = 'player-4';
      } else if (lowered.startsWith('player-')) {
        // Já é um ID válido no formato player-X, não re-normalizar
        result = lowered;
      } else {
        // IDs não reconhecidos são retornados como-is
        result = raw;
      }
    }

    this.normalizePlayerIdCache.set(cacheKey, result);
    return result;
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      const matchNonce = this.buildNextMatchNonce(0);
      this.rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        status: 'waiting',
        tick: 0,
        lastTickAt: Date.now(),
        winnerPlayerId: null,
        matchNonce,
        destructibleTiles: this.buildDestructibleTiles(roomId, matchNonce),
        bombs: [],
        explosions: [],
        powerups: [],
        nextBombId: 1,
        nextExplosionId: 1,
        nextPowerupId: 1,
        seed: this.getRoomSeed(roomId),
      });
    }

    return this.rooms.get(roomId);
  }

  applyPlayerMovement(room, player, dx, dy) {
    if (dx !== 0) {
      const nextX = player.x + dx;
      if (!this.collidesAt(room, nextX, player.y, player, { dx: Math.sign(dx), dy: 0 })) {
        player.x = nextX;
      }
    }

    if (dy !== 0) {
      const nextY = player.y + dy;
      if (!this.collidesAt(room, player.x, nextY, player, { dx: 0, dy: Math.sign(dy) })) {
        player.y = nextY;
      }
    }
  }

  alignPlayerToTileCenter(player, moveX, moveY) {
    const centerX = Math.floor(player.x / this.tileSize) * this.tileSize + this.tileSize / 2;
    const centerY = Math.floor(player.y / this.tileSize) * this.tileSize + this.tileSize / 2;

    // Keep lane alignment while moving in a cardinal axis.
    if (moveX !== 0 && moveY === 0) {
      if (Math.abs(player.y - centerY) < 8) {
        player.y = centerY;
      }
    }
    if (moveY !== 0 && moveX === 0) {
      if (Math.abs(player.x - centerX) < 8) {
        player.x = centerX;
      }
    }

    // When idle, settle to tile center if already very close.
    if (moveX === 0 && moveY === 0) {
      if (Math.abs(player.x - centerX) < 1.1) {
        player.x = centerX;
      }
      if (Math.abs(player.y - centerY) < 1.1) {
        player.y = centerY;
      }
    }
  }

  collidesAt(room, centerX, centerY, player = null, movementDir = null) {
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
      if (this.isPlayerTileBlocked(room, tx, ty, player)) {
        return true;
      }

      if (this.isBombBlocking(room, tx, ty, player, movementDir)) {
        return true;
      }
    }

    return false;
  }

  isBombBlocking(room, tx, ty, player = null, movementDir = null) {
    const bomb = room.bombs.find((entry) => entry.tx === tx && entry.ty === ty);
    if (!bomb) return false;
    if (bomb.isThrowing) return false;
    if (!player) return true;
    if (player.hasCrossBomb) return false;
    if (bomb.passThroughPlayerIds?.has(player.id)) return false;

    if (
      player.hasKickBomb &&
      movementDir &&
      Math.abs(movementDir.dx || 0) + Math.abs(movementDir.dy || 0) === 1
    ) {
      this.tryKickBomb(room, bomb, movementDir.dx || 0, movementDir.dy || 0);
    }

    if (bomb.isLandMine) return false;
    return true;
  }

  isPlayerTileBlocked(room, tx, ty, player = null) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return true;
    if (tx < 0 || ty < 0 || tx >= this.mapCols || ty >= this.mapRows) return true;

    const isBorder = tx === 0 || ty === 0 || tx === this.mapCols - 1 || ty === this.mapRows - 1;
    if (isBorder) return true;

    const isPillar = tx % 2 === 0 && ty % 2 === 0;
    if (isPillar) return true;

    const isDestructible = room.destructibleTiles?.has(`${tx},${ty}`) || false;
    if (isDestructible && !player?.hasCrossBlock) {
      return true;
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

  releaseBombPassThrough(room, player) {
    for (const bomb of room.bombs) {
      if (!bomb.passThroughPlayerIds?.has(player.id)) continue;
      if (!this.isPlayerOverlappingTile(player, bomb.tx, bomb.ty)) {
        bomb.passThroughPlayerIds.delete(player.id);
      }
    }
  }

  isPlayerOverlappingTile(player, tx, ty) {
    const half = this.playerCollisionHalf;
    const playerMinX = player.x - half;
    const playerMaxX = player.x + half;
    const playerMinY = player.y - half;
    const playerMaxY = player.y + half;

    const tileMinX = tx * this.tileSize;
    const tileMaxX = tileMinX + this.tileSize;
    const tileMinY = ty * this.tileSize;
    const tileMaxY = tileMinY + this.tileSize;

    return (
      playerMaxX > tileMinX &&
      playerMinX < tileMaxX &&
      playerMaxY > tileMinY &&
      playerMinY < tileMaxY
    );
  }

  normalizeInput(input = {}, player = null) {
    const safeInput = input && typeof input === 'object' ? input : {};
    const x = Number(safeInput.x || 0);
    const y = Number(safeInput.y || 0);
    const magnitude = Math.hypot(x, y);
    const normalizedX = Number.isFinite(x) ? x : 0;
    const normalizedY = Number.isFinite(y) ? y : 0;
    let clampedX = normalizedX;
    let clampedY = normalizedY;

    if (magnitude > 1) {
      clampedX /= magnitude;
      clampedY /= magnitude;
    }

    const nextInput = {
      ...safeInput,
      x: clampedX,
      y: clampedY,
      tick: Number.isFinite(Number(safeInput.tick)) ? Number(safeInput.tick) : 0,
      bomb: safeInput.bomb && typeof safeInput.bomb === 'object' ? safeInput.bomb : null,
    };

    if (player?.inputCooldownTicks > 0) {
      player.inputCooldownTicks = Math.max(0, player.inputCooldownTicks - 1);
      nextInput.x = 0;
      nextInput.y = 0;
    }

    return nextInput;
  }

  shouldAcceptBombCommand(player) {
    if (!player) return false;
    if (Number(player.inputCooldownTicks || 0) > 0) return false;
    return true;
  }

  handleBombCommand(room, player) {
    const bombCommandTs = Number(player.input?.bomb?.timestamp || 0);
    if (!Number.isFinite(bombCommandTs) || bombCommandTs <= 0) return;
    if (bombCommandTs === player.lastBombCommandTs) return;

    player.lastBombCommandTs = bombCommandTs;
    if (player.hasThrowBomb) {
      const throwableBomb = this.findThrowableBomb(room, player, player.lastFacing || 'down');
      if (throwableBomb && this.throwBomb(room, throwableBomb, player.lastFacing || 'down')) {
        return true;
      }
    }

    return this.placeBomb(room, player, player.tx, player.ty);
  }

  findThrowableBomb(room, player, facing = 'down') {
    if (!room || !player) return null;

    // Priority 1: bomb currently overlapping the player hitbox.
    const overlapBomb = room.bombs.find((bomb) =>
      !bomb.isSliding &&
      !bomb.isThrowing &&
      this.isPlayerOverlappingTile(player, bomb.tx, bomb.ty)
    );
    if (overlapBomb) return overlapBomb;

    // Priority 2: bomb exactly on player's current tile coordinates.
    const sameTileBomb = room.bombs.find((bomb) =>
      !bomb.isSliding &&
      !bomb.isThrowing &&
      bomb.tx === player.tx &&
      bomb.ty === player.ty
    );
    if (sameTileBomb) return sameTileBomb;

    // Priority 3: bomb on the tile right in front of player facing direction.
    const dir = this.facingToDirection(facing);
    const frontTx = player.tx + dir.dx;
    const frontTy = player.ty + dir.dy;
    return room.bombs.find((bomb) =>
      !bomb.isSliding &&
      !bomb.isThrowing &&
      bomb.tx === frontTx &&
      bomb.ty === frontTy
    ) || null;
  }

  placeBomb(room, player, tx, ty) {
    if (player.activeBombs >= player.maxBombs) return false;
    if (this.isTileBlocked(room, tx, ty)) return false;
    if (room.bombs.some((bomb) => bomb.tx === tx && bomb.ty === ty)) return false;

    const bomb = {
      id: `${room.id}-bomb-${room.nextBombId++}`,
      tx,
      ty,
      x: tx * this.tileSize + this.tileSize / 2,
      y: ty * this.tileSize + this.tileSize / 2,
      timer: this.bombFuseTicks,
      ownerSocketId: player.id,
      ownerPlayerId: player.playerId,
      range: Math.max(1, Number(player.explosionRange || 1)),
      canPierceBlocks: !!player.canPierceBlocks,
      passThroughPlayerIds: new Set([player.id]),
      isSliding: false,
      slideDx: 0,
      slideDy: 0,
      slideProgress: 0,
      isThrowing: false,
      throwDx: 0,
      throwDy: 0,
      throwRemainingTiles: 0,
      throwProgress: 0,
      isFollower: !!player.hasFollowerBomb,
      followDx: 0,
      followDy: 0,
      followProgress: 0,
      isLandMine: !!player.hasLandMine,
      isTriggered: false,
      triggerTimer: this.landMineTriggerTicks,
      ownerMustLeaveTile: !!player.hasLandMine,
    };

    if (bomb.isLandMine) {
      bomb.timer = Number.POSITIVE_INFINITY;
      bomb.isFollower = false;
    }

    room.bombs.push(bomb);
    player.activeBombs += 1;
    return true;
  }

  updateBombs(room, deltaTicks) {
    this.updateSlidingBombs(room, deltaTicks);
    this.updateThrownBombs(room, deltaTicks);
    this.updateFollowerBombs(room, deltaTicks);
    this.updateLandMines(room, deltaTicks);

    for (const bomb of room.bombs) {
      if (!bomb.isLandMine) {
        bomb.timer -= deltaTicks;
      }
    }

    const queue = room.bombs.filter((bomb) => bomb.timer <= 0 || (bomb.isLandMine && bomb.isTriggered && bomb.triggerTimer <= 0));
    while (queue.length > 0) {
      const bomb = queue.shift();
      if (!room.bombs.includes(bomb)) continue;
      const chained = this.explodeBomb(room, bomb);
      for (const chainedBomb of chained) {
        queue.push(chainedBomb);
      }
    }
  }

  explodeBomb(room, bomb) {
    room.bombs = room.bombs.filter((entry) => entry !== bomb);
    const owner = room.players.get(bomb.ownerSocketId);
    if (owner && owner.activeBombs > 0) {
      owner.activeBombs -= 1;
    }

    const tiles = this.getExplosionTiles(room, bomb);
    const explodedTileKeys = new Set(tiles.map((tile) => `${tile.tx},${tile.ty}`));

    // Match single-player behavior: active explosions destroy non-immune powerups.
    room.powerups = room.powerups.filter((powerup) => {
      if (Number(powerup.immuneTicks || 0) > 0) return true;
      return !explodedTileKeys.has(`${powerup.tx},${powerup.ty}`);
    });

    // Criar Map de bombs para lookup O(1)
    const bombMap = new Map();
    for (const b of room.bombs) {
      bombMap.set(`${b.tx},${b.ty}`, b);
    }

    for (const tile of tiles) {
      this.upsertExplosion(room, tile.tx, tile.ty, tile.isCenter);

      const key = `${tile.tx},${tile.ty}`;
      if (room.destructibleTiles.has(key)) {
        room.destructibleTiles.delete(key);
        this.trySpawnPowerup(room, tile.tx, tile.ty);
      }
    }

    const chained = [];
    for (const tile of tiles) {
      const hitBomb = bombMap.get(`${tile.tx},${tile.ty}`);
      if (hitBomb) {
        hitBomb.timer = 0;
        chained.push(hitBomb);
      }
    }

    return chained;
  }

  tryKickBomb(room, bomb, dx, dy) {
    if (!bomb || bomb.isSliding || bomb.isThrowing || bomb.isLandMine) return false;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    const nextTx = bomb.tx + dx;
    const nextTy = bomb.ty + dy;
    if (this.isTileBlocked(room, nextTx, nextTy)) return false;
    if (room.bombs.some((entry) => entry !== bomb && entry.tx === nextTx && entry.ty === nextTy)) return false;

    bomb.isSliding = true;
    bomb.slideDx = dx;
    bomb.slideDy = dy;
    bomb.slideProgress = 0;
    return true;
  }

  throwBomb(room, bomb, facing = 'down') {
    if (!bomb || bomb.isSliding || bomb.isThrowing) return false;

    const dir = this.facingToDirection(facing);
    if (Math.abs(dir.dx) + Math.abs(dir.dy) !== 1) return false;

    let nextTx = bomb.tx + (dir.dx * this.bombThrowDistance);
    let nextTy = bomb.ty + (dir.dy * this.bombThrowDistance);

    // Match single-player behavior: allow temporary out-of-bounds tiles before wrapping.
    if (nextTx < -2) {
      nextTx = this.mapCols - 2;
    } else if (nextTx >= this.mapCols + 2) {
      nextTx = 2;
    }

    if (nextTy < -2) {
      nextTy = this.mapRows - 2;
    } else if (nextTy >= this.mapRows + 2) {
      nextTy = 2;
    }

    bomb.isThrowing = true;
    bomb.throwDx = dir.dx;
    bomb.throwDy = dir.dy;
    bomb.throwProgress = 0;
    bomb.throwAbsolutePosition = 0;
    bomb.throwStartTx = bomb.tx;
    bomb.throwStartTy = bomb.ty;
    bomb.throwPath = [{ tx: nextTx, ty: nextTy }];
    bomb.throwTiles = 1;
    bomb.throwTargetTx = nextTx;
    bomb.throwTargetTy = nextTy;
    bomb.throwRemainingTiles = 1;
    bomb.isVisible = true;
    bomb.isSliding = false;
    return true;
  }

  facingToDirection(facing = 'down') {
    return RoomManager.FACING_DIRECTION_MAP.get(facing) || { dx: 0, dy: 1 };
  }

  updateSlidingBombs(room, deltaTicks) {
    // Criar Map de posições de bombs para lookup O(1)
    const bombPositions = new Map();
    for (const bomb of room.bombs) {
      bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
    }

    for (const bomb of room.bombs) {
      if (!bomb.isSliding || bomb.isThrowing) continue;

      if (!Number.isFinite(bomb.slideProgress)) bomb.slideProgress = 0;
      if (!Number.isFinite(bomb.slideDx)) bomb.slideDx = 0;
      if (!Number.isFinite(bomb.slideDy)) bomb.slideDy = 0;
      if (bomb.slideDx === 0 && bomb.slideDy === 0) {
        bomb.isSliding = false;
        bomb.slideProgress = 0;
        this.setBombPixelFromTile(bomb);
        continue;
      }

      bomb.slideProgress += this.bombSlideSpeed * deltaTicks;
      while (bomb.slideProgress >= this.tileSize) {
        bomb.slideProgress -= this.tileSize;
        const nextTx = bomb.tx + bomb.slideDx;
        const nextTy = bomb.ty + bomb.slideDy;
        const nextKey = `${nextTx},${nextTy}`;

        if (this.isTileBlocked(room, nextTx, nextTy) ||
            (bombPositions.has(nextKey) && bombPositions.get(nextKey) !== bomb)) {
          bomb.isSliding = false;
          bomb.slideDx = 0;
          bomb.slideDy = 0;
          bomb.slideProgress = 0;
          break;
        }

        bomb.tx = nextTx;
        bomb.ty = nextTy;
        bombPositions.set(nextKey, bomb);
      }

      if (!bomb.isSliding) {
        this.setBombPixelFromTile(bomb);
      } else {
        bomb.x = (bomb.tx + (bomb.slideDx * bomb.slideProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
        bomb.y = (bomb.ty + (bomb.slideDy * bomb.slideProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
      }
    }
  }

  updateThrownBombs(room, deltaTicks) {
    // Criar Map de posições de bombs para lookup O(1)
    const bombPositions = new Map();
    for (const bomb of room.bombs) {
      bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
    }

    for (const bomb of room.bombs) {
      if (!bomb.isThrowing) continue;

      if (!Number.isFinite(bomb.throwProgress)) bomb.throwProgress = 0;
      if (!Number.isFinite(bomb.throwAbsolutePosition)) bomb.throwAbsolutePosition = 0;
      if (!Number.isFinite(bomb.throwDx)) bomb.throwDx = 0;
      if (!Number.isFinite(bomb.throwDy)) bomb.throwDy = 0;
      if (!Number.isFinite(bomb.throwStartTx)) bomb.throwStartTx = bomb.tx;
      if (!Number.isFinite(bomb.throwStartTy)) bomb.throwStartTy = bomb.ty;
      if (!Number.isFinite(bomb.throwTargetTx)) bomb.throwTargetTx = bomb.tx;
      if (!Number.isFinite(bomb.throwTargetTy)) bomb.throwTargetTy = bomb.ty;
      if (!Array.isArray(bomb.throwPath) || bomb.throwPath.length === 0) {
        bomb.throwPath = [{ tx: bomb.throwTargetTx, ty: bomb.throwTargetTy }];
      }
      if (!Number.isFinite(bomb.throwTiles) || bomb.throwTiles <= 0) {
        bomb.throwTiles = bomb.throwPath.length;
      }

      if (bomb.throwDx === 0 && bomb.throwDy === 0) {
        bomb.isThrowing = false;
        bomb.throwProgress = 0;
        bomb.throwAbsolutePosition = 0;
        this.setBombPixelFromTile(bomb);
        continue;
      }

      bomb.throwAbsolutePosition += (this.bombThrowSpeed * deltaTicks) / this.tileSize;

      if (bomb.throwAbsolutePosition >= bomb.throwTiles) {
        this.stopThrowingBomb(room, bomb);
        continue;
      }

      const currentSegment = Math.floor(bomb.throwAbsolutePosition);
      const segmentProgress = bomb.throwAbsolutePosition - currentSegment;

      if (currentSegment >= bomb.throwPath.length - 1 && segmentProgress > 0.8) {
        const lastTile = bomb.throwPath[bomb.throwPath.length - 1];
        const lastKey = `${lastTile.tx},${lastTile.ty}`;
        const hasBombAtTarget = bombPositions.has(lastKey) && bombPositions.get(lastKey) !== bomb;

        if (this.isTileBlocked(room, lastTile.tx, lastTile.ty) || hasBombAtTarget) {
          let nextTx = lastTile.tx + bomb.throwDx;
          let nextTy = lastTile.ty + bomb.throwDy;

          if (nextTx < -2) nextTx = this.mapCols - 1;
          else if (nextTx >= this.mapCols + 2) nextTx = 0;

          if (nextTy < -2) nextTy = this.mapRows - 1;
          else if (nextTy >= this.mapRows + 2) nextTy = 0;

          if (bomb.throwPath.length < this.mapCols + this.mapRows) {
            bomb.throwPath.push({ tx: nextTx, ty: nextTy });
            bomb.throwTiles = bomb.throwPath.length;
            bomb.throwTargetTx = nextTx;
            bomb.throwTargetTy = nextTy;
          }
        }
      }

      let startTx;
      let startTy;
      if (currentSegment === 0) {
        startTx = bomb.throwStartTx;
        startTy = bomb.throwStartTy;
      } else {
        startTx = bomb.throwPath[currentSegment - 1].tx;
        startTy = bomb.throwPath[currentSegment - 1].ty;
      }

      const endTile = bomb.throwPath[currentSegment];
      if (!endTile) {
        this.stopThrowingBomb(room, bomb);
        continue;
      }

      const half = this.tileSize / 2;
      const startX = startTx * this.tileSize + half;
      const startY = startTy * this.tileSize + half;
      const endX = endTile.tx * this.tileSize + half;
      const endY = endTile.ty * this.tileSize + half;
      const arc = Math.sin(segmentProgress * Math.PI) * this.tileSize * 0.55;

      const isWrappingX = (startTx < 0 || startTx >= this.mapCols) && (endTile.tx >= 0 && endTile.tx < this.mapCols);
      const isWrappingY = (startTy < 0 || startTy >= this.mapRows) && (endTile.ty >= 0 && endTile.ty < this.mapRows);
      bomb.isVisible = !(isWrappingX || isWrappingY);

      bomb.x = startX + (endX - startX) * segmentProgress;
      bomb.y = startY + (endY - startY) * segmentProgress - arc;
    }
  }

  stopThrowingBomb(room, bomb) {
    if (
      room.bombs.some(
        (entry) =>
          entry !== bomb &&
          entry.tx === bomb.throwTargetTx &&
          entry.ty === bomb.throwTargetTy
      )
    ) {
      for (let i = bomb.throwPath.length - 2; i >= 0; i -= 1) {
        const tile = bomb.throwPath[i];
        if (!this.isTileBlocked(room, tile.tx, tile.ty) &&
          !room.bombs.some((entry) => entry !== bomb && entry.tx === tile.tx && entry.ty === tile.ty)) {
          bomb.throwTargetTx = tile.tx;
          bomb.throwTargetTy = tile.ty;
          break;
        }
      }
    }

    bomb.isThrowing = false;
    bomb.throwDx = 0;
    bomb.throwDy = 0;
    bomb.throwProgress = 0;
    bomb.throwAbsolutePosition = 0;
    bomb.tx = bomb.throwTargetTx;
    bomb.ty = bomb.throwTargetTy;
    bomb.throwStartTx = bomb.tx;
    bomb.throwStartTy = bomb.ty;
    bomb.throwTargetTx = bomb.tx;
    bomb.throwTargetTy = bomb.ty;
    bomb.throwTiles = 0;
    bomb.throwPath = [];
    bomb.throwRemainingTiles = 0;
    bomb.isVisible = true;
    this.setBombPixelFromTile(bomb);
  }

  updateFollowerBombs(room, deltaTicks) {
    // Criar Map de posições de bombs para lookup O(1)
    const bombPositions = new Map();
    for (const bomb of room.bombs) {
      bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
    }

    for (const bomb of room.bombs) {
      if (!bomb.isFollower || bomb.isLandMine || bomb.isSliding || bomb.isThrowing) continue;

      const target = this.findNearestFollowerTarget(room, bomb);
      if (!target) {
        bomb.followDx = 0;
        bomb.followDy = 0;
        bomb.followProgress = 0;
        this.setBombPixelFromTile(bomb);
        continue;
      }

      if (!Number.isFinite(bomb.followProgress)) bomb.followProgress = 0;
      if (!Number.isFinite(bomb.followDx)) bomb.followDx = 0;
      if (!Number.isFinite(bomb.followDy)) bomb.followDy = 0;

      const distanceX = target.tx - bomb.tx;
      const distanceY = target.ty - bomb.ty;
      if (Math.abs(distanceX) <= 1 && Math.abs(distanceY) <= 1 && !(distanceX === 0 && distanceY === 0)) {
        bomb.followDx = 0;
        bomb.followDy = 0;
        bomb.followProgress = 0;
        this.setBombPixelFromTile(bomb);
        continue;
      }

      // Pick a direction immediately so follower movement starts on this frame,
      // avoiding the initial "stuck" feel after placing the bomb.
      if (bomb.followDx === 0 && bomb.followDy === 0) {
        const startDir = this.pickFollowerDirection(room, bomb, target);
        if (!startDir) {
          bomb.followProgress = 0;
          this.setBombPixelFromTile(bomb);
          continue;
        }
        bomb.followDx = startDir.dx;
        bomb.followDy = startDir.dy;
      }

      const speedDelta = this.bombFollowSpeed * deltaTicks;
      bomb.followProgress += speedDelta;

      while (bomb.followProgress >= this.tileSize) {
        if (bomb.followDx === 0 && bomb.followDy === 0) {
          const nextDir = this.pickFollowerDirection(room, bomb, target);
          if (!nextDir) {
            bomb.followProgress = 0;
            break;
          }
          bomb.followDx = nextDir.dx;
          bomb.followDy = nextDir.dy;
        }

        const nextTx = bomb.tx + bomb.followDx;
        const nextTy = bomb.ty + bomb.followDy;
        const nextKey = `${nextTx},${nextTy}`;

        if (this.isTileBlocked(room, nextTx, nextTy) ||
            (bombPositions.has(nextKey) && bombPositions.get(nextKey) !== bomb)) {
          const reroute = this.pickFollowerDirection(room, bomb, target);
          if (!reroute) {
            bomb.followDx = 0;
            bomb.followDy = 0;
            bomb.followProgress = 0;
            break;
          }
          bomb.followDx = reroute.dx;
          bomb.followDy = reroute.dy;
          continue;
        }

        bomb.tx = nextTx;
        bomb.ty = nextTy;
        bombPositions.set(nextKey, bomb);
        bomb.followProgress -= this.tileSize;

        const remainingX = target.tx - bomb.tx;
        const remainingY = target.ty - bomb.ty;
        if (Math.abs(remainingX) <= 1 && Math.abs(remainingY) <= 1 && !(remainingX === 0 && remainingY === 0)) {
          bomb.followDx = 0;
          bomb.followDy = 0;
          bomb.followProgress = 0;
          break;
        }

        const nextDir = this.pickFollowerDirection(room, bomb, target);
        if (!nextDir) {
          bomb.followDx = 0;
          bomb.followDy = 0;
          bomb.followProgress = 0;
          break;
        }
        bomb.followDx = nextDir.dx;
        bomb.followDy = nextDir.dy;
      }

      if (bomb.followDx === 0 && bomb.followDy === 0) {
        this.setBombPixelFromTile(bomb);
      } else {
        bomb.x = (bomb.tx + (bomb.followDx * bomb.followProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
        bomb.y = (bomb.ty + (bomb.followDy * bomb.followProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
      }
    }
  }

  pickFollowerDirection(room, bomb, target) {
    if (!target) return null;

    const dx = target.tx - bomb.tx;
    const dy = target.ty - bomb.ty;
    const candidates = [];

    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      candidates.push({ dx: Math.sign(dx), dy: 0 });
    }
    if (dy !== 0) {
      candidates.push({ dx: 0, dy: Math.sign(dy) });
    }
    if (Math.abs(dx) < Math.abs(dy) && dx !== 0) {
      candidates.push({ dx: Math.sign(dx), dy: 0 });
    }

    for (const dir of candidates) {
      const nextTx = bomb.tx + dir.dx;
      const nextTy = bomb.ty + dir.dy;
      if (this.isTileBlocked(room, nextTx, nextTy)) continue;
      if (room.bombs.some((entry) => entry !== bomb && entry.tx === nextTx && entry.ty === nextTy)) continue;
      return dir;
    }

    return null;
  }

  findNearestFollowerTarget(room, bomb) {
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const player of room.players.values()) {
      if (player.id === bomb.ownerSocketId) continue;
      const cached = this.playerPositionsCache.get(player.id);
      const tx = cached ? cached.tx : player.tx;
      const ty = cached ? cached.ty : player.ty;
      const dist = Math.abs(tx - bomb.tx) + Math.abs(ty - bomb.ty);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        best = player;
      }
    }
    return best;
  }

  updateLandMines(room, deltaTicks) {
    for (const bomb of room.bombs) {
      if (!bomb.isLandMine) continue;

      if (bomb.ownerMustLeaveTile) {
        const owner = room.players.get(bomb.ownerSocketId);
        if (!owner || owner.tx !== bomb.tx || owner.ty !== bomb.ty) {
          bomb.ownerMustLeaveTile = false;
        }
      }

      if (!bomb.isTriggered && !bomb.ownerMustLeaveTile) {
        for (const player of room.players.values()) {
          if (player.tx === bomb.tx && player.ty === bomb.ty) {
            bomb.isTriggered = true;
            bomb.triggerTimer = this.landMineTriggerTicks;
            break;
          }
        }
      }

      if (bomb.isTriggered) {
        bomb.triggerTimer -= deltaTicks;
      }

      this.setBombPixelFromTile(bomb);
    }
  }

  setBombPixelFromTile(bomb) {
    bomb.x = bomb.tx * this.tileSize + this.tileSize / 2;
    bomb.y = bomb.ty * this.tileSize + this.tileSize / 2;
  }

  getExplosionTiles(room, bomb) {
    const tiles = [{ tx: bomb.tx, ty: bomb.ty, isCenter: true }];
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    for (const dir of directions) {
      for (let i = 1; i <= bomb.range; i += 1) {
        const tx = bomb.tx + dir.dx * i;
        const ty = bomb.ty + dir.dy * i;
        const key = `${tx},${ty}`;

        // Usar cache de wall tiles em vez de chamada de função
        if (this.wallTiles.has(key)) break;

        const isDestructible = room.destructibleTiles.has(key);
        tiles.push({ tx, ty, isCenter: false });

        if (isDestructible && !bomb.canPierceBlocks) {
          break;
        }
      }
    }

    return tiles;
  }

  isWallTile(tx, ty) {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return true;
    if (tx < 0 || ty < 0 || tx >= this.mapCols || ty >= this.mapRows) return true;
    if (tx === 0 || ty === 0 || tx === this.mapCols - 1 || ty === this.mapRows - 1) return true;
    return tx % 2 === 0 && ty % 2 === 0;
  }

  upsertExplosion(room, tx, ty, isCenter = false) {
    const key = `${tx},${ty}`;
    const existing = room.explosions.find((entry) => `${entry.tx},${entry.ty}` === key);
    if (existing) {
      existing.timer = Math.max(existing.timer, this.explosionDuration);
      existing.isCenter = existing.isCenter || isCenter;
      return;
    }

    room.explosions.push({
      id: `${room.id}-explosion-${room.nextExplosionId++}`,
      tx,
      ty,
      timer: this.explosionDuration,
      isCenter,
      damagedPlayers: new Set(),
    });
  }

  updateExplosions(room, deltaTicks) {
    // Criar mapa de tiles com explosões para lookup O(1)
    const explosionTiles = this.getPooledSet();
    try {
      for (const explosion of room.explosions) {
        const key = `${explosion.tx},${explosion.ty}`;
        if (!explosionTiles.has(key)) {
          explosionTiles.add(key);
        }
      }

      // Verificar cada player uma vez
      for (const player of room.players.values()) {
        const key = `${player.tx},${player.ty}`;
        if (explosionTiles.has(key)) {
          const explosion = room.explosions.find(e => `${e.tx},${e.ty}` === key);
          if (explosion && !explosion.damagedPlayers?.has(player.id) && Number(player.damageBlinkTicks || 0) <= 0) {
            player.lives = Math.max(0, Number(player.lives || 0) - 1);
            player.damageBlinkTicks = this.playerDamageBlinkDurationTicks;
            explosion.damagedPlayers?.add(player.id);
          }
        }
      }

      for (const explosion of room.explosions) {
        explosion.timer -= deltaTicks;
      }

      room.explosions = room.explosions.filter((explosion) => explosion.timer > 0);
    } finally {
      this.releasePooledSet(explosionTiles);
    }
  }

  updateMatchEndState(room) {
    if (!room || room.status !== 'playing') return;

    const alivePlayers = Array.from(room.players.values()).filter((player) => Number(player.lives || 0) > 0);
    if (alivePlayers.length > 1) return;

    room.status = 'finished';
    room.countdownStartedAt = null;
    room.countdownEndsAt = null;
    room.winnerPlayerId = alivePlayers[0]?.playerId || null;

    for (const player of room.players.values()) {
      player.input = {};
      player.inputCooldownTicks = Math.max(Number(player.inputCooldownTicks || 0), 999999);
    }
  }

  trySpawnPowerup(room, tx, ty) {
    if (Math.random() > this.powerupSpawnChance) return;

    const type = this.getRandomPowerupType();
    room.powerups.push({
      id: `${room.id}-powerup-${room.nextPowerupId++}`,
      tx,
      ty,
      type,
      immuneTicks: Math.max(this.powerupImmuneTicks, this.explosionDuration + 1),
    });
  }

  getRandomPowerupType() {
    const entries = Object.entries(this.powerupWeights);
    const total = entries.reduce((acc, [, weight]) => acc + weight, 0);
    let random = Math.random() * total;

    for (const [type, weight] of entries) {
      random -= weight;
      if (random <= 0) {
        return type;
      }
    }

    return entries[0][0];
  }

  updatePowerups(room, deltaTicks) {
    // Atualizar immune ticks
    for (const powerup of room.powerups) {
      powerup.immuneTicks = Math.max(0, powerup.immuneTicks - deltaTicks);
    }

    // Criar mapa de powerups por tile para lookup O(1)
    const powerupTiles = new Map();
    for (const powerup of room.powerups) {
      if (powerup.immuneTicks <= 0) {
        const key = `${powerup.tx},${powerup.ty}`;
        powerupTiles.set(key, powerup);
      }
    }

    // Coletar powerups
    const collectedIds = this.getPooledSet();
    try {
      for (const player of room.players.values()) {
        const key = `${player.tx},${player.ty}`;
        const powerup = powerupTiles.get(key);
        if (powerup && !collectedIds.has(powerup.id)) {
          this.applyPowerup(player, powerup.type);
          collectedIds.add(powerup.id);
        }
      }

      if (collectedIds.size > 0) {
        room.powerups = room.powerups.filter((powerup) => !collectedIds.has(powerup.id));
      }
    } finally {
      this.releasePooledSet(collectedIds);
    }
  }

  applyPowerup(player, type) {
    switch (type) {
      case 'speed':
        player.speedPowerups += 1;
        break;
      case 'bomb':
        player.maxBombs += 1;
        break;
      case 'range':
        player.explosionRange += 1;
        break;
      case 'pierce':
        player.canPierceBlocks = true;
        break;
      case 'kick_bomb':
        player.hasKickBomb = true;
        break;
      case 'throw_bomb':
        player.hasThrowBomb = true;
        break;
      case 'cross_block':
        player.hasCrossBlock = true;
        break;
      case 'cross_bomb':
        player.hasCrossBomb = true;
        break;
      case 'follower_bomb':
        player.hasFollowerBomb = true;
        player.hasLandMine = false;
        break;
      case 'land_mine':
        player.hasLandMine = true;
        player.hasFollowerBomb = false;
        break;
      case 'extra_life':
        player.lives += 1;
        break;
      default:
        break;
    }
  }

  getPlayerMoveSpeed(player) {
    const stacks = Math.max(0, Number(player?.speedPowerups || 0));
    return this.playerSpeed * Math.pow(1.2, stacks);
  }

  buildDestructibleTiles(roomId, matchNonce = 0) {
    const cacheKey = `${roomId}:${matchNonce}`;

    // Verificar cache
    if (this.tileRandomCache.has(cacheKey)) {
      return new Set(this.tileRandomCache.get(cacheKey));
    }

    const tiles = new Set();

    for (let ty = 1; ty < this.mapRows - 1; ty += 1) {
      for (let tx = 1; tx < this.mapCols - 1; tx += 1) {
        if (this.isSpawnSafeTile(tx, ty)) {
          continue;
        }

        // Preserve indestructible pillar grid from classic Bomberman.
        if (tx % 2 === 0 && ty % 2 === 0) {
          continue;
        }

        // Regional noise creates dense/sparse pockets; local noise breaks visual uniformity.
        const regionX = Math.floor(tx / 3);
        const regionY = Math.floor(ty / 3);
        const regionNoise = this.getTileRandomValue(roomId, regionX, regionY, 'region', matchNonce);
        const localNoise = this.getTileRandomValue(roomId, tx, ty, 'local', matchNonce);
        const roll = this.getTileRandomValue(roomId, tx, ty, 'roll', matchNonce);

        let chance = this.destructibleChance * (0.52 + regionNoise * 0.68);

        // Keep a subtle classic Bomberman feel without hard odd/odd lock.
        if (tx % 2 === 1 && ty % 2 === 1) {
          chance += 0.06;
        } else {
          chance -= 0.04;
        }

        chance += (localNoise - 0.5) * 0.12;
        chance = Math.max(0.28, Math.min(0.82, chance));

        if (roll < chance) {
          tiles.add(`${tx},${ty}`);
        }
      }
    }

    // Cache resultado
    this.tileRandomCache.set(cacheKey, Array.from(tiles));
    return tiles;
  }

  isSpawnSafeTile(tx, ty) {
    const zones = [
      [1, 1],
      [this.mapCols - 2, this.mapRows - 2],
      [this.mapCols - 2, 1],
      [1, this.mapRows - 2],
    ];

    return zones.some(([sx, sy]) => {
      const dist = Math.abs(tx - sx) + Math.abs(ty - sy);
      return dist <= 1;
    });
  }

  getTileRandomValue(roomId, tx, ty, channel = 'default', matchNonce = 0) {
    const room = this.rooms.get(roomId);
    const seed = room ? room.seed : this.getRoomSeed(roomId);
    const seedInput = `${seed}:${matchNonce}:${tx},${ty}:${channel}`;
    const seedHash = String(seedInput)
      .split('')
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0);
    const state = (seedHash * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  }

  getMetrics() {
    const avgTickTime = this.metrics.tickCount > 0
      ? this.metrics.totalTickTime / this.metrics.tickCount
      : 0;

    return {
      ...this.metrics,
      avgTickTime,
      avgPlayerUpdate: this.metrics.tickCount > 0 ? this.metrics.playerUpdateTime / this.metrics.tickCount : 0,
      avgBombUpdate: this.metrics.tickCount > 0 ? this.metrics.bombUpdateTime / this.metrics.tickCount : 0,
      avgExplosionUpdate: this.metrics.tickCount > 0 ? this.metrics.explosionUpdateTime / this.metrics.tickCount : 0,
      avgPowerupUpdate: this.metrics.tickCount > 0 ? this.metrics.powerupUpdateTime / this.metrics.tickCount : 0,
      avgSnapshotEmit: this.metrics.tickCount > 0 ? this.metrics.snapshotEmitTime / this.metrics.tickCount : 0,
    };
  }
}
