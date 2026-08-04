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
    this.initialize();
    this.startSimulationLoop();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      socket.on('create-room', ({ roomId }) => {
        const safeRoomId = String(roomId || 'room').trim();
        const room = this.getOrCreateRoom(safeRoomId);
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
        if (room.players.size === 0 && room.status === 'finished') {
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
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.status === 'countdown') {
          if (room.countdownEndsAt && now >= room.countdownEndsAt) {
            room.status = 'playing';
            room.countdownStartedAt = null;
            room.countdownEndsAt = null;
            room.tick = 0;
            room.lastTickAt = now;
            this.broadcastRoomState(roomId);
            this.emitSnapshot(roomId, room);
          } else {
            this.broadcastRoomState(roomId);
            this.emitSnapshot(roomId, room);
          }
        }

        if (room.status !== 'playing') continue;

        room.tick = (room.tick || 0) + 1;
        const deltaMs = Math.max(1, now - (room.lastTickAt || now));
        room.lastTickAt = now;
        const deltaTicks = Math.max(0.25, Math.min(8, deltaMs / 16.6667));

        for (const player of room.players.values()) {
          player.damageBlinkTicks = Math.max(0, Number(player.damageBlinkTicks || 0) - deltaTicks);

          if (Number(player.lives || 0) <= 0) {
            player.input = {};
            continue;
          }

          const inputTick = Number(player.input?.tick || room.tick || 0);
          if (Number.isFinite(inputTick) && inputTick <= player.lastAcceptedInputTick) {
            continue;
          }

          let moveX = Number(player.input?.x || 0);
          let moveY = Number(player.input?.y || 0);
          const playerMoveSpeed = this.getPlayerMoveSpeed(player);

          if (moveX !== 0 && moveY !== 0) {
            const inv = Math.SQRT1_2;
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

        const uniquePlayers = Array.from(room.players.values()).reduce((acc, player) => {
          if (!acc.some((entry) => entry.playerId === player.playerId)) {
            const inputX = Number(player.input?.x || 0);
            const inputY = Number(player.input?.y || 0);
            acc.push({
              ...player,
              x: Math.round(player.x),
              y: Math.round(player.y),
              playerId: this.normalizePlayerId(player.playerId, acc.length),
              isBlinking: Number(player.damageBlinkTicks || 0) > 0,
              facing: player.lastFacing || 'down',
              moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
            });
          }
          return acc;
        }, []);

        this.emitSnapshot(roomId, room, uniquePlayers);
      }
    }, this.simulationStepMs);
  }

  emitSnapshot(roomId, room, uniquePlayers = null) {
    const players = uniquePlayers || Array.from(room.players.values()).reduce((acc, player) => {
      if (!acc.some((entry) => entry.playerId === player.playerId)) {
        const inputX = Number(player.input?.x || 0);
        const inputY = Number(player.input?.y || 0);
        acc.push({
          ...player,
          x: Math.round(player.x),
          y: Math.round(player.y),
          playerId: this.normalizePlayerId(player.playerId, acc.length),
          isBlinking: Number(player.damageBlinkTicks || 0) > 0,
          facing: player.lastFacing || 'down',
          moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
        });
      }
      return acc;
    }, []);

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
      seed: this.getRoomSeed(roomId),
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
      seed: this.getRoomSeed(roomId),
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
      room.countdownEndsAt = room.countdownStartedAt + 15000;
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
    room.status = 'waiting';
    room.tick = 0;
    room.lastTickAt = Date.now();
    room.countdownStartedAt = null;
    room.countdownEndsAt = null;
    room.winnerPlayerId = null;
    room.destructibleTiles = this.buildDestructibleTiles(roomId);
    room.bombs = [];
    room.explosions = [];
    room.powerups = [];
    room.nextBombId = 1;
    room.nextExplosionId = 1;
    room.nextPowerupId = 1;
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

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        status: 'waiting',
        tick: 0,
        lastTickAt: Date.now(),
        winnerPlayerId: null,
        destructibleTiles: this.buildDestructibleTiles(roomId),
        bombs: [],
        explosions: [],
        powerups: [],
        nextBombId: 1,
        nextExplosionId: 1,
        nextPowerupId: 1,
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
      const hitBomb = room.bombs.find((entry) => entry.tx === tile.tx && entry.ty === tile.ty);
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
    switch (facing) {
      case 'up':
        return { dx: 0, dy: -1 };
      case 'left':
        return { dx: -1, dy: 0 };
      case 'right':
        return { dx: 1, dy: 0 };
      default:
        return { dx: 0, dy: 1 };
    }
  }

  updateSlidingBombs(room, deltaTicks) {
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
        if (this.isTileBlocked(room, nextTx, nextTy) || room.bombs.some((entry) => entry !== bomb && entry.tx === nextTx && entry.ty === nextTy)) {
          bomb.isSliding = false;
          bomb.slideDx = 0;
          bomb.slideDy = 0;
          bomb.slideProgress = 0;
          break;
        }

        bomb.tx = nextTx;
        bomb.ty = nextTy;
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
        const hasBombAtTarget = room.bombs.some((entry) => entry !== bomb && entry.tx === lastTile.tx && entry.ty === lastTile.ty);

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

        if (this.isTileBlocked(room, nextTx, nextTy) || room.bombs.some((entry) => entry !== bomb && entry.tx === nextTx && entry.ty === nextTy)) {
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
      const dist = Math.abs(player.tx - bomb.tx) + Math.abs(player.ty - bomb.ty);
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

        if (this.isWallTile(tx, ty)) break;

        const key = `${tx},${ty}`;
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
    for (const explosion of room.explosions) {
      for (const player of room.players.values()) {
        if (player.tx !== explosion.tx || player.ty !== explosion.ty) continue;
        if (explosion.damagedPlayers?.has(player.id)) continue;
        if (Number(player.damageBlinkTicks || 0) > 0) continue;

        player.lives = Math.max(0, Number(player.lives || 0) - 1);
        player.damageBlinkTicks = this.playerDamageBlinkDurationTicks;
        explosion.damagedPlayers?.add(player.id);
      }
    }

    for (const explosion of room.explosions) {
      explosion.timer -= deltaTicks;
    }

    room.explosions = room.explosions.filter((explosion) => explosion.timer > 0);
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
    for (const powerup of room.powerups) {
      powerup.immuneTicks = Math.max(0, powerup.immuneTicks - deltaTicks);
    }

    const collectedIds = new Set();
    for (const player of room.players.values()) {
      for (const powerup of room.powerups) {
        if (collectedIds.has(powerup.id)) continue;
        if (powerup.tx !== player.tx || powerup.ty !== player.ty) continue;
        if (powerup.immuneTicks > 0) continue;

        this.applyPowerup(player, powerup.type);
        collectedIds.add(powerup.id);
      }
    }

    if (collectedIds.size > 0) {
      room.powerups = room.powerups.filter((powerup) => !collectedIds.has(powerup.id));
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
