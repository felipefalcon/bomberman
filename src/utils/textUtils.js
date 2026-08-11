import * as PIXI from 'pixi.js';
import { GAME_CONFIG } from '../config/Constants.js';

/**
 * Creates a PIXI.Text object with Silkscreen font styling
 * @param {string} text - The text content
 * @param {Object} options - Style options
 * @param {number} options.fontSize - Font size (defaults to GAME_CONFIG.FONT.SIZES.MEDIUM)
 * @param {string} options.fontWeight - Font weight '400' or '700' (defaults to '400')
 * @param {number} options.fill - Text color (defaults to GAME_CONFIG.FONT.COLORS.WHITE)
 * @param {number} options.stroke - Stroke color (optional)
 * @param {number} options.strokeThickness - Stroke thickness (optional)
 * @param {string} options.align - Text alignment 'left', 'center', 'right' (defaults to 'left')
 * @returns {PIXI.Text} - Styled text object
 */
export function createSilkscreenText(text, options = {}) {
  const {
    fontSize = GAME_CONFIG.FONT.SIZES.MEDIUM,
    fontWeight = GAME_CONFIG.FONT.WEIGHTS.NORMAL,
    fill = GAME_CONFIG.FONT.COLORS.WHITE,
    stroke,
    strokeThickness,
    align = 'left',
  } = options;

  const styleOptions = {
    fontFamily: GAME_CONFIG.FONT.FAMILY,
    fontSize,
    fontWeight,
    fill,
    align,
  };

  if (stroke !== undefined) {
    styleOptions.stroke = { color: stroke, width: strokeThickness || 1 };
  }

  try {
    return new PIXI.Text({
      text,
      style: styleOptions,
    });
  } catch (error) {
    console.warn('Failed to create text with Silkscreen font, using fallback:', error);
    // Fallback to monospace if Silkscreen fails
    styleOptions.fontFamily = 'monospace';
    return new PIXI.Text({
      text,
      style: styleOptions,
    });
  }
}

/**
 * Creates a small Silkscreen text
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.Text} - Styled text object
 */
export function createSmallSilkscreenText(text, options = {}) {
  return createSilkscreenText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.SMALL,
    ...options,
  });
}

/**
 * Creates a large Silkscreen text
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.Text} - Styled text object
 */
export function createLargeSilkscreenText(text, options = {}) {
  return createSilkscreenText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.LARGE,
    ...options,
  });
}

/**
 * Creates an extra large Silkscreen text (for titles, etc.)
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.Text} - Styled text object
 */
export function createExtraLargeSilkscreenText(text, options = {}) {
  return createSilkscreenText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.EXTRA_LARGE,
    ...options,
  });
}

/**
 * Creates a Silkscreen text with bold weight
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.Text} - Styled text object
 */
export function createBoldSilkscreenText(text, options = {}) {
  return createSilkscreenText(text, {
    fontWeight: GAME_CONFIG.FONT.WEIGHTS.BOLD,
    ...options,
  });
}

/**
 * Creates a Silkscreen text with stroke (outline)
 * @param {string} text - The text content
 * @param {number} strokeColor - Stroke color
 * @param {number} strokeThickness - Stroke thickness
 * @param {Object} options - Additional style options
 * @returns {PIXI.Text} - Styled text object
 */
export function createStrokedSilkscreenText(text, strokeColor, strokeThickness = 1, options = {}) {
  return createSilkscreenText(text, {
    stroke: strokeColor,
    strokeThickness,
    ...options,
  });
}

/**
 * Creates a PIXI.BitmapText object with HUD font styling
 * @param {string} text - The text content
 * @param {Object} options - Style options
 * @param {number} options.fontSize - Font size (defaults to GAME_CONFIG.FONT.SIZES.SMALL)
 * @param {number} options.fill - Text color (defaults to GAME_CONFIG.FONT.COLORS.WHITE)
 * @param {string} options.align - Text alignment 'left', 'center', 'right' (defaults to 'left')
 * @returns {PIXI.BitmapText} - Styled bitmap text object
 */
export function createBitmapText(text, options = {}) {
  const {
    fontSize = GAME_CONFIG.FONT.SIZES.SMALL,
    fill = GAME_CONFIG.FONT.COLORS.WHITE,
    align = 'left',
  } = options;

  return new PIXI.BitmapText({
    text,
    style: {
      fontFamily: GAME_CONFIG.FONT.BITMAP_FONT_NAME,
      fontSize,
      fill,
      align,
    },
    roundPixels: true,
  });
}

/**
 * Creates a small bitmap text
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.BitmapText} - Styled bitmap text object
 */
export function createSmallBitmapText(text, options = {}) {
  return createBitmapText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.SMALL,
    ...options,
  });
}

/**
 * Creates a medium bitmap text
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.BitmapText} - Styled bitmap text object
 */
export function createMediumBitmapText(text, options = {}) {
  return createBitmapText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.MEDIUM,
    ...options,
  });
}

/**
 * Creates a large bitmap text
 * @param {string} text - The text content
 * @param {Object} options - Additional style options
 * @returns {PIXI.BitmapText} - Styled bitmap text object
 */
export function createLargeBitmapText(text, options = {}) {
  return createBitmapText(text, {
    fontSize: GAME_CONFIG.FONT.SIZES.LARGE,
    ...options,
  });
}
