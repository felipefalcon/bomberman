import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * CollisionSystem - Handles collision detection between entities and tiles
 */
export class CollisionSystem {
  constructor(eventBus = globalEventBus, map = null) {
    this.eventBus = eventBus;
    this.map = map;
    this.tileSize = GAME_CONFIG.TILE_SIZE;
  }

  /**
   * Set the map for this system
   * @param {Object} map - TileMap instance
   */
  setMap(map) {
    this.map = map;
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
    
    const currentCorners = [
      { x: currentX - collisionHalf, y: currentY - collisionHalf },
      { x: currentX + collisionHalf - 1, y: currentY - collisionHalf },
      { x: currentX - collisionHalf, y: currentY + collisionHalf - 1 },
      { x: currentX + collisionHalf - 1, y: currentY + collisionHalf - 1 },
    ];
    const currentTiles = new Set(currentCorners.map((c) => 
      `${Math.floor(c.x / this.tileSize)},${Math.floor(c.y / this.tileSize)}`
    ));

    const corners = [
      { x: x - collisionHalf, y: y - collisionHalf },
      { x: x + collisionHalf - 1, y: y - collisionHalf },
      { x: x - collisionHalf, y: y + collisionHalf - 1 },
      { x: x + collisionHalf - 1, y: y + collisionHalf - 1 },
    ];

    for (const corner of corners) {
      const tx = Math.floor(corner.x / this.tileSize);
      const ty = Math.floor(corner.y / this.tileSize);
      
      // Check tile collision
      if (this.isTileBlocked(tx, ty)) return true;

      // Check bomb collision
      const bomb = bombs.find((bomb) => bomb.tx === tx && bomb.ty === ty);
      if (bomb) {
        // Allow entity to walk through bomb if it's currently on that tile
        if (currentTiles.has(`${tx},${ty}`)) {
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
    
    const entityTx = Math.floor(entity.sprite.x / this.tileSize);
    const entityTy = Math.floor(entity.sprite.y / this.tileSize);
    
    return bombs.find((bomb) => bomb.tx === entityTx && bomb.ty === entityTy) || null;
  }

  /**
   * Check if entity collides with any powerup
   * @param {Object} entity - Entity to check
   * @param {Array} powerups - Array of powerup objects
   * @returns {Object|null} Powerup that collides, or null
   */
  collidesWithPowerup(entity, powerups) {
    if (!entity?.sprite) return null;
    
    const entityTx = Math.floor(entity.sprite.x / this.tileSize);
    const entityTy = Math.floor(entity.sprite.y / this.tileSize);
    
    return powerups.find((powerup) => powerup.isOnTile(entityTx, entityTy)) || null;
  }

  /**
   * Check if entity collides with any monster
   * @param {Object} entity - Entity to check
   * @param {Array} monsters - Array of monster objects
   * @returns {Array} Array of monsters that collide
   */
  collidesWithMonsters(entity, monsters) {
    if (!entity?.sprite) return [];
    
    const entityTx = Math.floor(entity.sprite.x / this.tileSize);
    const entityTy = Math.floor(entity.sprite.y / this.tileSize);
    
    return monsters.filter((monster) => monster.isOnTile(entityTx, entityTy));
  }

  /**
   * Get tile position from pixel position
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @returns {Object} {tx, ty}
   */
  getTilePosition(x, y) {
    return {
      tx: Math.floor(x / this.tileSize),
      ty: Math.floor(y / this.tileSize)
    };
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
      const half = this.tileSize / 2;
      return {
        x: tx * this.tileSize + half,
        y: ty * this.tileSize + half
      };
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
    this.map = null;
  }
}
