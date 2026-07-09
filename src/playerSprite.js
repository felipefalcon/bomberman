import * as PIXI from 'pixi.js';

// Load a spritesheet image and slice it into 32x32 frames at runtime.
// Returns { frames: Texture[], cols, rows, mapping }
export function loadPlayerSprites(url = '/assets/player-spritesheet.png', tileSize = 32) {
  return new Promise((resolve, reject) => {
    const loader = PIXI.Loader.shared;
    // use a fixed key so repeated calls reuse the resource
    const key = 'player_spritesheet';
    if (!loader.resources[key]) loader.add(key, url);

    loader.load((_, resources) => {
      const res = resources[key];
      if (!res || !res.texture) return reject(new Error('Failed to load spritesheet: ' + url));

      const base = res.texture.baseTexture;
      const bw = base.width;
      const bh = base.height;
      const cols = Math.floor(bw / tileSize);
      const rows = Math.floor(bh / tileSize);
      const frames = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const rect = new PIXI.Rectangle(c * tileSize, r * tileSize, tileSize, tileSize);
          frames.push(new PIXI.Texture(base, rect));
        }
      }

      // Default mapping heuristic — may need tuning per spritesheet layout
      // These indices assume the common layout: rows of direction animations near the top.
      const mapping = {
        walkDown: [0, 1, 2],
        walkLeft: [3, 4, 5],
        walkRight: [6, 7, 8],
        walkUp: [9, 10, 11],
        idleDown: [1],
        idleLeft: [4],
        idleRight: [7],
        idleUp: [10],
        placeBomb: [12],
        death: [13, 14, 15, 16]
      };

      resolve({ frames, cols, rows, mapping });
    });
  });
}
