import { GAME_CONFIG } from '../config/Constants.js';

/**
 * Applies color-key transparency to a canvas context
 * Detects background color from top-left pixel and makes similar pixels transparent
 * 
 * @param {HTMLCanvasElement} canvas - The canvas to process
 * @param {number} tolerance - Color difference tolerance (default: 45)
 */
export function applyColorKeyTransparency(canvas, tolerance = GAME_CONFIG.COLOR_KEY_TOLERANCE) {
  const ctx = canvas.getContext('2d');
  
  // Detect background color from top-left pixel
  const bgData = ctx.getImageData(0, 0, 1, 1).data;
  const bgColor = { 
    r: bgData[0], 
    g: bgData[1], 
    b: bgData[2], 
    a: bgData[3] 
  };
  
  // Get all pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Make pixels similar to background color transparent
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = Math.abs(pixels[i] - bgColor.r);
    const dg = Math.abs(pixels[i + 1] - bgColor.g);
    const db = Math.abs(pixels[i + 2] - bgColor.b);
    const da = Math.abs(pixels[i + 3] - bgColor.a);
    
    if (dr + dg + db + da < tolerance) {
      pixels[i + 3] = 0; // Set alpha to 0 (transparent)
    }
  }
  
  // Apply modified pixel data back to canvas
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Loads an image and applies color-key transparency
 * 
 * @param {string} url - URL of the image to load
 * @param {number} tolerance - Color difference tolerance
 * @returns {Promise<HTMLCanvasElement>} Canvas with processed image
 */
export async function loadImageWithTransparency(url, tolerance = GAME_CONFIG.COLOR_KEY_TOLERANCE) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`Failed to load image at ${url}`));
  });
  
  // Draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  // Apply color-key transparency
  applyColorKeyTransparency(canvas, tolerance);
  
  return canvas;
}
