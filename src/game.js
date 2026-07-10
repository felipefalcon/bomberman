import * as PIXI from 'pixi.js';
import { TileMap } from './map.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { Powerup } from './powerup.js';
import { loadPlayerSprites } from './playerSprite.js';
import { loadEnemySprites } from './enemySprite.js';
import { loadBombSprite } from './bombLoader.js';
import { loadItemSprites } from './itemsLoader.js';
import { AnimationDebugger } from './animationDebugger.js';
import { AudioManager } from './audioManager.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.tileSize = 32;
    this.mapCols = 17;
    this.mapRows = 11;
    this.keys = {};
    this.bombFuseTicks = 180; // 3 seconds at 60 FPS
    this.lastZ = false;
    this.bombs = [];
    this.explosions = [];
    this.destroyingBlocks = []; // Blocks being animated during destruction
    this.powerups = [];
    this.monsters = [];
    this.livesText = null;
    this.playerFrames = null;
    this.playerMapping = null;
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.bombFrames = null;
    this.bombMapping = null;
    this.itemFrames = null;
    this.itemMapping = null;
    this.debugger = null;
    this.audioManager = new AudioManager();
  }

  start() {
    this.gameContainer = new PIXI.Container();
    this.gameContainer.y = this.tileSize; // offset down by 1 tile for HUD
    this.stage.addChild(this.gameContainer);

    this.map = new TileMap(this.app, this.tileSize, this.mapCols, this.mapRows);
    this.gameContainer.addChild(this.map.container);

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

    this.livesText = new PIXI.BitmapText({
      text: 'Lives: 3',
      style: {
        fontFamily: 'HUDFont',
        fontSize: 8,
        fill: 0xffffff,
      },
      roundPixels: true,
    });
    this.livesText.x = 6;
    this.livesText.y = 6;
    this.stage.addChild(this.livesText);

    // simple keyboard state
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // place player near top-left free tile
    const startX = this.tileSize * 1.5;
    const startY = this.tileSize * 1.5;

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
        this._spawnMonsters(3);
      } catch (err) {
        console.warn('Could not load enemy spritesheet, using placeholder. Error:', err);
        this.enemyFrames = null;
        this.enemyMapping = null;
      }
    });

    const bombPromise = loadBombSprite()
      .then(({ frames, mapping }) => {
        this.bombFrames = frames;
        this.bombMapping = mapping;
        console.log('Game: Bomb sprite loaded');
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

    if (this.player) {
      this.player.update(tickDelta, this.keys, this.map, this.bombs);
      this._processBombInput();
    }
    this._updateBombs(tickDelta);
    this._updateDestroyingBlocks(tickDelta);
    this._updatePowerups(tickDelta);
    this._updateMonsters(tickDelta);
    this._updateExplosions(tickDelta);
  }

  _processBombInput() {
    const zPressed = !!this.keys['z'];
    if (zPressed && !this.lastZ) {
      this._placeBomb();
    }
    this.lastZ = zPressed;
  }

  _placeBomb() {
    // Check if player has reached max bomb limit
    if (this.player.activeBombs >= this.player.maxBombs) return;
    
    const tx = Math.floor(this.player.sprite.x / this.tileSize);
    const ty = Math.floor(this.player.sprite.y / this.tileSize);
    if (this.map.isBlocked(tx, ty)) return;
    if (this.bombs.some((b) => b.tx === tx && b.ty === ty)) return;

    const bomb = {
      tx,
      ty,
      timer: this.bombFuseTicks,
      sprite: this._createBombSprite(tx, ty),
    };
    this.bombs.push(bomb);
    this.player.activeBombs += 1;
    this.gameContainer.addChild(bomb.sprite);
  }

  _createBombSprite(tx, ty) {
    let sprite;
    
    if (this.bombFrames && this.bombFrames.length > 0 && this.bombMapping?.bomb) {
      // Use animated sprite with ping-pong animation
      const frameIndices = this.bombMapping.bomb;
      const textures = frameIndices.map(i => this.bombFrames[i]).filter(Boolean);
      
      if (textures.length > 0) {
        sprite = new PIXI.AnimatedSprite(textures);
        sprite.animationSpeed = 0.15;
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
      
      // Play explosion sound early (when timer reaches ~40 ticks before explosion)
      if (bomb.timer <= 40 && !bomb.soundPlayed) {
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
        if (distanceFromStart < 6) continue;
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
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.gameContainer.removeChild(bomb.sprite);
    
    // Decrease active bomb count
    if (this.player && this.player.activeBombs > 0) {
      this.player.activeBombs -= 1;
    }

    const center = { tx: bomb.tx, ty: bomb.ty, isCenter: true };
    this._createExplosion(center);
    this._destroyTileAt(center.tx, center.ty);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    
    const range = this.player?.explosionRange || 1;
    const canPierce = this.player?.canPierceBlocks || false;
    
    for (const dir of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = bomb.tx + dir.dx * i;
        const ty = bomb.ty + dir.dy * i;
        
        if (this.map.isWall(tx, ty)) break; // Wall always stops explosion
        
        const isBlock = this.map.isDestructible(tx, ty);
        
        this._createExplosion({ tx, ty, isCenter: false });
        this._destroyTileAt(tx, ty);
        
        // If not piercing and hit a block, stop here
        if (isBlock && !canPierce) {
          break;
        }
        // If piercing, explosion continues through all blocks
      }
    }
  }

  _destroyTileAt(tx, ty) {
    if (this.map.isDestructible(tx, ty)) {
      const sprite = this.map.destroyTile(tx, ty);
      
      // Add to destroying blocks for animation
      if (sprite) {
        this.destroyingBlocks.push({
          sprite: sprite,
          duration: 15, // animation duration in ticks
          elapsed: 0,
          originalScale: sprite.scale.x
        });
      }
      
      // Chance to spawn a powerup
      this._trySpawnPowerup(tx, ty);
      
      // Remove any explosion on this tile to prevent further damage
      this.explosions = this.explosions.filter(exp => !(exp.tx === tx && exp.ty === ty));
    }
  }

  _trySpawnPowerup(tx, ty) {
    // 30% chance to spawn a powerup when a block is destroyed
    if (Math.random() > 0.3) return;
    if (!this.itemFrames || !this.itemMapping) return;
    
    const powerupTypes = Object.keys(this.itemMapping);
    const randomType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
    const frameIndex = this.itemMapping[randomType];
    
    const powerup = new Powerup(tx, ty, this.tileSize, randomType, this.itemFrames[frameIndex]);
    this.powerups.push(powerup);
    this.gameContainer.addChild(powerup.sprite);
  }

  _createExplosion(cell) {
    const explosion = {
      tx: cell.tx,
      ty: cell.ty,
      timer: 20,
      hasDamagedMonsters: false,
      sprite: this._createExplosionSprite(cell.tx, cell.ty, cell.isCenter),
    };
    this.explosions.push(explosion);
    this.gameContainer.addChild(explosion.sprite);
  }

  _createExplosionSprite(tx, ty, isCenter = false) {
    const container = new PIXI.Container();
    const tileSize = this.tileSize;
    
    // Position container at the tile
    container.x = tx * tileSize;
    container.y = ty * tileSize;
    
    // Create single fire layer at this tile only, centered
    const gfx = new PIXI.Graphics();
    gfx.x = tileSize / 2;
    gfx.y = tileSize / 2;
    container.addChild(gfx);

    // Animation state
    container.userData = {
      animFrame: 0,
      sprites: [gfx],
      isCenter: isCenter
    };

    return container;
  }

  _updateExplosions(delta) {
    const expire = [];
    for (const explosion of this.explosions) {
      explosion.timer -= delta;
      
      // Update explosion animation
      const userData = explosion.sprite.userData;
      userData.animFrame += 0.15; // Animation speed
      
      // Draw animated fire
      for (const gfx of userData.sprites) {
        gfx.clear();
        
        // Vary size and color based on animation frame
        const frame = Math.floor(userData.animFrame) % 3;
        const baseSize = this.tileSize * 0.8;
        let size = baseSize + Math.sin(userData.animFrame * 0.3) * (baseSize * 0.15);
        
        // Color progression: yellow -> orange -> red
        let color;
        if (frame === 0) color = 0xFFFF00; // Yellow
        else if (frame === 1) color = 0xFF8800; // Orange
        else color = 0xFF3300; // Red
        
        // All explosions: pixelated squares
        gfx.rect(-size / 2, -size / 2, size, size);
        gfx.fill({ color: color, alpha: 0.9 });
        
        // Add glow effect
        const glowSize = size * 1.3;
        gfx.rect(-glowSize / 2, -glowSize / 2, glowSize, glowSize);
        gfx.fill({ color: color, alpha: 0.3 });
      }
      
      // Play damage warning sound 30 ticks after explosion appears
      if (this.player && !explosion.soundPlayedForPlayer && explosion.timer <= 30 && this._isPlayerOnTile(explosion.tx, explosion.ty)) {
        explosion.soundPlayedForPlayer = true;
        this.audioManager.playSoundEffect('damage');
      }
      
      if (this.player && !explosion.hasDamagedPlayer && this._isPlayerOnTile(explosion.tx, explosion.ty)) {
        explosion.hasDamagedPlayer = true;
        this.player.takeDamage();
        this._refreshLivesText();
        if (this.player.lives <= 0) {
          this._handlePlayerDeath();
        }
      }
      if (!explosion.hasDamagedMonsters) {
        const hitMonsters = this.monsters.filter((monster) => monster.isOnTile(explosion.tx, explosion.ty));
        if (hitMonsters.length > 0) {
          explosion.hasDamagedMonsters = true;
          for (const monster of hitMonsters) {
            if (!monster.takeDamage()) {
              this._removeMonster(monster);
            }
          }
        }
      }
      
      // Check for powerup collision
      const hitPowerups = this.powerups.filter((powerup) => powerup.isOnTile(explosion.tx, explosion.ty));
      for (const powerup of hitPowerups) {
        this.gameContainer.removeChild(powerup.sprite);
        this.powerups = this.powerups.filter((p) => p !== powerup);
      }
      
      if (explosion.timer <= 0) {
        expire.push(explosion);
      }
    }
    for (const explosion of expire) {
      this.gameContainer.removeChild(explosion.sprite);
      this.explosions = this.explosions.filter((e) => e !== explosion);
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
    const toRemove = [];
    
    for (const powerup of this.powerups) {
      powerup.update(delta);
      
      // Check collision with player
      if (this.player && powerup.isOnTile(
        Math.floor(this.player.sprite.x / this.tileSize),
        Math.floor(this.player.sprite.y / this.tileSize)
      )) {
        this._applyPowerup(this.player, powerup.type);
        toRemove.push(powerup);
        this.gameContainer.removeChild(powerup.sprite);
      }
    }
    
    // Remove collected powerups
    this.powerups = this.powerups.filter(p => !toRemove.includes(p));
  }

  _applyPowerup(player, type) {
    console.log(`Player collected: ${type}`);
    
    switch(type) {
      case 'speed':
        player.speed *= 1.2; // 20% speed boost
        break;
      case 'bomb':
        player.maxBombs += 1;
        break;
      case 'range':
        player.explosionRange += 1;
        break;
      case 'pierce':
        player.canPierceBlocks = true;
        break;
      case 'shield':
        player.hasShield = true;
        break;
      case 'detonator':
        player.hasDetonator = true;
        break;
    }
  }

  _updateMonsters(delta) {
    for (const monster of this.monsters.slice()) {
      monster.update(delta, this.map, this.bombs);
      if (this.player && monster.isOnTile(Math.floor(this.player.sprite.x / this.tileSize), Math.floor(this.player.sprite.y / this.tileSize))) {
        if (!monster.lastPlayerTouch) {
          monster.lastPlayerTouch = true;
          this.player.takeDamage();
          this.audioManager.playSoundEffect('damage');
          this._refreshLivesText();
          if (this.player.lives <= 0) {
            this._handlePlayerDeath();
          }
        }
      } else {
        monster.lastPlayerTouch = false;
      }
    }
  }

  _removeMonster(monster) {
    this.gameContainer.removeChild(monster.sprite);
    this.monsters = this.monsters.filter((m) => m !== monster);
  }

  _isPlayerOnTile(tx, ty) {
    const playerTx = Math.floor(this.player.sprite.x / this.tileSize);
    const playerTy = Math.floor(this.player.sprite.y / this.tileSize);
    return playerTx === tx && playerTy === ty;
  }

  _refreshLivesText() {
    if (!this.livesText || !this.player) return;
    this.livesText.text = `Lives: ${this.player.lives}`;
  }

  _handlePlayerDeath() {
    this.audioManager.stop(); // Stop background music
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

