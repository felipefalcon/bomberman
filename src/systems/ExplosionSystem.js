import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * ExplosionSystem - Manages explosions, damage, and visual effects
 */
export class ExplosionSystem {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.explosions = [];
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.explosionDuration = GAME_CONFIG.EXPLOSION_DURATION;
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
   * Set the map directly for wall/destructible checks
   * @param {Object} map - TileMap instance
   */
  setMap(map) {
    this.map = map;
  }

  /**
   * Create an explosion at the specified tile
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {boolean} isCenter - Whether this is the center explosion
   */
  createExplosion(tx, ty, isCenter = false) {
    const explosion = {
      tx,
      ty,
      timer: this.explosionDuration,
      hasDamagedMonsters: false,
      hasDamagedPlayer: false,
      soundPlayedForPlayer: false,
      sprite: this.createExplosionSprite(tx, ty, isCenter),
    };
    
    this.explosions.push(explosion);
    this.gameContainer.addChild(explosion.sprite);
    
    this.eventBus.emit(GameEvents.EXPLOSION_CREATE, { tx, ty, isCenter });
  }

  /**
   * Create explosion sprite
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {boolean} isCenter - Whether this is the center explosion
   * @returns {PIXI.Container}
   */
  createExplosionSprite(tx, ty, isCenter = false) {
    const container = new PIXI.Container();
    const tileSize = this.tileSize;
    
    // Position container at the tile
    container.x = tx * tileSize;
    container.y = ty * tileSize;
    
    // Create single fire layer at this tile only, centered
    const gfx = new PIXI.Graphics();
    gfx.x = tileSize / 2;
    gfx.y = tileSize / 2;
    container.addChild(gfx);

    // Animation state
    container.userData = {
      animFrame: 0,
      sprites: [gfx],
      isCenter: isCenter
    };

    return container;
  }

  /**
   * Update explosions - called every frame
   * @param {number} delta - Time delta
   * @param {Object} player - Player entity
   * @param {Array} monsters - Array of monster entities
   * @param {Array} powerups - Array of powerup entities
   */
  update(delta, player, monsters, powerups) {
    const expire = [];
    
    for (const explosion of this.explosions) {
      explosion.timer -= delta;
      
      // Update explosion animation
      const userData = explosion.sprite.userData;
      userData.animFrame += GAME_CONFIG.ANIMATION_SPEED;
      
      // Draw animated fire
      for (const gfx of userData.sprites) {
        gfx.clear();
        
        // Vary size and color based on animation frame
        const frame = Math.floor(userData.animFrame) % 3;
        const baseSize = this.tileSize * 0.8;
        let size = baseSize + Math.sin(userData.animFrame * 0.3) * (baseSize * 0.15);
        
        // Color progression: yellow -> orange -> red
        let color;
        if (frame === 0) color = 0xFFFF00; // Yellow
        else if (frame === 1) color = 0xFF8800; // Orange
        else color = 0xFF3300; // Red
        
        // All explosions: pixelated squares
        gfx.rect(-size / 2, -size / 2, size, size);
        gfx.fill({ color: color, alpha: 0.9 });
        
        // Add glow effect
        const glowSize = size * 1.3;
        gfx.rect(-glowSize / 2, -glowSize / 2, glowSize, glowSize);
        gfx.fill({ color: color, alpha: 0.3 });
      }
      
      // Check for player damage
      if (player && this.isPlayerOnTile(explosion.tx, explosion.ty, player)) {
        // Play damage warning sound
        if (!explosion.soundPlayedForPlayer && explosion.timer <= GAME_CONFIG.EXPLOSION_DAMAGE_WARNING_TICKS) {
          explosion.soundPlayedForPlayer = true;
          this.eventBus.emit(GameEvents.AUDIO_PLAY, { type: 'damage' });
        }
        
        // Apply damage
        if (!explosion.hasDamagedPlayer) {
          explosion.hasDamagedPlayer = true;
          this.eventBus.emit(GameEvents.EXPLOSION_DAMAGE, { 
            target: 'player', 
            tx: explosion.tx, 
            ty: explosion.ty 
          });
        }
      }
      
      // Check for monster damage
      if (!explosion.hasDamagedMonsters) {
        const hitMonsters = monsters.filter((monster) => monster.isOnTile(explosion.tx, explosion.ty));
        if (hitMonsters.length > 0) {
          explosion.hasDamagedMonsters = true;
          for (const monster of hitMonsters) {
            this.eventBus.emit(GameEvents.EXPLOSION_DAMAGE, { 
              target: 'monster', 
              monster,
              tx: explosion.tx, 
              ty: explosion.ty 
            });
          }
        }
      }
      
      // Check for powerup collision (destroy powerups in explosion)
      const hitPowerups = powerups.filter((powerup) => !powerup.immuneTicks && powerup.isOnTile(explosion.tx, explosion.ty));
      for (const powerup of hitPowerups) {
        this.gameContainer.removeChild(powerup.sprite);
        this.eventBus.emit(GameEvents.EXPLOSION_DAMAGE, { 
          target: 'powerup', 
          powerup,
          tx: explosion.tx, 
          ty: explosion.ty 
        });
      }
      
      if (explosion.timer <= 0) {
        expire.push(explosion);
      }
    }
    
    // Remove expired explosions
    for (const explosion of expire) {
      this.gameContainer.removeChild(explosion.sprite);
      this.explosions = this.explosions.filter((e) => e !== explosion);
      this.eventBus.emit(GameEvents.EXPLOSION_END, { tx: explosion.tx, ty: explosion.ty });
    }
  }

