// Block loader for pillar/internal wall tiles
// Loads a single block image and returns it as a texture

import * as PIXI from 'pixi.js';

export async function loadBlockTexture(url = `${import.meta.env.BASE_URL}assets/block_1.png`) {
  // load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load block texture at ' + url));
  });

  // draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Don't apply color-key transparency - preserve original colors

  const texture = PIXI.Texture.from(canvas);
  if (texture.source) {
    texture.source.scaleMode = 'nearest';
  }

  console.log('blockLoader: loaded block texture', { width: img.width, height: img.height });
  return texture;
}
