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
import { globalEventBus } from '../infrastructure/index.js';
import { loadPlayerSprites } from '../loaders/playerSprite.js';
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
    
    // Systems
    this.bombSystem = null;
    this.explosionSystem = null;
    this.powerupSystem = null;
    this.monsterSystem = null;
    this.collisionSystem = null;
    
    // Asset storage
    this.playerFrames = null;
    this.playerMapping = null;
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.bombFrames = null;
    this.bombMapping = null;
    this.itemFrames = null;
    this.itemMapping = null;
    
    // Block destruction animation state
    this.destroyingBlocks = [];
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
    
    return {
      gameContainer: this.gameContainer,
      map: this.map,
      player: this.player,
      tileSize: this.tileSize,
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
    this.map = new TileMap(this.app, this.tileSize, this.mapCols, this.mapRows);
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
    this.gameState.eventBus.on(globalEventBus.constructor.name === 'EventBus' ? 'AUDIO_PLAY' : 'AUDIO_PLAY', (data) => {
      this.audioManager.playSoundEffect(data.type);
    });
  }

  /**
   * Load all game assets
   */
  async _loadAssets() {
    // Load player spritesheet
    const playerPromise = loadPlayerSprites(`${import.meta.env.BASE_URL}assets/player-spritesheet.png`, this.tileSize)
      .then(({ frames, mapping }) => {
        this.playerFrames = frames;
        this.playerMapping = mapping;
        console.log('GameInitializer: Player spritesheet loaded');
      })
      .catch((err) => {
        console.warn('Could not load player spritesheet, using placeholder. Error:', err);
        this.playerFrames = null;
        this.playerMapping = null;
      });

    // Load enemy spritesheet
    const enemyPromise = this.map._initPromise.then(async () => {
      try {
        const { frames, mapping } = await loadEnemySprites();
        this.enemyFrames = frames;
        this.enemyMapping = mapping;
        console.log('GameInitializer: Enemy spritesheet loaded');
        this.monsterSystem.setAssets(frames, mapping);
        this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
      } catch (err) {
        console.warn('Could not load enemy spritesheet, using placeholder. Error:', err);
        this.enemyFrames = null;
        this.enemyMapping = null;
        this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
      }
    });

    // Load bomb sprite
    const bombPromise = loadBombSprite()
      .then(({ frames, mapping }) => {
        this.bombFrames = frames;
        this.bombMapping = mapping;
        console.log('GameInitializer: Bomb sprite loaded');
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
        console.log('GameInitializer: Item sprites loaded');
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

    this.player = new Player(startX, startY, this.tileSize, this.playerFrames, this.playerMapping, this.gameState);
    this.gameContainer.addChild(this.player.sprite);
  }
}
