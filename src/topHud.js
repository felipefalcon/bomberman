import * as PIXI from 'pixi.js';

export class TopHud {
  fontSize = 12;
  constructor(stage, { sidebarWidth, mapCols, tileSize, itemFrames = null }) {
    this.stage = stage;
    this.sidebarWidth = sidebarWidth;
    this.mapCols = mapCols;
    this.tileSize = tileSize;
    this.itemFrames = itemFrames;
    this.timerText = null;
    this.livesText = null;
    this.playerIconContainer = null;
    this.clockIconContainer = null;
    this.container = this._create();
  }

  setItemIcons(itemFrames) {
    this.itemFrames = itemFrames;
    this._refreshIcons();
  }

  setLives(value) {
    if (this.livesText) this.livesText.text = `${value}`;
  }

  setTimer(timeRemaining) {
    if (!this.timerText) return;
    const t = Math.max(0, Math.ceil(timeRemaining));
    const mins = Math.floor(t / 60);
    const secs = t % 60;
    this.timerText.text = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _create() {
    const container = new PIXI.Container();
    container.x = this.sidebarWidth;
    this.stage.addChild(container);

    const width = this.mapCols * this.tileSize;
    const height = this.tileSize;

    const frame = new PIXI.Graphics();
    frame.rect(0, 0, width, height);
    frame.fill(0x203890);
    frame.rect(0, 0, width, height);
    frame.stroke({ color: 0x406000, width: 1 });
    frame.rect(1, 1, width - 2, height - 2);
    frame.stroke({ color: 0x58d800, width: 1 });
    container.addChild(frame);

    const livesPanel = this._createHudPanel(8, 5, 90, height - 6);
    container.addChild(livesPanel);

    this.playerIconContainer = new PIXI.Container();
    this.playerIconContainer.addChild(this._createPlayerIcon());
    livesPanel.addChild(this.playerIconContainer);

    this.livesText = new PIXI.BitmapText({
      text: '3',
      style: { fontFamily: 'HUDFont', fontSize: this.fontSize, fill: 0xffffff },
      roundPixels: true,
    });
    this.livesText.x = 26;
    this.livesText.y = 5;
    livesPanel.addChild(this.livesText);

    const timerPanel = this._createHudPanel((width /2) - 40, 5, 82, height - 6);
    container.addChild(timerPanel);

    this.clockIconContainer = new PIXI.Container();
    this.clockIconContainer.addChild(this._createClockIcon());
    timerPanel.addChild(this.clockIconContainer);

    this.timerText = new PIXI.BitmapText({
      text: '3:20',
      style: { fontFamily: 'HUDFont', fontSize: this.fontSize, fill: 0xffffff },
      roundPixels: true,
    });
    this.timerText.x = 32;
    this.timerText.y = 5;
    timerPanel.addChild(this.timerText);

    return container;
  }

  _createHudPanel(x, y, width, height) {
    const panel = new PIXI.Container();
    panel.x = x;
    panel.y = y;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height);
    // bg.fill(0x050505);
    bg.rect(0, 0, width, height);
    // bg.stroke({ color: 0x3e6de6, width: 1 });
    bg.rect(0, 0, width, 3);
    // bg.fill(0xdf8d1f);
    panel.addChild(bg);

    return panel;
  }

  _refreshIcons() {
    if (this.playerIconContainer) {
      this.playerIconContainer.removeChildren();
      this.playerIconContainer.addChild(this._createPlayerIcon());
    }

    if (this.clockIconContainer) {
      this.clockIconContainer.removeChildren();
      this.clockIconContainer.addChild(this._createClockIcon());
    }
  }

  _createPlayerIcon() {
    const sprite = this._createItemIcon(19);
    if (sprite) return sprite;
    return this._drawFaceIcon(11, 13);
  }

  _createClockIcon() {
    const sprite = this._createItemIcon(20);
    if (sprite) return sprite;
    return this._drawClockIcon(10, 13, 0xff7a22);
  }

  _createItemIcon(frameIndex) {
    const texture = this.itemFrames?.[frameIndex];
    if (!texture) return null;

    const sprite = new PIXI.Sprite(texture);
    sprite.width = 24;
    sprite.height = 24;
    sprite.x = 0;
    sprite.y = 0;
    sprite.roundPixels = true;
    return sprite;
  }

  _drawClockIcon(cx, cy, bezelColor = 0xdddddd) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 7);
    g.fill(bezelColor);
    g.circle(cx, cy, 7);
    g.stroke({ color: 0x703000, width: 1.5 });
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - 4);
    g.stroke({ color: 0x222222, width: 1.5 });
    g.moveTo(cx, cy);
    g.lineTo(cx + 3, cy + 1);
    g.stroke({ color: 0x222222, width: 1.5 });
    g.circle(cx, cy, 1.5);
    g.fill(0x222222);
    return g;
  }

  _drawFaceIcon(cx, cy) {
    const g = new PIXI.Graphics();
    g.circle(cx, cy, 6);
    g.fill(0xf6c15c);
    g.rect(cx - 6, cy - 7, 12, 4);
    g.fill(0xd84b1a);
    g.rect(cx - 3, cy - 1, 1.5, 1.5);
    g.rect(cx + 1.5, cy - 1, 1.5, 1.5);
    g.fill(0x1d1d1d);
    g.rect(cx - 2, cy + 2, 4, 1.5);
    g.fill(0xffffff);
    return g;
  }
}