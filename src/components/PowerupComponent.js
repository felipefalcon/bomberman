/**
 * PowerupComponent - Base class for powerup components
 * Each powerup type extends this class to define its behavior
 */
export class PowerupComponent {
  constructor() {
    this.enabled = true;
  }

  /**
   * Apply the powerup effect
   * @param {Object} player - Player entity
   * @param {Object} gameState - GameState instance
   */
  apply(player, gameState) {
    // Override in subclasses
  }

  /**
   * Remove the powerup effect
   * @param {Object} player - Player entity
   * @param {Object} gameState - GameState instance
   */
  remove(player, gameState) {
    // Override in subclasses
  }

  /**
   * Check if component is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Enable or disable the component
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}
