import * as PIXI from 'pixi.js';

export async function loadItemSprites() {
  const url = `${import.meta.env.BASE_URL}assets/itens.png`;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const frameSize = 16;
      const cols = Math.floor(img.width / frameSize);
      const rows = Math.floor(img.height / frameSize);
      
      const frames = [];
      const texture = PIXI.Texture.from(canvas);
      texture.scaleMode = 'nearest';
      texture.source.scaleMode = 'nearest';
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const frame = new PIXI.Rectangle(
            col * frameSize,
            row * frameSize,
            frameSize,
            frameSize
          );
          const frameTexture = new PIXI.Texture({
            source: texture.source,
            frame: frame
          });
          frameTexture.scaleMode = 'nearest';
          frames.push(frameTexture);
        }
      }
      
      // Define item types and their frame indices
      const mapping = {
        range: 0,        // Explosion range
        pierce: 1,       // Explosion pierces through blocks
        bomb: 2,         // Extra bomb
        speed: 3,        // Speed boost
        shield: 4,       // Shield/Invulnerability (para decidir depois)
        detonator: 7,    // Remote detonator (para decidir depois)
        kick_bomb: 5,     // Kick bomb (para decidir depois)
        throw_bomb: 6,    // Throw bomb (para decidir depois)
        land_mine: 6,    // Land mine - triggered by player/monster stepping on it
        cross_block: 8,    // Cross block (para decidir depois)
        cross_bomb: 9,    // Cross bomb (para decidir depois)
        follower_bomb: 15, // Follower bomb - follows enemies
      };
      
      resolve({ frames, mapping });
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load items sprite: ${url}`));
    };
    
    img.src = url;
  });
}