  /**
   * Check if player is on a specific tile
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {Object} player - Player entity
   * @returns {boolean}
   */
  isPlayerOnTile(tx, ty, player) {
    if (!player || !player.sprite) return false;
    const playerTx = Math.floor(player.sprite.x / this.tileSize);
    const playerTy = Math.floor(player.sprite.y / this.tileSize);
    return playerTx === tx && playerTy === ty;
  }

  /**
   * Process explosion propagation from a bomb
   * @param {Object} bomb - Bomb object
   * @param {Object} player - Player entity (for explosion range)
   * @param {Function} destroyTileCallback - Callback to destroy tiles
   */
  processExplosionPropagation(bomb, player, destroyTileCallback) {
    const center = { tx: bomb.tx, ty: bomb.ty, isCenter: true };
    this.createExplosion(center.tx, center.ty, true);
    
    if (destroyTileCallback) {
      destroyTileCallback(center.tx, center.ty);
    }

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    
    const range = player?.explosionRange || 1;
    const canPierce = player?.canPierceBlocks || false;
    
    for (const dir of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = bomb.tx + dir.dx * i;
        const ty = bomb.ty + dir.dy * i;

        if (this.isWall(tx, ty)) break; // Wall always stops explosion

        const isBlock = this.isDestructible(tx, ty);

        this.createExplosion(tx, ty, false);
        
        if (destroyTileCallback) {
          destroyTileCallback(tx, ty);
        }

        // Without pierce: stop at first block
        if (isBlock && !canPierce) break;
      }
    }
  }

  /**
   * Check if tile is a wall
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isWall(tx, ty) {
    if (this.map) return this.map.isWall(tx, ty);
    if (!this.scene || !this.scene.map) return true;
    return this.scene.map.isWall(tx, ty);
  }

  /**
   * Check if tile is destructible
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isDestructible(tx, ty) {
    if (this.map) return this.map.isDestructible(tx, ty);
    if (!this.scene || !this.scene.map) return false;
    return this.scene.map.isDestructible(tx, ty);
  }

  /**
   * Get all explosions
   * @returns {Array}
   */
  getExplosions() {
    return this.explosions;
  }

  /**
   * Clear all explosions
   */
  clear() {
    for (const explosion of this.explosions) {
      if (explosion.sprite && explosion.sprite.parent) {
        explosion.sprite.parent.removeChild(explosion.sprite);
      }
    }
    this.explosions = [];
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
