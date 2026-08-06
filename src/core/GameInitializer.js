import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';
import { TileMap } from '../map/TileMap.js';
import { Player } from '../entities/Player.js';
import { HudManager } from '../managers/HudManager.js';
import { AssetManager } from '../engine/AssetManager.js';
import { InputManager } from '../managers/InputManager.js';
import { GameState } from '../managers/GameState.js';
import { AudioManager } from '../managers/AudioManager.js';
import { BombSystem } from '../systems/BombSystem.js';
import { ExplosionSystem } from '../systems/ExplosionSystem.js';
import { PowerupSystem } from '../systems/PowerupSystem.js';
import { MonsterSystem } from '../systems/MonsterSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { GameEvents, globalEventBus } from '../infrastructure/index.js';
import { OnlineStateBridge } from '../infrastructure/network/OnlineStateBridge.js';
import { loadPlayerSprites, getPlayerSpritesheetUrl } from '../loaders/playerSprite.js';
import { loadEnemySprites } from '../loaders/enemySprite.js';
import { loadBombSprite } from '../loaders/bombLoader.js';
import { loadItemSprites } from '../loaders/itemsLoader.js';

/**
 * GameInitializer - Handles initial game setup
 * Creates and initializes all game components
 */
export class GameInitializer {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    
    // Config values
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.sidebarWidth = GAME_CONFIG.SIDEBAR_WIDTH;
    this.mapCols = GAME_CONFIG.MAP_COLS;
    this.mapRows = GAME_CONFIG.MAP_ROWS;
    
    // Game components (to be initialized)
    this.gameContainer = null;
    this.map = null;
    this.player = null;
    this.hudManager = null;
    
    // Managers
    this.assetManager = null;
    this.inputManager = null;
    this.gameState = null;
    this.audioManager = null;
    this.onlineStateBridge = null;
    
    // Systems
    this.bombSystem = null;
    this.explosionSystem = null;
    this.powerupSystem = null;
    this.monsterSystem = null;
    this.collisionSystem = null;
    
    // Asset storage
    this.playerFrames = {};
    this.playerMapping = {};
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.bombFrames = null;
    this.bombMapping = null;
    this.itemFrames = null;
    this.itemMapping = null;
    
