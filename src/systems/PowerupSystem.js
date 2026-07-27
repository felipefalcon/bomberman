import { GAME_CONFIG, POWERUP_TYPES } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';
import { Powerup } from '../entities/Powerup.js';

/**
 * PowerupSystem - Manages powerup spawning, collection, and effects
 */
export class PowerupSystem {
  constructor(eventBus = globalEventBus, gameContainer = null) {
    this.eventBus = eventBus;
    this.gameContainer = gameContainer;
    this.powerups = [];
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.spawnChance = GAME_CONFIG.POWERUP_SPAWN_CHANCE;
    this.itemFrames = null;
    this.itemMapping = null;
  }

  /**
   * Set the game container for this system
   * @param {PIXI.Container} container - Game container
   */
  setGameContainer(container) {
    this.gameContainer = container;
  }

  /**
   * Set item assets
   * @param {Object} frames - Item texture frames
   * @param {Object} mapping - Item type mapping
   */
  setAssets(frames, mapping) {
    this.itemFrames = frames;
    this.itemMapping = mapping;
  }

  /**
   * Try to spawn a powerup at the specified tile
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   */
  trySpawnPowerup(tx, ty) {
    // Spawn chance is configured in GAME_CONFIG.POWERUP_SPAWN_CHANCE.
    if (Math.random() > this.spawnChance) return;
    if (!this.itemFrames || !this.itemMapping) return;
    
    const powerupTypes = Object.keys(this.itemMapping);
    const randomType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    const frameIndex = this.itemMapping[randomType];
    
    const powerup = new Powerup(tx, ty, this.tileSize, randomType, this.itemFrames[frameIndex]);
    // Keep newly spawned powerups immune for at least the full current explosion lifetime.
    powerup.immuneTicks = Math.max(GAME_CONFIG.POWERUP_IMMUNE_TICKS, GAME_CONFIG.EXPLOSION_DURATION + 1);
    this.powerups.push(powerup);
    this.gameContainer.addChild(powerup.sprite);
    
    this.eventBus.emit(GameEvents.POWERUP_SPAWN, { tx, ty, type: randomType });
  }

  /**
   * Update powerups - called every frame
   * @param {number} delta - Time delta
   * @param {Object} player - Player entity
   */
  update(delta, player) {
    const toRemove = [];
    
    for (const powerup of this.powerups) {
      powerup.update(delta);
      if (powerup.immuneTicks > 0) {
        powerup.immuneTicks = Math.max(0, powerup.immuneTicks - delta);
      }
      
      // Check collision with player
      if (player && this.isPlayerOnPowerup(player, powerup)) {
        this.applyPowerup(player, powerup.type);
        toRemove.push(powerup);
        this.gameContainer.removeChild(powerup.sprite);
        
        this.eventBus.emit(GameEvents.POWERUP_COLLECT, { 
          type: powerup.type, 
          tx: powerup.tx, 
          ty: powerup.ty 
        });
      }
    }
    
    // Remove collected powerups
    this.powerups = this.powerups.filter(p => !toRemove.includes(p));
  }

  /**
   * Check if player is on a powerup
   * @param {Object} player - Player entity
   * @param {Object} powerup - Powerup entity
   * @returns {boolean}
   */
  isPlayerOnPowerup(player, powerup) {
    if (!player || !player.sprite) return false;
    const playerTx = Math.floor(player.sprite.x / this.tileSize);
    const playerTy = Math.floor(player.sprite.y / this.tileSize);
    return powerup.isOnTile(playerTx, playerTy);
  }

  /**
   * Apply powerup effect to player
   * @param {Object} player - Player entity
   * @param {string} type - Powerup type
   */
  applyPowerup(player, type) {
    console.log(`Player collected: ${type}`);
    
    switch(type) {
      case POWERUP_TYPES.SPEED:
        player.speed *= 1.2; // 20% speed boost
        if (player.gameState) {
          player.gameState.playerState.speedPowerups += 1;
        }
        break;
      case POWERUP_TYPES.BOMB:
        if (player.gameState) {
          player.gameState.playerState.maxBombs += 1;
        }
        break;
      case POWERUP_TYPES.RANGE:
        if (player.gameState) {
          player.gameState.playerState.explosionRange += 1;
        }
        break;
      case POWERUP_TYPES.PIERCE:
        if (player.gameState) {
          player.gameState.playerState.canPierceBlocks = true;
        }
        break;
      case POWERUP_TYPES.KICK_BOMB:
        if (player.gameState) {
          player.gameState.playerState.hasKickBomb = true;
        }
        break;
      case POWERUP_TYPES.THROW_BOMB:
        if (player.gameState) {
          player.gameState.playerState.hasThrowBomb = true;
        }
        break;
      case POWERUP_TYPES.CROSS_BLOCK:
        if (player.gameState) {
          player.gameState.playerState.hasCrossBlock = true;
        }
        break;
      case POWERUP_TYPES.CROSS_BOMB:
        if (player.gameState) {
          player.gameState.playerState.hasCrossBomb = true;
        }
        break;
      case POWERUP_TYPES.FOLLOWER_BOMB:
        if (player.gameState) {
          player.gameState.playerState.hasFollowerBomb = true;
          player.gameState.playerState.hasLandMine = false;
        }
        break;
      case POWERUP_TYPES.LAND_MINE:
        if (player.gameState) {
          player.gameState.playerState.hasLandMine = true;
          player.gameState.playerState.hasFollowerBomb = false;
        }
        break;
      case POWERUP_TYPES.EXTRA_LIFE:
        if (player.gameState) {
          player.gameState.playerState.lives += 1;
        }
        break;
    }
    
    this.eventBus.emit(GameEvents.PLAYER_COLLECT_POWERUP, { type, player });
  }

  /**
   * Get all powerups
   * @returns {Array}
   */
  getPowerups() {
    return this.powerups;
  }

  /**
   * Get powerup at specific position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {Object|null}
   */
  getPowerupAt(tx, ty) {
    return this.powerups.find((p) => p.isOnTile(tx, ty)) || null;
  }

  /**
   * Remove a specific powerup
   * @param {Object} powerup - Powerup to remove
   */
  removePowerup(powerup) {
    const index = this.powerups.indexOf(powerup);
    if (index !== -1) {
      this.powerups.splice(index, 1);
      if (powerup.sprite && powerup.sprite.parent) {
        powerup.sprite.parent.removeChild(powerup.sprite);
      }
    }
  }

  /**
   * Clear all powerups
   */
  clear() {
    for (const powerup of this.powerups) {
      if (powerup.sprite && powerup.sprite.parent) {
        powerup.sprite.parent.removeChild(powerup.sprite);
      }
    }
    this.powerups = [];
  }

  /**
   * Called when system is destroyed
   */
  destroy() {
    this.clear();
    this.gameContainer = null;
  }
}
