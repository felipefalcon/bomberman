import { GAME_CONFIG, POWERUP_TYPES } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';
import { Powerup } from '../entities/Powerup.js';
import { BaseGameSystem } from './BaseGameSystem.js';
import { spriteToTile } from '../utils/tileUtils.js';
import { createSeededRandom } from '../utils/seededRandom.js';

/**
 * PowerupSystem - Manages powerup spawning, collection, and effects
 */
export class PowerupSystem extends BaseGameSystem {
  constructor(eventBus = globalEventBus, gameContainer = null) {
    super(eventBus, null, gameContainer);
    this.powerups = [];
    this.spawnChance = GAME_CONFIG.POWERUP_SPAWN_CHANCE;
    this.itemFrames = null;
    this.itemMapping = null;
    this.random = createSeededRandom(window.__ROOM_SEED__ ?? GAME_CONFIG.RNG_SEED);
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
    if (this.random() > this.spawnChance) return;
    if (!this.itemFrames || !this.itemMapping) return;
    
    // Weighted random selection based on rarity
    const randomType = this._getRandomPowerupType();
    const frameIndex = this.itemMapping[randomType];
    
    const powerup = new Powerup(tx, ty, this.tileSize, randomType, this.itemFrames[frameIndex]);
    // Keep newly spawned powerups immune for at least the full current explosion lifetime.
    powerup.immuneTicks = Math.max(GAME_CONFIG.POWERUP_IMMUNE_TICKS, GAME_CONFIG.EXPLOSION_DURATION + 1);
    this.powerups.push(powerup);
    this.gameContainer.addChild(powerup.sprite);
    
    this.eventBus.emit(GameEvents.POWERUP_SPAWN, { tx, ty, type: randomType });
  }

  /**
   * Get a random powerup type based on rarity weights
   * @returns {string} Powerup type
   */
  _getRandomPowerupType() {
    // Powerup rarity weights (higher = more common)
    const weights = {
      range: 25,      // Common
      pierce: 15,     // Uncommon
      bomb: 25,       // Common
      speed: 20,      // Common
      kick_bomb: 8,   // Rare
      throw_bomb: 8,  // Rare
      cross_block: 5,  // Very rare
      cross_bomb: 5,  // Very rare
      follower_bomb: 3, // Extremely rare
      land_mine: 3,   // Extremely rare
      extra_life: 2,  // Legendary
    };
    
    // Filter to only available powerup types
    const availableTypes = Object.keys(this.itemMapping);
    const filteredWeights = {};
    let totalWeight = 0;
    
    for (const type of availableTypes) {
      const weight = weights[type] || 5; // Default weight if not defined
      filteredWeights[type] = weight;
      totalWeight += weight;
    }
    
    // Weighted random selection
    let random = this.random() * totalWeight;
    for (const type of availableTypes) {
      random -= filteredWeights[type];
      if (random <= 0) {
        return type;
      }
    }
    
    // Fallback to first available type
    return availableTypes[0];
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
    if (toRemove.length === 0) return;
    const removed = new Set(toRemove);
    this.powerups = this.powerups.filter((powerup) => !removed.has(powerup));
  }

  syncFromSnapshot(powerups = []) {
    if (!Array.isArray(powerups)) return;

    const existingById = new Map(
      this.powerups.map((powerup) => [powerup.serverId || `${powerup.tx}:${powerup.ty}:${powerup.type}`, powerup])
    );
    const nextIds = new Set();

    for (const entry of powerups) {
      const serverId = entry.id || `${entry.tx}:${entry.ty}:${entry.type}`;
      nextIds.add(serverId);

      let powerup = existingById.get(serverId);
      if (!powerup) {
        const frameIndex = this.itemMapping?.[entry.type];
        const texture = Number.isFinite(frameIndex) ? this.itemFrames?.[frameIndex] : null;
        if (!texture) continue;

        powerup = new Powerup(entry.tx, entry.ty, this.tileSize, entry.type, texture);
        this.powerups.push(powerup);
        this.gameContainer?.addChild(powerup.sprite);
      }

      powerup.serverId = serverId;
      powerup.tx = entry.tx;
      powerup.ty = entry.ty;
      powerup.type = entry.type;
      powerup.immuneTicks = Number.isFinite(entry.immuneTicks) ? entry.immuneTicks : 0;
      powerup.update(0);
    }

    for (const powerup of this.powerups.slice()) {
      const id = powerup.serverId || `${powerup.tx}:${powerup.ty}:${powerup.type}`;
      if (!nextIds.has(id)) {
        this.removePowerup(powerup);
      }
    }
  }

  /**
   * Check if player is on a powerup
   * @param {Object} player - Player entity
   * @param {Object} powerup - Powerup entity
   * @returns {boolean}
   */
  isPlayerOnPowerup(player, powerup) {
    if (!player || !player.sprite) return false;
    const playerTile = spriteToTile(player.sprite, this.tileSize);
    if (!playerTile) return false;
    return powerup.isOnTile(playerTile.tx, playerTile.ty);
  }

  /**
   * Apply powerup effect to player
   * @param {Object} player - Player entity
   * @param {string} type - Powerup type
   */
  applyPowerup(player, type) {
    console.log(`Player collected: ${type}`);
    
    // Use component manager to apply powerup
    if (player.componentManager) {
      player.componentManager.addComponent(type, player, player.gameState);
    } else {
      // Fallback to direct state update if component manager not available
      this._applyDirectStateUpdate(player, type);
    }
    
    this.eventBus.emit(GameEvents.PLAYER_COLLECT_POWERUP, { type, player });
  }

  /**
   * Fallback method to apply powerup directly to state
   * Used if component manager is not available
   * @param {Object} player - Player entity
   * @param {string} type - Powerup type
   */
  _applyDirectStateUpdate(player, type) {
    switch(type) {
      case POWERUP_TYPES.SPEED:
        player.speed *= 1.2;
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
    super.destroy();
  }
}
