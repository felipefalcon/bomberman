import { drawImageToCanvas, loadImage, sliceTextureGrid } from './spritesheetLoader.js';

export async function loadItemSprites() {
  const url = `${import.meta.env.BASE_URL}assets/itens.png`;

  const img = await loadImage(url);
  const { canvas } = drawImageToCanvas(img);
  const frameSize = 16;
  const { frames } = sliceTextureGrid(canvas, frameSize, frameSize);

  for (const frame of frames) {
    frame.scaleMode = 'nearest';
  }

  // Define item types and their frame indices
  const mapping = {
    range: 0, // Explosion range
    pierce: 1, // Explosion pierces through blocks
    bomb: 2, // Extra bomb
    speed: 3, // Speed boost
    kick_bomb: 5, // Kick bomb (para decidir depois)
    throw_bomb: 6, // Throw bomb (para decidir depois)
    land_mine: 14, // Land mine - triggered by player/monster stepping on it
    cross_block: 8, // Cross block (para decidir depois)
    cross_bomb: 9, // Cross bomb (para decidir depois)
    follower_bomb: 15, // Follower bomb - follows enemies
    extra_life: 11, // Extra life
  };

  return { frames, mapping };
}
