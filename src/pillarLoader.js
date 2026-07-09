// Pillar loader for internal wall tiles
// Loads a single pillar image and returns it as a texture

import * as PIXI from 'pixi.js';

export async function loadPillarTexture(url = `${import.meta.env.BASE_URL}assets/pillar_1.png`) {
  try {
    const texture = await PIXI.Assets.load(url);
    
    if (!texture) {
      console.warn('Pillar texture not loaded');
      return null;
    }

    // Set pixel-perfect rendering
    if (texture.source) {
      texture.source.scaleMode = 'nearest';
    }

    console.log('pillarLoader: loaded pillar texture', { width: texture.width, height: texture.height });
    return texture;
  } catch (error) {
    console.error('Error loading pillar texture:', error);
    return null;
  }
}
