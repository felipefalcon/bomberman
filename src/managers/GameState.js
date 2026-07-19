import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from '../engine/EventBus.js';

/**
 * GameState - Centralized game state management
 * Manages all game state including player stats, time, and game status
 */
export class GameState {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    
    // Game status
    this.isRunning = false;
    this.isPaused = false;
    this.isGameOver = false;
    
    // Time
    this.timeRemaining = GAME_CONFIG.TIME_REMAINING;
    
    // Player state
    this.playerState = {
      lives: GAME_CONFIG.PLAYER_STARTING_LIVES,
      maxBombs: GAME_CONFIG.PLAYER_STARTING_BOMBS,
      activeBombs: 0,
      explosionRange: GAME_CONFIG.PLAYER_STARTING_RANGE,
      speedPowerups: 0,
      canPierceBlocks: false,
      hasShield: false,
      hasDetonator: false,
      hasKickBomb: false,
      hasThrowBomb: false,
      hasCrossBlock: false,
      hasCrossBomb: false,
    };
    
    // Score
    this.score = 0;
    this.monstersKilled = 0;
    this.blocksDestroyed = 0;
    
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for state changes
   */
  setupEventListeners() {
    this.eventBus.on(GameEvents.PLAYER_DAMAGE, () => this.handlePlayerDamage());
    this.eventBus.on(GameEvents.MONSTER_DAMAGE_PLAYER, () => this.handlePlayerDamage());
    this.eventBus.on(GameEvents.PLAYER_DEATH, () => this.handlePlayerDeath());
    this.eventBus.on(GameEvents.MONSTER_DEATH, () => this.handleMonsterDeath());
    this.eventBus.on(GameEvents.BLOCK_DESTROY, () => this.handleBlockDestroy());
    this.eventBus.on(GameEvents.PLAYER_COLLECT_POWERUP, (data) => this.handlePowerupCollect(data));
    this.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => this.handleExplosionDamage(data));
  }

  /**
   * Initialize game state
   */
  initialize() {
    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.timeRemaining = GAME_CONFIG.TIME_REMAINING;
    
    this.playerState = {
      lives: GAME_CONFIG.PLAYER_STARTING_LIVES,
      maxBombs: GAME_CONFIG.PLAYER_STARTING_BOMBS,
      activeBombs: 0,
      explosionRange: GAME_CONFIG.PLAYER_STARTING_RANGE,
      speedPowerups: 0,
      canPierceBlocks: false,
      hasShield: false,
      hasDetonator: false,
      hasKickBomb: false,
      hasThrowBomb: false,
      hasCrossBlock: false,
      hasCrossBomb: false,
    };
    
    this.score = 0;
    this.monstersKilled = 0;
    this.blocksDestroyed = 0;
    
    this.eventBus.emit(GameEvents.GAME_START);
  }

  /**
   * Update game state - called every frame
   * @param {number} delta - Time delta
   */
  update(delta) {
    if (!this.isRunning || this.isPaused || this.isGameOver) return;
    
    // Update timer
    if (this.timeRemaining > 0) {
      this.timeRemaining -= delta / 60;
      if (this.timeRemaining < 0) this.timeRemaining = 0;
      
      this.eventBus.emit(GameEvents.UI_UPDATE_TIMER, { value: this.timeRemaining });
      
      if (this.timeRemaining <= 0) {
        this.handleTimeUp();
      }
    }
  }

  /**
   * Handle player damage
   */
  handlePlayerDamage() {
    if (this.playerState.lives > 0) {
      this.playerState.lives -= 1;
      this.eventBus.emit(GameEvents.UI_UPDATE_LIVES, { value: this.playerState.lives });
      
      if (this.playerState.lives <= 0) {
        this.eventBus.emit(GameEvents.PLAYER_DEATH);
      }
    }
  }

  /**
   * Handle explosion damage
   * @param {Object} data - Damage data with target type
   */
  handleExplosionDamage(data) {
    if (data.target === 'player') {
      this.handlePlayerDamage();
    } else if (data.target === 'monster') {
      // Monster damage is handled by MonsterSystem
      this.handleMonsterDeath();
    }
  }

  /**
   * Handle player death
   */
  handlePlayerDeath() {
    this.isGameOver = true;
    this.isRunning = false;
    this.eventBus.emit(GameEvents.GAME_OVER, { score: this.score });
  }

  /**
   * Handle monster death
   */
  handleMonsterDeath() {
    this.monstersKilled += 1;
    this.score += 100;
  }

  /**
   * Handle block destruction
   */
  handleBlockDestroy() {
    this.blocksDestroyed += 1;
    this.score += 10;
  }

  /**
   * Handle powerup collection
   * @param {Object} data - Powerup data
   */
  handlePowerupCollect(data) {
    const { type } = data;
    
    switch(type) {
      case 'speed':
        this.playerState.speedPowerups += 1;
        break;
      case 'bomb':
        this.playerState.maxBombs += 1;
        break;
      case 'range':
        this.playerState.explosionRange += 1;
        break;
      case 'pierce':
        this.playerState.canPierceBlocks = true;
        break;
      case 'shield':
        this.playerState.hasShield = true;
        break;
      case 'detonator':
        this.playerState.hasDetonator = true;
        break;
      case 'kick_bomb':
        this.playerState.hasKickBomb = true;
        break;
      case 'throw_bomb':
        this.playerState.hasThrowBomb = true;
        break;
      case 'cross_block':
        this.playerState.hasCrossBlock = true;
        break;
      case 'cross_bomb':
        this.playerState.hasCrossBomb = true;
        break;
    }
    
    this.eventBus.emit(GameEvents.UI_UPDATE_POWERUPS, { player: this.playerState });
  }

  /**
   * Handle time up
   */
  handleTimeUp() {
    this.isGameOver = true;
    this.isRunning = false;
    this.eventBus.emit(GameEvents.GAME_OVER, { score: this.score, reason: 'time' });
  }

  /**
   * Pause the game
   */
  pause() {
    if (!this.isRunning || this.isGameOver) return;
    this.isPaused = true;
    this.eventBus.emit(GameEvents.GAME_PAUSE);
  }

  /**
   * Resume the game
   */
  resume() {
    if (!this.isRunning || this.isGameOver) return;
    this.isPaused = false;
    this.eventBus.emit(GameEvents.GAME_RESUME);
  }

  /**
   * Get player state
   * @returns {Object}
   */
  getPlayerState() {
    return { ...this.playerState };
  }

  /**
   * Update player state
   * @param {Object} updates - State updates
   */
  updatePlayerState(updates) {
    Object.assign(this.playerState, updates);
    this.eventBus.emit(GameEvents.UI_UPDATE_POWERUPS, { player: this.playerState });
  }

  /**
   * Get current score
   * @returns {number}
   */
  getScore() {
    return this.score;
  }

  /**
   * Get time remaining
   * @returns {number}
   */
  getTimeRemaining() {
    return this.timeRemaining;
  }

  /**
   * Check if game is running
   * @returns {boolean}
   */
  isGameRunning() {
    return this.isRunning && !this.isPaused && !this.isGameOver;
  }

  /**
   * Check if game is paused
   * @returns {boolean}
   */
  isGamePaused() {
    return this.isPaused;
  }

  /**
   * Check if game is over
   * @returns {boolean}
   */
  isGameGameOver() {
    return this.isGameOver;
  }

  /**
   * Get game statistics
   * @returns {Object}
   */
  getStatistics() {
    return {
      score: this.score,
      monstersKilled: this.monstersKilled,
      blocksDestroyed: this.blocksDestroyed,
      timeRemaining: this.timeRemaining,
    };
  }

  /**
   * Reset game state
   */
  reset() {
    this.initialize();
  }

  /**
   * Called when manager is destroyed
   */
  destroy() {
    this.eventBus.off(GameEvents.PLAYER_DAMAGE);
    this.eventBus.off(GameEvents.PLAYER_DEATH);
    this.eventBus.off(GameEvents.MONSTER_DEATH);
    this.eventBus.off(GameEvents.BLOCK_DESTROY);
    this.eventBus.off(GameEvents.PLAYER_COLLECT_POWERUP);
    
    this.isRunning = false;
    this.isPaused = false;
    this.isGameOver = false;
  }
}
