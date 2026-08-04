// Player spritesheet loader temporarily disabled.
// Keep this file minimal and syntactically safe so Vite import analysis won't fail.

import {
  applyTopLeftColorKeyTransparency,
  drawImageToCanvas,
  loadImage,
  sliceTextureGrid,
} from './spritesheetLoader.js';

// Load spritesheet from public path (e.g. /assets/player-spritesheet.png),
// slice it into tileSize grid, detect non-empty tiles and return frames + mapping.
export async function loadPlayerSprites(url = `${import.meta.env.BASE_URL}assets/player-spritesheet.png`, tileSize = 32) {
  const img = await loadImage(url);
  const { canvas, ctx } = drawImageToCanvas(img);
  applyTopLeftColorKeyTransparency(ctx, canvas.width, canvas.height, 45);
  const { frames, cols, rows } = sliceTextureGrid(canvas, tileSize, tileSize);

  // Spritesheet layout:
  // row 0 = walkDown (5 frames)
  // row 1 = walkRight (5 frames)
  // row last = walkUp (5 frames)
  // walkLeft uses walkRight frames mirrored
  const mapping = {};
  const frameCountPerRow = 5;
  const hasUpRow = rows >= 3;

  const downFrames = Array.from({ length: frameCountPerRow }, (_, i) => i);
  const rightFrames = Array.from({ length: frameCountPerRow }, (_, i) => cols + i);
  const upFrames = hasUpRow
    ? Array.from({ length: frameCountPerRow }, (_, i) => (rows - 1) * cols + i)
    : [];

  mapping.walkDown = downFrames;
  mapping.idleDown = [downFrames[2]];

  mapping.walkRight = rightFrames;
  mapping.idleRight = [rightFrames[2]];

  mapping.walkLeft = rightFrames;
  mapping.idleLeft = [rightFrames[2]];

  mapping.walkUp = hasUpRow ? upFrames : [];
  mapping.idleUp = hasUpRow ? [upFrames[2]] : [];

  return { frames, cols, rows, mapping };
}
