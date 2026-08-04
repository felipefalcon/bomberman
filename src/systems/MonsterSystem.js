import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';
import { Monster } from '../entities/Monster.js';
import { BaseGameSystem } from './BaseGameSystem.js';
import { spriteToTile } from '../utils/tileUtils.js';
import { createSeededRandom } from '../utils/seededRandom.js';

/**
 * MonsterSystem - Manages monster spawning, AI, and updates
 */
export class MonsterSystem extends BaseGameSystem {
  constructor(eventBus = globalEventBus, map = null, gameContainer = null) {
    super(eventBus, map, gameContainer);
    this.monsters = [];
    this.spawnCount = GAME_CONFIG.MONSTER_SPAWN_COUNT;
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.random = createSeededRandom(window.__ROOM_SEED__ ?? GAME_CONFIG.RNG_SEED);
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
      monster.serverControlled = false;
      this.monsters.push(monster);
      this.gameContainer?.addChild(monster.sprite);
      
      this.eventBus.emit(GameEvents.MONSTER_SPAWN, { tx, ty, monster });
    }
    
  }

  syncFromSnapshot(monsters = []) {
    if (!Array.isArray(monsters)) return;

    const existingById = new Map(this.monsters.map((monster) => [monster.serverId || `${monster.tx}:${monster.ty}`, monster]));
    const nextIds = new Set();

    for (const entry of monsters) {
      const serverId = entry.id || `${entry.tx}:${entry.ty}`;
      nextIds.add(serverId);

      let monster = existingById.get(serverId);
      if (!monster) {
        monster = new Monster(entry.tx, entry.ty, this.tileSize, this.enemyFrames, this.enemyMapping);
        monster.serverId = serverId;
        monster.serverControlled = true;
        this.monsters.push(monster);
        this.gameContainer?.addChild(monster.sprite);
        this.eventBus.emit(GameEvents.MONSTER_SPAWN, { tx: entry.tx, ty: entry.ty, monster });
      }

      const previousTx = Number.isFinite(monster.tx) ? monster.tx : entry.tx;
      const previousTy = Number.isFinite(monster.ty) ? monster.ty : entry.ty;
      const deltaTx = entry.tx - previousTx;
      const deltaTy = entry.ty - previousTy;

      monster.serverControlled = true;
      monster.serverId = serverId;
      monster.serverState = { tx: entry.tx, ty: entry.ty };
      const half = this.tileSize / 2;
      monster.tx = entry.tx;
      monster.ty = entry.ty;
      monster.sprite.x = entry.tx * this.tileSize + half;
      monster.sprite.y = entry.ty * this.tileSize + half;

      if (typeof monster._updateAnimation === 'function') {
        const direction = this._toDirection(deltaTx, deltaTy);
        monster._updateAnimation(direction);
      }
    }

    for (const monster of this.monsters.slice()) {
      const monsterId = monster.serverId || `${monster.tx}:${monster.ty}`;
      if (!nextIds.has(monsterId)) {
        this.removeMonster(monster);
      }
    }
  }

  /**
   * Find valid spawn positions for monsters
   * @param {number} count - Number of positions to find
   * @returns {Array} Array of {tx, ty} positions
   */
  findMonsterSpawnTiles(count) {
    if (!this.map) return [];
    
    const positions = [];
    const map = this.map;
    
    for (let ty = 1; ty < map.rows - 1; ty++) {
      for (let tx = 1; tx < map.cols - 1; tx++) {
        const isStartArea = (tx === 1 && ty === 1) || (tx === 2 && ty === 1) || (tx === 1 && ty === 2)
          || (tx === map.cols - 2 && ty === map.rows - 2)
          || (tx === map.cols - 3 && ty === map.rows - 2)
          || (tx === map.cols - 2 && ty === map.rows - 3);
        if (isStartArea) continue;

        if (map.isBlocked(tx, ty)) continue;

        const distanceFromStart = Math.abs(tx - 1) + Math.abs(ty - 1);
        const distanceFromSecondStart = Math.abs(tx - (map.cols - 2)) + Math.abs(ty - (map.rows - 2));
        if (distanceFromStart < GAME_CONFIG.MONSTER_START_DISTANCE && distanceFromSecondStart < GAME_CONFIG.MONSTER_START_DISTANCE) continue;

        positions.push({ tx, ty });
      }
    }
    
    // Shuffle positions with seeded RNG when available
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
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
    if (window.__ONLINE_ENABLED__) {
      return;
    }

    for (const monster of this.monsters.slice()) {
      if (monster.serverControlled && monster.serverState) {
        const half = this.tileSize / 2;
        monster.tx = monster.serverState.tx;
        monster.ty = monster.serverState.ty;
        monster.sprite.x = monster.serverState.tx * this.tileSize + half;
        monster.sprite.y = monster.serverState.ty * this.tileSize + half;
      } else {
        monster.update(delta, this.map, bombs);
      }
      
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
    const playerTile = spriteToTile(player.sprite, this.tileSize);
    if (!playerTile) return false;
    return monster.isOnTile(playerTile.tx, playerTile.ty);
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

  _toDirection(deltaTx, deltaTy) {
    if (Math.abs(deltaTx) > Math.abs(deltaTy)) {
      return { dx: Math.sign(deltaTx), dy: 0 };
    }
    if (Math.abs(deltaTy) > 0) {
      return { dx: 0, dy: Math.sign(deltaTy) };
    }
    return null;
  }

  /**
   * Called when system is destroyed
   */
  destroy() {
    this.clear();
    super.destroy();
  }
}
