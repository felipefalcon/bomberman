// Tileset loader for ground, walls, and crate tiles
// Loads a tileset image and slices it into 16x16 tiles

import * as PIXI from 'pixi.js';

export async function loadTilesetTiles(url = `${import.meta.env.BASE_URL}assets/1156554.png`) {
  const tileSize = 16;

  try {
    const sheetTexture = await PIXI.Assets.load(url);
    
    if (!sheetTexture) {
      console.warn('Tileset texture not loaded');
      return { frames: [], cols: 0, rows: 0, mapping: {} };
    }

    // Set pixel-perfect rendering
    if (sheetTexture.source) {
      sheetTexture.source.scaleMode = 'nearest';
    }

    const cols = Math.floor(sheetTexture.width / tileSize);
    const rows = Math.floor(sheetTexture.height / tileSize);

    const frames = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = new PIXI.Rectangle(c * tileSize, r * tileSize, tileSize, tileSize);
        frames.push(new PIXI.Texture({ source: sheetTexture.source, frame: rect }));
      }
    }

  // Tileset layout (16x16):
  // First row/col/last row/col = border walls
  // Rest = ground, crates, and obstacles
  const mapping = {
    // Corner tiles (0, maxCol, maxRow, maxRow*cols)
    cornerTopLeft: 0,
    cornerTopRight: cols - 1,
    cornerBottomLeft: (rows - 1) * cols,
    cornerBottomRight: rows * cols - 1,
    
    // Border walls
    wallTopRow: Array.from({ length: cols }, (_, i) => i),
    wallBottomRow: Array.from({ length: cols }, (_, i) => (rows - 1) * cols + i),
    wallLeftCol: Array.from({ length: rows }, (_, i) => i * cols),
    wallRightCol: Array.from({ length: rows }, (_, i) => i * cols + (cols - 1)),
    
    // All frames for general use
    all: Array.from({ length: frames.length }, (_, i) => i),
  };

    console.log('tilesetLoader: loaded tileset', { width: sheetTexture.width, height: sheetTexture.height, cols, rows, frames: frames.length });
    return { frames, cols, rows, mapping };
  } catch (error) {
    console.error('Error loading tileset:', error);
    return { frames: [], cols: 0, rows: 0, mapping: {} };
  }
}
