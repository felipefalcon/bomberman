import * as PIXI from 'pixi.js';
import { Game } from './game.js';

const app = new PIXI.Application({
  width: 13 * 32,
  height: 11 * 32,
  backgroundColor: 0x1099bb,
  resolution: window.devicePixelRatio || 1,
});

document.getElementById('game').appendChild(app.view);

const game = new Game(app);
game.start();
