// Animation Debugger - Display player and enemy sprites in all directions
import * as PIXI from 'pixi.js';
import { Player } from './player.js';
import { Monster } from './monster.js';

export class AnimationDebugger {
  constructor(app, playerFrames, playerMapping, enemyFrames, enemyMapping) {
    this.app = app;
    this.playerFrames = playerFrames;
    this.playerMapping = playerMapping;
    this.enemyFrames = enemyFrames;
    this.enemyMapping = enemyMapping;
    
    this.container = new PIXI.Container();
    this.container.x = 10;
    this.container.y = 10;
    this.container.zIndex = 1000;
    
    this.sprites = [];
    this.labels = [];
    this.ticker = null;
  }

  create() {
    // Create background panel
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 600, 120);
    bg.fill(0x000000);
    bg.alpha = 0.9;
    bg.stroke({ color: 0xffffff, width: 2 });
    this.container.addChild(bg);

    // Title
    const title = new PIXI.Text({
      text: 'Animation Debugger - Player (Yellow) | Enemy (Red)',
      style: {
        fontFamily: 'Arial',
        fontSize: 12,
        fill: 0xffff00,
        fontWeight: 'bold',
      },
    });
    title.x = 10;
    title.y = 5;
    this.container.addChild(title);

    // Player sprites in 4 directions (smaller for debugger)
    const directions = ['Down', 'Right', 'Up', 'Left'];
    const playerPositions = [
      { x: 50, y: 50 },
      { x: 120, y: 50 },
      { x: 190, y: 50 },
      { x: 260, y: 50 },
    ];

    directions.forEach((dir, idx) => {
      const pos = playerPositions[idx];
      
      // Label
      const label = new PIXI.Text({
        text: `P${dir[0]}`,
        style: {
          fontFamily: 'Arial',
          fontSize: 9,
          fill: 0xffff00,
        },
      });
      label.x = pos.x - 8;
      label.y = pos.y - 20;
      this.container.addChild(label);

      // Create player sprite with smaller tileSize (16 instead of 32)
      const player = new Player(pos.x, pos.y, 16, this.playerFrames, this.playerMapping);
      player.sprite.x = pos.x;
      player.sprite.y = pos.y;
      this.container.addChild(player.sprite);
      
      console.log(`Debugger: Added Player ${dir}`, {
        pos,
        spriteType: player.sprite.constructor.name,
        spriteVisible: player.sprite.visible,
        spriteAlpha: player.sprite.alpha,
        texturesCount: player.sprite.textures?.length,
      });
      
      // Force the direction
      player._facing = dir.toLowerCase();
      const updateResult = player._updateAnimation({ dx: dir === 'Right' ? 1 : dir === 'Left' ? -1 : 0, dy: dir === 'Down' ? 1 : dir === 'Up' ? -1 : 0 });
      console.log(`Debugger: Updated Player ${dir} animation`, {
        facing: player._facing,
        updateResult,
        texturesCount: player.sprite.textures?.length,
      });
      
      this.sprites.push(player);
    });

    // Enemy sprites in 4 directions
    const enemyPositions = [
      { x: 330, y: 50 },
      { x: 400, y: 50 },
      { x: 470, y: 50 },
      { x: 540, y: 50 },
    ];

    directions.forEach((dir, idx) => {
      const pos = enemyPositions[idx];
      
      // Label
      const label = new PIXI.Text({
        text: `E${dir[0]}`,
        style: {
          fontFamily: 'Arial',
          fontSize: 9,
          fill: 0xff6666,
        },
      });
      label.x = pos.x - 8;
      label.y = pos.y - 20;
      this.container.addChild(label);

      // Create enemy sprite with smaller tileSize (16 instead of 32)
      const enemy = new Monster(0, 0, 16, this.enemyFrames, this.enemyMapping);
      enemy.sprite.x = pos.x;
      enemy.sprite.y = pos.y;
      this.container.addChild(enemy.sprite);
      
      console.log(`Debugger: Added Enemy ${dir}`, {
        pos,
        spriteType: enemy.sprite.constructor.name,
        spriteVisible: enemy.sprite.visible,
        spriteAlpha: enemy.sprite.alpha,
        texturesCount: enemy.sprite.textures?.length,
      });
      
      // Force the direction
      enemy._facing = dir.toLowerCase();
      const updateResult = enemy._updateAnimation({ dx: dir === 'Right' ? 1 : dir === 'Left' ? -1 : 0, dy: dir === 'Down' ? 1 : dir === 'Up' ? -1 : 0 });
      console.log(`Debugger: Updated Enemy ${dir} animation`, {
        facing: enemy._facing,
        updateResult,
        texturesCount: enemy.sprite.textures?.length,
      });
      
      this.sprites.push(enemy);
    });

    // Add to stage (make sure it's on top)
    this.app.stage.addChild(this.container);

    // Start ticker to update animations
    this.ticker = this.app.ticker.add(() => {
      this.sprites.forEach(sprite => {
        if (sprite.sprite && sprite.sprite.update) {
          sprite.sprite.update(this.app.ticker.deltaTime);
        }
      });
    });

    console.log('AnimationDebugger: Created with', this.sprites.length, 'sprites at position', this.container.x, this.container.y);
  }

  destroy() {
    if (this.ticker) {
      this.app.ticker.remove(this.ticker);
    }
    if (this.container.parent) {
      this.app.stage.removeChild(this.container);
    }
  }
}
