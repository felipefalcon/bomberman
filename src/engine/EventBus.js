/**
 * EventBus - Simple event system for decoupling components
 * Allows components to communicate without direct dependencies
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event).push(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
    
    if (callbacks.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Data to pass to callbacks
   */
  emit(event, data) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    
    // Create a copy to avoid issues if callbacks modify the list
    for (const callback of [...callbacks]) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    }
  }

  /**
   * Subscribe to an event only once
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  once(event, callback) {
    const wrappedCallback = (data) => {
      callback(data);
      this.off(event, wrappedCallback);
    };
    
    return this.on(event, wrappedCallback);
  }

  /**
   * Remove all listeners for an event or all events
   * @param {string} event - Optional event name, if not provided clears all
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.listeners.has(event) ? this.listeners.get(event).length : 0;
  }
}

// Global event bus instance
export const globalEventBus = new EventBus();

// Game event names
export const GameEvents = {
  // Game state
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  
  // Player events
  PLAYER_SPAWN: 'player:spawn',
  PLAYER_DEATH: 'player:death',
  PLAYER_DAMAGE: 'player:damage',
  PLAYER_MOVE: 'player:move',
  PLAYER_COLLECT_POWERUP: 'player:collect_powerup',
  
  // Bomb events
  BOMB_PLACED: 'bomb:placed',
  BOMB_EXPLODE: 'bomb:explode',
  
  // Explosion events
  EXPLOSION_CREATE: 'explosion:create',
  EXPLOSION_DAMAGE: 'explosion:damage',
  EXPLOSION_END: 'explosion:end',
  
  // Monster events
  MONSTER_SPAWN: 'monster:spawn',
  MONSTER_DEATH: 'monster:death',
  MONSTER_DAMAGE_PLAYER: 'monster:damage_player',
  
  // Block events
  BLOCK_DESTROY: 'block:destroy',
  BLOCK_SPAWN_POWERUP: 'block:spawn_powerup',
  BLOCK_DESTRUCTION_START: 'block:destruction_start',
  BLOCK_DESTRUCTION_END: 'block:destruction_end',
  
  // Powerup events
  POWERUP_SPAWN: 'powerup:spawn',
  POWERUP_COLLECT: 'powerup:collect',
  
  // Asset events
  ASSET_LOADED: 'asset:loaded',
  ASSET_ERROR: 'asset:error',
  ALL_ASSETS_LOADED: 'asset:all_loaded',
  
  // Audio events
  AUDIO_PLAY: 'audio:play',
  AUDIO_STOP: 'audio:stop',
  
  // UI events
  UI_UPDATE_LIVES: 'ui:update_lives',
  UI_UPDATE_TIMER: 'ui:update_timer',
  UI_UPDATE_POWERUPS: 'ui:update_powerups',
  
  // Input events
  INPUT_KEY_DOWN: 'input:key_down',
  INPUT_KEY_UP: 'input:key_up',
};
