import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';
import { BaseGameSystem } from './BaseGameSystem.js';
import {
  getCornerTileKeys,
  getCorners,
  pixelToTile,
  spriteToTile,
  tileCenter,
  tileKey,
  toTile,
} from '../utils/tileUtils.js';

/**
 * CollisionSystem - Handles collision detection between entities and tiles
 */
export class CollisionSystem extends BaseGameSystem {
  constructor(eventBus = globalEventBus, map = null) {
    super(eventBus, map, null);
  }

  /**
   * Check if a position collides with blocked tiles
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {Object} entity - Entity with collision properties
   * @param {Array} bombs - Array of bomb objects
   * @returns {boolean}
   */
  collidesAt(x, y, entity, bombs = []) {
    if (!entity) return false;
    
    const collisionHalf = entity.collisionHalf || Math.floor(entity.hitboxSize / 2) || Math.floor(this.tileSize / 2);
    
    // Get current position for bomb collision check
    const currentX = entity.sprite?.x || x;
    const currentY = entity.sprite?.y || y;
    
    const currentTiles = getCornerTileKeys(currentX, currentY, collisionHalf, this.tileSize);
    const corners = getCorners(x, y, collisionHalf);

    for (const corner of corners) {
      const tx = toTile(corner.x, this.tileSize);
      const ty = toTile(corner.y, this.tileSize);
      
      // Check tile collision
      if (this.isTileBlocked(tx, ty)) return true;

      // Check bomb collision
      const bomb = bombs.find((bomb) => bomb.tx === tx && bomb.ty === ty);
      if (bomb) {
        // Allow entity to walk through bomb if it's currently on that tile
        if (currentTiles.has(tileKey(tx, ty))) {
          continue;
        }
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a tile is blocked
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isTileBlocked(tx, ty) {
    if (!this.map) return true;
    return this.map.isBlocked(tx, ty);
  }

  /**
   * Check if a tile is a wall
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isTileWall(tx, ty) {
    if (!this.map) return true;
    return this.map.isWall(tx, ty);
  }

  /**
   * Check if a tile is destructible
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isTileDestructible(tx, ty) {
    if (!this.map) return false;
    return this.map.isDestructible(tx, ty);
  }

  /**
   * Check if two entities collide
   * @param {Object} entity1 - First entity
   * @param {Object} entity2 - Second entity
   * @returns {boolean}
   */
  entitiesCollide(entity1, entity2) {
    if (!entity1?.sprite || !entity2?.sprite) return false;
    
    const half1 = entity1.collisionHalf || Math.floor(entity1.hitboxSize / 2) || Math.floor(this.tileSize / 2);
    const half2 = entity2.collisionHalf || Math.floor(entity2.hitboxSize / 2) || Math.floor(this.tileSize / 2);
    
    const x1 = entity1.sprite.x;
    const y1 = entity1.sprite.y;
    const x2 = entity2.sprite.x;
    const y2 = entity2.sprite.y;
    
    // Simple AABB collision
    return (
      x1 - half1 < x2 + half2 &&
      x1 + half1 > x2 - half2 &&
      y1 - half1 < y2 + half2 &&
      y1 + half1 > y2 - half2
    );
  }

  /**
   * Check if entity collides with any bomb
   * @param {Object} entity - Entity to check
   * @param {Array} bombs - Array of bomb objects
   * @returns {Object|null} Bomb that collides, or null
   */
  collidesWithBomb(entity, bombs) {
    if (!entity?.sprite) return null;
    const tile = spriteToTile(entity.sprite, this.tileSize);
    if (!tile) return null;
    
    return bombs.find((bomb) => bomb.tx === tile.tx && bomb.ty === tile.ty) || null;
  }

  /**
   * Check if entity collides with any powerup
   * @param {Object} entity - Entity to check
   * @param {Array} powerups - Array of powerup objects
   * @returns {Object|null} Powerup that collides, or null
   */
  collidesWithPowerup(entity, powerups) {
    if (!entity?.sprite) return null;
    const tile = spriteToTile(entity.sprite, this.tileSize);
    if (!tile) return null;
    
    return powerups.find((powerup) => powerup.isOnTile(tile.tx, tile.ty)) || null;
  }

  /**
   * Check if entity collides with any monster
   * @param {Object} entity - Entity to check
   * @param {Array} monsters - Array of monster objects
   * @returns {Array} Array of monsters that collide
   */
  collidesWithMonsters(entity, monsters) {
    if (!entity?.sprite) return [];
    const tile = spriteToTile(entity.sprite, this.tileSize);
    if (!tile) return [];
    
    return monsters.filter((monster) => monster.isOnTile(tile.tx, tile.ty));
  }

  /**
   * Get tile position from pixel position
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @returns {Object} {tx, ty}
   */
  getTilePosition(x, y) {
    return pixelToTile(x, y, this.tileSize);
  }

  /**
   * Get pixel position from tile position
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @param {boolean} center - Whether to return center of tile
   * @returns {Object} {x, y}
   */
  getPixelPosition(tx, ty, center = true) {
    if (center) {
      return tileCenter(tx, ty, this.tileSize);
    }
    return {
      x: tx * this.tileSize,
      y: ty * this.tileSize
    };
  }

  /**
   * Check if tile coordinates are valid
   * @param {number} tx - Tile X position
   * @param {number} ty - Tile Y position
   * @returns {boolean}
   */
  isValidTileCoord(tx, ty) {
    if (!this.map) return false;
    return Number.isInteger(tx) && Number.isInteger(ty) && 
           tx >= 0 && ty >= 0 && 
           tx < this.map.cols && ty < this.map.rows;
  }

  /**
   * Called when system is destroyed
   */
  destroy() {
    super.destroy();
  }
}