    // Block destruction animation state
    this.destroyingBlocks = [];
    this.unsubscribers = [];
  }

  /**
   * Initialize all game components
   * @returns {Promise} Resolves when initialization is complete
   */
  async initialize() {
    this._createGameContainer();
    this._initializeMap();
    this._initializeSystems();
    this._initializeManagers();
    this._initializeInput();
    this._initializeGameState();
    this._setupGameStateListeners();
    
    await this._loadAssets();
    this._initializeHUD(); // Initialize HUD after assets are loaded
    // Ensure HUD has item icons set (in case HUD was created before assets loaded)
    if (this.hudManager && this.itemFrames && this.itemMapping) {
      this.hudManager.setItemIcons(this.itemFrames, this.itemMapping);
    }
    this._initializePlayer();
    this._initializeOnlineBridge();
    
    return {
      gameContainer: this.gameContainer,
      map: this.map,
      player: this.player,
      tileSize: this.tileSize,
      playerFrames: this.playerFrames,
      playerMapping: this.playerMapping,
      systems: {
        bomb: this.bombSystem,
        explosion: this.explosionSystem,
        powerup: this.powerupSystem,
        monster: this.monsterSystem,
        collision: this.collisionSystem,
      },
      managers: {
        asset: this.assetManager,
        input: this.inputManager,
        gameState: this.gameState,
        audio: this.audioManager,
        hud: this.hudManager,
        onlineStateBridge: this.onlineStateBridge,
      },
      destroyingBlocks: this.destroyingBlocks,
    };
  }

  /**
   * Create the main game container
   */
  _createGameContainer() {
    this.gameContainer = new PIXI.Container();
    this.gameContainer.x = this.sidebarWidth;
    this.gameContainer.y = this.tileSize; // offset down by 1 tile for HUD
    this.stage.addChild(this.gameContainer);
  }

  /**
   * Initialize the map
   */
  _initializeMap() {
    this.map = new TileMap(this.app, this.tileSize, this.mapCols, this.mapRows, window.__ROOM_SEED__ ?? GAME_CONFIG.RNG_SEED);
    this.gameContainer.addChild(this.map.container);
  }

  /**
   * Initialize game systems
   */
  _initializeSystems() {
    this.bombSystem = new BombSystem(globalEventBus, this.map, this.gameContainer);
    this.explosionSystem = new ExplosionSystem(globalEventBus, this.map, this.gameContainer);
    this.powerupSystem = new PowerupSystem(globalEventBus, this.gameContainer);
    this.monsterSystem = new MonsterSystem(globalEventBus, this.map, this.gameContainer);
    this.collisionSystem = new CollisionSystem(globalEventBus, this.map);
  }

  /**
   * Initialize game managers
   */
  _initializeManagers() {
    this.assetManager = new AssetManager();
    this.inputManager = new InputManager();
    this.gameState = new GameState();
    this.audioManager = new AudioManager();
  }

  /**
   * Initialize input manager
   */
  _initializeInput() {
    this.inputManager.bind();
  }

  /**
   * Initialize game state
   */
  _initializeGameState() {
    this.gameState.initialize();
  }

  /**
   * Initialize HUD
   */
  _initializeHUD() {
    this.hudManager = new HudManager(
      this.stage,
      {
        sidebarWidth: this.sidebarWidth,
        mapCols: this.mapCols,
        mapRows: this.mapRows,
        tileSize: this.tileSize,
        itemFrames: this.itemFrames,
        itemMapping: this.itemMapping,
      }
    );
    this.hudManager.updatePowerups(this.gameState.getPlayerState());
  }

  /**
   * Setup game state event listeners
   */
  _setupGameStateListeners() {
    // Route audio events emitted by systems to the audio manager.
    this.unsubscribers.push(
      this.gameState.eventBus.on(GameEvents.AUDIO_PLAY, (data) => {
        this.audioManager.playSoundEffect(data.type);
      })
    );
  }

  /**
   * Load all game assets
   */
  async _loadAssets() {
    // Load all player spritesheets (1-4)
    const playerPromises = [];
    for (let i = 1; i <= 4; i++) {
      const url = getPlayerSpritesheetUrl(i, `${import.meta.env.BASE_URL}assets/`);
      playerPromises.push(
        loadPlayerSprites(url, this.tileSize)
          .then(({ frames, mapping }) => {
            this.playerFrames[i] = frames;
            this.playerMapping[i] = mapping;
          })
          .catch((err) => {
            console.warn(`Could not load player ${i} spritesheet, using placeholder. Error:`, err);
            this.playerFrames[i] = null;
            this.playerMapping[i] = null;
          })
      );
    }
    const playerPromise = Promise.all(playerPromises);

    // Load enemy spritesheet
    const enemyPromise = this.map._initPromise.then(async () => {
      try {
        const { frames, mapping } = await loadEnemySprites();
        this.enemyFrames = frames;
        this.enemyMapping = mapping;
        this.monsterSystem.setAssets(frames, mapping);
        if (window.__ONLINE_ENABLED__) {
          this.monsterSystem.clear();
        } else {
          this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
        }
      } catch (err) {
        console.warn('Could not load enemy spritesheet, using placeholder. Error:', err);
        this.enemyFrames = null;
        this.enemyMapping = null;
        if (window.__ONLINE_ENABLED__) {
          this.monsterSystem.clear();
        } else {
          this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
        }
      }
    });

    // Load bomb sprite
    const bombPromise = loadBombSprite()
      .then(({ frames, mapping }) => {
        this.bombFrames = frames;
        this.bombMapping = mapping;
        this.bombSystem.setAssets(frames, mapping);
      })
      .catch((err) => {
        console.warn('Could not load bomb sprite, using placeholder. Error:', err);
        this.bombFrames = null;
        this.bombMapping = null;
      });

    // Load item sprites
    const itemPromise = loadItemSprites()
      .then(({ frames, mapping }) => {
        this.itemFrames = frames;
        this.itemMapping = mapping;
        this.powerupSystem.setAssets(frames, mapping);
        // Update HUD with item icons
        if (this.hudManager) {
          this.hudManager.setItemIcons(frames, mapping);
        }
      })
      .catch((err) => {
        console.warn('Could not load item sprites, using placeholder. Error:', err);
        this.itemFrames = null;
        this.itemMapping = null;
      });

    await Promise.all([playerPromise, enemyPromise, bombPromise, itemPromise]);
  }

  /**
   * Initialize the player
   */
  _initializePlayer() {
    const startX = this.tileSize * GAME_CONFIG.PLAYER_START_X;
    const startY = this.tileSize * GAME_CONFIG.PLAYER_START_Y;

    // Pass all player sprites so the player can switch based on playerId
    this.player = new Player(startX, startY, this.tileSize, this.playerFrames, this.playerMapping, this.gameState);
    this.gameContainer.addChild(this.player.sprite);
  }

  _initializeOnlineBridge() {
    this.onlineStateBridge = new OnlineStateBridge(this.gameState, this.player);
  }

  destroy() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    this.collisionSystem?.destroy?.();
    this.monsterSystem?.destroy?.();
    this.powerupSystem?.destroy?.();
    this.explosionSystem?.destroy?.();
    this.bombSystem?.destroy?.();

    this.hudManager?.destroy?.();
    this.inputManager?.destroy?.();
    this.gameState?.destroy?.();
    this.audioManager?.stop?.();

    if (this.player?.sprite?.parent) {
      this.player.sprite.parent.removeChild(this.player.sprite);
    }

    if (this.gameContainer?.parent) {
      this.gameContainer.parent.removeChild(this.gameContainer);
    }

    this.destroyingBlocks = [];
  }
}
