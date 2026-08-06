import { GAME_CONFIG } from '../config/Constants.js';
import { globalEventBus, GameEvents } from './EventBus.js';
import { loadPlayerSprites, getPlayerSpritesheetUrl } from '../loaders/playerSprite.js';
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
      player1: { frames: null, mapping: null, loaded: false },
      player2: { frames: null, mapping: null, loaded: false },
      player3: { frames: null, mapping: null, loaded: false },
      player4: { frames: null, mapping: null, loaded: false },
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
      this.loadPlayerSprites(1, baseUrl),
      this.loadPlayerSprites(2, baseUrl),
      this.loadPlayerSprites(3, baseUrl),
      this.loadPlayerSprites(4, baseUrl),
      this.loadEnemySprites(`${baseUrl}enemy_1.png`),
      this.loadBombSprite(),
      this.loadItemSprites(),
    ];

    try {
      await Promise.all(promises);
      this.eventBus.emit(GameEvents.ALL_ASSETS_LOADED, this.assets);
    } catch (error) {
      console.error('AssetManager: Error loading assets:', error);
      this.eventBus.emit(GameEvents.ASSET_ERROR, { error });
      throw error;
    }
  }

  /**
   * Load player sprites for a specific player
   * @param {number} playerNumber - Player number (1-4)
   * @param {string} baseUrl - Base URL for assets
   * @returns {Promise<void>}
   */
  async loadPlayerSprites(playerNumber = 1, baseUrl = GAME_CONFIG.ASSETS_PATH) {
    const assetKey = `player${playerNumber}`;
    if (this.assets[assetKey].loaded) return;

    try {
      const url = getPlayerSpritesheetUrl(playerNumber, baseUrl);
      const { frames, mapping } = await loadPlayerSprites(url, GAME_CONFIG.TILE_SIZE);
      this.assets[assetKey] = { frames, mapping, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_LOADED, { type: assetKey, data: { frames, mapping } });
    } catch (error) {
      console.warn(`AssetManager: Could not load player ${playerNumber} sprites, using placeholder:`, error);
      this.assets[assetKey] = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: assetKey, error });
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
    } catch (error) {
      console.warn('AssetManager: Could not load item sprites, using placeholder:', error);
      this.assets.items = { frames: null, mapping: null, loaded: true };
      this.eventBus.emit(GameEvents.ASSET_ERROR, { type: 'items', error });
    }
  }

  /**
   * Get player asset data for a specific player
   * @param {number} playerNumber - Player number (1-4)
   * @returns {Object} Player frames and mapping
   */
  getPlayerAssets(playerNumber = 1) {
    const assetKey = `player${playerNumber}`;
    return this.assets[assetKey] || { frames: null, mapping: null, loaded: false };
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
      player1: { frames: null, mapping: null, loaded: false },
      player2: { frames: null, mapping: null, loaded: false },
      player3: { frames: null, mapping: null, loaded: false },
      player4: { frames: null, mapping: null, loaded: false },
      enemy: { frames: null, mapping: null, loaded: false },
      bomb: { frames: null, mapping: null, loaded: false },
      items: { frames: null, mapping: null, loaded: false },
    };
    this.loadingPromises.clear();
  }
}
