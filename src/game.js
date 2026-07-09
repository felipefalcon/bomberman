import * as PIXI from 'pixi.js';
import { TileMap } from './map.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { loadPlayerSprites } from './playerSprite.js';
import { loadEnemySprites } from './enemySprite.js';
import { loadBombSprite } from './bombLoader.js';
import { AnimationDebugger } from './animationDebugger.js';

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.tileSize = 32;
    this.mapCols = 17;
    this.mapRows = 13;
    this.keys = {};
    this.bombFuseTicks = 180; // 3 seconds at 60 FPS
    this.lastZ = false;
    this.bombs = [];
    this.explosions = [];
    this.destroyingBlocks = []; // Blocks being animated during destruction
    this.monsters = [];
    this.livesText = null;
    this.playerFrames = null;
    this.playerMapping = null;
    this.enemyFrames = null;
    this.enemyMapping = null;
    this.bombFrames = null;
    this.bombMapping = null;
    this.debugger = null;
  }

  start() {
    this.map = new TileMap(this.app, this.tileSize, this.mapCols, this.mapRows);
    this.stage.addChild(this.map.container);

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
        this.stage.addChild(this.player.sprite);
      })
      .catch((err) => {
        console.warn('Could not load player spritesheet, using placeholder. Error:', err);
        this.player = new Player(startX, startY, this.tileSize);
        this.stage.addChild(this.player.sprite);
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

    Promise.all([playerPromise, enemyPromise, bombPromise]).then(() => {
      console.log('Game: All spritesheets loaded');
      // Debugger disabled for now
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
    this.stage.addChild(bomb.sprite);
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
      this.stage.addChild(monster.sprite);
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
    this.stage.removeChild(bomb.sprite);

    const center = { tx: bomb.tx, ty: bomb.ty, isCenter: true };
    this._createExplosion(center);
    this._destroyTileAt(center.tx, center.ty);

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const dir of directions) {
      const tx = bomb.tx + dir.dx;
      const ty = bomb.ty + dir.dy;
      if (!this.map.isWall(tx, ty)) {
        this._createExplosion({ tx, ty, isCenter: false });
        this._destroyTileAt(tx, ty);
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
      
      // Remove any explosion on this tile to prevent further damage
      this.explosions = this.explosions.filter(exp => !(exp.tx === tx && exp.ty === ty));
    }
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
    this.stage.addChild(explosion.sprite);
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
      if (explosion.timer <= 0) {
        expire.push(explosion);
      }
    }
    for (const explosion of expire) {
      this.stage.removeChild(explosion.sprite);
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
        this.stage.removeChild(block.sprite);
        toRemove.push(block);
      }
    }
    
    // Remove completed animations
    this.destroyingBlocks = this.destroyingBlocks.filter(b => !toRemove.includes(b));
  }

  _updateMonsters(delta) {
    for (const monster of this.monsters.slice()) {
      monster.update(delta, this.map, this.bombs);
      if (this.player && monster.isOnTile(Math.floor(this.player.sprite.x / this.tileSize), Math.floor(this.player.sprite.y / this.tileSize))) {
        if (!monster.lastPlayerTouch) {
          monster.lastPlayerTouch = true;
          this.player.takeDamage();
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
    this.stage.removeChild(monster.sprite);
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
    this.stage.addChild(gameOver);
    this.app.ticker.stop();
  }
}

