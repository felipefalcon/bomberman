// Enemy spritesheet loader
// Loads enemy spritesheet and creates animation frames

import * as PIXI from 'pixi.js';

export async function loadEnemySprites(url = `${import.meta.env.BASE_URL}assets/enemy_1.png`, tileSize = 32) {
  // load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load enemy spritesheet at ' + url));
  });

  // draw to offscreen canvas to inspect pixels and apply color-key transparency
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // detect background color from top-left pixel and make it transparent
  const bgData = ctx.getImageData(0, 0, 1, 1).data;
  const bgColor = { r: bgData[0], g: bgData[1], b: bgData[2], a: bgData[3] };
  const tolerance = 45;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = Math.abs(pixels[i] - bgColor.r);
    const dg = Math.abs(pixels[i + 1] - bgColor.g);
    const db = Math.abs(pixels[i + 2] - bgColor.b);
    const da = Math.abs(pixels[i + 3] - bgColor.a);
    if (dr + dg + db + da < tolerance) {
      pixels[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

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
