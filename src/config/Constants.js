// Game Configuration Constants
export const GAME_CONFIG = {
  // Display
  GAME_ZOOM: 2,
  SIDEBAR_WIDTH: 24,
  
  // Map dimensions
  MAP_COLS: 17,
  MAP_ROWS: 11,
  
  // Tile settings
  TILE_SIZE: 32,
  
  // Game timing
  BOMB_FUSE_TICKS: 180, // 3 seconds at 60 FPS
  TIME_REMAINING: 200, // seconds
  
  // Player settings
  PLAYER_START_X: 1.5, // in tiles
  PLAYER_START_Y: 1.5, // in tiles
  PLAYER_BASE_SPEED: 2.6, // pixels per tick
  PLAYER_SPRITE_SCALE: 1.5,
  PLAYER_HITBOX_SIZE: 26,
  PLAYER_STARTING_LIVES: 3,
  PLAYER_STARTING_BOMBS: 1,
  PLAYER_STARTING_RANGE: 1,
  PLAYER_BLINK_DURATION: 60, // ticks
  
  // Monster settings
  MONSTER_SPEED: 0.85,
  MONSTER_SPRITE_SCALE: 1.5,
  MONSTER_ANIMATION_SPEED: 0.15,
  MONSTER_SPAWN_COUNT: 3,
  MONSTER_START_DISTANCE: 6, // minimum distance from start area
  
  // Powerup settings
  POWERUP_SPAWN_CHANCE: 0.3, // 30% chance when block destroyed
  POWERUP_IMMUNE_TICKS: 10, // protection from same-frame explosions
  POWERUP_SPRITE_SCALE: 1.5,
  POWERUP_BOB_SPEED: 0.1,
  POWERUP_BOB_AMOUNT: 3, // pixels
  
  // Explosion settings
  EXPLOSION_DURATION: 20, // ticks
  EXPLOSION_SOUND_TICKS: 40, // ticks before explosion to play sound
  EXPLOSION_DAMAGE_WARNING_TICKS: 30, // ticks to play damage warning
  
  // Block destruction animation
  BLOCK_DESTRUCTION_DURATION: 15, // ticks
  
  // Animation
  ANIMATION_SPEED: 0.15,
  
  // Audio
  MUSIC_VOLUME: 0.3,
  SOUND_EFFECT_VOLUME: 0.7,
  SOUND_POOL_SIZE: 5,
  
  // Asset paths
  ASSETS_PATH: `${import.meta.env.BASE_URL}assets/`,
  
  // Sprite sizes
  SPRITE_TILE_SIZE: 16,
  FRAME_COUNT_PER_ROW: 5,
  
  // Color key transparency
  COLOR_KEY_TOLERANCE: 45,
};

// Map tile types
export const TILE_TYPES = {
  FLOOR: 0,
  WALL: 1,
  DESTRUCTIBLE: 2,
};

// Powerup types
export const POWERUP_TYPES = {
  SPEED: 'speed',
  BOMB: 'bomb',
  RANGE: 'range',
  PIERCE: 'pierce',
  SHIELD: 'shield',
  DETONATOR: 'detonator',
};

// Directions
export const DIRECTIONS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

// Animation states
export const ANIMATION_STATES = {
  IDLE: 'idle',
  WALK: 'walk',
};

// Facing directions
export const FACING = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
};
