export function toTile(value, tileSize) {
  return Math.floor(value / tileSize);
}

export function pixelToTile(x, y, tileSize) {
  return {
    tx: toTile(x, tileSize),
    ty: toTile(y, tileSize),
  };
}

export function spriteToTile(sprite, tileSize) {
  if (!sprite) return null;
  return pixelToTile(sprite.x, sprite.y, tileSize);
}

export function isSpriteOnTile(sprite, tx, ty, tileSize) {
  const tile = spriteToTile(sprite, tileSize);
  return !!tile && tile.tx === tx && tile.ty === ty;
}

export function tileCenter(tx, ty, tileSize) {
  const half = tileSize / 2;
  return {
    x: tx * tileSize + half,
    y: ty * tileSize + half,
  };
}

export function tileKey(tx, ty) {
  return `${tx},${ty}`;
}

export function getCorners(cx, cy, collisionHalf) {
  return [
    { x: cx - collisionHalf, y: cy - collisionHalf },
    { x: cx + collisionHalf - 1, y: cy - collisionHalf },
    { x: cx - collisionHalf, y: cy + collisionHalf - 1 },
    { x: cx + collisionHalf - 1, y: cy + collisionHalf - 1 },
  ];
}

export function getCornerTileKeys(cx, cy, collisionHalf, tileSize) {
  return new Set(
    getCorners(cx, cy, collisionHalf).map((corner) =>
      tileKey(toTile(corner.x, tileSize), toTile(corner.y, tileSize))
    )
  );
}
