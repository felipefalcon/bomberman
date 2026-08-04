import * as PIXI from 'pixi.js';
import { GameInitializer } from './core/GameInitializer.js';
import { GameLoop } from './core/GameLoop.js';
import { EntityManager } from './core/EntityManager.js';
import { GameEvents } from './engine/EventBus.js';
import { GAME_CONFIG } from './config/Constants.js';

/**
 * Game - Main game class
 * Orchestrates game initialization and loop using modular components
 */
export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    
    // Modular components
    this.initializer = null;
    this.gameLoop = null;
    this.entityManager = null;
    
    // Game components (set by initializer)
    this.components = null;
    this.unsubscribers = [];
  }

  /**
   * Start the game
   */
  async start() {
    // Install HUD font
    PIXI.BitmapFont.install({
      name: 'HUDFont',
      chars: PIXI.BitmapFontManager.ASCII,
      resolution: window.devicePixelRatio || 1,
      padding: 8,
      textureStyle: { scaleMode: 'nearest' },
      style: {
        fontFamily: 'Silkscreen, monospace',
        fontSize: 8,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room') || 'room';
    const seed = this._buildSeed(roomId);
    const onlineEnabled = params.get('online') === '1' || params.get('online') === 'true';
    const playerId = params.get('player') || undefined;

    GAME_CONFIG.RNG_SEED = seed;
    window.__ROOM_SEED__ = seed;
    window.__ONLINE_ENABLED__ = onlineEnabled;

    // Initialize game components
    this.initializer = new GameInitializer(this.app);
    this.components = await this.initializer.initialize();
    
    // Initialize entity manager
    this.entityManager = new EntityManager();
    
    // Register main entities
    if (this.components.player) {
      this.entityManager.add(this.components.player, 'player');
    }
    
    // Initialize game loop
    this.gameLoop = new GameLoop(this.components);

    const onlineBridge = this.components.managers.onlineStateBridge;
    if (onlineBridge) {
      onlineBridge.onSnapshot = (snapshot) => {
        if (!snapshot || !window.__ONLINE_ENABLED__) return;
        this.gameLoop?._renderRemotePlayers?.(snapshot.players || []);
        this.gameLoop?._syncOnlineWorld?.(snapshot, 1);
      };

      onlineBridge.onRoomState = (roomState) => {
        if (!roomState || !window.__ONLINE_ENABLED__) return;
        const gameState = this.components?.managers?.gameState;
        if (gameState?.setOnlineCountdown) {
          const seconds = Number(roomState?.countdownSeconds || 0);
          if (roomState?.status === 'countdown') {
            gameState.setOnlineCountdown(seconds);
          } else if (roomState?.status === 'playing' || roomState?.status === 'waiting') {
            gameState.clearOnlineCountdown();
          }
        }
      };
    }

    if (onlineEnabled && onlineBridge) {
      onlineBridge.enable(roomId, playerId);
      onlineBridge.playerId = playerId || onlineBridge.playerId;
    }

    onlineBridge?.applySnapshot?.({
      players: [
        {
          playerId: onlineBridge?.playerId || 'local',
          x: this.components.player.sprite.x,
          y: this.components.player.sprite.y,
        },
      ],
    });
    this.gameLoop.start(this.app);
    
    // Setup additional event listeners
    this._setupEventListeners();
    
    // Load audio assets
    await this._loadAudioAssets();
    
  }

  _buildSeed(roomId = 'room') {
    const normalized = String(roomId || 'room').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  /**
   * Load audio assets
   */
  async _loadAudioAssets() {
    const audioManager = this.components.managers.audio;
    
    const musicPromise = audioManager.loadMusic(`${import.meta.env.BASE_URL}assets/18 Where it All Began.mp3`)
      .catch((err) => console.warn('Could not load background music. Error:', err));

    const explosionSoundPromise = audioManager.loadSoundEffect('explosion', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (12).wav`)
      .catch((err) => console.warn('Could not load explosion sound. Error:', err));

    const damageSoundPromise = audioManager.loadSoundEffect('damage', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (100).wav`)
      .catch((err) => console.warn('Could not load damage sound. Error:', err));

    const gameOverSoundPromise = audioManager.loadSoundEffect('gameOver', `${import.meta.env.BASE_URL}assets/10 Bad Luck.mp3`)
      .catch((err) => console.warn('Could not load game over sound. Error:', err));

    await Promise.all([musicPromise, explosionSoundPromise, damageSoundPromise, gameOverSoundPromise]);
  }

  /**
   * Setup additional event listeners
   */
  _setupEventListeners() {
    const gameState = this.components.managers.gameState;
    
    // Listen for damage events and apply to actual player
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'player' && this.components.player) {
        this.components.player.takeDamage();
        this._refreshHUD();
        if (this.components.player.lives <= 0) {
          this._handlePlayerDeath();
        }
      }
    }));
    
    // Listen for monster damage events
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'monster' && data.monster) {
        this.components.systems.monster.damageMonster(data.monster);
      }
    }));

    // Ensure powerups destroyed by explosion are removed from PowerupSystem state too
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'powerup' && data.powerup) {
        this.components.systems.powerup.removePowerup(data.powerup);
      }
    }));

    // Monster touch damage uses a separate event and must also sync to player entity
    this.unsubscribers.push(gameState.eventBus.on(GameEvents.MONSTER_DAMAGE_PLAYER, () => {
      if (!this.components.player) return;
      this.components.player.takeDamage();
      this._refreshHUD();
      if (this.components.player.lives <= 0) {
        this._handlePlayerDeath();
      }
    }));
  }

  /**
   * Refresh HUD display
   */
  _refreshHUD() {
    if (!this.components.player) return;
    this.components.managers.hud?.setLives(this.components.player.lives);
    this.components.managers.hud?.updatePowerups(this.components.player);
  }

  /**
   * Handle player death
   */
  _handlePlayerDeath() {
    this.components.managers.audio.stop();
    this.components.managers.audio.playSoundEffect('gameOver');
    
    if (this.components.player) {
      this.components.player.sprite.tint = 0xff0000;
      this.components.managers.input.clear();
    }
    
    const gameOver = new PIXI.BitmapText({
      text: 'Game Over',
      style: {
        fontFamily: 'HUDFont',
        fontSize: 12,
        fill: 0xff0000,
      },
      anchor: 0.5,
      roundPixels: true,
    });
    gameOver.x = (this.components.tileSize * this.components.map.cols) / 2;
    gameOver.y = (this.components.tileSize * this.components.map.rows) / 2;
    this.components.gameContainer.addChild(gameOver);
    this.app.ticker.stop();
  }

  /**
   * Stop the game
   */
  stop() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    if (this.gameLoop) {
      this.gameLoop.stop();
    }

    this.initializer?.destroy?.();
  }

  /**
   * Get the entity manager
   * @returns {EntityManager}
   */
  getEntityManager() {
    return this.entityManager;
  }

  /**
   * Get game components
   * @returns {Object}
   */
  getComponents() {
    return this.components;
  }
}

