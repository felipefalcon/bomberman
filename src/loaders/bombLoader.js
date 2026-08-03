import {
  applyTopLeftColorKeyTransparency,
  drawImageToCanvas,
  loadImage,
  sliceTextureGrid,
} from './spritesheetLoader.js';

export async function loadBombSprite() {
  try {
    const url = `${import.meta.env.BASE_URL}assets/247203.png`;
    const img = await loadImage(url);
    const { canvas, ctx } = drawImageToCanvas(img);
    applyTopLeftColorKeyTransparency(ctx, canvas.width, canvas.height, 45);

    // Bomb sprite is a tilemap of 16x16 frames
    const frameWidth = 16;
    const frameHeight = 16;
    const { frames, cols, rows } = sliceTextureGrid(canvas, frameWidth, frameHeight);

    console.log(`Bomb sprite loaded: ${cols}x${rows} tilemap (${cols * rows} total frames)`);

    // Create ping-pong animation with first 3 frames: [0, 1, 2, 1]
    const bombFrames = [0, 1, 2];
    const pingPongFrames = bombFrames.concat(bombFrames.slice(1, -1).reverse()); // [0, 1, 2, 1]

    // Create follower bomb animation with frames 10, 11, 12, 13
    const followerBombFrames = [10, 11, 12, 13];

    const mapping = {
      bomb: pingPongFrames,
      follower_bomb: followerBombFrames,
      land_mine: [6] // Land mine - single sprite, no animation
    };

    return { frames, mapping };
  } catch (error) {
    console.error('Error loading bomb sprite:', error);
    return { frames: [], mapping: {} };
  }
}
