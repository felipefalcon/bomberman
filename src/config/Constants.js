// Game Configuration Constants
export const GAME_CONFIG = {
  // Display
  GAME_ZOOM: 2,
  SIDEBAR_WIDTH: 24,

  // HUD
  HUD: {
    FONT_SIZE: 12,
    SMALL_FONT_SIZE: 6,
    PANEL_STRIP_HEIGHT: 3,
    SIDEBAR_INACTIVE_ALPHA: 0.35,
    ICON_SIZE: 24,
    TOP: {
      FRAME_FILL_COLOR: 0x203890,
      FRAME_OUTER_STROKE_COLOR: 0x406000,
      FRAME_INNER_STROKE_COLOR: 0x58d800,
      FRAME_STROKE_WIDTH: 1,
      LIVES_PANEL_X: 8,
      LIVES_PANEL_Y: 5,
      LIVES_PANEL_WIDTH: 90,
      TIMER_PANEL_OFFSET_X: -40,
      TIMER_PANEL_Y: 5,
      TIMER_PANEL_WIDTH: 82,
      PANEL_INNER_MARGIN: 6,
      LIVES_TEXT_X: 26,
      LIVES_TEXT_Y: 5,
      TIMER_TEXT_X: 32,
      TIMER_TEXT_Y: 5,
      DEFAULT_LIVES_TEXT: '3',
      DEFAULT_TIMER_TEXT: '3:20',
      PLAYER_ICON_FRAME: 19,
      CLOCK_ICON_FRAME: 20,
      PLAYER_ICON_X: 11,
      PLAYER_ICON_Y: 13,
      CLOCK_ICON_X: 10,
      CLOCK_ICON_Y: 13,
      CLOCK_BEZEL_COLOR: 0xff7a22,
    },
    SIDEBAR: {
      SLOT_START_X: 2,
      SLOT_START_Y: 0,
      SLOT_GAP_Y: 26,
      POWERUP_ICON_X: 8,
      POWERUP_ICON_Y: 9,
      SLOT_TEXT_X: 7,
      SLOT_TEXT_Y: 19,
    },
  },
  
  // Map dimensions
  MAP_COLS: 17,
  MAP_ROWS: 11,
  
  // Tile settings
  TILE_SIZE: 32,
  
  // Game timing
  BOMB_FUSE_TICKS: 180, // 3 seconds at 60 FPS
  LAND_MINE_TRIGGER_TICKS: 140, // 3 seconds for land mine to explode after being triggered
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
  PLAYER_BLINK_DURATION: 120, // ticks (~2 seconds)
  PLAYER_BLINK_INTERVAL_TICKS: 10,
  
  // Monster settings
  MONSTER_SPEED: 0.85,
  MONSTER_SPRITE_SCALE: 1.5,
  MONSTER_ANIMATION_SPEED: 0.15,
  MONSTER_SPAWN_COUNT: 3,
  MONSTER_START_DISTANCE: 6, // minimum distance from start area
  MONSTER_STARTING_LIVES: 1,
  
  // Powerup settings
  POWERUP_SPAWN_CHANCE: 0.8, // chance when block destroyed
  POWERUP_IMMUNE_TICKS: 10, // protection from same-frame explosions
  POWERUP_SPRITE_SCALE: 1.5,
  POWERUP_BOB_SPEED: 0.1,
  POWERUP_BOB_AMOUNT: 3, // pixels

  // Map generation
  MAP_DESTRUCTIBLE_CHANCE: 0.7,
  
  // Explosion settings
  EXPLOSION_DURATION: 20, // ticks
  EXPLOSION_SOUND_TICKS: 40, // ticks before explosion to play sound
  EXPLOSION_DAMAGE_WARNING_TICKS: 30, // ticks to play damage warning
  
  // Bomb slide settings
  BOMB_SLIDE_SPEED: 4, // pixels per tick
  
  // Follower bomb settings
  BOMB_FOLLOW_SPEED: 2, // pixels per tick
  
  // Block destruction animation
  BLOCK_DESTRUCTION_DURATION: 15, // ticks
  
  // Animation
  ANIMATION_SPEED: 0.15,
  
  // Audio
  MUSIC_VOLUME: 0.3,
  SOUND_EFFECT_VOLUME: 0.7,
  SOUND_POOL_SIZE: 5,
  AUDIO_START_MUTED: true,

  // Runtime mode baseline
  GAME_MODE: 'single-player',
  NETWORK_MODE: 'offline',
  ONLINE_ENABLED: false,
  RNG_SEED: null,
  
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
  KICK_BOMB: 'kick_bomb',
  THROW_BOMB: 'throw_bomb',
  CROSS_BLOCK: 'cross_block',
  CROSS_BOMB: 'cross_bomb',
  FOLLOWER_BOMB: 'follower_bomb',
  LAND_MINE: 'land_mine',
  EXTRA_LIFE: 'extra_life',
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
