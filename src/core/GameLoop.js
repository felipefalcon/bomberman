import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import {
  BombActionHandler,
  BombLifecycleHandler,
  DestroyingBlockAnimator,
} from '../application/index.js';
import { RuntimeMetricsCollector } from '../infrastructure/index.js';

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

    const delta = Math.min(4, (timestamp - this.lastFrameTime) / 16.6667);
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
              this._renderRemotePlayers(snapshot.players);
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

        if (window.__ONLINE_ENABLED__) {
          this._applyLocalReconciliation(tickDelta);
        }

        if (window.__ONLINE_ENABLED__ && snapshot) {
          const hasNewSnapshot = this._hasNewOnlineSnapshot(snapshot);
          if (hasNewSnapshot) {
            this._syncOnlineWorld(snapshot, tickDelta);
            if (snapshot?.players) {
              this._renderRemotePlayers(snapshot.players);
            }
          }
        } else if (onlineBridge?.enabled && onlineBridge?.connected && onlineBridge?.hasRemoteSnapshot && snapshot?.players) {
          this._renderRemotePlayers(snapshot.players);
        }

        onlineBridge?.sendInput?.({
          type: 'move',
          x: movementCommand.x,
          y: movementCommand.y,
          bomb: bombCommand,
        });

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
    if (raw === 'p1' || raw === 'player1' || raw === '1') return 'player-1';
    if (raw === 'p2' || raw === 'player2' || raw === '2') return 'player-2';
    if (raw.startsWith('player-')) return raw;
    return raw;
  }

  _renderRemotePlayers(players = []) {
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
        try {
          const sprite = remoteEntry?.sprite || remoteEntry;
          sprite?.parent?.removeChild(sprite);
        } catch (error) {
          console.warn('[gameLoop] failed to remove remote sprite', error);
        }
        remotePlayers.delete(playerId);
      }
    }

    for (const entry of otherPlayers) {
      const entryId = this._normalizePlayerId(entry?.playerId);
      let remoteEntry = remotePlayers.get(entryId);
      if (!remoteEntry) {
        remoteEntry = this._createRemotePlayerEntry();
        const sprite = remoteEntry?.sprite || remoteEntry;
        this.components.gameContainer.addChild(sprite);
        this.components.gameContainer.sortChildren();
        remotePlayers.set(entryId, remoteEntry);
      }

      const remoteSprite = remoteEntry?.sprite || remoteEntry;

      const tileSize = this.components.tileSize || GAME_CONFIG.TILE_SIZE;
      const pixelX = Number.isFinite(entry?.x) ? entry.x : Number.isFinite(entry?.tx) ? entry.tx * tileSize + tileSize / 2 : tileSize * 1.5;
      const pixelY = Number.isFinite(entry?.y) ? entry.y : Number.isFinite(entry?.ty) ? entry.ty * tileSize + tileSize / 2 : tileSize * 1.5;
      const renderX = Math.round(pixelX);
      const renderY = Math.round(pixelY);
      this._updateRemotePlayerAnimation(remoteEntry, entry, pixelX, pixelY);
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
      ? players.find((entry) => this._normalizePlayerId(entry?.playerId) === localId)
      : null;
    if (!localEntry) return;

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

    if (hasNewServerTick && Number.isFinite(pixelX) && Number.isFinite(pixelY) && this.components.player?.sprite) {
      const localX = this.components.player.sprite.x;
      const localY = this.components.player.sprite.y;
      const errX = pixelX - localX;
      const errY = pixelY - localY;
      const errorDistance = Math.hypot(errX, errY);

      this.localAuthorityTarget = {
        x: Math.round(pixelX),
        y: Math.round(pixelY),
      };

      if (errorDistance >= 10) {
        this.components.player.sprite.position.set(pixelX, pixelY);
      }

      if (Number.isFinite(snapshotTick)) {
        this.lastAppliedLocalSnapshotTick = snapshotTick;
      }
    }

    const state = this.components.player.gameState.playerState;
    state.maxBombs = Number.isFinite(localEntry.maxBombs) ? localEntry.maxBombs : state.maxBombs;
    state.activeBombs = Number.isFinite(localEntry.activeBombs) ? localEntry.activeBombs : state.activeBombs;
    state.explosionRange = Number.isFinite(localEntry.explosionRange) ? localEntry.explosionRange : state.explosionRange;
    state.speedPowerups = Number.isFinite(localEntry.speedPowerups) ? localEntry.speedPowerups : state.speedPowerups;
    state.canPierceBlocks = !!localEntry.canPierceBlocks;
    state.hasKickBomb = !!localEntry.hasKickBomb;
    state.hasThrowBomb = !!localEntry.hasThrowBomb;
    state.hasCrossBlock = !!localEntry.hasCrossBlock;
    state.hasCrossBomb = !!localEntry.hasCrossBomb;
    state.hasFollowerBomb = !!localEntry.hasFollowerBomb;
    state.hasLandMine = !!localEntry.hasLandMine;
    state.lives = Number.isFinite(localEntry.lives) ? localEntry.lives : state.lives;

    const speedMultiplier = Math.pow(1.2, Math.max(0, state.speedPowerups || 0));
    this.components.player.speed = this.components.player.baseSpeed * speedMultiplier;
    this.components.managers.hud?.setLives?.(state.lives);
    this.components.managers.hud?.updatePowerups?.(this.components.player);
  }

  _applyLocalReconciliation(tickDelta = 1) {
    if (!this.localAuthorityTarget || !this.components.player?.sprite) return;

    const localSprite = this.components.player.sprite;
    const errX = this.localAuthorityTarget.x - localSprite.x;
    const errY = this.localAuthorityTarget.y - localSprite.y;
    const errorDistance = Math.hypot(errX, errY);
    const movement = this.components.managers.input?.getMovementCommand?.() || { x: 0, y: 0 };
    const isInputMoving = Math.abs(movement.x) > 0.001 || Math.abs(movement.y) > 0.001;

    if (!isInputMoving) {
      localSprite.x = this.localAuthorityTarget.x;
      localSprite.y = this.localAuthorityTarget.y;
      return;
    }

    if (errorDistance < 0.15) {
      localSprite.x = this.localAuthorityTarget.x;
      localSprite.y = this.localAuthorityTarget.y;
      return;
    }

    const correction = Math.min(0.7, Math.max(0.35, 0.45 * (Number(tickDelta) || 1)));
    localSprite.x += errX * correction;
    localSprite.y += errY * correction;
  }

  _createRemotePlayerEntry() {
    const localPlayer = this.components.player;
    const textures = localPlayer?.textures;
    const mapping = localPlayer?.mapping;

    if (Array.isArray(textures) && textures.length > 0 && mapping) {
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
    };
  }

  _updateRemotePlayerAnimation(remoteEntry, snapshotEntry, pixelX, pixelY) {
    if (!remoteEntry || typeof remoteEntry !== 'object') return;

    const sprite = remoteEntry.sprite;
    if (!(sprite instanceof PIXI.AnimatedSprite)) return;

    const localPlayer = this.components.player;
    const textures = localPlayer?.textures;
    const mapping = localPlayer?.mapping;
    if (!Array.isArray(textures) || textures.length === 0 || !mapping) return;

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

  _toPingPongFrames(frames) {
    if (!Array.isArray(frames) || frames.length <= 1) return Array.isArray(frames) ? frames : [0];

    const middle = Math.floor(frames.length / 2);
    const leftPart = frames.slice(0, middle + 1).reverse();
    const rightPart = frames.slice(1);
    const backPart = frames.slice(middle + 1, -1).reverse();
    return leftPart.concat(rightPart).concat(backPart);
  }
}
