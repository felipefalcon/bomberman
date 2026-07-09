// Tileset loader for ground, walls, and crate tiles
// Loads a tileset image and slices it into 16x16 tiles

import * as PIXI from 'pixi.js';

export async function loadTilesetTiles(url = `${import.meta.env.BASE_URL}assets/1156554.png`) {
  const tileSize = 16;

  // load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load tileset at ' + url));
  });

  // draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Don't apply color-key transparency to tileset - preserve original colors

  const cols = Math.floor(img.width / tileSize);
  const rows = Math.floor(img.height / tileSize);

  const sheetTexture = PIXI.Texture.from(canvas);
  if (sheetTexture.source) {
    sheetTexture.source.scaleMode = 'nearest';
  }

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

  console.log('tilesetLoader: loaded tileset', { width: img.width, height: img.height, cols, rows, frames: frames.length });
  return { frames, cols, rows, mapping };
}
