import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * BombSystem - Manages bomb placement, timing, and explosion triggers
 */
export class BombSystem {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.bombs = [];
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.bombFuseTicks = GAME_CONFIG.BOMB_FUSE_TICKS;
    this.bombFrames = null;
    this.bombMapping = null;
    this.scene = null;
    this.gameContainer = null;
  }

  /**
   * Set the scene for this system
   * @param {Object} scene - Game scene
   */
  setScene(scene) {
    this.scene = scene;
    this.gameContainer = scene.getContainer();
  }

  /**
   * Set bomb assets
   * @param {Object} frames - Bomb texture frames
   * @param {Object} mapping - Bomb animation mapping
   */
  setAssets(frames, mapping) {
    this.bombFrames = frames;
    this.bombMapping = mapping;
  }

  /**
   * Place a bomb at the specified tile position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {Object} player - Player entity (for bomb count tracking)
   * @param {Array} enemies - Array of enemy entities (for follower bomb targeting)
   * @returns {boolean} True if bomb was placed
   */
  placeBomb(tx, ty, player, enemies = []) {
    // Check if player has reached max bomb limit
    if (player.activeBombs >= player.maxBombs) return false;

    // Check if tile is blocked
    if (this.isTileBlocked(tx, ty)) return false;

    // Check if bomb already exists at this position
    if (this.bombs.some((b) => b.tx === tx && b.ty === ty)) return false;

    // Determine if this will be a follower bomb before creating sprite
    // Bomb is follower if player has the powerup, regardless of enemies
    const willBeFollower = player.hasFollowerBomb;

    const bomb = {
      tx,
      ty,
      timer: this.bombFuseTicks,
      sprite: this.createBombSprite(tx, ty, willBeFollower),
      soundPlayed: false,
      // Kick bomb properties
      isSliding: false,
      slideDx: 0,
      slideDy: 0,
      slideSpeed: GAME_CONFIG.BOMB_SLIDE_SPEED || 4,
      slideProgress: 0,
      nextTx: tx,
      nextTy: ty,

      canMove: false,
      // Throw bomb properties
      isThrowing: false,
      throwDx: 0,
      throwDy: 0,
      throwProgress: 0,

      throwStartTx: tx,
      throwStartTy: ty,

      throwTargetTx: tx,
      throwTargetTy: ty,

      throwDistance: 2,
      throwSpeed: 4,

      // Follower bomb properties
      isFollower: false,
      targetEnemy: null,
      followSpeed: GAME_CONFIG.BOMB_FOLLOW_SPEED || 2,
    };

    // Set as follower bomb if player has the powerup
    if (willBeFollower) {
      bomb.isFollower = true;
      bomb.targetEnemy = this.findNearestEnemy(tx, ty, enemies);
    }

    this.bombs.push(bomb);
    player.activeBombs += 1;
    this.gameContainer.addChild(bomb.sprite);

    this.eventBus.emit(GameEvents.BOMB_PLACED, { tx, ty, bomb });

    return true;
  }

  /**
   * Check if a tile is blocked (for bomb placement)
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isTileBlocked(tx, ty) {
    if (!this.scene || !this.scene.map) return true;
    return this.scene.map.isBlocked(tx, ty);
  }

  /**
   * Find the nearest enemy to a bomb position within max distance
   * @param {number} tx - Bomb tile X position
   * @param {number} ty - Bomb tile Y position
   * @param {Array} enemies - Array of enemy entities
   * @param {number} maxDistance - Maximum distance to consider (default: 3)
   * @returns {Object|null} Nearest enemy or null
   */
  findNearestEnemy(tx, ty, enemies, maxDistance = 3) {
    if (!enemies || enemies.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const enemy of enemies) {
      const enemyTx = Math.floor(enemy.sprite.x / this.tileSize);
      const enemyTy = Math.floor(enemy.sprite.y / this.tileSize);
      const distance = Math.abs(enemyTx - tx) + Math.abs(enemyTy - ty);

      // Only consider enemies within max distance
      if (distance <= maxDistance && distance < minDistance) {
        minDistance = distance;
        nearest = enemy;
      }
    }

    return nearest;
  }

  /**
   * Create bomb sprite
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {boolean} isFollower - Whether this is a follower bomb
   * @returns {PIXI.DisplayObject}
   */
  createBombSprite(tx, ty, isFollower = false) {
    let sprite;

    if (this.bombFrames && this.bombFrames.length > 0) {
      // Use animated sprite with appropriate animation
      // If it's a follower bomb, always use follower_bomb frames if available
      // This ensures the sprite stays as follower even after enemies die
      const frameIndices = isFollower && this.bombMapping?.follower_bomb 
        ? this.bombMapping.follower_bomb 
        : this.bombMapping?.bomb;
      
      if (frameIndices) {
        const textures = frameIndices.map(i => this.bombFrames[i]).filter(Boolean);

        if (textures.length > 0) {
          sprite = new PIXI.AnimatedSprite(textures);
          sprite.animationSpeed = GAME_CONFIG.ANIMATION_SPEED;
          sprite.play();
          // Scale from 16x16 to 32x32 (2x scale)
          sprite.scale.set(2);
          sprite.anchor.set(0.5, 0.5);
        } else {
          sprite = this.createBombGraphics();
        }
      } else {
        sprite = this.createBombGraphics();
      }
    } else {
      // Fallback to Graphics
      sprite = this.createBombGraphics();
    }

    // Position at center of tile
    const half = this.tileSize / 2;
    sprite.x = tx * this.tileSize + half;
    sprite.y = ty * this.tileSize + half;
    sprite.roundPixels = true;
    return sprite;
  }

  /**
   * Create fallback bomb graphics
   * @returns {PIXI.Graphics}
   */
  createBombGraphics() {
    const bomb = new PIXI.Graphics();
    const radius = this.tileSize / 2 - 3;
    bomb.circle(0, 0, radius);
    bomb.fill(0x000000);
    return bomb;
  }

  /**
   * Update bombs - called every frame
   * @param {number} delta - Time delta
   * @param {Function} explodeCallback - Callback when bomb explodes
   * @param {Array} enemies - Array of enemy entities (for follower bomb targeting)
   */
  update(delta, explodeCallback, enemies = []) {

    this.updateSliding(delta);

    this.updateThrowing(delta);

    this.updateFollowerBombs(delta, enemies);

    this.updateTimers(delta);

    this.explodeExpiredBombs(explodeCallback);

  }

  updateSliding(delta) {

    this.calculateTargets();

    this.resolveConflicts();

    this.moveBombs(delta);

    this.finalizeTiles();

  }

  calculateTargets() {

    for (const bomb of this.bombs) {

      if (!bomb.isSliding)
        continue;

      bomb.nextTx = bomb.tx + bomb.slideDx;
      bomb.nextTy = bomb.ty + bomb.slideDy;

      bomb.canMove = true;

    }

  }

  resolveConflicts() {

    const reserved = new Map();

    for (const bomb of this.bombs) {

      if (!bomb.isSliding)
        continue;

      if (!bomb.canMove)
        continue;

      if (this.isTileBlocked(bomb.nextTx, bomb.nextTy)) {

        bomb.canMove = false;

        continue;

      }

      const stoppedBomb = this.bombs.find(b =>
        b !== bomb &&
        !b.isSliding &&
        b.tx === bomb.nextTx &&
        b.ty === bomb.nextTy
      );

      if (stoppedBomb) {

        bomb.canMove = false;

        continue;

      }

      const key = `${bomb.nextTx},${bomb.nextTy}`;

      if (reserved.has(key)) {

        bomb.canMove = false;

        continue;

      }

      reserved.set(key, bomb);

    }

  }

  moveBombs(delta) {

    for (const bomb of this.bombs) {

      if (!bomb.isSliding)
        continue;

      if (!bomb.canMove)
        continue;

      const amount = bomb.slideSpeed * delta;

      bomb.sprite.x += bomb.slideDx * amount;
      bomb.sprite.y += bomb.slideDy * amount;

      bomb.slideProgress += amount / this.tileSize;

    }

  }

  finalizeTiles() {

    for (const bomb of this.bombs) {

      if (!bomb.isSliding)
        continue;

      if (!bomb.canMove) {

        this.stopSlidingBomb(bomb);

        continue;

      }

      if (bomb.slideProgress < 1)
        continue;

      bomb.slideProgress = 0;

      bomb.tx = bomb.nextTx;
      bomb.ty = bomb.nextTy;

      const half = this.tileSize / 2;
      bomb.sprite.x = bomb.tx * this.tileSize + half;
      bomb.sprite.y = bomb.ty * this.tileSize + half;

    }

  }

  updateThrowing(delta) {

    for (const bomb of this.bombs) {

      if (!bomb.isThrowing)
        continue;

      // Use absolute position instead of relative progress
      if (!bomb.throwAbsolutePosition) {
        bomb.throwAbsolutePosition = 0;
      }

      // Advance absolute position at constant speed
      bomb.throwAbsolutePosition += (delta * bomb.throwSpeed) / this.tileSize;

      const totalTiles = bomb.throwTiles;

      // Check if we've reached the end of the current path
      if (bomb.throwAbsolutePosition >= totalTiles) {
        this.stopThrowingBomb(bomb);
        continue;
      }

      //-------------------------------------------------
      // Descobre qual tile está atravessando
      //-------------------------------------------------

      const currentSegment = Math.floor(bomb.throwAbsolutePosition);

      const segmentProgress = bomb.throwAbsolutePosition - currentSegment;

      //-------------------------------------------------
      // Dynamic path extension - check if we need to add more tiles
      //-------------------------------------------------

      // When approaching the end of current path, check if target is blocked
      if (currentSegment >= bomb.throwPath.length - 1 && segmentProgress > 0.8) {
        const lastTile = bomb.throwPath[bomb.throwPath.length - 1];

        // Check if current target is blocked (by walls/blocks OR other bombs)
        const hasBombAtTarget = this.bombs.some(b => b !== bomb && b.tx === lastTile.tx && b.ty === lastTile.ty);
        if (this.isTileBlocked(lastTile.tx, lastTile.ty) || hasBombAtTarget) {
          const mapCols = this.scene.map.cols;
          const mapRows = this.scene.map.rows;

          // Calculate next tile in same direction
          let nextTx = lastTile.tx + bomb.throwDx;
          let nextTy = lastTile.ty + bomb.throwDy;

          // Allow going up to 2 tiles out of bounds before wrapping
          if (nextTx < -2)
            nextTx = mapCols - 1;
          else if (nextTx >= mapCols + 2)
            nextTx = 0;

          if (nextTy < -2)
            nextTy = mapRows - 1;
          else if (nextTy >= mapRows + 2)
            nextTy = 0;

          // Safety limit to prevent infinite loops
          if (bomb.throwPath.length < mapCols + mapRows) {
            // Add next tile to path
            bomb.throwPath.push({ tx: nextTx, ty: nextTy });
            bomb.throwTiles = bomb.throwPath.length;
            bomb.throwTargetTx = nextTx;
            bomb.throwTargetTy = nextTy;
          }
        }
      }

      //-------------------------------------------------
      // Tile inicial
      //-------------------------------------------------

      let startTx;
      let startTy;

      if (currentSegment === 0) {

        startTx = bomb.throwStartTx;
        startTy = bomb.throwStartTy;

      } else {

        startTx = bomb.throwPath[currentSegment - 1].tx;
        startTy = bomb.throwPath[currentSegment - 1].ty;

      }

      //-------------------------------------------------
      // Tile final
      //-------------------------------------------------

      const endTile = bomb.throwPath[currentSegment];

      const mapCols = this.scene.map.cols;
      const mapRows = this.scene.map.rows;

      // Check if we're wrapping (going from out of bounds to in bounds)
      const isWrappingX = (startTx < 0 || startTx >= mapCols) && (endTile.tx >= 0 && endTile.tx < mapCols);
      const isWrappingY = (startTy < 0 || startTy >= mapRows) && (endTile.ty >= 0 && endTile.ty < mapRows);

      // Hide bomb during wrapping transition
      if (isWrappingX || isWrappingY) {
        bomb.sprite.visible = false;
      } else {
        bomb.sprite.visible = true;
      }

      const startX = startTx * this.tileSize;
      const startY = startTy * this.tileSize;

      const endX = endTile.tx * this.tileSize;
      const endY = endTile.ty * this.tileSize;

      //-------------------------------------------------
      // Parábola
      //-------------------------------------------------

      const arcHeight = this.tileSize * 0.55;

      const arcOffset =
        Math.sin(segmentProgress * Math.PI) *
        arcHeight;

      //-------------------------------------------------
      // Interpolação
      //-------------------------------------------------

      bomb.sprite.x =
        startX +
        (endX - startX) *
        segmentProgress;

      bomb.sprite.y =
        startY +
        (endY - startY) *
        segmentProgress -
        arcOffset;

      //-------------------------------------------------
      // Escala

      const scale =
        1 +
        Math.sin(segmentProgress * Math.PI) *
        0.20;

      bomb.sprite.scale.set(2 * scale);

    }

  }

  updateFollowerBombs(delta, enemies) {
    for (const bomb of this.bombs) {
      if (!bomb.isFollower) continue;

      // Initialize bobbing animation timer if not exists
      if (!bomb.bobTimer) bomb.bobTimer = 0;
      bomb.bobTimer += delta;

      // Apply bobbing animation using scale instead of position
      const bobScale = 1 + Math.sin(bomb.bobTimer * 0.3) * 0.1;
      bomb.sprite.scale.set(2 * bobScale);

      // If target enemy is dead or doesn't exist, find a new target
      // Once a target is locked, it will NOT change even if it moves out of range
      if (!bomb.targetEnemy || !enemies.includes(bomb.targetEnemy)) {
        bomb.targetEnemy = this.findNearestEnemy(bomb.tx, bomb.ty, enemies, 3);
        if (!bomb.targetEnemy) continue; // No target available, but still show as follower bomb
      }

      // Get target enemy position
      const targetTx = Math.floor(bomb.targetEnemy.sprite.x / this.tileSize);
      const targetTy = Math.floor(bomb.targetEnemy.sprite.y / this.tileSize);

      // Calculate direction to target
      const dx = targetTx - bomb.tx;
      const dy = targetTy - bomb.ty;

      // If bomb is adjacent to target enemy (1 tile away), stop following
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) {
        continue;
      }

      // Try both axes to find a valid path
      const directions = [];
      
      if (Math.abs(dx) > Math.abs(dy)) {
        directions.push({ dx: dx > 0 ? 1 : -1, dy: 0 });
        if (dy !== 0) directions.push({ dx: 0, dy: dy > 0 ? 1 : -1 });
      } else {
        directions.push({ dx: 0, dy: dy > 0 ? 1 : -1 });
        if (dx !== 0) directions.push({ dx: dx > 0 ? 1 : -1, dy: 0 });
      }

      // Try each direction until we find a valid move
      for (const dir of directions) {
        const nextTx = bomb.tx + dir.dx;
        const nextTy = bomb.ty + dir.dy;

        // Check if next tile is within map bounds and free
        if (this._isValidTileCoord(nextTx, nextTy) &&
            !this.isTileBlocked(nextTx, nextTy) && 
            !this.bombs.some(b => b !== bomb && b.tx === nextTx && b.ty === nextTy)) {
          
          // Move bomb towards target using tile-based movement
          const half = this.tileSize / 2;
          const targetX = nextTx * this.tileSize + half;
          const targetY = nextTy * this.tileSize + half;
          const speed = bomb.followSpeed * delta;

          const currentX = bomb.sprite.x;
          const currentY = bomb.sprite.y;
          const distX = targetX - currentX;
          const distY = targetY - currentY;
          const distance = Math.sqrt(distX * distX + distY * distY);

          if (distance <= speed) {
            // Reached the tile - snap to grid and update tile coordinates
            bomb.sprite.x = targetX;
            bomb.sprite.y = targetY;
            bomb.tx = nextTx;
            bomb.ty = nextTy;
          } else {
            // Move towards the tile
            bomb.sprite.x += (distX / distance) * speed;
            bomb.sprite.y += (distY / distance) * speed;
          }
          
          // Successfully moved, break out of direction loop
          break;
        }
      }
    }
  }

  _isValidTileCoord(tx, ty) {
    if (!this.scene || !this.scene.map) return false;
    return tx >= 0 && ty >= 0 && tx < this.scene.map.cols && ty < this.scene.map.rows;
  }

  stopThrowingBomb(bomb) {

    // Check if final landing tile has another bomb
    if (
      this.bombs.some(
        b =>
          b !== bomb &&
          b.tx === bomb.throwTargetTx &&
          b.ty === bomb.throwTargetTy
      )
    ) {
      // Find previous empty tile in path
      for (let i = bomb.throwPath.length - 2; i >= 0; i--) {
        const tile = bomb.throwPath[i];
        if (!this.isTileBlocked(tile.tx, tile.ty) &&
          !this.bombs.some(b => b !== bomb && b.tx === tile.tx && b.ty === tile.ty)) {
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

    const half = this.tileSize / 2;
    bomb.sprite.x = bomb.tx * this.tileSize + half;
    bomb.sprite.y = bomb.ty * this.tileSize + half;

    bomb.sprite.scale.set(2);

  }

  updateTimers(delta) {

    for (const bomb of this.bombs) {

      bomb.timer -= delta;

      if (
        bomb.timer <= GAME_CONFIG.EXPLOSION_SOUND_TICKS &&
        !bomb.soundPlayed
      ) {

        bomb.soundPlayed = true;

        this.eventBus.emit(
          GameEvents.AUDIO_PLAY,
          { type: "explosion" }
        );

      }

    }

  }

  explodeExpiredBombs(callback) {

    const expired = this.bombs.filter(b => b.timer <= 0);

    for (const bomb of expired) {

      this.explodeBomb(bomb, callback);

    }

  }

  stopSlidingBomb(bomb) {
    bomb.isSliding = false;
    bomb.slideDx = 0;
    bomb.slideDy = 0;
    bomb.slideProgress = 0;
    bomb.nextTx = bomb.tx;
    bomb.nextTy = bomb.ty;
    bomb.canMove = false;

    const half = this.tileSize / 2;
    bomb.sprite.x = bomb.tx * this.tileSize + half;
    bomb.sprite.y = bomb.ty * this.tileSize + half;
  }

  /**
   * Explode a bomb
   * @param {Object} bomb - Bomb object
   * @param {Function} explodeCallback - Callback for explosion logic
   */
  explodeBomb(bomb, explodeCallback) {
    console.log('BombSystem: Exploding bomb at', bomb.tx, bomb.ty);
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.gameContainer.removeChild(bomb.sprite);

    this.eventBus.emit(GameEvents.BOMB_EXPLODE, { tx: bomb.tx, ty: bomb.ty });

    if (explodeCallback) {
      console.log('BombSystem: Calling explodeCallback');
      explodeCallback(bomb);
    }
  }

  /**
   * Get all bombs
   * @returns {Array}
   */
  getBombs() {
    return this.bombs;
  }

  /**
   * Get bomb at specific position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {Object|null}
   */
  getBombAt(tx, ty) {
    return this.bombs.find((b) => b.tx === tx && b.ty === ty) || null;
  }

  /**
   * Kick a bomb in a specific direction
   * @param {Object} bomb - Bomb object
   * @param {number} dx - Direction X (-1, 0, or 1)
   * @param {number} dy - Direction Y (-1, 0, or 1)
   * @returns {boolean} True if bomb was kicked
   */
  kickBomb(bomb, dx, dy) {
    if (bomb.isSliding) return false; // Already sliding

    // Check if the direction is valid (only cardinal directions)
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    // Check if the next tile in that direction is free
    const nextTx = bomb.tx + dx;
    const nextTy = bomb.ty + dy;

    if (this.isTileBlocked(nextTx, nextTy)) return false;

    // Check if there's another bomb at the target position
    if (this.bombs.some((b) => b !== bomb && b.tx === nextTx && b.ty === nextTy)) return false;
    console.log('BombSystem: No bomb at target position');

    // Start sliding
    bomb.isSliding = true;
    bomb.slideDx = dx;
    bomb.slideDy = dy;
    bomb.slideProgress = 0;
    bomb.nextTx = bomb.tx;
    bomb.nextTy = bomb.ty;
    bomb.canMove = true;

    this.eventBus.emit(GameEvents.BOMB_KICK, { tx: bomb.tx, ty: bomb.ty, dx, dy });

    return true;
  }

  /**
 * Throw a bomb in a specific direction
 * @param {Object} bomb - Bomb object
 * @param {number} dx - Direction X (-1, 0, or 1)
 * @param {number} dy - Direction Y (-1, 0, or 1)
 * @returns {boolean} True if bomb was thrown
 */
  throwBomb(bomb, dx, dy) {

    if (bomb.isThrowing || bomb.isSliding)
      return false;

    // Check if the direction is valid (only cardinal directions)
    if (Math.abs(dx) + Math.abs(dy) !== 1)
      return false;

    const mapCols = this.scene.map.cols;
    const mapRows = this.scene.map.rows;

    // Save start position
    bomb.throwStartTx = bomb.tx;
    bomb.throwStartTy = bomb.ty;

    // Initialize dynamic path - start with initial direction
    bomb.throwPath = [];
    bomb.throwTiles = 0;
    bomb.throwDx = dx;
    bomb.throwDy = dy;
    bomb.throwProgress = 0;

    // Calculate first target tile (2 tiles away initially)
    let nextTx = bomb.tx + (dx * bomb.throwDistance);
    let nextTy = bomb.ty + (dy * bomb.throwDistance);

    // Allow going up to 2 tiles out of bounds before wrapping
    if (nextTx < -2)
      nextTx = mapCols - 2;
    else if (nextTx >= mapCols + 2)
      nextTx = 2;

    if (nextTy < -2)
      nextTy = mapRows - 2;
    else if (nextTy >= mapRows + 2)
      nextTy = 2;

    // Add first target to path
    bomb.throwPath.push({ tx: nextTx, ty: nextTy });
    bomb.throwTiles = 1;

    // Set initial target
    bomb.throwTargetTx = nextTx;
    bomb.throwTargetTy = nextTy;

    // Start throwing
    bomb.isThrowing = true;

    this.eventBus.emit(GameEvents.BOMB_THROW, {
      tx: bomb.tx,
      ty: bomb.ty,
      dx,
      dy,
      targetTx: nextTx,
      targetTy: nextTy
    });

    return true;
  }

  /**
   * Clear all bombs
   */
  clear() {
    for (const bomb of this.bombs) {
      if (bomb.sprite && bomb.sprite.parent) {
        bomb.sprite.parent.removeChild(bomb.sprite);
      }
    }
    this.bombs = [];
  }

  /**
   * Called when system is destroyed
   */
  destroy() {
    this.clear();
    this.scene = null;
    this.gameContainer = null;
  }
}
