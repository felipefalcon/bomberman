import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import {
  BombActionHandler,
  BombLifecycleHandler,
  DestroyingBlockAnimator,
} from '../game/handlers/index.js';
import { RuntimeMetricsCollector } from '../infrastructure/index.js';
import { GameEvents } from '../infrastructure/events/EventBus.js';

/**
 * GameLoop - Manages the main game update loop
 * Handles delta time, system updates, and game state updates
 */
export class GameLoop {
  constructor(gameComponents) {
    this.components = gameComponents;
    this.isRunning = false;
    this.ticker = null;
    this.rafId = null;
    this.lastFrameTime = null;
    this.boundUpdate = this.update.bind(this);
    this.bombActionHandler = new BombActionHandler(this.components);
    this.bombLifecycleHandler = new BombLifecycleHandler(this.components);
    this.destroyingBlockAnimator = new DestroyingBlockAnimator(this.components);
    this.runtimeMetrics = new RuntimeMetricsCollector(this.components, this.components.managers.gameState.eventBus);
    this.components.remotePlayers = this.components.remotePlayers instanceof Map ? this.components.remotePlayers : new Map();
    this.lastAppliedLocalSnapshotTick = null;
    this.localAuthorityTarget = null;
    this.lastProcessedSnapshotTick = null;
    this.lastProcessedSnapshotRef = null;
    this.playerIdCache = new Map();
    this.playerIdCacheMaxSize = 50;
    this.remotePlayerPool = [];
    this.maxPoolSize = 8;
    this.needsSorting = false;
    this.deltaBuffer = [];
    this.deltaBufferSize = 3;
    this.lastDelta = 1.0;
    this.snapshotBuffer = [];
    this.maxSnapshotBuffer = 3;
    this.interpolationDelay = 100; // 100ms de delay para interpolação
    this.extrapolationTime = 50; // 50ms de extrapolation
    this.lastInput = { x: 0, y: 0 };
    this.lastInputTime = 0;
  }

