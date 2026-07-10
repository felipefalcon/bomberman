import * as PIXI from 'pixi.js';

export class SidebarHud {
  constructor(stage, { sidebarWidth, mapRows, tileSize, itemFrames = null, itemMapping = null }) {
    this.stage = stage;
    this.sidebarWidth = sidebarWidth;
    this.mapRows = mapRows;
    this.tileSize = tileSize;
    this.itemFrames = itemFrames;
    this.itemMapping = itemMapping;
    this.powerupSlots = {};
    this.container = this._create();
  }

  setItemIcons(itemFrames, itemMapping) {
    this.itemFrames = itemFrames;
    this.itemMapping = itemMapping;
    this._refreshPowerupIcons();
  }

  update(player) {
    if (!player) return;

    this._setPowerupSlotState('bomb', `${player.maxBombs}`, true);
    this._setPowerupSlotState('range', `${player.explosionRange}`, true);
    this._setPowerupSlotState('speed', `${player.speedPowerups}`, player.speedPowerups > 0);
    this._setPowerupSlotState('pierce', '', player.canPierceBlocks);
    this._setPowerupSlotState('shield', '', player.hasShield);
    this._setPowerupSlotState('detonator', '', player.hasDetonator);
  }

  _create() {
    const container = new PIXI.Container();
    container.y = this.tileSize;
    this.stage.addChild(container);

    const height = this.mapRows * this.tileSize;
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.sidebarWidth, height);
    // bg.fill(0x171717);
    bg.rect(0, 0, this.sidebarWidth, height);
    // bg.stroke({ color: 0xd8d862, width: 1.5 });
    container.addChild(bg);

    const powerupRows = [
      { key: 'bomb', fallbackDraw: () => this._drawBombIcon(8, 9), withText: true },
      { key: 'range', fallbackDraw: () => this._drawRangeIcon(8, 9), withText: true },
      { key: 'speed', fallbackDraw: () => this._drawSpeedIcon(8, 9), withText: true },
      { key: 'pierce', fallbackDraw: () => this._drawPierceIcon(8, 9), withText: false },
      { key: 'shield', fallbackDraw: () => this._drawShieldIcon(8, 9), withText: false },
      { key: 'detonator', fallbackDraw: () => this._drawDetonatorIcon(8, 9), withText: false },
    ];

    powerupRows.forEach((row, index) => {
      const slot = this._createPowerupSlot(2, index * 28, row.key, row.fallbackDraw, row.withText);
      container.addChild(slot.container);
      this.powerupSlots[row.key] = slot;
    });

