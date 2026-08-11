# Configuração de Fonte Silkscreen

Este documento explica como usar a fonte Silkscreen de forma centralizada no jogo Bomberman.

## Visão Geral

A fonte Silkscreen já está configurada e disponível para uso em todo o jogo através de:

1. **Configuração centralizada** em `src/config/Constants.js`
2. **Helpers utilitários** em `src/utils/textUtils.js`
3. **Importação da fonte** já está presente no `index.html`

## Configuração em Constants.js

```javascript
FONT: {
  FAMILY: 'Silkscreen',
  BITMAP_FONT_NAME: 'HUDFont',
  SIZES: {
    SMALL: 8,
    MEDIUM: 12,
    LARGE: 16,
    EXTRA_LARGE: 24,
  },
  WEIGHTS: {
    NORMAL: '400',
    BOLD: '700',
  },
  COLORS: {
    WHITE: 0xFFFFFF,
    BLACK: 0x000000,
    RED: 0xFF0000,
    GREEN: 0x00FF00,
    BLUE: 0x0000FF,
    YELLOW: 0xFFFF00,
    CYAN: 0x00FFFF,
    MAGENTA: 0xFF00FF,
  },
}
```

## Helpers Disponíveis

### Para PIXI.Text (texto vetorial)

#### `createSilkscreenText(text, options)`
Cria um texto básico com a fonte Silkscreen.

