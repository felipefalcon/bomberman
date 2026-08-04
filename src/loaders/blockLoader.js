// Block loader for pillar/internal wall tiles
// Loads a single block image and returns it as a texture

import * as PIXI from 'pixi.js';

export async function loadBlockTexture(url = `${import.meta.env.BASE_URL}assets/block_1.png`) {
  try {
    const texture = await PIXI.Assets.load(url);
    
    if (!texture) {
      console.warn('Block texture not loaded');
      return null;
    }

    // Set pixel-perfect rendering
    if (texture.source) {
      texture.source.scaleMode = 'nearest';
    }

    return texture;
  } catch (error) {
    console.error('Error loading block texture:', error);
    return null;
  }
}
