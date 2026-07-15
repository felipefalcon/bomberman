import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';

/**
 * Creates a grid of textures from a spritesheet
 * 
 * @param {PIXI.Texture} sheetTexture - The source texture
 * @param {number} frameWidth - Width of each frame
 * @param {number} frameHeight - Height of each frame
 * @returns {Array<PIXI.Texture>} Array of frame textures
 */
export function createTextureGrid(sheetTexture, frameWidth, frameHeight) {
  const cols = Math.floor(sheetTexture.width / frameWidth);
  const rows = Math.floor(sheetTexture.height / frameHeight);
  const frames = [];
  
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
  
  return { frames, cols, rows };
}

/**
 * Creates a ping-pong animation from frame indices
 * Ping-pong: [0,1,2,3] => [0,1,2,3,2,1]
 * 
 * @param {Array<number>} frames - Array of frame indices
 * @returns {Array<number>} Ping-pong frame indices
 */
export function createPingPongAnimation(frames) {
  if (frames.length <= 1) return frames;
  return frames.concat(frames.slice(1, -1).reverse());
}

/**
 * Creates a centered ping-pong animation (used for player)
 * Ping-pong centered: 2-1-0-1-2-3-4-3 and loops back to 2
 * 
 * @param {Array<number>} frames - Array of frame indices
 * @returns {Array<number>} Centered ping-pong frame indices
 */
export function createCenteredPingPongAnimation(frames) {
  if (frames.length <= 1) return frames;
  
  const middle = Math.floor(frames.length / 2);
  const leftPart = frames.slice(0, middle + 1).reverse();
  const rightPart = frames.slice(1);
  const backPart = frames.slice(middle + 1, -1).reverse();
  
  return leftPart.concat(rightPart).concat(backPart);
}

/**
 * Sets pixel-perfect rendering mode for a texture
 * 
 * @param {PIXI.Texture} texture - The texture to configure
 */
export function setNearestNeighborScaling(texture) {
  if (texture.source) {
    texture.source.scaleMode = 'nearest';
  }
}

/**
 * Creates a texture from a canvas with pixel-perfect scaling
 * 
 * @param {HTMLCanvasElement} canvas - The source canvas
 * @returns {PIXI.Texture} Configured texture
 */
export function createTextureFromCanvas(canvas) {
  const texture = PIXI.Texture.from(canvas);
  setNearestNeighborScaling(texture);
  return texture;
}

/**
 * Maps frame indices to animation names based on spritesheet layout
 * 
 * @param {number} cols - Number of columns in spritesheet
 * @param {number} rows - Number of rows in spritesheet
 * @param {number} frameCountPerRow - Frames per animation row
 * @param {boolean} hasUpRow - Whether spritesheet has up animation row
 * @returns {Object} Animation mapping object
 */
export function createAnimationMapping(cols, rows, frameCountPerRow = 5, hasUpRow = true) {
  const mapping = {};
  
  const downFrames = Array.from({ length: frameCountPerRow }, (_, i) => i);
  const rightFrames = Array.from({ length: frameCountPerRow }, (_, i) => cols + i);
  const upFrames = hasUpRow
    ? Array.from({ length: frameCountPerRow }, (_, i) => (rows - 1) * cols + i)
    : [];
  
  // Down animations
  mapping.walkDown = downFrames;
  mapping.idleDown = [downFrames[Math.floor(downFrames.length / 2)]];
  
  // Right animations
  mapping.walkRight = rightFrames;
  mapping.idleRight = [rightFrames[Math.floor(rightFrames.length / 2)]];
  
  // Left animations (uses right frames, flipped horizontally)
  mapping.walkLeft = rightFrames;
  mapping.idleLeft = [rightFrames[Math.floor(rightFrames.length / 2)]];
  
  // Up animations
  if (hasUpRow && upFrames.length > 0) {
    mapping.walkUp = upFrames;
    mapping.idleUp = [upFrames[Math.floor(upFrames.length / 2)]];
  }
  
  return mapping;
}
