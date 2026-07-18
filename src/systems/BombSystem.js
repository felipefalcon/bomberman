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
   * @returns {boolean} True if bomb was placed
   */
  placeBomb(tx, ty, player) {
    // Check if player has reached max bomb limit
    if (player.activeBombs >= player.maxBombs) return false;

    // Check if tile is blocked
    if (this.isTileBlocked(tx, ty)) return false;

    // Check if bomb already exists at this position
    if (this.bombs.some((b) => b.tx === tx && b.ty === ty)) return false;

    const bomb = {
      tx,
      ty,
      timer: this.bombFuseTicks,
      sprite: this.createBombSprite(tx, ty),
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
    };

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
   * Create bomb sprite
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {PIXI.DisplayObject}
   */
  createBombSprite(tx, ty) {
    let sprite;

    if (this.bombFrames && this.bombFrames.length > 0 && this.bombMapping?.bomb) {
      // Use animated sprite with ping-pong animation
      const frameIndices = this.bombMapping.bomb;
      const textures = frameIndices.map(i => this.bombFrames[i]).filter(Boolean);

      if (textures.length > 0) {
        sprite = new PIXI.AnimatedSprite(textures);
        sprite.animationSpeed = GAME_CONFIG.ANIMATION_SPEED;
        sprite.play();
        // Scale from 16x16 to 32x32 (2x scale)
        sprite.scale.set(2);
        sprite.anchor.set(0, 0);
      } else {
        sprite = this.createBombGraphics();
      }
    } else {
      // Fallback to Graphics
      sprite = this.createBombGraphics();
    }

    sprite.x = tx * this.tileSize;
    sprite.y = ty * this.tileSize;
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
    bomb.circle(this.tileSize / 2, this.tileSize / 2, radius);
    bomb.fill(0x000000);
    return bomb;
  }

  /**
   * Update bombs - called every frame
   * @param {number} delta - Time delta
   * @param {Function} explodeCallback - Callback when bomb explodes
   */
  update(delta, explodeCallback) {

    this.updateSliding(delta);

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

      bomb.sprite.x = bomb.tx * this.tileSize;
      bomb.sprite.y = bomb.ty * this.tileSize;

    }

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

    bomb.sprite.x = bomb.tx * this.tileSize;
    bomb.sprite.y = bomb.ty * this.tileSize;
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
