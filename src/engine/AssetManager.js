import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from './EventBus.js';
import { loadPlayerSprites } from '../loaders/playerSprite.js';
import { loadEnemySprites } from '../loaders/enemySprite.js';
import { loadBombSprite } from '../loaders/bombLoader.js';
import { loadItemSprites } from '../loaders/itemsLoader.js';

/**
 * AssetManager - Centralized asset loading and management
 * Handles all game asset loading with progress tracking and error handling
 */
export class AssetManager {
  constructor(eventBus = globalEventBus) {
    this.eventBus = eventBus;
    this.assets = {
      player: { frames: null, mapping: null, loaded: false },
      enemy: { frames: null, mapping: null, loaded: false },
      bomb: { frames: null, mapping: null, loaded: false },
      items: { frames: null, mapping: null, loaded: false },
    };
    this.loadingPromises = new Map();
  }

  /**
   * Load all game assets
   * @returns {Promise<void>}
   */
  async loadAllAssets() {
    const baseUrl = GAME_CONFIG.ASSETS_PATH;
    
    const promises = [
      this.loadPlayerSprites(`${baseUrl}player-spritesheet.png`),
      this.loadEnemySprites(`${baseUrl}enemy_1.png`),
      this.loadBombSprite(),
      this.loadItemSprites(),
    ];

    try {
      await Promise.all(promises);
      this.eventBus.emit(GameEvents.ALL_ASSETS_LOADED, this.assets);
      console.log('AssetManager: All assets loaded successfully');
    } catch (error) {
      console.error('AssetManager: Error loading assets:', error);
      this.eventBus.emit(GameEvents.ASSET_ERROR, { error });
      throw error;
    }
  }

  /**
   * Load player sprites
   * @param {string} url - Spritesheet URL
   * @returns {Promise<void>}
   */
  async loadPlayerSprites(url) {
    if (this.assets.player.loaded) return;

    try {
      const { frames, mapping } = await loadPlayerSprites(url, GAME_CONFIG.TILE_SIZE);
      this.assets.player = { frames, mapping, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_LOADED, { type: 'player', data: { frames, mapping } });
      console.log('AssetManager: Player sprites loaded');
    } catch (error) {
      console.warn('AssetManager: Could not load player sprites, using placeholder:', error);
      this.assets.player = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: 'player', error });
    }
  }

  /**
   * Load enemy sprites
   * @param {string} url - Spritesheet URL
   * @returns {Promise<void>}
   */
  async loadEnemySprites(url) {
    if (this.assets.enemy.loaded) return;

    try {
      const { frames, mapping } = await loadEnemySprites(url, GAME_CONFIG.TILE_SIZE);
      this.assets.enemy = { frames, mapping, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_LOADED, { type: 'enemy', data: { frames, mapping } });
      console.log('AssetManager: Enemy sprites loaded');
    } catch (error) {
      console.warn('AssetManager: Could not load enemy sprites, using placeholder:', error);
      this.assets.enemy = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: 'enemy', error });
    }
  }

  /**
   * Load bomb sprite
   * @returns {Promise<void>}
   */
  async loadBombSprite() {
    if (this.assets.bomb.loaded) return;

    try {
      const { frames, mapping } = await loadBombSprite();
      this.assets.bomb = { frames, mapping, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_LOADED, { type: 'bomb', data: { frames, mapping } });
      console.log('AssetManager: Bomb sprite loaded');
    } catch (error) {
      console.warn('AssetManager: Could not load bomb sprite, using placeholder:', error);
      this.assets.bomb = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: 'bomb', error });
    }
  }

  /**
   * Load item/powerup sprites
   * @returns {Promise<void>}
   */
  async loadItemSprites() {
    if (this.assets.items.loaded) return;

    try {
      const { frames, mapping } = await loadItemSprites();
      this.assets.items = { frames, mapping, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_LOADED, { type: 'items', data: { frames, mapping } });
      console.log('AssetManager: Item sprites loaded');
    } catch (error) {
      console.warn('AssetManager: Could not load item sprites, using placeholder:', error);
      this.assets.items = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: 'items', error });
    }
  }

  /**
   * Get player asset data
   * @returns {Object} Player frames and mapping
   */
  getPlayerAssets() {
    return this.assets.player;
  }

  /**
   * Get enemy asset data
   * @returns {Object} Enemy frames and mapping
   */
  getEnemyAssets() {
    return this.assets.enemy;
  }

  /**
   * Get bomb asset data
   * @returns {Object} Bomb frames and mapping
   */
  getBombAssets() {
    return this.assets.bomb;
  }

  /**
   * Get item asset data
   * @returns {Object} Item frames and mapping
   */
  getItemAssets() {
    return this.assets.items;
  }

  /**
   * Check if all assets are loaded
   * @returns {boolean}
   */
  isFullyLoaded() {
    return Object.values(this.assets).every(asset => asset.loaded);
  }

  /**
   * Get loading progress (0-1)
   * @returns {number}
   */
  getProgress() {
    const total = Object.keys(this.assets).length;
    const loaded = Object.values(this.assets).filter(asset => asset.loaded).length;
    return loaded / total;
  }

  /**
   * Clear all loaded assets
   */
  clear() {
    this.assets = {
      player: { frames: null, mapping: null, loaded: false },
      enemy: { frames: null, mapping: null, loaded: false },
      bomb: { frames: null, mapping: null, loaded: false },
      items: { frames: null, mapping: null, loaded: false },
    };
    this.loadingPromises.clear();
  }
}
