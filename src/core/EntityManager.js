/**
 * EntityManager - Manages game entities
 * Provides CRUD operations for entities and queries
 */
export class EntityManager {
  constructor() {
    this.entities = new Map();
    this.entitiesByType = new Map();
    this.nextId = 1;
  }

  /**
   * Add an entity to the manager
   * @param {Object} entity - Entity object
   * @param {string} type - Entity type (player, monster, powerup, bomb, etc.)
   * @returns {number} Entity ID
   */
  add(entity, type = 'default') {
    const id = this.nextId++;
    this.entities.set(id, { entity, type, id });
    
    if (!this.entitiesByType.has(type)) {
      this.entitiesByType.set(type, new Set());
    }
    this.entitiesByType.get(type).add(id);
    
    return id;
  }

  /**
   * Remove an entity by ID
   * @param {number} id - Entity ID
   * @returns {Object|null} Removed entity or null
   */
  remove(id) {
    const data = this.entities.get(id);
    if (!data) return null;
    
    this.entities.delete(id);
    this.entitiesByType.get(data.type)?.delete(id);
    
    return data.entity;
  }

  /**
   * Get an entity by ID
   * @param {number} id - Entity ID
   * @returns {Object|null} Entity or null
   */
  get(id) {
    const data = this.entities.get(id);
    return data ? data.entity : null;
  }

  /**
   * Get all entities of a specific type
   * @param {string} type - Entity type
   * @returns {Array} Array of entities
   */
  getByType(type) {
    const ids = this.entitiesByType.get(type);
    if (!ids) return [];
    
    const entities = [];
    for (const id of ids) {
      const data = this.entities.get(id);
      if (data) {
        entities.push(data.entity);
      }
    }
    
    return entities;
  }

  /**
   * Get all entities
   * @returns {Array} Array of all entities
   */
  getAll() {
    return Array.from(this.entities.values()).map(data => data.entity);
  }

  /**
   * Clear all entities
   */
  clear() {
    this.entities.clear();
    this.entitiesByType.clear();
    this.nextId = 1;
  }

  /**
   * Get entity count
   * @returns {number} Total number of entities
   */
  getCount() {
    return this.entities.size;
  }

  /**
   * Get entity count by type
   * @param {string} type - Entity type
   * @returns {number} Number of entities of type
   */
  getCountByType(type) {
    const ids = this.entitiesByType.get(type);
    return ids ? ids.size : 0;
  }

  /**
   * Update an entity
   * @param {number} id - Entity ID
   * @param {Object} updates - Object with properties to update
   * @returns {boolean} True if updated, false if not found
   */
  update(id, updates) {
    const data = this.entities.get(id);
    if (!data) return false;
    
    Object.assign(data.entity, updates);
    return true;
  }

  /**
   * Find entities matching a predicate
   * @param {Function} predicate - Function that returns true for matching entities
   * @returns {Array} Array of matching entities
   */
  find(predicate) {
    const results = [];
    for (const data of this.entities.values()) {
      if (predicate(data.entity)) {
        results.push(data.entity);
      }
    }
    return results;
  }

  /**
   * Find entities of a specific type matching a predicate
   * @param {string} type - Entity type
   * @param {Function} predicate - Function that returns true for matching entities
   * @returns {Array} Array of matching entities
   */
  findByType(type, predicate) {
    const entities = this.getByType(type);
    return entities.filter(predicate);
  }
}
