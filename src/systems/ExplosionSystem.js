import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../infrastructure/events/EventBus.js';
import { BaseGameSystem } from './BaseGameSystem.js';
import { spriteToTile, tileKey } from '../utils/tileUtils.js';
import { ExplosionRenderer } from '../presentation/renderers/ExplosionRenderer.js';

/**
 * ExplosionSystem - Manages explosions, damage, and visual effects
 */
export class ExplosionSystem extends BaseGameSystem {
  constructor(eventBus = globalEventBus, map = null, gameContainer = null) {
    super(eventBus, map, gameContainer);
    this.explosions = [];
    this.explosionDuration = GAME_CONFIG.EXPLOSION_DURATION;
    this.renderer = new ExplosionRenderer();
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
      sprite: this.renderer.createSprite(tx, ty, this.tileSize, isCenter),
    };
    
    this.explosions.push(explosion);
    this.gameContainer.addChild(explosion.sprite);
    
    this.eventBus.emit(GameEvents.EXPLOSION_CREATE, { tx, ty, isCenter });
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
    const monstersByTile = new Map();
    const powerupsByTile = new Map();

    for (const monster of monsters) {
      const tx = Math.floor(monster.sprite.x / this.tileSize);
      const ty = Math.floor(monster.sprite.y / this.tileSize);
      const key = tileKey(tx, ty);
      const bucket = monstersByTile.get(key);
      if (bucket) {
        bucket.push(monster);
      } else {
        monstersByTile.set(key, [monster]);
      }
    }

    for (const powerup of powerups) {
      if (powerup.immuneTicks) continue;
      const key = tileKey(powerup.tx, powerup.ty);
      const bucket = powerupsByTile.get(key);
      if (bucket) {
        bucket.push(powerup);
      } else {
        powerupsByTile.set(key, [powerup]);
      }
    }
    
    for (const explosion of this.explosions) {
      explosion.timer -= delta;
      this.renderer.updateSprite(explosion.sprite, this.tileSize);
      
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
        const hitMonsters = monstersByTile.get(tileKey(explosion.tx, explosion.ty)) || [];
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
      const hitPowerups = powerupsByTile.get(tileKey(explosion.tx, explosion.ty)) || [];
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
    if (expire.length === 0) return;

    const expiredSet = new Set(expire);
    for (const explosion of expire) {
      this.gameContainer.removeChild(explosion.sprite);
      this.eventBus.emit(GameEvents.EXPLOSION_END, { tx: explosion.tx, ty: explosion.ty });
    }

    this.explosions = this.explosions.filter((explosion) => !expiredSet.has(explosion));
  }

  syncFromSnapshot(explosions = []) {
    if (!Array.isArray(explosions)) return;

    const existingById = new Map(
      this.explosions.map((explosion) => [explosion.serverId || `${explosion.tx}:${explosion.ty}`, explosion])
    );
    const nextIds = new Set();

    for (const entry of explosions) {
      const serverId = entry.id || `${entry.tx}:${entry.ty}:${entry.timer}`;
      nextIds.add(serverId);

      let explosion = existingById.get(serverId);
      if (!explosion) {
        explosion = {
          tx: entry.tx,
          ty: entry.ty,
          timer: Number.isFinite(entry.timer) ? entry.timer : this.explosionDuration,
          hasDamagedMonsters: true,
          hasDamagedPlayer: true,
          soundPlayedForPlayer: true,
          sprite: this.renderer.createSprite(entry.tx, entry.ty, this.tileSize, !!entry.isCenter),
        };
        this.explosions.push(explosion);
        this.gameContainer?.addChild(explosion.sprite);
      }

      explosion.serverId = serverId;
      explosion.tx = entry.tx;
      explosion.ty = entry.ty;
      explosion.timer = Number.isFinite(entry.timer) ? entry.timer : explosion.timer;
      this.renderer.updateSprite(explosion.sprite, this.tileSize);
    }

    for (const explosion of this.explosions.slice()) {
      const id = explosion.serverId || `${explosion.tx}:${explosion.ty}:${explosion.timer}`;
      if (!nextIds.has(id)) {
        this.gameContainer?.removeChild(explosion.sprite);
        this.explosions = this.explosions.filter((entry) => entry !== explosion);
      }
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
    const playerTile = spriteToTile(player.sprite, this.tileSize);
    if (!playerTile) return false;
    return playerTile.tx === tx && playerTile.ty === ty;
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
    if (!this.map) return true;
    return this.map.isWall(tx, ty);
  }

  /**
   * Check if tile is destructible
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isDestructible(tx, ty) {
    if (!this.map) return false;
    return this.map.isDestructible(tx, ty);
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
    super.destroy();
  }
}
