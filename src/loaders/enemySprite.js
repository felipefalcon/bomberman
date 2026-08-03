// Enemy spritesheet loader
// Loads enemy spritesheet and creates animation frames

import {
  applyTopLeftColorKeyTransparency,
  drawImageToCanvas,
  loadImage,
  sliceTextureGrid,
} from './spritesheetLoader.js';

export async function loadEnemySprites(url = `${import.meta.env.BASE_URL}assets/enemy_1.png`, tileSize = 32) {
  const img = await loadImage(url);
  const { canvas, ctx } = drawImageToCanvas(img);
  applyTopLeftColorKeyTransparency(ctx, canvas.width, canvas.height, 45);
  const { frames, cols, rows } = sliceTextureGrid(canvas, tileSize, tileSize);

  // Spritesheet layout:
  // row 0 = walkDown (5 frames)
  // row 1 = walkRight (5 frames)
  // row 2 = walkUp (5 frames)
  // row 3 = walkLeft is mirrored from walkRight (flip with scale)
  const mapping = {};
  const frameCountPerRow = 5;

  const downFrames = Array.from({ length: frameCountPerRow }, (_, i) => i);
  const rightFrames = Array.from({ length: frameCountPerRow }, (_, i) => cols + i);
  const upFrames = Array.from({ length: frameCountPerRow }, (_, i) => (cols * 2) + i);

  mapping.walkDown = downFrames;
  mapping.idleDown = [downFrames[2]];

  mapping.walkRight = rightFrames;
  mapping.idleRight = [rightFrames[2]];

  mapping.walkUp = upFrames;
  mapping.idleUp = [upFrames[2]];

  // walkLeft uses walkRight frames but flipped with scale.x
  mapping.walkLeft = rightFrames;
  mapping.idleLeft = [rightFrames[2]];

  console.log('enemySprite: loaded enemy spritesheet', { width: img.width, height: img.height, cols, rows, frames: frames.length });
  return { frames, mapping };
}
