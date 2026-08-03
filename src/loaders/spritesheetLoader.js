import * as PIXI from 'pixi.js';

export async function loadImage(url, crossOrigin = 'anonymous') {
  const img = new Image();
  img.crossOrigin = crossOrigin;
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`Failed to load image at ${url}`));
  });

  return img;
}

export function drawImageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return { canvas, ctx };
}

export function applyTopLeftColorKeyTransparency(ctx, width, height, tolerance = 45) {
  const bgData = ctx.getImageData(0, 0, 1, 1).data;
  const bgColor = { r: bgData[0], g: bgData[1], b: bgData[2], a: bgData[3] };

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const dr = Math.abs(pixels[i] - bgColor.r);
    const dg = Math.abs(pixels[i + 1] - bgColor.g);
    const db = Math.abs(pixels[i + 2] - bgColor.b);
    const da = Math.abs(pixels[i + 3] - bgColor.a);
    if (dr + dg + db + da < tolerance) {
      pixels[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function sliceTextureGrid(canvas, frameWidth, frameHeight) {
  const cols = Math.floor(canvas.width / frameWidth);
  const rows = Math.floor(canvas.height / frameHeight);
  const sheetTexture = PIXI.Texture.from(canvas);

  if (sheetTexture.source) {
    sheetTexture.source.scaleMode = 'nearest';
  }

  const frames = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const rect = new PIXI.Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight);
      frames.push(new PIXI.Texture({ source: sheetTexture.source, frame: rect }));
    }
  }

  return { frames, cols, rows };
}