  /**
   * Start the game loop
   * @param {Object} app - PIXI Application instance
   */
  start(app) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.ticker = app.ticker;
    this.lastFrameTime = null;
    this._scheduleFrame();
  }

  /**
   * Stop the game loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  _scheduleFrame() {
    if (!this.isRunning) return;
    if (this.rafId) return;

    this.rafId = requestAnimationFrame((timestamp) => {
      this.rafId = null;
      this._onFrame(timestamp);
    });
  }

  _onFrame(timestamp) {
    if (!this.isRunning) return;

    if (this.lastFrameTime == null) {
      this.lastFrameTime = timestamp;
    }

    const frameTime = timestamp - this.lastFrameTime;
    
    // Delta time suave com buffer
    this.deltaBuffer.push(frameTime);
    if (this.deltaBuffer.length > this.deltaBufferSize) {
      this.deltaBuffer.shift();
    }

    const avgFrameTime = this.deltaBuffer.reduce((a, b) => a + b, 0) / this.deltaBuffer.length;
    let delta = avgFrameTime / 16.6667;

    // Clamp mais agressivo para evitar picos
    delta = Math.max(0.5, Math.min(2.0, delta));

    // Suavização com lastDelta
    delta = delta * 0.7 + this.lastDelta * 0.3;
    this.lastDelta = delta;
    
    this.lastFrameTime = timestamp;

    this.boundUpdate(delta);
    this._scheduleFrame();
  }

  /**
   * Main update loop - called every frame
   * @param {Object} delta - Time delta
   */
  update(delta) {
    try {
      const tickDelta = typeof delta === 'number' ? delta : delta?.deltaTime ?? 1;

      // Update game state (timer, etc.)
      this.components.managers.gameState.update(tickDelta);

      const inputManager = this.components.managers.input;
      const gameState = this.components.managers.gameState;
      const movementCommand = inputManager.getMovementCommand();
      const bombCommand = this.bombActionHandler.buildCommand();
      const onlineBridge = this.components.managers.onlineStateBridge;
      const snapshot = onlineBridge?.getSnapshot?.();

      if (gameState?.isPreGameCountdownActive) {
        if (window.__ONLINE_ENABLED__ && snapshot) {
          const hasNewSnapshot = this._hasNewOnlineSnapshot(snapshot);
          if (hasNewSnapshot) {
            this._syncOnlineWorld(snapshot, tickDelta);
            if (snapshot?.players) {
              this._renderRemotePlayers(snapshot.players, snapshot.tick);
            }
          }
        }
        this.components.managers.input?.update?.();
        this.runtimeMetrics.observeFrame(tickDelta);
        return;
      }

      // Update player
      if (this.components.player) {
        const bombs = this.components.systems.bomb.getBombs();
        const movementCollisionBombs = window.__ONLINE_ENABLED__ ? [] : bombs;
        const player = this.components.player;

        if (onlineBridge?.enabled && onlineBridge?.connected && onlineBridge?.playerId) {
          const playerSpawn = this._getPlayerSpawn(onlineBridge.playerId);
          if (!player._onlineSpawnApplied || player._onlineSpawnPlayerId !== onlineBridge.playerId) {
            player.sprite.x = playerSpawn.x;
            player.sprite.y = playerSpawn.y;
            player._onlineSpawnApplied = true;
            player._onlineSpawnPlayerId = onlineBridge.playerId;
          }
        }

        player.update(
          tickDelta,
          inputManager.keys,
          this.components.map,
          movementCollisionBombs,
          this.components.systems.bomb,
          false,
        );

        if (window.__ONLINE_ENABLED__ && snapshot) {
          // Adicionar snapshot ao buffer para interpolação
          this.snapshotBuffer.push({
            snapshot,
            timestamp: Date.now(),
          });
          
          if (this.snapshotBuffer.length > this.maxSnapshotBuffer) {
            this.snapshotBuffer.shift();
          }
          
          // Interpolar snapshots
          this._interpolateSnapshots(tickDelta);
          
          const hasNewSnapshot = this._hasNewOnlineSnapshot(snapshot);
          if (hasNewSnapshot) {
            this._syncOnlineWorld(snapshot, tickDelta);
            if (snapshot?.players) {
              this._renderRemotePlayers(snapshot.players, snapshot.tick);
            }
          }
        } else if (onlineBridge?.enabled && onlineBridge?.connected && onlineBridge?.hasRemoteSnapshot && snapshot?.players) {
          this._renderRemotePlayers(snapshot.players, snapshot.tick);
        }

        if (window.__ONLINE_ENABLED__) {
          this._applyLocalReconciliation(tickDelta);
          
          // Client-side lag compensation
          const onlineBridge = this.components.managers.onlineStateBridge;
          const rtt = onlineBridge.rtt || 0;
          const halfRtt = rtt / 2;
          
          // Ajustar input com compensação de lag
          onlineBridge.sendInput({
            type: 'move',
            x: movementCommand.x,
            y: movementCommand.y,
            bomb: bombCommand,
            predictedTick: this.lastProcessedSnapshotTick + Math.ceil(halfRtt / 16.6667),
          });
        } else {
          onlineBridge?.sendInput?.({
            type: 'move',
            x: movementCommand.x,
            y: movementCommand.y,
            bomb: bombCommand,
          });
        }

        if (!window.__ONLINE_ENABLED__) {
          this.bombActionHandler.processInput();
        }
      }
      
      // Update input manager after processing input (for next frame)
      this.components.managers.input.update();
      
      // Update systems
      if (!window.__ONLINE_ENABLED__) {
        this.components.systems.bomb.update(
          tickDelta,
          (bomb) => this.bombLifecycleHandler.onBombExplode(bomb),
          this.components.systems.monster.getMonsters(),
          this.components.player
        );
        this.components.systems.explosion.update(tickDelta, this.components.player, this.components.systems.monster.getMonsters(), this.components.systems.powerup.getPowerups());
        this.components.systems.powerup.update(tickDelta, this.components.player);
      }
      this.components.systems.monster.update(tickDelta, this.components.player, this.components.systems.bomb.getBombs());
      
      // Block destruction animation
      this.destroyingBlockAnimator.update(tickDelta);
      
      // HUD timer is updated by GameState UI event emission.
      this.runtimeMetrics.observeFrame(tickDelta);

      if (this.components.managers.gameState?.eventBus) {
        this.components.managers.gameState.eventBus.emit('game:input_command', {
          movement: movementCommand,
          bomb: bombCommand,
        });
      }
    } catch (error) {
      console.error('[gameLoop] update failed', error);
    }
  }

  _getPlayerSpawn(playerId) {
    const tileSize = this.components.tileSize || GAME_CONFIG.TILE_SIZE;
    const row = this.components.map?.rows || GAME_CONFIG.MAP_ROWS;
    const col = this.components.map?.cols || GAME_CONFIG.MAP_COLS;
    const normalizedId = this._normalizePlayerId(playerId);

    if (normalizedId === 'player-2' || normalizedId === 'player2' || normalizedId === 'p2' || normalizedId === '2') {
      return {
        x: tileSize * (col - 2) + tileSize / 2,
        y: tileSize * (row - 2) + tileSize / 2,
      };
    }

    return { x: tileSize * 1.5, y: tileSize * 1.5 };
  }

  _normalizePlayerId(playerId) {
    const raw = String(playerId || '').trim().toLowerCase();
    if (!raw) return '';
    
    if (this.playerIdCache.has(raw)) {
      return this.playerIdCache.get(raw);
    }
    
    let result;
    if (raw === 'p1' || raw === 'player1' || raw === '1') {
      result = 'player-1';
    } else if (raw === 'p2' || raw === 'player2' || raw === '2') {
      result = 'player-2';
    } else if (raw === 'p3' || raw === 'player3' || raw === '3') {
      result = 'player-3';
    } else if (raw === 'p4' || raw === 'player4' || raw === '4') {
      result = 'player-4';
    } else if (raw.startsWith('player-')) {
      result = raw;
    } else {
      result = raw;
    }
    
    // Cache com LRU
    if (this.playerIdCache.size >= this.playerIdCacheMaxSize) {
      const firstKey = this.playerIdCache.keys().next().value;
      this.playerIdCache.delete(firstKey);
    }
    this.playerIdCache.set(raw, result);
    
    return result;
  }

  _getPooledRemotePlayer() {
    return this.remotePlayerPool.pop() || this._createRemotePlayerEntry();
  }

  _releaseRemotePlayer(remoteEntry) {
    if (this.remotePlayerPool.length < this.maxPoolSize) {
      const sprite = remoteEntry?.sprite || remoteEntry;
      sprite.visible = false;
      // Reset player number when returning to pool
      remoteEntry.playerNumber = 1;
      this.remotePlayerPool.push(remoteEntry);
    } else {
      const sprite = remoteEntry?.sprite || remoteEntry;
      sprite?.parent?.removeChild(sprite);
    }
  }

  _renderRemotePlayers(players = [], snapshotTick = null) {
    if (!this.components.gameContainer) return;

    const onlineBridge = this.components.managers.onlineStateBridge;
    const localPlayerId = this._normalizePlayerId(onlineBridge?.playerId);
    const remotePlayers = this.components.remotePlayers instanceof Map
      ? this.components.remotePlayers
      : new Map();

    const otherPlayers = Array.isArray(players)
      ? players.filter((entry) => {
          const entryId = this._normalizePlayerId(entry?.playerId);
          return entryId && entryId !== localPlayerId;
        })
      : [];

    for (const [playerId, remoteEntry] of Array.from(remotePlayers.entries())) {
      if (!otherPlayers.some((entry) => this._normalizePlayerId(entry?.playerId) === playerId)) {
        this._releaseRemotePlayer(remoteEntry);
        remotePlayers.delete(playerId);
      }
    }

    for (const entry of otherPlayers) {
      const entryId = this._normalizePlayerId(entry?.playerId);
      let remoteEntry = remotePlayers.get(entryId);
      if (!remoteEntry) {
        remoteEntry = this._getPooledRemotePlayer();
        const sprite = remoteEntry?.sprite || remoteEntry;
        sprite.visible = true;
        this.components.gameContainer.addChild(sprite);
        this.needsSorting = true;
        remotePlayers.set(entryId, remoteEntry);
      }

      const remoteSprite = remoteEntry?.sprite || remoteEntry;
      this._updateRemotePlayerSprites(remoteEntry, entry?.playerId);

      const tileSize = this.components.tileSize || GAME_CONFIG.TILE_SIZE;
      const pixelX = Number.isFinite(entry?.x) ? entry.x : Number.isFinite(entry?.tx) ? entry.tx * tileSize + tileSize / 2 : tileSize * 1.5;
      const pixelY = Number.isFinite(entry?.y) ? entry.y : Number.isFinite(entry?.ty) ? entry.ty * tileSize + tileSize / 2 : tileSize * 1.5;
      const renderX = Math.round(pixelX);
      const renderY = Math.round(pixelY);
      this._updateRemotePlayerAnimation(remoteEntry, entry, pixelX, pixelY);
      this._applyRemoteDamageBlink(remoteEntry, entry, snapshotTick);
      if (remoteSprite && typeof remoteSprite.position?.set === 'function') {
        // In strict online mode, render remote players exactly at authoritative positions.
        remoteEntry.renderX = renderX;
        remoteEntry.renderY = renderY;
        remoteSprite.position.set(renderX, renderY);
      }

      if (remoteEntry && typeof remoteEntry === 'object') {
        remoteEntry.lastX = pixelX;
        remoteEntry.lastY = pixelY;
      }
    }

    if (this.needsSorting) {
      this.components.gameContainer.sortChildren();
      this.needsSorting = false;
    }

    this.components.remotePlayers = remotePlayers;
  }

  _syncOnlineWorld(snapshot, tickDelta) {
    this.components.map?.syncDestructibleTiles?.(snapshot.destructibleTiles || []);
    this.components.systems.bomb?.syncFromSnapshot?.(snapshot.bombs || []);
    this.components.systems.explosion?.syncFromSnapshot?.(snapshot.explosions || []);
    this.components.systems.powerup?.syncFromSnapshot?.(snapshot.powerups || []);
    this._syncLocalPlayerStateFromSnapshot(snapshot.players || [], snapshot.tick);
    this.components.systems.monster?.syncFromSnapshot?.(snapshot.monsters || []);
    this.components.systems.powerup?.getPowerups?.().forEach((powerup) => powerup.update(tickDelta));

    if (Number.isFinite(snapshot?.tick)) {
      this.lastProcessedSnapshotTick = snapshot.tick;
    }
    this.lastProcessedSnapshotRef = snapshot;
  }

  _hasNewOnlineSnapshot(snapshot) {
    if (!snapshot) return false;
    if (Number.isFinite(snapshot.tick)) {
      return snapshot.tick !== this.lastProcessedSnapshotTick;
    }
    return snapshot !== this.lastProcessedSnapshotRef;
  }

  _syncLocalPlayerStateFromSnapshot(players = [], snapshotTick = null) {
  if (!this.components.player?.gameState?.playerState) return;

  const onlineBridge = this.components.managers.onlineStateBridge;
  const localId = this._normalizePlayerId(onlineBridge?.playerId);

  const localEntry = Array.isArray(players)
    ? players.find(
        (entry) =>
          this._normalizePlayerId(entry?.playerId) === localId
      )
    : null;

  if (!localEntry) return;

  // Atualizar powerups do playerState local com dados do snapshot
  if (localEntry.lives !== undefined) {
    this.components.player.gameState.playerState.lives = localEntry.lives;
  }
  if (localEntry.maxBombs !== undefined) {
    this.components.player.gameState.playerState.maxBombs = localEntry.maxBombs;
  }
  if (localEntry.explosionRange !== undefined) {
    this.components.player.gameState.playerState.explosionRange = localEntry.explosionRange;
  }
  if (localEntry.speedPowerups !== undefined) {
    this.components.player.gameState.playerState.speedPowerups = localEntry.speedPowerups;
  }
  if (localEntry.canPierceBlocks !== undefined) {
    this.components.player.gameState.playerState.canPierceBlocks = localEntry.canPierceBlocks;
  }
  if (localEntry.hasKickBomb !== undefined) {
    this.components.player.gameState.playerState.hasKickBomb = localEntry.hasKickBomb;
  }
  if (localEntry.hasThrowBomb !== undefined) {
    this.components.player.gameState.playerState.hasThrowBomb = localEntry.hasThrowBomb;
  }
  if (localEntry.hasCrossBlock !== undefined) {
    this.components.player.gameState.playerState.hasCrossBlock = localEntry.hasCrossBlock;
  }
  if (localEntry.hasCrossBomb !== undefined) {
    this.components.player.gameState.playerState.hasCrossBomb = localEntry.hasCrossBomb;
  }
  if (localEntry.hasFollowerBomb !== undefined) {
    this.components.player.gameState.playerState.hasFollowerBomb = localEntry.hasFollowerBomb;
  }
  if (localEntry.hasLandMine !== undefined) {
    this.components.player.gameState.playerState.hasLandMine = localEntry.hasLandMine;
  }
  if (localEntry.damageBlinkTicks !== undefined) {
    this.components.player.gameState.playerState.damageBlinkTicks = localEntry.damageBlinkTicks;
  }

  // Emitir evento de atualização de UI para powerups
  this.components.managers.gameState.eventBus.emit(GameEvents.UI_UPDATE_POWERUPS, { player: this.components.player.gameState.playerState });

  const tileSize = this.components.tileSize || GAME_CONFIG.TILE_SIZE;

  const hasAuthoritativeX = Number.isFinite(localEntry.x);
  const hasAuthoritativeY = Number.isFinite(localEntry.y);

  const pixelX = hasAuthoritativeX
    ? localEntry.x
    : Number.isFinite(localEntry.tx)
      ? localEntry.tx * tileSize + tileSize / 2
      : null;

  const pixelY = hasAuthoritativeY
    ? localEntry.y
    : Number.isFinite(localEntry.ty)
      ? localEntry.ty * tileSize + tileSize / 2
      : null;

  const hasNewServerTick = Number.isFinite(snapshotTick)
    ? snapshotTick !== this.lastAppliedLocalSnapshotTick
    : true;

  if (
    hasNewServerTick &&
    Number.isFinite(pixelX) &&
    Number.isFinite(pixelY) &&
    this.components.player?.sprite
  ) {

    const sprite = this.components.player.sprite;

    const errX = pixelX - sprite.x;
    const errY = pixelY - sprite.y;
    const errorDistance = Math.hypot(errX, errY);

    // Mantém precisão do servidor (não arredonda)
    this.localAuthorityTarget = {
      x: pixelX,
      y: pixelY,
    };

    // Apenas teleporta se realmente houve grande divergência
    const HARD_SNAP_DISTANCE = tileSize * 2;

    if (errorDistance > HARD_SNAP_DISTANCE) {
      sprite.position.set(pixelX, pixelY);
    }

    if (Number.isFinite(snapshotTick)) {
      this.lastAppliedLocalSnapshotTick = snapshotTick;
    }
  }

  const state = this.components.player.gameState.playerState;

  const previousLives = Number(state.lives || 0);

  state.maxBombs = Number.isFinite(localEntry.maxBombs)
    ? localEntry.maxBombs
    : state.maxBombs;

  state.activeBombs = Number.isFinite(localEntry.activeBombs)
    ? localEntry.activeBombs
    : state.activeBombs;

  state.explosionRange = Number.isFinite(localEntry.explosionRange)
    ? localEntry.explosionRange
    : state.explosionRange;

  state.speedPowerups = Number.isFinite(localEntry.speedPowerups)
    ? localEntry.speedPowerups
    : state.speedPowerups;

  state.canPierceBlocks = !!localEntry.canPierceBlocks;
  state.hasKickBomb = !!localEntry.hasKickBomb;
  state.hasThrowBomb = !!localEntry.hasThrowBomb;
  state.hasCrossBlock = !!localEntry.hasCrossBlock;
  state.hasCrossBomb = !!localEntry.hasCrossBomb;
  state.hasFollowerBomb = !!localEntry.hasFollowerBomb;
  state.hasLandMine = !!localEntry.hasLandMine;

  state.lives = Number.isFinite(localEntry.lives)
    ? localEntry.lives
    : state.lives;

  // Blink quando perde vida
  if (state.lives < previousLives) {
    this.components.player.startBlink?.();
  } else if (
    Number(localEntry.damageBlinkTicks || 0) > 0 &&
    !this.components.player.isBlinking
  ) {
    this.components.player.startBlink?.();
  }

  // Atualiza velocidade
  const speedMultiplier = Math.pow(
    1.2,
    Math.max(0, state.speedPowerups || 0)
  );

  this.components.player.speed =
    this.components.player.baseSpeed * speedMultiplier;

  // HUD
  this.components.managers.hud?.setLives?.(state.lives);
  this.components.managers.hud?.updatePowerups?.(this.components.player);
}

  _applyLocalReconciliation() {
  if (!this.localAuthorityTarget || !this.components.player?.sprite) {
    return;
  }

  const sprite = this.components.player.sprite;

  const errX = this.localAuthorityTarget.x - sprite.x;
  const errY = this.localAuthorityTarget.y - sprite.y;

  const errorDistance = Math.hypot(errX, errY);

  const movement =
    this.components.managers.input?.getMovementCommand?.() || { x: 0, y: 0 };

  const isMoving =
    Math.abs(movement.x) > 0.001 ||
    Math.abs(movement.y) > 0.001;

  // ==========================
  // Erro absurdo -> teleporta
  // ==========================
  const HARD_SNAP_DISTANCE = this.tileSize * 2;

  if (errorDistance > HARD_SNAP_DISTANCE) {
    sprite.position.set(
      this.localAuthorityTarget.x,
      this.localAuthorityTarget.y
    );
    return;
  }

  // =====================================
  // Dead zone para evitar micro-correções
  // =====================================
  if (errorDistance < 0.5) {
    return;
  }

  // =====================================
  // Snap instantâneo quando parado e erro pequeno
  // =====================================
  if (!isMoving && errorDistance < 2) {
    sprite.position.set(
      this.localAuthorityTarget.x,
      this.localAuthorityTarget.y
    );
    return;
  }

  // =====================================
  // Erro pequeno -> corrige instantaneamente
  // =====================================
  if (errorDistance < 2) {
    sprite.position.set(
      this.localAuthorityTarget.x,
      this.localAuthorityTarget.y
    );
    return;
  }

  // =====================================
  // Parado -> corrige muito mais rápido
  // =====================================
  if (!isMoving) {
    sprite.x += errX * 0.4;
    sprite.y += errY * 0.4;
    return;
  }

  // =====================================
  // Andando -> corrige mais rápido (interpolação linear)
  // =====================================
  const lerpFactor = 0.2;
  sprite.x = sprite.x + (this.localAuthorityTarget.x - sprite.x) * lerpFactor;
  sprite.y = sprite.y + (this.localAuthorityTarget.y - sprite.y) * lerpFactor;
  }

  _interpolateSnapshots(delta) {
    if (this.snapshotBuffer.length < 2) return;
    
    const now = Date.now();
    
    // Adaptive interpolation delay baseado em RTT
    const onlineBridge = this.components.managers.onlineStateBridge;
    const rtt = onlineBridge.rtt || 100;
    const adaptiveDelay = Math.max(50, Math.min(150, rtt * 0.8));
    this.interpolationDelay = adaptiveDelay;
    
    const targetTime = now - this.interpolationDelay;
    
    // Encontrar snapshots que cercam o target time
    let prev = null, next = null;
    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      if (this.snapshotBuffer[i].timestamp <= targetTime && 
          this.snapshotBuffer[i + 1].timestamp > targetTime) {
        prev = this.snapshotBuffer[i];
        next = this.snapshotBuffer[i + 1];
        break;
      }
    }
    
    if (!prev || !next) return;
    
    // Calcular fator de interpolação (0-1)
    const range = next.timestamp - prev.timestamp;
    const elapsed = targetTime - prev.timestamp;
    const t = Math.max(0, Math.min(1, elapsed / range));
    
    // Interpolar posição do player local
    const localId = this._normalizePlayerId(onlineBridge?.playerId);
    
    const prevPlayer = prev.snapshot.players?.find(p => 
      this._normalizePlayerId(p.playerId) === localId
    );
    const nextPlayer = next.snapshot.players?.find(p => 
      this._normalizePlayerId(p.playerId) === localId
    );
    
    if (prevPlayer && nextPlayer) {
      let interpX = prevPlayer.x + (nextPlayer.x - prevPlayer.x) * t;
      let interpY = prevPlayer.y + (nextPlayer.y - prevPlayer.y) * t;
      
      // Extrapolation baseada em input atual
      const input = this.components.managers.input?.getMovementCommand?.() || { x: 0, y: 0 };
      
      // Calcular velocidade baseada em input
      if (input.x !== 0 || input.y !== 0) {
        const timeSinceLastInput = now - this.lastInputTime;
        if (timeSinceLastInput > 100) {
          this.lastInput = input;
          this.lastInputTime = now;
        }
      }
      
      // Extrapolar posição se estiver se movendo
      if (this.lastInput.x !== 0 || this.lastInput.y !== 0) {
        const speed = this.components.player?.speed || 2.6;
        const extrapolationSeconds = this.extrapolationTime / 1000;
        
        interpX += this.lastInput.x * speed * extrapolationSeconds * 16.6667;
        interpY += this.lastInput.y * speed * extrapolationSeconds * 16.6667;
      }
      
      this.localAuthorityTarget = { x: interpX, y: interpY };
    }
  }

  _createRemotePlayerEntry() {
    const localPlayer = this.components.player;
    const playerTextures = localPlayer?.textures;
    const playerMapping = localPlayer?.mapping;

    // Default to player 1 sprites
    const textures = playerTextures?.[1];
    const mapping = playerMapping?.[1];

    if (textures && mapping) {
      const idleDownIndices = mapping.idleDown || [0];
      const idleFrames = idleDownIndices
        .map((index) => textures[index])
        .filter(Boolean);
      const sprite = new PIXI.AnimatedSprite(idleFrames.length > 0 ? idleFrames : [textures[0]]);
      sprite.animationSpeed = localPlayer?.sprite?.animationSpeed ?? GAME_CONFIG.ANIMATION_SPEED;
      sprite.loop = true;
      sprite.play();
      sprite.scale.set(localPlayer?.spriteScale ?? GAME_CONFIG.PLAYER_SPRITE_SCALE, localPlayer?.spriteScale ?? GAME_CONFIG.PLAYER_SPRITE_SCALE);
      if (sprite.anchor && typeof sprite.anchor.set === 'function') {
        sprite.anchor.set(0.5, 0.5);
      }
      sprite.alpha = 0.95;
      sprite.visible = true;
      sprite.zIndex = 1000;
      sprite.roundPixels = true;
      return {
        sprite,
        lastX: null,
        lastY: null,
        renderX: null,
        renderY: null,
        facing: 'down',
        animationKey: 'idleDown',
        playerNumber: 1,
      };
    }

    const avatar = new PIXI.Graphics();
    avatar.rect(
      -this.components.tileSize / 2,
      -this.components.tileSize / 2,
      this.components.tileSize,
      this.components.tileSize,
    );
    avatar.fill(0x33cc33);
    avatar.stroke({ color: 0x000000, width: 2 });
    avatar.alpha = 0.95;
    avatar.position.set(0, 0);
    avatar.visible = true;
    avatar.zIndex = 1000;
    avatar.roundPixels = true;
    return {
      sprite: avatar,
      lastX: null,
      lastY: null,
      renderX: null,
      renderY: null,
      facing: 'down',
      animationKey: 'fallback',
      playerNumber: 1,
    };
  }

  _updateRemotePlayerAnimation(remoteEntry, snapshotEntry, pixelX, pixelY) {
    if (!remoteEntry || typeof remoteEntry !== 'object') return;

    const sprite = remoteEntry.sprite;
    if (!(sprite instanceof PIXI.AnimatedSprite)) return;

    const localPlayer = this.components.player;
    const playerTextures = localPlayer?.textures;
    const playerMapping = localPlayer?.mapping;
    if (!playerTextures || !playerMapping) return;

    // Get the textures and mapping for this specific remote player
    const playerNumber = remoteEntry.playerNumber || 1;
    const textures = playerTextures[playerNumber];
    const mapping = playerMapping[playerNumber];
    if (!textures || !mapping) return;

    const lastX = Number.isFinite(remoteEntry.lastX) ? remoteEntry.lastX : pixelX;
    const lastY = Number.isFinite(remoteEntry.lastY) ? remoteEntry.lastY : pixelY;
    const dx = pixelX - lastX;
    const dy = pixelY - lastY;
    const inferredMoving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    const snapshotMoving = typeof snapshotEntry?.moving === 'boolean' ? snapshotEntry.moving : null;
    const moving = snapshotMoving ?? inferredMoving;

    let facing = remoteEntry.facing || 'down';
    const snapshotFacing = String(snapshotEntry?.facing || '').trim().toLowerCase();
    if (snapshotFacing === 'up' || snapshotFacing === 'down' || snapshotFacing === 'left' || snapshotFacing === 'right') {
      facing = snapshotFacing;
    } else if (moving) {
      if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? 'right' : 'left';
      } else {
        facing = dy > 0 ? 'down' : 'up';
      }
    }

    const facingSuffix = facing.charAt(0).toUpperCase() + facing.slice(1);
    const key = `${moving ? 'walk' : 'idle'}${facingSuffix}`;
    const frameIndices = mapping[key] || mapping.idleDown || [0];
    const indices = moving ? this._toPingPongFrames(frameIndices) : frameIndices;
    const frames = indices.map((index) => textures[index]).filter(Boolean);

    if (frames.length > 0 && remoteEntry.animationKey !== key) {
      sprite.textures = frames;
      sprite.gotoAndPlay(0);
      remoteEntry.animationKey = key;
    }

    const scale = localPlayer?.spriteScale ?? GAME_CONFIG.PLAYER_SPRITE_SCALE;
    sprite.scale.x = facing === 'left' ? -scale : scale;
    sprite.scale.y = scale;
    remoteEntry.facing = facing;
  }

  _applyRemoteDamageBlink(remoteEntry, snapshotEntry, snapshotTick = null) {
    if (!remoteEntry || typeof remoteEntry !== 'object') return;

    const sprite = remoteEntry.sprite || remoteEntry;
    if (!sprite || typeof sprite !== 'object') return;

    const blinkTicks = Number(snapshotEntry?.damageBlinkTicks || 0);
    if (blinkTicks > 0) {
      const tick = Number.isFinite(snapshotTick) ? snapshotTick : 0;
      const phase = Math.floor((tick / GAME_CONFIG.PLAYER_BLINK_INTERVAL_TICKS) % 2);
      sprite.alpha = phase === 0 ? 0.5 : 1;
      return;
    }

    sprite.alpha = 0.95;
  }

  _updateRemotePlayerSprites(remoteEntry, playerId) {
    if (!remoteEntry || !playerId) return;

    const sprite = remoteEntry?.sprite;
    if (!sprite) return;

    const playerNumber = this._resolvePlayerNumber(playerId);
    const localPlayer = this.components.player;
    const playerTextures = localPlayer?.textures;
    const playerMapping = localPlayer?.mapping;

    if (!playerTextures || !playerMapping) return;

    // Check if we need to update the sprites
    if (remoteEntry.playerNumber === playerNumber) return;

    remoteEntry.playerNumber = playerNumber;

    // Update the sprite textures if we have sprites for this player
    if (playerTextures[playerNumber] && playerMapping[playerNumber]) {
      const textures = playerTextures[playerNumber];
      const mapping = playerMapping[playerNumber];

      if (sprite instanceof PIXI.AnimatedSprite) {
        const idleDownIndices = mapping.idleDown || [0];
        const idleFrames = idleDownIndices
          .map((index) => textures[index])
          .filter(Boolean);
        sprite.textures = idleFrames.length > 0 ? idleFrames : [textures[0]];
        remoteEntry.animationKey = 'idleDown';
      }
    }
  }

  _resolvePlayerNumber(playerId) {
    if (!playerId) return 1;
    const normalized = this._normalizePlayerId(playerId);

    if (normalized.startsWith('player-')) {
      const parsed = Number(normalized.split('-').pop());
      return Number.isFinite(parsed) ? parsed : 1;
    }
    if (normalized === 'p1' || normalized === 'player1' || normalized === '1') return 1;
    if (normalized === 'p2' || normalized === 'player2' || normalized === '2') return 2;
    if (normalized === 'p3' || normalized === 'player3' || normalized === '3') return 3;
    if (normalized === 'p4' || normalized === 'player4' || normalized === '4') return 4;
    return 1;
  }

  _toPingPongFrames(frames) {
    if (!Array.isArray(frames) || frames.length <= 1) return Array.isArray(frames) ? frames : [0];

    const middle = Math.floor(frames.length / 2);
    const leftPart = frames.slice(0, middle + 1).reverse();
    const rightPart = frames.slice(1);
    const backPart = frames.slice(middle + 1, -1).reverse();
    return leftPart.concat(rightPart).concat(backPart);
  }
}
