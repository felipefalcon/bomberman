import { POWERUP_TYPES } from '../config/Constants.js';
import {
  SpeedComponent,
  BombComponent,
  RangeComponent,
  PierceComponent,
  KickBombComponent,
  ThrowBombComponent,
  CrossBlockComponent,
  CrossBombComponent,
  FollowerBombComponent,
  LandMineComponent,
  ExtraLifeComponent
} from './PowerupComponents.js';

/**
 * ComponentManager - Manages powerup components for a player
 * Provides a clean interface to add, remove, and query components
 */
export class ComponentManager {
  constructor() {
    this.components = new Map();
  }

  /**
   * Add a component by type
   * @param {string} type - Powerup type from POWERUP_TYPES
   * @param {Object} player - Player entity
   * @param {Object} gameState - GameState instance
   */
  addComponent(type, player, gameState) {
    const component = this._createComponent(type);
    if (component) {
      component.apply(player, gameState);
      this.components.set(type, component);
    }
  }

  /**
   * Remove a component by type
   * @param {string} type - Powerup type from POWERUP_TYPES
   * @param {Object} player - Player entity
   * @param {Object} gameState - GameState instance
   */
  removeComponent(type, player, gameState) {
    const component = this.components.get(type);
    if (component) {
      component.remove(player, gameState);
      this.components.delete(type);
    }
  }

  /**
   * Check if a component exists
   * @param {string} type - Powerup type from POWERUP_TYPES
   * @returns {boolean}
   */
  hasComponent(type) {
    return this.components.has(type);
  }

  /**
   * Get a component by type
   * @param {string} type - Powerup type from POWERUP_TYPES
   * @returns {PowerupComponent|null}
   */
  getComponent(type) {
    return this.components.get(type) || null;
  }

  /**
   * Get all components
   * @returns {Map}
   */
  getAllComponents() {
    return this.components;
  }

  /**
   * Clear all components
   * @param {Object} player - Player entity
   * @param {Object} gameState - GameState instance
   */
  clear(player, gameState) {
    for (const [type, component] of this.components) {
      component.remove(player, gameState);
    }
    this.components.clear();
  }

  /**
   * Create a component instance based on type
   * @param {string} type - Powerup type from POWERUP_TYPES
   * @returns {PowerupComponent|null}
   */
  _createComponent(type) {
    switch(type) {
      case POWERUP_TYPES.SPEED:
        return new SpeedComponent();
      case POWERUP_TYPES.BOMB:
        return new BombComponent();
      case POWERUP_TYPES.RANGE:
        return new RangeComponent();
      case POWERUP_TYPES.PIERCE:
        return new PierceComponent();
      case POWERUP_TYPES.KICK_BOMB:
        return new KickBombComponent();
      case POWERUP_TYPES.THROW_BOMB:
        return new ThrowBombComponent();
      case POWERUP_TYPES.CROSS_BLOCK:
        return new CrossBlockComponent();
      case POWERUP_TYPES.CROSS_BOMB:
        return new CrossBombComponent();
      case POWERUP_TYPES.FOLLOWER_BOMB:
        return new FollowerBombComponent();
      case POWERUP_TYPES.LAND_MINE:
        return new LandMineComponent();
      case POWERUP_TYPES.EXTRA_LIFE:
        return new ExtraLifeComponent();
      default:
        console.warn(`Unknown powerup type: ${type}`);
        return null;
    }
  }
}
