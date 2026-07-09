// Player spritesheet loader temporarily disabled.
// Keep this file minimal and syntactically safe so Vite import analysis won't fail.

import * as PIXI from 'pixi.js';

// Load spritesheet from public path (e.g. /assets/player-spritesheet.png),
// slice it into tileSize grid, detect non-empty tiles and return frames + mapping.
export async function loadPlayerSprites(url = '/assets/player-spritesheet.png', tileSize = 32) {
  // load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load spritesheet at ' + url));
  });

  // draw to offscreen canvas to inspect pixels
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const cols = Math.floor(img.width / tileSize);
  const rows = Math.floor(img.height / tileSize);

  const base = new PIXI.BaseTexture(img);
  base.scaleMode = PIXI.SCALE_MODES.NEAREST;
  const frames = [];
  const nonEmpty = [];

  // helper to test if a tile is non-empty by sampling pixels
  function tileNonEmpty(tx, ty) {
    const startX = tx * tileSize;
    const startY = ty * tileSize;
    // sample a small grid inside the tile
    const step = Math.max(2, Math.floor(tileSize / 8));
    const sampleSize = 0;
    const data = ctx.getImageData(startX, startY, tileSize, tileSize).data;
    // compare to the pixel at (0,0) which is likely background
    const r0 = data[0], g0 = data[1], b0 = data[2], a0 = data[3];
    let diff = 0;
    for (let y = 0; y < tileSize; y += step) {
      for (let x = 0; x < tileSize; x += step) {
        const idx = (y * tileSize + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
        // if alpha significantly different or color different
        if (Math.abs(r - r0) > 8 || Math.abs(g - g0) > 8 || Math.abs(b - b0) > 8 || Math.abs(a - a0) > 16) {
          diff++;
          if (diff > 2) return true;
        }
      }
    }
    return false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rect = new PIXI.Rectangle(c * tileSize, r * tileSize, tileSize, tileSize);
      frames.push(new PIXI.Texture(base, rect));
      const isNonEmpty = tileNonEmpty(c, r);
      nonEmpty.push(isNonEmpty);
    }
  }

  // Build simple mapping: group non-empty frames per row and assign directions
  const mapping = {};
  const directions = ['Down', 'Left', 'Right', 'Up'];
  for (let r = 0; r < rows && r < directions.length; r++) {
    const rowFrames = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (nonEmpty[idx]) rowFrames.push(idx);
    }
    if (rowFrames.length > 0) {
      mapping['walk' + directions[r]] = rowFrames;
      mapping['idle' + directions[r]] = [rowFrames[Math.floor(rowFrames.length / 2)]];
    }
  }

  // fallback: if no mapping detected, use first few frames
  if (Object.keys(mapping).length === 0) {
    mapping.walkDown = [0,1,2].filter(i => i < frames.length);
    mapping.idleDown = [mapping.walkDown[0] || 0];
  }

  console.log('playerSprite: loaded spritesheet', { width: img.width, height: img.height, cols, rows, frames: frames.length });
  return { frames, cols, rows, mapping };
}
