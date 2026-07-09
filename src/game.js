import * as PIXI from 'pixi.js';
import { TileMap } from './map.js';
import { Player } from './player.js';
import { loadPlayerSprites } from './playerSprite.js';
import { createSpriteDebugger } from './spriteDebugger.js';

const ENABLE_SPRITE_DEBUGGER = false;

export class Game {
  constructor(app) {
    this.app = app;
    this.stage = app.stage;
    this.tileSize = 32;
    this.keys = {};
  }

  start() {
    this.map = new TileMap(this.app, this.tileSize, 13, 11);
    this.stage.addChild(this.map.container);

    // simple keyboard state
    window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    // place player near top-left free tile
    const startX = this.tileSize * 1.5;
    const startY = this.tileSize * 1.5;

    // Try to load spritesheet from public assets (place player-spritesheet.png in public/assets)
    const sheetUrl = '/assets/player-spritesheet.png';
    loadPlayerSprites(sheetUrl, this.tileSize)
      .then(({ frames, mapping: detectedMapping }) => {
        // try to load saved mapping from localStorage
        let mapping = detectedMapping;
        try {
          const raw = localStorage.getItem('playerMapping');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              mapping = parsed;
              console.log('Loaded player mapping from localStorage');
            }
          }
        } catch (e) {
          console.warn('Failed to load saved mapping from localStorage', e);
        }

        this.player = new Player(startX, startY, this.tileSize, frames, mapping);
        this.stage.addChild(this.player.sprite);

        if (ENABLE_SPRITE_DEBUGGER) {
          try {
            const dbg = createSpriteDebugger(frames, mapping, (newMapping) => {
              // update player's mapping live and persist
              this.player.mapping = newMapping;
              try {
                localStorage.setItem('playerMapping', JSON.stringify(newMapping));
              } catch (e) {
                console.warn('Failed to save player mapping to localStorage', e);
              }
              console.log('Updated mapping', newMapping);
            });
            this.stage.addChild(dbg.container);
          } catch (e) {
            console.warn('Sprite debugger failed to initialize', e);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load spritesheet from', sheetUrl, 'using placeholder. Error:', err);
        this.player = new Player(startX, startY, this.tileSize);
        this.stage.addChild(this.player.sprite);
      });

    this.app.ticker.add(this.update.bind(this));
  }

  update(delta) {
    if (this.player) this.player.update(delta, this.keys, this.map);
  }
}
