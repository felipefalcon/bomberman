import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * InputManager - Handles keyboard input and state management
 */
export class InputManager {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.keys = {};
    this.previousKeys = {};
    this.bound = false;
    this._onKeyDown = this.handleKeyDown.bind(this);
    this._onKeyUp = this.handleKeyUp.bind(this);
  }

  /**
   * Bind event listeners
   */
  bind() {
    if (this.bound) return;
    
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.bound = true;
  }

  /**
   * Unbind event listeners
   */
  unbind() {
    if (!this.bound) return;
    
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.bound = false;
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    const key = e.key.toLowerCase();
    this.keys[key] = true;
    
    this.eventBus.emit(GameEvents.INPUT_KEY_DOWN, { key, originalEvent: e });
  }

  /**
   * Handle key up event
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyUp(e) {
    const key = e.key.toLowerCase();
    this.keys[key] = false;
    
    this.eventBus.emit(GameEvents.INPUT_KEY_UP, { key, originalEvent: e });
  }

  /**
   * Check if a key is currently pressed
   * @param {string} key - Key to check
   * @returns {boolean}
   */
  isKeyDown(key) {
    return !!this.keys[key.toLowerCase()];
  }

  /**
   * Check if a key was just pressed this frame
   * @param {string} key - Key to check
   * @returns {boolean}
   */
  isKeyPressed(key) {
    const keyLower = key.toLowerCase();
    return this.keys[keyLower] && !this.previousKeys[keyLower];
  }

  /**
   * Check if a key was just released this frame
   * @param {string} key - Key to check
   * @returns {boolean}
   */
  isKeyReleased(key) {
    const keyLower = key.toLowerCase();
    return !this.keys[keyLower] && this.previousKeys[keyLower];
  }

  /**
   * Build a normalized movement command from current input state.
   * This keeps the local input flow compatible with a future networked command pipeline.
   * @returns {Object} {x, y, action: 'move'}
   */
  getMovementCommand() {
    let x = 0;
    let y = 0;
    
    if (this.isKeyDown('arrowup') || this.isKeyDown('w')) y = -1;
    if (this.isKeyDown('arrowdown') || this.isKeyDown('s')) y = 1;
    if (this.isKeyDown('arrowleft') || this.isKeyDown('a')) x = -1;
    if (this.isKeyDown('arrowright') || this.isKeyDown('d')) x = 1;

    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    
    return { type: 'move', x, y };
  }

  /**
   * Get movement vector from input
   * @returns {Object} {x, y} movement vector
   */
  getMovementVector() {
    return this.getMovementCommand();
  }

  /**
   * Check if any movement key is pressed
   * @returns {boolean}
   */
  isMoving() {
    const movement = this.getMovementVector();
    return movement.x !== 0 || movement.y !== 0;
  }

  /**
   * Update previous keys state - call at end of frame
   */
  update() {
    this.previousKeys = { ...this.keys };
  }

  /**
   * Get all currently pressed keys
   * @returns {Array<string>}
   */
  getPressedKeys() {
    return Object.keys(this.keys).filter(key => this.keys[key]);
  }

  /**
   * Clear all key states
   */
  clear() {
    this.keys = {};
    this.previousKeys = {};
  }

  /**
   * Called when manager is destroyed
   */
  destroy() {
    this.unbind();
    this.clear();
  }
}
