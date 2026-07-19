import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from './config/Constants.js';
import { TileMap } from './map/TileMap.js';
import { Player } from './entities/Player.js';
import { Monster } from './entities/Monster.js';
import { Powerup } from './entities/Powerup.js';
import { loadPlayerSprites } from './loaders/playerSprite.js';
import { loadEnemySprites } from './loaders/enemySprite.js';
import { loadBombSprite } from './loaders/bombLoader.js';
import { loadItemSprites } from './loaders/itemsLoader.js';
import { AnimationDebugger } from './AnimationDebugger.js';
import { AudioManager } from './managers/AudioManager.js';
import { HudManager } from './managers/HudManager.js';
import { AssetManager } from './engine/AssetManager.js';
import { InputManager } from './managers/InputManager.js';
import { GameState } from './managers/GameState.js';
import { BombSystem } from './systems/BombSystem.js';
import { ExplosionSystem } from './systems/ExplosionSystem.js';
import { PowerupSystem } from './systems/PowerupSystem.js';
import { MonsterSystem } from './systems/MonsterSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { GameEvents } from './engine/EventBus.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    
    // Use config values
    this.tileSize = GAME_CONFIG.TILE_SIZE;
    this.sidebarWidth = GAME_CONFIG.SIDEBAR_WIDTH;
    this.mapCols = GAME_CONFIG.MAP_COLS;
    this.mapRows = GAME_CONFIG.MAP_ROWS;
    
    // Legacy state (will be phased out)
    this.keys = {};
    this.lastZ = false;
    this.destroyingBlocks = [];
    
    // Asset storage
    this.playerFrames = null;
    this.playerMapping = null;
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.bombFrames = null;
    this.bombMapping = null;
    this.itemFrames = null;
    this.itemMapping = null;
    
    // Managers
    this.assetManager = new AssetManager();
    this.inputManager = new InputManager();
    this.gameState = new GameState();
    this.audioManager = new AudioManager();
    
    // Systems (will be initialized in start)
    this.bombSystem = null;
    this.explosionSystem = null;
    this.powerupSystem = null;
    this.monsterSystem = null;
    this.collisionSystem = null;
    
    // Game objects
    this.map = null;
    this.player = null;
    this.hudManager = null;
    this.debugger = null;
  }

  start() {
    this.gameContainer = new PIXI.Container();
    this.gameContainer.x = this.sidebarWidth;
    this.gameContainer.y = this.tileSize; // offset down by 1 tile for HUD
    this.stage.addChild(this.gameContainer);

    // Initialize map
    this.map = new TileMap(this.app, this.tileSize, this.mapCols, this.mapRows);
    this.gameContainer.addChild(this.map.container);

    // Initialize systems
    this.bombSystem = new BombSystem();
    this.bombSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });
    
    this.explosionSystem = new ExplosionSystem();
    this.explosionSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });
    this.explosionSystem.setMap(this.map); // Set map directly for wall/destructible checks
    
    this.powerupSystem = new PowerupSystem();
    this.powerupSystem.setScene({ getContainer: () => this.gameContainer });
    
    this.monsterSystem = new MonsterSystem();
    this.monsterSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });
    
    this.collisionSystem = new CollisionSystem();
    this.collisionSystem.setScene({ map: this.map });

    // Initialize input manager
    this.inputManager.bind();

    // Initialize game state
    this.gameState.initialize();
    
    // Setup event listeners to sync player with game state
    this._setupGameStateListeners();

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

    this.hudManager = new HudManager(this.stage, {
      sidebarWidth: this.sidebarWidth,
      mapCols: this.mapCols,
      mapRows: this.mapRows,
      tileSize: this.tileSize,
      itemFrames: this.itemFrames,
      itemMapping: this.itemMapping,
    });

    // Initialize HUD with default game state values (bomb/range level 1, etc.)
    this.hudManager.updatePowerups(this.gameState.getPlayerState());

    // Legacy keyboard state (will be phased out)
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // place player near top-left free tile
    const startX = this.tileSize * GAME_CONFIG.PLAYER_START_X;
    const startY = this.tileSize * GAME_CONFIG.PLAYER_START_Y;

    // Load both player and enemy spritesheets in parallel
    const playerPromise = loadPlayerSprites(`${import.meta.env.BASE_URL}assets/player-spritesheet.png`, this.tileSize)
      .then(({ frames, mapping }) => {
        this.playerFrames = frames;
        this.playerMapping = mapping;
        console.log('Game: Player spritesheet loaded');
        this.player = new Player(startX, startY, this.tileSize, frames, mapping);
        this.gameContainer.addChild(this.player.sprite);
      })
      .catch((err) => {
        console.warn('Could not load player spritesheet, using placeholder. Error:', err);
        this.player = new Player(startX, startY, this.tileSize);
        this.gameContainer.addChild(this.player.sprite);
      });

    const enemyPromise = this.map._initPromise.then(async () => {
      try {
        const { frames, mapping } = await loadEnemySprites();
        this.enemyFrames = frames;
        this.enemyMapping = mapping;
        console.log('Game: Enemy spritesheet loaded');
        // Pass assets to monster system
        this.monsterSystem.setAssets(frames, mapping);
        this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
      } catch (err) {
        console.warn('Could not load enemy spritesheet, using placeholder. Error:', err);
        this.enemyFrames = null;
        this.enemyMapping = null;
        this.monsterSystem.spawnMonsters(GAME_CONFIG.MONSTER_SPAWN_COUNT);
      }
    });

    const bombPromise = loadBombSprite()
      .then(({ frames, mapping }) => {
        this.bombFrames = frames;
        this.bombMapping = mapping;
        console.log('Game: Bomb sprite loaded');
        // Pass assets to bomb system
        this.bombSystem.setAssets(frames, mapping);
      })
      .catch((err) => {
        console.warn('Could not load bomb sprite, using placeholder. Error:', err);
        this.bombFrames = null;
        this.bombMapping = null;
      });

    const musicPromise = this.audioManager.loadMusic(`${import.meta.env.BASE_URL}assets/18 Where it All Began.mp3`)
      .then(() => {
        console.log('Game: Background music loaded');
      })
      .catch((err) => {
        console.warn('Could not load background music. Error:', err);
      });

    const explosionSoundPromise = this.audioManager.loadSoundEffect('explosion', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (12).wav`)
      .then(() => {
        console.log('Game: Explosion sound loaded');
      })
      .catch((err) => {
        console.warn('Could not load explosion sound. Error:', err);
      });

    const damageSoundPromise = this.audioManager.loadSoundEffect('damage', `${import.meta.env.BASE_URL}assets/SB5 Sound Effects (100).wav`)
      .then(() => {
        console.log('Game: Damage sound loaded');
      })
      .catch((err) => {
        console.warn('Could not load damage sound. Error:', err);
      });

    const gameOverSoundPromise = this.audioManager.loadSoundEffect('gameOver', `${import.meta.env.BASE_URL}assets/10 Bad Luck.mp3`)
      .then(() => {
        console.log('Game: Game Over sound loaded');
      })
      .catch((err) => {
        console.warn('Could not load game over sound. Error:', err);
      });

    const itemsPromise = loadItemSprites()
      .then(({ frames, mapping }) => {
        this.itemFrames = frames;
        this.itemMapping = mapping;
        // Pass assets to powerup system
        this.powerupSystem.setAssets(frames, mapping);
        this.hudManager?.setItemIcons(this.itemFrames, this.itemMapping);
        console.log('Game: Items sprite loaded');
      })
      .catch((err) => {
        console.warn('Could not load items sprite. Error:', err);
        this.itemFrames = null;
        this.itemMapping = null;
      });

    Promise.all([playerPromise, enemyPromise, bombPromise, musicPromise, explosionSoundPromise, damageSoundPromise, gameOverSoundPromise, itemsPromise]).then(() => {
      console.log('Game: All assets loaded');
    });

    this.app.ticker.add(this.update.bind(this));
  }

  update(delta) {
    const tickDelta = typeof delta === 'number' ? delta : delta?.deltaTime ?? 1;

    // Update game state (timer, etc.)
    this.gameState.update(tickDelta);
    this.inputManager.update();

    if (this.player) {
      // Use collision system for player movement
      const bombs = this.bombSystem.getBombs();
      this.player.update(tickDelta, this.keys, this.map, bombs, this.bombSystem);
      this._processBombInput();
    }
    
    // Update systems
    this.bombSystem.update(tickDelta, (bomb) => this._explodeBomb(bomb));
    this.explosionSystem.update(tickDelta, this.player, this.monsterSystem.getMonsters(), this.powerupSystem.getPowerups());
    this.powerupSystem.update(tickDelta, this.player);
    this.monsterSystem.update(tickDelta, this.player, this.bombSystem.getBombs());
    
    // Legacy updates (will be phased out)
    this._updateDestroyingBlocks(tickDelta);
  }

  _processBombInput() {
    const zPressed = !!this.keys['z'];
    if (zPressed && !this.lastZ) {
      this._handleBombAction();
    }
    this.lastZ = zPressed;
  }

  _handleBombAction() {
    const tx = Math.floor(this.player.sprite.x / this.tileSize);
    const ty = Math.floor(this.player.sprite.y / this.tileSize);

    // Check if player has throw_bomb powerup and is standing on a bomb
    if (this.player.hasThrowBomb) {
      const bomb = this.bombSystem.getBombAt(tx, ty);
      if (bomb) {
        // Throw the bomb in player's facing direction
        this._throwBomb(bomb);
        return;
      }
    }

    // Otherwise, place a new bomb
    this.bombSystem.placeBomb(tx, ty, this.player);
  }

  _throwBomb(bomb) {
    // Determine throw direction based on player's facing direction
    let dx = 0, dy = 0;
    switch (this.player._facing) {
      case 'up':
        dy = -1;
        break;
      case 'down':
        dy = 1;
        break;
      case 'left':
        dx = -1;
        break;
      case 'right':
        dx = 1;
        break;
    }

    this.bombSystem.throwBomb(bomb, dx, dy);
  }

  _placeBomb() {
    const tx = Math.floor(this.player.sprite.x / this.tileSize);
    const ty = Math.floor(this.player.sprite.y / this.tileSize);
    this.bombSystem.placeBomb(tx, ty, this.player);
  }

  _createBombSprite(tx, ty) {
    let sprite;
    
    if (this.bombFrames && this.bombFrames.length > 0 && this.bombMapping?.bomb) {
      // Use animated sprite with ping-pong animation
      const frameIndices = this.bombMapping.bomb;
      const textures = frameIndices.map(i => this.bombFrames[i]).filter(Boolean);
      
      if (textures.length > 0) {
        sprite = new PIXI.AnimatedSprite(textures);
        sprite.animationSpeed = GAME_CONFIG.ANIMATION_SPEED;
        sprite.play();
        // Scale from 16x16 to 32x32 (2x scale)
        sprite.scale.set(2);
        sprite.anchor.set(0, 0);
      } else {
        sprite = this._createBombGraphics();
      }
    } else {
      // Fallback to Graphics
      sprite = this._createBombGraphics();
    }
    
    sprite.x = tx * this.tileSize;
    sprite.y = ty * this.tileSize;
    sprite.roundPixels = true;
    return sprite;
  }

  _createBombGraphics() {
    const bomb = new PIXI.Graphics();
    const radius = this.tileSize / 2 - 3;
    bomb.circle(this.tileSize / 2, this.tileSize / 2, radius);
    bomb.fill(0x000000);
    return bomb;
  }

  _updateBombs(delta) {
    const expire = [];
    for (const bomb of this.bombs) {
      bomb.timer -= delta;
      
      // Play explosion sound early before detonation.
      if (bomb.timer <= GAME_CONFIG.EXPLOSION_SOUND_TICKS && !bomb.soundPlayed) {
        bomb.soundPlayed = true;
        this.audioManager.playSoundEffect('explosion');
      }
      
      if (bomb.timer <= 0) {
        expire.push(bomb);
      }
    }
    for (const bomb of expire) {
      this._explodeBomb(bomb);
    }
  }

  _spawnMonsters(count) {
    const spawnTiles = this._findMonsterSpawnTiles(count);
    for (const { tx, ty } of spawnTiles) {
      const monster = new Monster(tx, ty, this.tileSize, this.enemyFrames, this.enemyMapping);
      this.monsters.push(monster);
      this.gameContainer.addChild(monster.sprite);
    }
  }

  _findMonsterSpawnTiles(count) {
    const positions = [];
    for (let ty = 1; ty < this.map.rows - 1; ty++) {
      for (let tx = 1; tx < this.map.cols - 1; tx++) {
        const isStartArea = (tx === 1 && ty === 1) || (tx === 2 && ty === 1) || (tx === 1 && ty === 2);
        if (isStartArea) continue;
        if (this.map.isBlocked(tx, ty)) continue;
        const distanceFromStart = Math.abs(tx - 1) + Math.abs(ty - 1);
        if (distanceFromStart < GAME_CONFIG.MONSTER_START_DISTANCE) continue;
        positions.push({ tx, ty });
      }
    }
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    return positions.slice(0, count);
  }

  _explodeBomb(bomb) {
    // Decrease active bomb count
    if (this.player && this.player.activeBombs > 0) {
      this.player.activeBombs -= 1;
    }

    // Use explosion system for propagation
    this.explosionSystem.processExplosionPropagation(bomb, this.player, (tx, ty) => this._destroyTileAt(tx, ty));
  }

  _destroyTileAt(tx, ty) {
    if (this.map.isDestructible(tx, ty)) {
      const sprite = this.map.destroyTile(tx, ty);
      
      // Add to destroying blocks for animation
      if (sprite) {
        this.destroyingBlocks.push({
          sprite: sprite,
          duration: GAME_CONFIG.BLOCK_DESTRUCTION_DURATION,
          elapsed: 0,
          originalScale: sprite.scale.x
        });
      }
      
      // Use powerup system for spawning
      this.powerupSystem.trySpawnPowerup(tx, ty);
    }
  }

  _updateDestroyingBlocks(delta) {
    const toRemove = [];
    
    for (const block of this.destroyingBlocks) {
      block.elapsed += delta;
      const progress = Math.min(block.elapsed / block.duration, 1);
      
      // Animation: colors change like explosion (yellow -> orange -> red)
      const colorFrame = Math.floor(progress * 3) % 3;
      let color;
      if (colorFrame === 0) color = 0xFFFF00; // Yellow
      else if (colorFrame === 1) color = 0xFF8800; // Orange
      else color = 0xFF3300; // Red
      
      // Apply tint to block
      block.sprite.tint = color;
      
      // Scale effect: grow then shrink
      const scaleFactor = 1 + Math.sin(progress * Math.PI) * 0.3;
      block.sprite.scale.set(block.originalScale * scaleFactor);
      
      // Fade out at the end
      block.sprite.alpha = 1 - (progress * progress); // quadratic fade
      
      if (progress >= 1) {
        // Remove from stage and mark for removal
        this.gameContainer.removeChild(block.sprite);
        toRemove.push(block);
      }
    }
    
    // Remove completed animations
    this.destroyingBlocks = this.destroyingBlocks.filter(b => !toRemove.includes(b));
  }

  _updatePowerups(delta) {
    // This is now handled by PowerupSystem
    // Keeping this method for compatibility during transition
  }

  _updateMonsters(delta) {
    // This is now handled by MonsterSystem
    // Keeping this method for compatibility during transition
  }

  _updateExplosions(delta) {
    // This is now handled by ExplosionSystem
    // Keeping this method for compatibility during transition
  }

  _isPlayerOnTile(tx, ty) {
    const playerTx = Math.floor(this.player.sprite.x / this.tileSize);
    const playerTy = Math.floor(this.player.sprite.y / this.tileSize);
    return playerTx === tx && playerTy === ty;
  }

  _setupGameStateListeners() {
    // Route audio events emitted by systems to the audio manager.
    this.gameState.eventBus.on(GameEvents.AUDIO_PLAY, (data) => {
      if (!data?.type) return;
      this.audioManager.playSoundEffect(data.type);
    });

    // Listen for damage events and apply to actual player
    this.gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'player' && this.player) {
        this.player.takeDamage();
        this._refreshHUD();
        if (this.player.lives <= 0) {
          this._handlePlayerDeath();
        }
      }
    });
    
    // Listen for monster damage events
    this.gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'monster' && data.monster) {
        this.monsterSystem.damageMonster(data.monster);
      }
    });

    // Ensure powerups destroyed by explosion are removed from PowerupSystem state too.
    this.gameState.eventBus.on(GameEvents.EXPLOSION_DAMAGE, (data) => {
      if (data.target === 'powerup' && data.powerup) {
        this.powerupSystem.removePowerup(data.powerup);
      }
    });

    // Monster touch damage uses a separate event and must also sync to player entity
    this.gameState.eventBus.on(GameEvents.MONSTER_DAMAGE_PLAYER, () => {
      if (!this.player) return;
      this.player.takeDamage();
      this._refreshHUD();
      if (this.player.lives <= 0) {
        this._handlePlayerDeath();
      }
    });
  }

  _refreshHUD() {
    if (!this.player) return;
    this.hudManager?.setLives(this.player.lives);
    this.hudManager?.updatePowerups(this.player);
  }

  _refreshTimerText() {
    this.hudManager?.setTimer(this.gameState.getTimeRemaining());
  }

  _handlePlayerDeath() {
    this.audioManager.stop();
    this.audioManager.playSoundEffect('gameOver');
    
    if (this.player) {
      this.player.sprite.tint = 0xff0000;
      this.keys = {};
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
    gameOver.x = (this.tileSize * this.mapCols) / 2;
    gameOver.y = (this.tileSize * this.mapRows) / 2;
    this.gameContainer.addChild(gameOver);
    this.app.ticker.stop();
  }
}

