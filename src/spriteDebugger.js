import { Container, Sprite, Graphics, Text } from 'pixi.js';

// Simple sprite frame debugger overlay.
// Usage: const dbg = createSpriteDebugger(frames, mapping, onUpdate); stage.addChild(dbg.container);
// Click frames to toggle selection for current animation. Press number keys 1-4 to change target animation.

export function createSpriteDebugger(frames, mapping = {}, onUpdate = () => {}) {
  const container = new Container();
  container.zIndex = 1000;

  const bg = new Graphics();
  bg.beginFill(0x000000, 0.6);
  bg.drawRect(0, 0, 260, 240);
  bg.endFill();
  container.addChild(bg);

  const title = new Text('Sprite Debugger (1:Down 2:Left 3:Right 4:Up)', { fill: 0xffffff, fontSize: 12 });
  title.x = 6; title.y = 4;
  container.addChild(title);

  const thumbnailSize = 28;
  const padding = 4;
  const cols = 8;

  let currentAnim = 'walkDown';

  function render() {
    // remove existing thumbnails except bg and title
    while (container.children.length > 2) container.removeChildAt(2);

    const info = new Text('Anim: ' + currentAnim, { fill: 0xffff00, fontSize: 12 });
    info.x = 6; info.y = 18;
    container.addChild(info);

    for (let i = 0; i < frames.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const sx = 6 + c * (thumbnailSize + padding);
      const sy = 36 + r * (thumbnailSize + padding);

      const spr = new Sprite(frames[i]);
      spr.x = sx; spr.y = sy;
      spr.width = thumbnailSize; spr.height = thumbnailSize;
      spr.interactive = true;
      spr.buttonMode = true;
      spr.frameIndex = i;
      spr.on('pointerdown', () => {
        toggleFrame(i);
      });
      container.addChild(spr);

      const idxText = new Text(String(i), { fill: 0xcccccc, fontSize: 8 });
      idxText.x = sx; idxText.y = sy + thumbnailSize - 10;
      container.addChild(idxText);

      // highlight if included in mapping
      const list = mapping[currentAnim] || [];
      if (list.includes(i)) {
        const h = new Graphics();
        h.lineStyle(2, 0xffff00);
        h.drawRect(sx - 1, sy - 1, thumbnailSize + 2, thumbnailSize + 2);
        container.addChild(h);
      }
    }
  }

  function toggleFrame(i) {
    mapping[currentAnim] = mapping[currentAnim] || [];
    const idx = mapping[currentAnim].indexOf(i);
    if (idx === -1) mapping[currentAnim].push(i);
    else mapping[currentAnim].splice(idx, 1);
    onUpdate(mapping);
    render();
  }

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') currentAnim = 'walkDown';
    if (e.key === '2') currentAnim = 'walkLeft';
    if (e.key === '3') currentAnim = 'walkRight';
    if (e.key === '4') currentAnim = 'walkUp';
    if (e.key === 'i') currentAnim = 'idleDown';
    render();
  });

  render();

  // position top-left
  container.x = 8;
  container.y = 8;

  return { container, mapping };
}
