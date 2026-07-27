import * as PIXI from 'pixi.js';

export async function loadBombSprite() {
  try {
    const url = `${import.meta.env.BASE_URL}assets/247203.png`;
    
    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load bomb sprite at ' + url));
    });

    // Draw to offscreen canvas to apply color-key transparency
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Detect background color from top-left pixel and make it transparent
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

    // Create texture from canvas
    const sheetTexture = PIXI.Texture.from(canvas);
    if (sheetTexture.source) {
      sheetTexture.source.scaleMode = 'nearest';
    }

    // Bomb sprite is a tilemap of 16x16 frames
    const frameWidth = 16;
    const frameHeight = 16;
    const frames = [];

    // Calculate cols and rows
    const cols = Math.floor(img.width / frameWidth);
    const rows = Math.floor(img.height / frameHeight);

    console.log(`Bomb sprite loaded: ${cols}x${rows} tilemap (${cols * rows} total frames)`);

    // Extract all frames from tilemap (row by row, left to right)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rect = new PIXI.Rectangle(
          col * frameWidth,
          row * frameHeight,
          frameWidth,
          frameHeight
        );
        frames.push(new PIXI.Texture({ source: sheetTexture.source, frame: rect }));
      }
    }

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
