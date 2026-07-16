import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';
import { Monster } from '../entities/Monster.js';

/**
 * MonsterSystem - Manages monster spawning, AI, and updates
 */
export class MonsterSystem {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.monsters = [];
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.spawnCount = GAME_CONFIG.MONSTER_SPAWN_COUNT;
    this.enemyFrames = null;
    this.enemyMapping = null;
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
   * Set enemy assets
   * @param {Object} frames - Enemy texture frames
   * @param {Object} mapping - Enemy animation mapping
   */
  setAssets(frames, mapping) {
    this.enemyFrames = frames;
    this.enemyMapping = mapping;
  }

  /**
   * Spawn monsters at valid positions
   * @param {number} count - Number of monsters to spawn
   */
  spawnMonsters(count = this.spawnCount) {
    const spawnTiles = this.findMonsterSpawnTiles(count);
    
    for (const { tx, ty } of spawnTiles) {
      const monster = new Monster(tx, ty, this.tileSize, this.enemyFrames, this.enemyMapping);
      this.monsters.push(monster);
      this.gameContainer.addChild(monster.sprite);
      
      this.eventBus.emit(GameEvents.MONSTER_SPAWN, { tx, ty, monster });
    }
    
    console.log(`MonsterSystem: Spawned ${this.monsters.length} monsters`);
  }

  /**
   * Find valid spawn positions for monsters
   * @param {number} count - Number of positions to find
   * @returns {Array} Array of {tx, ty} positions
   */
  findMonsterSpawnTiles(count) {
    if (!this.scene || !this.scene.map) return [];
    
    const positions = [];
    const map = this.scene.map;
    
    for (let ty = 1; ty < map.rows - 1; ty++) {
      for (let tx = 1; tx < map.cols - 1; tx++) {
        // Skip start area
        const isStartArea = (tx === 1 && ty === 1) || (tx === 2 && ty === 1) || (tx === 1 && ty === 2);
        if (isStartArea) continue;
        
        // Skip blocked tiles
        if (map.isBlocked(tx, ty)) continue;
        
        // Skip tiles too close to start
        const distanceFromStart = Math.abs(tx - 1) + Math.abs(ty - 1);
        if (distanceFromStart < GAME_CONFIG.MONSTER_START_DISTANCE) continue;
        
        positions.push({ tx, ty });
      }
    }
    
    // Shuffle positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    return positions.slice(0, count);
  }

  /**
   * Update monsters - called every frame
   * @param {number} delta - Time delta
   * @param {Object} player - Player entity
   * @param {Array} bombs - Array of bomb objects
   */
  update(delta, player, bombs) {
    for (const monster of this.monsters.slice()) {
      monster.update(delta, this.scene?.map, bombs);
      
      // Check collision with player
      if (player && this.isMonsterOnPlayer(monster, player)) {
        if (!monster.lastPlayerTouch) {
          monster.lastPlayerTouch = true;
          
          this.eventBus.emit(GameEvents.MONSTER_DAMAGE_PLAYER, { monster, player });
          this.eventBus.emit(GameEvents.AUDIO_PLAY, { type: 'damage' });
        }
      } else {
        monster.lastPlayerTouch = false;
      }
    }
  }

  /**
   * Check if monster is on the same tile as player
   * @param {Object} monster - Monster entity
   * @param {Object} player - Player entity
   * @returns {boolean}
   */
  isMonsterOnPlayer(monster, player) {
    if (!player || !player.sprite) return false;
    const playerTx = Math.floor(player.sprite.x / this.tileSize);
    const playerTy = Math.floor(player.sprite.y / this.tileSize);
    return monster.isOnTile(playerTx, playerTy);
  }

  /**
   * Remove a monster
   * @param {Object} monster - Monster to remove
   */
  removeMonster(monster) {
    const index = this.monsters.indexOf(monster);
    if (index !== -1) {
      this.monsters.splice(index, 1);
      if (monster.sprite && monster.sprite.parent) {
        monster.sprite.parent.removeChild(monster.sprite);
      }
      
      this.eventBus.emit(GameEvents.MONSTER_DEATH, { monster });
    }
  }

  /**
   * Apply damage to a monster
   * @param {Object} monster - Monster to damage
   * @returns {boolean} True if monster died
   */
  damageMonster(monster) {
    if (!monster.takeDamage()) {
      this.removeMonster(monster);
      return true;
    }
    return false;
  }

  /**
   * Get all monsters
   * @returns {Array}
   */
  getMonsters() {
    return this.monsters;
  }

  /**
   * Get monster at specific position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {Object|null}
   */
  getMonsterAt(tx, ty) {
    return this.monsters.find((m) => m.isOnTile(tx, ty)) || null;
  }

  /**
   * Clear all monsters
   */
  clear() {
    for (const monster of this.monsters) {
      if (monster.sprite && monster.sprite.parent) {
        monster.sprite.parent.removeChild(monster.sprite);
      }
    }
    this.monsters = [];
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
