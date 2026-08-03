import * as PIXI from 'pixi.js';
import { GAME_CONFIG, TILE_TYPES } from '../config/Constants.js';
import { createSeededRandom } from '../utils/seededRandom.js';
import { loadTilesetTiles } from '../loaders/tilesetLoader.js';
import { loadBlockTexture } from '../loaders/blockLoader.js';
import { loadPillarTexture } from '../loaders/pillarLoader.js';

export class TileMap {
  constructor(app, tileSize = GAME_CONFIG.TILE_SIZE, cols = GAME_CONFIG.MAP_COLS, rows = GAME_CONFIG.MAP_ROWS) {
    this.app = app;
    this.tileSize = tileSize;
    this.cols = cols;
    this.rows = rows;
    this.container = new PIXI.Container();
    this.tiles = [];
    this.tilesetFrames = null;
    this.tilesetMapping = null;
    this.blockTexture = null;
    this.pillarTexture = null;
    this.debugMode = false;
    this.spriteMap = new Map(); // Track block/pillar sprites by tile position
    this.random = createSeededRandom(GAME_CONFIG.RNG_SEED);

    this._initPromise = this._init();
  }

  async _init() {
    try {
      const tileset = await loadTilesetTiles();
      this.tilesetFrames = tileset.frames;
      this.tilesetMapping = tileset.mapping;
    } catch (err) {
      console.error('Failed to load tileset:', err);
      this.tilesetFrames = null;
    }

    try {
      this.blockTexture = await loadBlockTexture();
    } catch (err) {
      console.error('Failed to load block texture:', err);
      this.blockTexture = null;
    }

    try {
      this.pillarTexture = await loadPillarTexture();
    } catch (err) {
      console.error('Failed to load pillar texture:', err);
      this.pillarTexture = null;
    }

    this._generate();
  }

  _generate() {
    for (let y = 0; y < this.rows; y++) {
      this.tiles[y] = [];
      for (let x = 0; x < this.cols; x++) {
        // simple rules: border walls + pillars on even coords
        let t = TILE_TYPES.FLOOR;
        if (x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1) t = TILE_TYPES.WALL;
        if (x % 2 === 0 && y % 2 === 0) t = TILE_TYPES.WALL;

        // leave open spaces near the start area
        const isStartSafe = (x === 1 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2);
        if (t === TILE_TYPES.FLOOR && !isStartSafe && this.random() < GAME_CONFIG.MAP_DESTRUCTIBLE_CHANCE) {
          t = TILE_TYPES.DESTRUCTIBLE;
        }

        // Use tileset/block/pillar texture if available, otherwise fallback to graphics
        let sprite = null;
        
        // Check if it's a pilar (internal wall)
        const isBorderWall = (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1);
        const isPilar = t === TILE_TYPES.WALL && !isBorderWall;
        const isCrate = t === TILE_TYPES.DESTRUCTIBLE;

        // Always render ground/floor first
        let frameIndex = 0;
        if (t === TILE_TYPES.WALL) {
          // Border walls (cantos e paredes)
          if (x === 0 && y === 0) {
            frameIndex = 1; // canto topo-esquerdo
          } else if (x === this.cols - 1 && y === 0) {
            frameIndex = 4; // canto topo-direito
          } else if (x === 0 && y === this.rows - 1) {
            frameIndex = 25; // canto fundo-esquerdo
          } else if (x === this.cols - 1 && y === this.rows - 1) {
            frameIndex = 28; // canto fundo-direito
          } else if (y === 0) {
            frameIndex = 2; // parede topo
          } else if (x === 0) {
            frameIndex = 13; // parede esquerda
          } else if (y === this.rows - 1) {
            frameIndex = 26; // parede fundo
          } else if (x === this.cols - 1) {
            frameIndex = 16; // parede direita
          } else {
            frameIndex = 8; // fallback: piso para pilares internos
          }
        } else if (t === TILE_TYPES.DESTRUCTIBLE) {
          frameIndex = 8; // crate: render floor under it
        } else {
          frameIndex = 8; // chão normal
        }

        if (this.tilesetFrames && this.tilesetFrames.length > 0) {
          sprite = new PIXI.Sprite(this.tilesetFrames[frameIndex]);
          sprite.x = x * this.tileSize;
          sprite.y = y * this.tileSize;
          sprite.scale.set(this.tileSize / 16, this.tileSize / 16);
          sprite.roundPixels = true;
          this.container.addChild(sprite);
        }

        // Then render pillar or block on top of the ground
        if (isPilar && this.pillarTexture) {
          sprite = new PIXI.Sprite(this.pillarTexture);
          sprite.anchor.set(0, 0);
          sprite.position.set(x * this.tileSize, y * this.tileSize);
          sprite.scale.set(2, 2);
          sprite.roundPixels = true;
          this.container.addChild(sprite);
          this.spriteMap.set(`${x},${y}`, sprite); // Track pillar sprite
        } else if (isCrate && this.blockTexture) {
          sprite = new PIXI.Sprite(this.blockTexture);
          sprite.anchor.set(0, 0);
          sprite.position.set(x * this.tileSize, y * this.tileSize);
          sprite.scale.set(2, 2);
          sprite.roundPixels = true;
          this.container.addChild(sprite);
          this.spriteMap.set(`${x},${y}`, sprite); // Track block sprite
        }

        // Debug: Renderizar número do frame
        if (this.debugMode && frameIndex !== undefined) {
          const debugText = new PIXI.Text({
            text: frameIndex.toString(),
            style: {
              fontFamily: 'Arial',
              fontSize: 8,
              fill: 0xffffff,
              stroke: { color: 0x000000, width: 1 },
            },
          });
          debugText.x = x * this.tileSize + 2;
          debugText.y = y * this.tileSize + 2;
          this.container.addChild(debugText);
        }

        this.tiles[y][x] = t;
      }
    }
  }

  isWall(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return true;
    return this.tiles[ty][tx] === TILE_TYPES.WALL;
  }

  isBlocked(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return true;
    return this.tiles[ty][tx] === TILE_TYPES.WALL || this.tiles[ty][tx] === TILE_TYPES.DESTRUCTIBLE;
  }

  isDestructible(tx, ty) {
    if (!this._isValidTileCoord(tx, ty)) return false;
    return this.tiles[ty][tx] === TILE_TYPES.DESTRUCTIBLE;
  }

  _isValidTileCoord(tx, ty) {
    return Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  destroyTile(tx, ty) {
    if (!this.isDestructible(tx, ty)) return null;
    
    // Get block sprite if it exists
    const spriteKey = `${tx},${ty}`;
    const blockSprite = this.spriteMap.get(spriteKey);
    
    if (blockSprite) {
      // Remove sprite from container
      this.container.removeChild(blockSprite);
      // Mark as destroyed but keep sprite for animation
      this.spriteMap.delete(spriteKey);
    }
    
    this.tiles[ty][tx] = TILE_TYPES.FLOOR;
    return blockSprite || null; // Return the sprite so caller can apply effects
  }
}
