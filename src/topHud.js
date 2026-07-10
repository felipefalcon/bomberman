import * as PIXI from 'pixi.js';

export class TopHud {
  constructor(stage, { sidebarWidth, mapCols, tileSize }) {
    this.stage = stage;
    this.sidebarWidth = sidebarWidth;
    this.mapCols = mapCols;
    this.tileSize = tileSize;
    this.timerText = null;
    this.livesText = null;
    this.container = this._create();
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
    frame.fill(0x171717);
    frame.rect(0, 0, width, height);
    frame.stroke({ color: 0xd8d862, width: 1.5 });
    frame.rect(1, 1, width - 2, height - 2);
    frame.stroke({ color: 0x2957c8, width: 1 });
    container.addChild(frame);

    const livesPanel = this._createHudPanel(4, 3, 90, height - 6);
    container.addChild(livesPanel);
    livesPanel.addChild(this._drawFaceIcon(11, 13));

    this.livesText = new PIXI.BitmapText({
      text: '3',
      style: { fontFamily: 'HUDFont', fontSize: 8, fill: 0xffffff },
      roundPixels: true,
    });
    this.livesText.x = 22;
    this.livesText.y = 9;
    livesPanel.addChild(this.livesText);

    const timerPanel = this._createHudPanel(width - 86, 3, 82, height - 6);
    container.addChild(timerPanel);
    timerPanel.addChild(this._drawClockIcon(10, 13, 0xff7a22));

    this.timerText = new PIXI.BitmapText({
      text: '3:20',
      style: { fontFamily: 'HUDFont', fontSize: 8, fill: 0xffffff },
      roundPixels: true,
    });
    this.timerText.x = 20;
    this.timerText.y = 9;
    timerPanel.addChild(this.timerText);

    return container;
  }

  _createHudPanel(x, y, width, height) {
    const panel = new PIXI.Container();
    panel.x = x;
    panel.y = y;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height);
    bg.fill(0x050505);
    bg.rect(0, 0, width, height);
    bg.stroke({ color: 0x3e6de6, width: 1 });
    bg.rect(0, 0, width, 3);
    bg.fill(0xdf8d1f);
    panel.addChild(bg);

    return panel;
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