    return container;
  }

  _createPowerupSlot(x, y, key, fallbackDraw, withText) {
    const container = new PIXI.Container();
    container.x = x;
    container.y = y;
    container.alpha = 0.35;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, this.sidebarWidth, this.tileSize);
    // bg.fill(0x050505);
    bg.rect(0, 0, this.sidebarWidth, this.tileSize);
    // bg.stroke({ color: 0x3e6de6, width: 1 });
    bg.rect(0, 0, this.sidebarWidth, 3);
    // bg.fill(0xdf8d1f);
    container.addChild(bg);

    const iconContainer = new PIXI.Container();
    iconContainer.addChild(this._createPowerupIcon(key, fallbackDraw));
    container.addChild(iconContainer);

    let text = null;
    if (withText) {
      text = new PIXI.BitmapText({
        text: '0',
        style: { fontFamily: 'HUDFont', fontSize: 6, fill: 0xffffff },
        roundPixels: true,
      });
      text.x = 7;
      text.y = 19;
      container.addChild(text);
    }

    return { container, text, key, fallbackDraw, iconContainer };
  }

  _refreshPowerupIcons() {
    Object.values(this.powerupSlots).forEach((slot) => {
      if (!slot.iconContainer) return;
      slot.iconContainer.removeChildren();
      slot.iconContainer.addChild(this._createPowerupIcon(slot.key, slot.fallbackDraw));
    });
  }

  _createPowerupIcon(key, fallbackDraw) {
    const texture = this._getPowerupTexture(key);
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.x = 1;
      sprite.y = 1;
      sprite.roundPixels = true;
      return sprite;
    }

    return fallbackDraw();
  }

  _getPowerupTexture(key) {
    if (!this.itemFrames || !this.itemMapping) return null;

    const frameIndex = this.itemMapping[key];
    if (typeof frameIndex !== 'number') return null;

    return this.itemFrames[frameIndex] || null;
  }

  _setPowerupSlotState(key, value, isActive) {
    const slot = this.powerupSlots[key];
    if (!slot) return;

    slot.container.alpha = isActive ? 1 : 0.35;
    if (slot.text) slot.text.text = value;
  }

  _drawBombIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 6);
    g.fill(0x111111);
    g.circle(cx - 2, cy - 2, 2);
    g.fill(0x555555);
    g.moveTo(cx + 3, cy - 4);
    g.lineTo(cx + 6, cy - 7);
    g.stroke({ color: 0x886600, width: 2 });
    g.circle(cx + 6, cy - 7, 1.5);
    g.fill(0xffaa00);
    return g;
  }

  _drawRangeIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.rect(cx - 5, cy - 5, 10, 10);
    g.fill(0xffc233);
    g.rect(cx - 3, cy - 3, 6, 6);
    g.fill(0xff6b1a);
    g.rect(cx - 1, cy - 8, 2, 3);
    g.rect(cx - 1, cy + 5, 2, 3);
    g.rect(cx - 8, cy - 1, 3, 2);
    g.rect(cx + 5, cy - 1, 3, 2);
    g.fill(0xfff2a0);
    return g;
  }

  _drawPierceIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx - 7, cy + 4);
    g.lineTo(cx + 2, cy - 5);
    g.stroke({ color: 0xc8c8c8, width: 2 });
    g.moveTo(cx + 2, cy - 5);
    g.lineTo(cx + 6, cy - 5);
    g.lineTo(cx + 6, cy - 1);
    g.stroke({ color: 0xffaa33, width: 2 });
    g.rect(cx - 8, cy + 3, 4, 4);
    g.fill(0x6d4a2a);
    return g;
  }

  _drawShieldIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx, cy - 7);
    g.lineTo(cx + 6, cy - 4);
    g.lineTo(cx + 5, cy + 3);
    g.lineTo(cx, cy + 7);
    g.lineTo(cx - 5, cy + 3);
    g.lineTo(cx - 6, cy - 4);
    g.lineTo(cx, cy - 7);
    g.fill(0x4fc3f7);
    g.moveTo(cx, cy - 4);
    g.lineTo(cx + 3, cy - 2);
    g.lineTo(cx + 2, cy + 2);
    g.lineTo(cx, cy + 4);
    g.lineTo(cx - 2, cy + 2);
    g.lineTo(cx - 3, cy - 2);
    g.lineTo(cx, cy - 4);
    g.fill(0xe8f7ff);
    return g;
  }

  _drawSpeedIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.moveTo(cx - 2, cy - 8);
    g.lineTo(cx + 4, cy - 1);
    g.lineTo(cx + 1, cy - 1);
    g.lineTo(cx + 5, cy + 8);
    g.lineTo(cx - 3, cy + 1);
    g.lineTo(cx, cy + 1);
    g.lineTo(cx - 2, cy - 8);
    g.fill(0xffd84d);
    return g;
  }

  _drawDetonatorIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.rect(cx - 6, cy - 4, 12, 8);
    g.fill(0xc7d0d8);
    g.rect(cx - 2, cy - 8, 4, 4);
    g.fill(0xe65a3a);
    g.moveTo(cx + 2, cy - 8);
    g.lineTo(cx + 6, cy - 12);
    g.stroke({ color: 0xf0c54e, width: 1.5 });
    return g;
  }
}