```javascript
import { createSilkscreenText } from '../utils/textUtils.js';

const text = createSilkscreenText('Hello World', {
  fontSize: GAME_CONFIG.FONT.SIZES.MEDIUM,
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

#### `createSmallSilkscreenText(text, options)`
Cria um texto pequeno (8px).

```javascript
const smallText = createSmallSilkscreenText('Small text', {
  fill: GAME_CONFIG.FONT.COLORS.YELLOW,
});
```

#### `createLargeSilkscreenText(text, options)`
Cria um texto grande (16px).

```javascript
const largeText = createLargeSilkscreenText('Large text', {
  fill: GAME_CONFIG.FONT.COLORS.RED,
});
```

#### `createExtraLargeSilkscreenText(text, options)`
Cria um texto extra grande (24px) para títulos.

```javascript
const title = createExtraLargeSilkscreenText('TITLE', {
  fill: GAME_CONFIG.FONT.COLORS.GREEN,
});
```

#### `createBoldSilkscreenText(text, options)`
Cria um texto em negrito.

```javascript
const boldText = createBoldSilkscreenText('Bold text', {
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

#### `createStrokedSilkscreenText(text, strokeColor, strokeThickness, options)`
Cria um texto com contorno.

```javascript
const strokedText = createStrokedSilkscreenText(
  'Stroked text',
  GAME_CONFIG.FONT.COLORS.BLACK,
  2,
  {
    fill: GAME_CONFIG.FONT.COLORS.WHITE,
  }
);
```

### Para PIXI.BitmapText (texto bitmap)

#### `createBitmapText(text, options)`
Cria um texto bitmap básico usando a fonte HUDFont.

```javascript
import { createBitmapText } from '../utils/textUtils.js';

const bitmapText = createBitmapText('Hello', {
  fontSize: GAME_CONFIG.FONT.SIZES.SMALL,
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

#### `createSmallBitmapText(text, options)`
Cria um texto bitmap pequeno (8px).

```javascript
const smallBitmap = createSmallBitmapText('Small', {
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

#### `createMediumBitmapText(text, options)`
Cria um texto bitmap médio (12px).

```javascript
const mediumBitmap = createMediumBitmapText('Medium', {
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

#### `createLargeBitmapText(text, options)`
Cria um texto bitmap grande (16px).

```javascript
const largeBitmap = createLargeBitmapText('Large', {
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```

## Opções Comuns

Todas as funções aceitam um objeto `options` com as seguintes propriedades:

- `fontSize`: Tamanho da fonte (número)
- `fill`: Cor do texto (número hexadecimal)
- `stroke`: Cor do contorno (número hexadecimal) - apenas para PIXI.Text
- `strokeThickness`: Espessura do contorno (número) - apenas para PIXI.Text
- `align`: Alinhamento do texto ('left', 'center', 'right')
- `fontWeight`: Peso da fonte ('400' ou '700') - apenas para PIXI.Text

## Exemplos de Uso

### Exemplo 1: Texto simples
```javascript
import { createSilkscreenText, GAME_CONFIG } from '../config/Constants.js';
import { createSilkscreenText } from '../utils/textUtils.js';

const scoreText = createSilkscreenText('Score: 100', {
  fontSize: GAME_CONFIG.FONT.SIZES.MEDIUM,
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
scoreText.x = 10;
scoreText.y = 10;
container.addChild(scoreText);
```

### Exemplo 2: Texto com contorno
```javascript
import { createStrokedSilkscreenText, GAME_CONFIG } from '../utils/textUtils.js';
import { GAME_CONFIG } from '../config/Constants.js';

const warningText = createStrokedSilkscreenText(
  'WARNING!',
  GAME_CONFIG.FONT.COLORS.BLACK,
  2,
  {
    fontSize: GAME_CONFIG.FONT.SIZES.LARGE,
    fill: GAME_CONFIG.FONT.COLORS.RED,
  }
);
warningText.x = centerX;
warningText.y = centerY;
container.addChild(warningText);
```

### Exemplo 3: Texto bitmap para HUD
```javascript
import { createSmallBitmapText, GAME_CONFIG } from '../utils/textUtils.js';

const timerText = createSmallBitmapText('3:20', {
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
timerText.x = 100;
timerText.y = 10;
container.addChild(timerText);
```

## Quando usar PIXI.Text vs PIXI.BitmapText

- **PIXI.Text**: Use para textos que precisam de escala flexível, suporte a diferentes pesos de fonte, ou quando precisa de contornos personalizados.
- **PIXI.BitmapText**: Use para textos de HUD que precisam de performance consistente e renderização pixel-perfect. A fonte bitmap já está configurada como 'HUDFont'.

## Cores Disponíveis

Use as cores predefinidas em `GAME_CONFIG.FONT.COLORS`:

```javascript
GAME_CONFIG.FONT.COLORS.WHITE   // 0xFFFFFF
GAME_CONFIG.FONT.COLORS.BLACK   // 0x000000
GAME_CONFIG.FONT.COLORS.RED     // 0xFF0000
GAME_CONFIG.FONT.COLORS.GREEN   // 0x00FF00
GAME_CONFIG.FONT.COLORS.BLUE    // 0x0000FF
GAME_CONFIG.FONT.COLORS.YELLOW  // 0xFFFF00
GAME_CONFIG.FONT.COLORS.CYAN    // 0x00FFFF
GAME_CONFIG.FONT.COLORS.MAGENTA // 0xFF00FF
```

## Benefícios da Configuração Centralizada

1. **Consistência**: Todos os textos usam a mesma fonte
2. **Fácil manutenção**: Altere a fonte em um único lugar
3. **Type safety**: Configurações tipadas e documentadas
4. **Helpers convenientes**: Funções prontas para casos comuns
5. **Escalabilidade**: Fácil adicionar novos tamanhos ou cores

## Migração de Código Existente

Se você tiver código usando diretamente `new PIXI.Text()` ou `new PIXI.BitmapText()`, migre para os helpers:

**Antes:**
```javascript
const text = new PIXI.Text({
  text: 'Hello',
  style: {
    fontFamily: 'Arial',
    fontSize: 12,
    fill: 0xffffff,
  },
});
```

**Depois:**
```javascript
const text = createSilkscreenText('Hello', {
  fontSize: GAME_CONFIG.FONT.SIZES.MEDIUM,
  fill: GAME_CONFIG.FONT.COLORS.WHITE,
});
```
