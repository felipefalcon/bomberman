export function createSeededRandom(seed = null) {
  if (seed === null || seed === undefined) {
    return () => Math.random();
  }

  const normalizedSeed = String(seed)
    .split('')
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0);

  let state = normalizedSeed;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
