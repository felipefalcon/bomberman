import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../../config/Constants.js';

export class ExplosionRenderer {
  createSprite(tx, ty, tileSize, isCenter = false) {
    const container = new PIXI.Container();
    container.x = tx * tileSize;
    container.y = ty * tileSize;

    const gfx = new PIXI.Graphics();
    gfx.x = tileSize / 2;
    gfx.y = tileSize / 2;
    container.addChild(gfx);

    container.userData = {
      animFrame: 0,
      sprites: [gfx],
      isCenter,
    };

    return container;
  }

  updateSprite(sprite, tileSize) {
    const userData = sprite.userData;
    userData.animFrame += GAME_CONFIG.ANIMATION_SPEED;

    for (const gfx of userData.sprites) {
      gfx.clear();

      const frame = Math.floor(userData.animFrame) % 3;
      const baseSize = tileSize * 0.8;
      const size = baseSize + Math.sin(userData.animFrame * 0.3) * (baseSize * 0.15);

      let color;
      if (frame === 0) color = 0xffff00;
      else if (frame === 1) color = 0xff8800;
      else color = 0xff3300;

      gfx.rect(-size / 2, -size / 2, size, size);
      gfx.fill({ color, alpha: 0.9 });

      const glowSize = size * 1.3;
      gfx.rect(-glowSize / 2, -glowSize / 2, glowSize, glowSize);
      gfx.fill({ color, alpha: 0.3 });
    }
  }
}
