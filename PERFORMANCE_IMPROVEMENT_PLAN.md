# Plano de Melhorias de Performance - RoomManager

## Status Atual
- **7 melhorias já implementadas:**
  1. ✅ Otimização do reduce de uniquePlayers (O(n²) → O(n))
  2. ✅ Otimização do updateExplosions (O(n*m) → O(n+m))
  3. ✅ Otimização do updatePowerups (O(n*m) → O(n+m))
  4. ✅ Cache de Math.SQRT1_2 no constructor
  5. ✅ Evitar conversões Number() repetidas no loop de players
  6. ✅ Converter setInterval para loop adaptativo com setTimeout
  7. ✅ Implementar batch de emissões de snapshots

---

## 📊 CATEGORIZAÇÃO DAS MELHORIAS

### 🔥 ALTA PRIORIDADE (Impacto significativo)
### ⚡ MÉDIA PRIORIDADE (Ganho moderado)
### 💡 BAIXA PRIORIDADE (Micro-otimizações)

---

## PLANO DE IMPLEMENTAÇÃO

### FASE 1: Otimizações de Algoritmos (Alta Prioridade)

#### 1.1 🔥 Otimizar `emitSnapshot` quando `uniquePlayers` é null
**Problema:** Linhas 288-302 ainda usam reduce O(n²) quando chamado externamente
**Solução:** Aplicar a mesma otimização de Set para o fallback
**Ganho:** O(n²) → O(n) para chamadas externas (ex: `player-input`)

**Implementação:**
```javascript
emitSnapshot(roomId, room, uniquePlayers = null) {
  const players = uniquePlayers || (() => {
    const result = [];
    const seenPlayerIds = new Set();
    for (const player of room.players.values()) {
      if (!seenPlayerIds.has(player.playerId)) {
        seenPlayerIds.add(player.playerId);
        const inputX = Number(player.input?.x || 0);
        const inputY = Number(player.input?.y || 0);
        result.push({
          ...player,
          x: Math.round(player.x),
          y: Math.round(player.y),
          playerId: this.normalizePlayerId(player.playerId, result.length),
          isBlinking: Number(player.damageBlinkTicks || 0) > 0,
          facing: player.lastFacing || 'down',
          moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
        });
      }
    }
    return result;
  })();
  // ... restante do método
}
```

#### 1.2 🔥 Otimizar `explodeBomb` - filtra powerups e bombs
**Problema:** Linhas 744-746 usa `filter` que cria novo array; linhas 756-761 usa `find` em loop
**Solução:** Usar Set para powerups e Map para bombs lookup
**Ganho:** O(n*m) → O(n+m) em cadeamento de explosões

**Implementação:**
```javascript
explodeBomb(room, bomb) {
  room.bombs = room.bombs.filter((entry) => entry !== bomb);
  const owner = room.players.get(bomb.ownerSocketId);
  if (owner && owner.activeBombs > 0) {
    owner.activeBombs -= 1;
  }

  const tiles = this.getExplosionTiles(room, bomb);
  const explodedTileKeys = new Set(tiles.map((tile) => `${tile.tx},${tile.ty}`));

  // Otimização: usar filter com Set lookup em vez de loop
  room.powerups = room.powerups.filter((powerup) => {
    if (Number(powerup.immuneTicks || 0) > 0) return true;
    return !explodedTileKeys.has(`${powerup.tx},${powerup.ty}`);
  });

  // Criar Map de bombs para lookup O(1)
  const bombMap = new Map();
  for (const b of room.bombs) {
    bombMap.set(`${b.tx},${b.ty}`, b);
  }

  for (const tile of tiles) {
    this.upsertExplosion(room, tile.tx, tile.ty, tile.isCenter);

    const key = `${tile.tx},${tile.ty}`;
    if (room.destructibleTiles.has(key)) {
      room.destructibleTiles.delete(key);
      this.trySpawnPowerup(room, tile.tx, tile.ty);
    }
  }

  const chained = [];
  for (const tile of tiles) {
    const hitBomb = bombMap.get(`${tile.tx},${tile.ty}`);
    if (hitBomb) {
      hitBomb.timer = 0;
      chained.push(hitBomb);
    }
  }

  return chained;
}
```

#### 1.3 🔥 Otimizar `updateSlidingBombs` - verificação de colisão
**Problema:** Linha 796 usa `room.bombs.some()` em loop O(n²)
**Solução:** Criar Map temporário de posições de bombs
**Ganho:** O(n²) → O(n) para múltiplas bombs deslizando

**Implementação:**
```javascript
updateSlidingBombs(room, deltaTicks) {
  // Criar Map de posições de bombs para lookup O(1)
  const bombPositions = new Map();
  for (const bomb of room.bombs) {
    bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
  }

  for (const bomb of room.bombs) {
    if (!bomb.isSliding || bomb.isThrowing) continue;

    if (!Number.isFinite(bomb.slideProgress)) bomb.slideProgress = 0;
    if (!Number.isFinite(bomb.slideDx)) bomb.slideDx = 0;
    if (!Number.isFinite(bomb.slideDy)) bomb.slideDy = 0;
    if (bomb.slideDx === 0 && bomb.slideDy === 0) {
      bomb.isSliding = false;
      bomb.slideProgress = 0;
      this.setBombPixelFromTile(bomb);
      continue;
    }

    bomb.slideProgress += this.bombSlideSpeed * deltaTicks;
    while (bomb.slideProgress >= this.tileSize) {
      bomb.slideProgress -= this.tileSize;
      const nextTx = bomb.tx + bomb.slideDx;
      const nextTy = bomb.ty + bomb.slideDy;
      const nextKey = `${nextTx},${nextTy}`;

      if (this.isTileBlocked(room, nextTx, nextTy) ||
          (bombPositions.has(nextKey) && bombPositions.get(nextKey) !== bomb)) {
        bomb.isSliding = false;
        bomb.slideDx = 0;
        bomb.slideDy = 0;
        bomb.slideProgress = 0;
        break;
      }

      bomb.tx = nextTx;
      bomb.ty = nextTy;
      bombPositions.set(nextKey, bomb);
    }

    if (!bomb.isSliding) {
      this.setBombPixelFromTile(bomb);
    } else {
      bomb.x = (bomb.tx + (bomb.slideDx * bomb.slideProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
      bomb.y = (bomb.ty + (bomb.slideDy * bomb.slideProgress) / this.tileSize) * this.tileSize + this.tileSize / 2;
    }
  }
}
```

#### 1.4 🔥 Otimizar `updateThrownBombs` - verificação de colisão
**Problema:** Linha 847 usa `room.bombs.some()` repetidamente
**Solução:** Usar Map de posições como em updateSlidingBombs
**Ganho:** O(n²) → O(n) para múltiplas bombs sendo arremessadas

**Implementação:**
```javascript
updateThrownBombs(room, deltaTicks) {
  // Criar Map de posições de bombs para lookup O(1)
  const bombPositions = new Map();
  for (const bomb of room.bombs) {
    bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
  }

  for (const bomb of room.bombs) {
    if (!bomb.isThrowing) continue;

    // ... código existente ...

      if (currentSegment >= bomb.throwPath.length - 1 && segmentProgress > 0.8) {
        const lastTile = bomb.throwPath[bomb.throwPath.length - 1];
        const lastKey = `${lastTile.tx},${lastTile.ty}`;
        const hasBombAtTarget = bombPositions.has(lastKey) && bombPositions.get(lastKey) !== bomb;

        if (this.isTileBlocked(room, lastTile.tx, lastTile.ty) || hasBombAtTarget) {
          // ... restante do código
        }
      }

    // ... restante do código
  }
}
```

#### 1.5 🔥 Otimizar `updateFollowerBombs` - verificação de colisão
**Problema:** Linhas 962 e 990 usam `room.bombs.some()` em loops
**Solução:** Map de posições de bombs
**Ganho:** O(n²) → O(n) para follower bombs

**Implementação:**
```javascript
updateFollowerBombs(room, deltaTicks) {
  // Criar Map de posições de bombs para lookup O(1)
  const bombPositions = new Map();
  for (const bomb of room.bombs) {
    bombPositions.set(`${bomb.tx},${bomb.ty}`, bomb);
  }

  for (const bomb of room.bombs) {
    if (!bomb.isFollower || bomb.isLandMine || bomb.isSliding || bomb.isThrowing) continue;

    // ... código existente ...

        const nextTx = bomb.tx + bomb.followDx;
        const nextTy = bomb.ty + bomb.followDy;
        const nextKey = `${nextTx},${nextTy}`;

        if (this.isTileBlocked(room, nextTx, nextTy) ||
            (bombPositions.has(nextKey) && bombPositions.get(nextKey) !== bomb)) {
          const reroute = this.pickFollowerDirection(room, bomb, target);
          if (!reroute) {
            bomb.followDx = 0;
            bomb.followDy = 0;
            bomb.followProgress = 0;
            break;
          }
          bomb.followDx = reroute.dx;
          bomb.followDy = reroute.dy;
          continue;
        }

        bomb.tx = nextTx;
        bomb.ty = nextTy;
        bombPositions.set(nextKey, bomb);

    // ... restante do código
  }
}
```

#### 1.6 🔥 Otimizar `findNearestFollowerTarget`
**Problema:** Loop sobre todos players (pode ser otimizado com cache)
**Solução:** Cache de posições de players atualizado a cada tick
**Ganho:** Reduz overhead de cálculo de distância

**Implementação:**
```javascript
// No constructor:
this.playerPositionsCache = new Map();

// No startSimulationLoop, após atualizar posições dos players:
for (const [socketId, player] of room.players.entries()) {
  this.playerPositionsCache.set(socketId, { tx: player.tx, ty: player.ty });
}

findNearestFollowerTarget(room, bomb) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const player of room.players.values()) {
    if (player.id === bomb.ownerSocketId) continue;
    const cached = this.playerPositionsCache.get(player.id);
    const tx = cached ? cached.tx : player.tx;
    const ty = cached ? cached.ty : player.ty;
    const dist = Math.abs(tx - bomb.tx) + Math.abs(ty - bomb.ty);
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      best = player;
    }
  }
  return best;
}
```

---

### FASE 2: Redução de Alocação de Memória (Média Prioridade)

#### 2.1 ⚡ Object Pooling para `uniquePlayers`
**Problema:** Cria novo array a cada tick para cada room
**Solução:** Reutilizar array com tamanho máximo pré-alocado
**Ganho:** Reduz GC pressure

**Implementação:**
```javascript
// No constructor:
this.uniquePlayersPool = new Map(); // roomId -> array

// No startSimulationLoop:
for (const roomId of roomsNeedingSnapshot) {
  const room = this.rooms.get(roomId);
  if (room) {
    let uniquePlayers = this.uniquePlayersPool.get(roomId);
    if (!uniquePlayers || uniquePlayers.length < 4) {
      uniquePlayers = new Array(4);
      this.uniquePlayersPool.set(roomId, uniquePlayers);
    }

    const seenPlayerIds = new Set();
    let playerCount = 0;
    for (const player of room.players.values()) {
      if (!seenPlayerIds.has(player.playerId)) {
        seenPlayerIds.add(player.playerId);
        const inputX = Number(player.input?.x || 0);
        const inputY = Number(player.input?.y || 0);
        uniquePlayers[playerCount] = {
          ...player,
          x: Math.round(player.x),
          y: Math.round(player.y),
          playerId: this.normalizePlayerId(player.playerId, playerCount),
          isBlinking: Number(player.damageBlinkTicks || 0) > 0,
          facing: player.lastFacing || 'down',
          moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
        };
        playerCount++;
      }
    }

    // Criar slice apenas com players válidos
    const validPlayers = uniquePlayers.slice(0, playerCount);
    this.emitSnapshot(roomId, room, validPlayers);
  }
}
```

#### 2.2 ⚡ Object Pooling para Sets de tiles
**Problema:** `explosionTiles` e `powerupTiles` criados a cada tick
**Solução:** Reutilizar Sets com `.clear()`
**Ganho:** Reduz alocação de memória

**Implementação:**
```javascript
// No constructor:
this.setPool = [];

// Helper method:
getPooledSet() {
  let set = this.setPool.pop();
  if (!set) {
    set = new Set();
  }
  return set;
}

releasePooledSet(set) {
  set.clear();
  if (this.setPool.length < 10) {
    this.setPool.push(set);
  }
}

// Em updateExplosions:
updateExplosions(room, deltaTicks) {
  const explosionTiles = this.getPooledSet();
  try {
    for (const explosion of room.explosions) {
      const key = `${explosion.tx},${explosion.ty}`;
      if (!explosionTiles.has(key)) {
        explosionTiles.add(key);
      }
    }

    for (const player of room.players.values()) {
      const key = `${player.tx},${player.ty}`;
      const explosion = room.explosions.find(e => `${e.tx},${e.ty}` === key);
      if (explosion && !explosion.damagedPlayers?.has(player.id) && Number(player.damageBlinkTicks || 0) <= 0) {
        player.lives = Math.max(0, Number(player.lives || 0) - 1);
        player.damageBlinkTicks = this.playerDamageBlinkDurationTicks;
        explosion.damagedPlayers?.add(player.id);
      }
    }

    for (const explosion of room.explosions) {
      explosion.timer -= deltaTicks;
    }

    room.explosions = room.explosions.filter((explosion) => explosion.timer > 0);
  } finally {
    this.releasePooledSet(explosionTiles);
  }
}
```

#### 2.3 ⚡ Evitar spread operator em snapshot
**Problema:** `...player` copia todo o objeto player (linhas 276, 300)
**Solução:** Copiar apenas propriedades necessárias explicitamente
**Ganho:** Reduz memória e tempo de cópia

**Implementação:**
```javascript
uniquePlayers.push({
  id: player.id,
  playerId: this.normalizePlayerId(player.playerId, uniquePlayers.length),
  x: Math.round(player.x),
  y: Math.round(player.y),
  lives: player.lives,
  maxBombs: player.maxBombs,
  explosionRange: player.explosionRange,
  isBlinking: Number(player.damageBlinkTicks || 0) > 0,
  facing: player.lastFacing || 'down',
  moving: Math.abs(inputX) > 0.001 || Math.abs(inputY) > 0.001,
});
```

#### 2.4 ⚡ Cache de `getRoomSeed`
**Problema:** Recalcula hash do roomId a cada chamada
**Solução:** Cache no objeto room quando criado
**Ganho:** Elimina cálculo de hash repetido

**Implementação:**
```javascript
getOrCreateRoom(roomId) {
  if (!this.rooms.has(roomId)) {
    const matchNonce = this.buildNextMatchNonce(0);
    const room = {
      id: roomId,
      players: new Map(),
      status: 'waiting',
      tick: 0,
      lastTickAt: Date.now(),
      winnerPlayerId: null,
      matchNonce,
      destructibleTiles: this.buildDestructibleTiles(roomId, matchNonce),
      bombs: [],
      explosions: [],
      powerups: [],
      nextBombId: 1,
      nextExplosionId: 1,
      nextPowerupId: 1,
      seed: this.getRoomSeed(roomId), // Cache aqui
    };
    this.rooms.set(roomId, room);
  }

  return this.rooms.get(roomId);
}

// Usar cache em emitSnapshot:
emitSnapshot(roomId, room, uniquePlayers = null) {
  // ...
  seed: room.seed, // Usar cache
  // ...
}
```

---

### FASE 3: Otimizações de Network/I/O (Média Prioridade)

#### 3.1 ⚡ Compressão/Throttling de snapshots
**Problema:** Envia snapshot completo a cada tick (16ms)
**Solução:** Enviar apenas delta (mudanças) ou throttling para clientes com lag
**Ganho:** Reduz bandwidth significativamente

**Implementação:**
```javascript
// No constructor:
this.lastSnapshotStates = new Map(); // roomId -> last state
this.clientLagStatus = new Map(); // socketId -> lag level

// Modificar emitSnapshot para enviar delta:
emitSnapshot(roomId, room, uniquePlayers = null) {
  const currentState = this.buildCurrentState(room, uniquePlayers);
  const lastState = this.lastSnapshotStates.get(roomId);

  let payload;
  if (lastState && this.shouldSendDelta(roomId)) {
    payload = this.buildDeltaState(lastState, currentState);
  } else {
    payload = currentState;
  }

  this.lastSnapshotStates.set(roomId, currentState);
  this.io.to(roomId).emit('snapshot', payload);
}

buildDeltaState(lastState, currentState) {
  // Implementar comparação e enviar apenas diferenças
  // Complexidade: alta, benefício: muito alto
}
```

#### 3.2 ⚡ Merge de eventos WebSocket
**Problema:** Múltiplos emits para o mesmo room em sequência
**Solução:** Já implementado parcialmente, pode ser expandido
**Ganho:** Reduz overhead de WebSocket

**Implementação:**
```javascript
// Já implementado no startSimulationLoop:
// - roomsNeedingBroadcast para broadcastRoomState
// - roomsNeedingSnapshot para emitSnapshot

// Pode ser expandido para outros eventos
```

---

### FASE 4: Otimizações de Lógica (Baixa Prioridade)

#### 4.1 💡 Cache de `normalizePlayerId`
**Problema:** Normalização repetida para mesmo playerId
**Solução:** Cache LRU de normalizações
**Ganho:** Micro-otimização em join/create-room

**Implementação:**
```javascript
// No constructor:
this.normalizePlayerIdCache = new Map();

normalizePlayerId(playerId, playerCount = 0) {
  const cacheKey = `${playerId}:${playerCount}`;
  if (this.normalizePlayerIdCache.has(cacheKey)) {
    return this.normalizePlayerIdCache.get(cacheKey);
  }

  const raw = String(playerId || '').trim();
  let result;

  if (!raw) {
    result = `player-${playerCount + 1}`;
  } else {
    const lowered = raw.toLowerCase();
    if (lowered === 'p1' || lowered === 'player1' || lowered === '1') {
      result = 'player-1';
    } else if (lowered === 'p2' || lowered === 'player2' || lowered === '2') {
      result = 'player-2';
    } else if (lowered.startsWith('player-')) {
      result = lowered;
    } else {
      result = raw;
    }
  }

  this.normalizePlayerIdCache.set(cacheKey, result);
  return result;
}
```

#### 4.2 💡 Cache de `facingToDirection`
**Problema:** Switch case executado repetidamente
**Solução:** Usar Map const estático
**Ganho:** Micro-otimização

**Implementação:**
```javascript
// Como propriedade estática da classe:
static FACING_DIRECTION_MAP = new Map([
  ['up', { dx: 0, dy: -1 }],
  ['left', { dx: -1, dy: 0 }],
  ['right', { dx: 1, dy: 0 }],
  ['down', { dx: 0, dy: 1 }],
]);

facingToDirection(facing = 'down') {
  return RoomManager.FACING_DIRECTION_MAP.get(facing) || { dx: 0, dy: 1 };
}
```

#### 4.3 💡 Inline de `isWallTile` em loops críticos
**Problema:** Chamada de função em loop de `getExplosionTiles`
**Solução:** Inliner ou cache de wall tiles
**Ganho:** Reduz overhead de chamada de função

**Implementação:**
```javascript
// No constructor:
this.wallTiles = new Set();

// Inicializar wall tiles:
this.initializeWallTiles();

initializeWallTiles() {
  for (let tx = 0; tx < this.mapCols; tx++) {
    for (let ty = 0; ty < this.mapRows; ty++) {
      if (this.isWallTile(tx, ty)) {
        this.wallTiles.add(`${tx},${ty}`);
      }
    }
  }
}

// Em getExplosionTiles:
getExplosionTiles(room, bomb) {
  const tiles = [{ tx: bomb.tx, ty: bomb.ty, isCenter: true }];
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const dir of directions) {
    for (let i = 1; i <= bomb.range; i += 1) {
      const tx = bomb.tx + dir.dx * i;
      const ty = bomb.ty + dir.dy * i;
      const key = `${tx},${ty}`;

      // Usar cache em vez de chamada de função
      if (this.wallTiles.has(key)) break;

      const isDestructible = room.destructibleTiles.has(key);
      tiles.push({ tx, ty, isCenter: false });

      if (isDestructible && !bomb.canPierceBlocks) {
        break;
      }
    }
  }

  return tiles;
}
```

#### 4.4 💡 Pre-computar spawn positions
**Problema:** Recalcula posições de spawn a cada spawn
**Solução:** Pre-computar no constructor
**Ganho:** Elimina cálculo repetido

**Implementação:**
```javascript
// No constructor:
this.spawnPositions = new Map([
  ['player-1', { x: this.tileSize * 1 + this.tileSize / 2, y: this.tileSize * 1 + this.tileSize / 2 }],
  ['player-2', { x: this.tileSize * (this.mapCols - 2) + this.tileSize / 2, y: this.tileSize * (this.mapRows - 2) + this.tileSize / 2 }],
  ['player-3', { x: this.tileSize * (this.mapCols - 2) + this.tileSize / 2, y: this.tileSize * 1 + this.tileSize / 2 }],
  ['player-4', { x: this.tileSize * 1 + this.tileSize / 2, y: this.tileSize * (this.mapRows - 2) + this.tileSize / 2 }],
]);

getSpawnPosition(playerId, playerCount) {
  const normalizedId = this.normalizePlayerId(playerId, playerCount).toLowerCase();
  return this.spawnPositions.get(normalizedId) || this.spawnPositions.get('player-1');
}
```

#### 4.5 💡 Otimizar `getTileRandomValue`
**Problema:** Cálculo de hash executado múltiplas vezes para mesmo tile
**Solução:** Cache de valores randômicos por tile durante setup
**Ganho:** Reduz cálculo de hash em buildDestructibleTiles

**Implementação:**
```javascript
// No constructor:
this.tileRandomCache = new Map();

buildDestructibleTiles(roomId, matchNonce = 0) {
  const tiles = new Set();
  const cacheKey = `${roomId}:${matchNonce}`;

  // Verificar cache
  if (this.tileRandomCache.has(cacheKey)) {
    return new Set(this.tileRandomCache.get(cacheKey));
  }

  for (let ty = 1; ty < this.mapRows - 1; ty += 1) {
    for (let tx = 1; tx < this.mapCols - 1; tx += 1) {
      if (this.isSpawnSafeTile(tx, ty)) {
        continue;
      }

      if (tx % 2 === 0 && ty % 2 === 0) {
        continue;
      }

      const regionX = Math.floor(tx / 3);
      const regionY = Math.floor(ty / 3);
      const regionNoise = this.getTileRandomValue(roomId, regionX, regionY, 'region', matchNonce);
      const localNoise = this.getTileRandomValue(roomId, tx, ty, 'local', matchNonce);
      const roll = this.getTileRandomValue(roomId, tx, ty, 'roll', matchNonce);

      let chance = this.destructibleChance * (0.52 + regionNoise * 0.68);

      if (tx % 2 === 1 && ty % 2 === 1) {
        chance += 0.06;
      } else {
        chance -= 0.04;
      }

      chance += (localNoise - 0.5) * 0.12;
      chance = Math.max(0.28, Math.min(0.82, chance));

      if (roll < chance) {
        tiles.add(`${tx},${ty}`);
      }
    }
  }

  // Cache resultado
  this.tileRandomCache.set(cacheKey, Array.from(tiles));
  return tiles;
}
```

---

### FASE 5: Arquitetural (Média Prioridade)

#### 5.1 ⚡ Separar simulação de emissão de rede
**Problema:** Simulação e emissão estão acopladas no mesmo loop
**Solução:** Usar padrão producer-consumer com filas separadas
**Ganho:** Melhor isolamento e possibilidade de threading futuro

**Implementação:**
```javascript
// No constructor:
this.snapshotQueue = [];
this.isNetworkThreadRunning = false;

// Modificar startSimulationLoop:
startSimulationLoop() {
  const loop = () => {
    const start = Date.now();
    const now = start;

    // Fase de simulação (puro cálculo)
    for (const [roomId, room] of this.rooms.entries()) {
      // ... lógica de simulação ...

      // Enfileirar snapshot em vez de emitir imediatamente
      this.snapshotQueue.push({
        roomId,
        room,
        uniquePlayers: /* ... */,
        timestamp: now
      });
    }

    // Processar fila de snapshots em separado
    this.processSnapshotQueue();

    const elapsed = Date.now() - start;
    const delay = Math.max(0, this.simulationStepMs - elapsed);
    this.tickTimeout = setTimeout(loop, delay);
  };

  this.tickTimeout = setTimeout(loop, this.simulationStepMs);
}

processSnapshotQueue() {
  while (this.snapshotQueue.length > 0) {
    const snapshot = this.snapshotQueue.shift();
    this.emitSnapshot(snapshot.roomId, snapshot.room, snapshot.uniquePlayers);
  }
}
```

#### 5.2 ⚡ Adicionar sistema de profiling/metrics
**Problema:** Dificuldade de medir impacto das otimizações
**Solução:** Adicionar timers para medir tempo de cada fase do tick
**Ganho:** Visibilidade para otimizações futuras

**Implementação:**
```javascript
// No constructor:
this.metrics = {
  tickCount: 0,
  totalTickTime: 0,
  playerUpdateTime: 0,
  bombUpdateTime: 0,
  explosionUpdateTime: 0,
  powerupUpdateTime: 0,
  snapshotEmitTime: 0,
  maxTickTime: 0,
};

// No startSimulationLoop:
startSimulationLoop() {
  const loop = () => {
    const tickStart = Date.now();
    const now = tickStart;

    // Player update
    const playerStart = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      // ... player update ...
    }
    this.metrics.playerUpdateTime += Date.now() - playerStart;

    // Bomb update
    const bombStart = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      this.updateBombs(room, deltaTicks);
    }
    this.metrics.bombUpdateTime += Date.now() - bombStart;

    // Explosion update
    const explosionStart = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      this.updateExplosions(room, deltaTicks);
    }
    this.metrics.explosionUpdateTime += Date.now() - explosionStart;

    // Powerup update
    const powerupStart = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      this.updatePowerups(room, deltaTicks);
    }
    this.metrics.powerupUpdateTime += Date.now() - powerupStart;

    // Snapshot emit
    const snapshotStart = Date.now();
    for (const roomId of roomsNeedingSnapshot) {
      // ... emit snapshot ...
    }
    this.metrics.snapshotEmitTime += Date.now() - snapshotStart;

    // Update metrics
    const tickTime = Date.now() - tickStart;
    this.metrics.tickCount++;
    this.metrics.totalTickTime += tickTime;
    this.metrics.maxTickTime = Math.max(this.metrics.maxTickTime, tickTime);

    const elapsed = Date.now() - tickStart;
    const delay = Math.max(0, this.simulationStepMs - elapsed);
    this.tickTimeout = setTimeout(loop, delay);
  };

  this.tickTimeout = setTimeout(loop, this.simulationStepMs);
}

// Método para obter metrics:
getMetrics() {
  const avgTickTime = this.metrics.tickCount > 0
    ? this.metrics.totalTickTime / this.metrics.tickCount
    : 0;

  return {
    ...this.metrics,
    avgTickTime,
    avgPlayerUpdate: this.metrics.tickCount > 0 ? this.metrics.playerUpdateTime / this.metrics.tickCount : 0,
    avgBombUpdate: this.metrics.tickCount > 0 ? this.metrics.bombUpdateTime / this.metrics.tickCount : 0,
    avgExplosionUpdate: this.metrics.tickCount > 0 ? this.metrics.explosionUpdateTime / this.metrics.tickCount : 0,
    avgPowerupUpdate: this.metrics.tickCount > 0 ? this.metrics.powerupUpdateTime / this.metrics.tickCount : 0,
    avgSnapshotEmit: this.metrics.tickCount > 0 ? this.metrics.snapshotEmitTime / this.metrics.tickCount : 0,
  };
}
```

---

## 🎯 ORDEM RECOMENDADA DE IMPLEMENTAÇÃO

### Sprint 1 - Ganhos Imediatos (Fase 1)
1. Otimizar `emitSnapshot` fallback
2. Otimizar `explodeBomb`
3. Otimizar `updateSlidingBombs`
4. Otimizar `updateThrownBombs`
5. Otimizar `updateFollowerBombs`
6. Otimizar `findNearestFollowerTarget`

**Impacto esperado:** 30-40% redução em tempo de CPU em cenários com muitas bombs/explosões

### Sprint 2 - Redução de GC (Fase 2)
7. Object pooling para uniquePlayers
8. Object pooling para Sets
9. Evitar spread operator
10. Cache de getRoomSeed

**Impacto esperado:** 20-30% redução em memory allocation e GC pauses

### Sprint 3 - Network (Fase 3)
11. Compressão/throttling de snapshots
12. Merge adicional de eventos

**Impacto esperado:** 40-60% redução em bandwidth

### Sprint 4 - Micro-otimizações (Fase 4)
13-17. Otimizações de lógica diversas

**Impacto esperado:** 5-10% ganho adicional

### Sprint 5 - Arquitetural (Fase 5)
18-19. Separação de concerns e metrics

**Impacto esperado:** Melhor manutenibilidade e visibilidade

---

## 📈 RESUMO DE IMPACTO ESTIMADO

| Fase | Complexidade | Impacto CPU | Impacto Memória | Impacto Network |
|------|-------------|-------------|-----------------|-----------------|
| Fase 1 | Alta | 🔥🔥🔥🔥🔥 | - | - |
| Fase 2 | Média | 🔥🔥 | 🔥🔥🔥🔥🔥 | - |
| Fase 3 | Média | - | - | 🔥🔥🔥🔥🔥 |
| Fase 4 | Baixa | 🔥 | 🔥 | - |
| Fase 5 | Alta | - | - | - |

**Ganho total estimado:** 50-70% redução em latency percebida

---

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

### Sprint 1 (Fase 1)
- [ ] 1.1 Otimizar emitSnapshot fallback
- [ ] 1.2 Otimizar explodeBomb
- [ ] 1.3 Otimizar updateSlidingBombs
- [ ] 1.4 Otimizar updateThrownBombs
- [ ] 1.5 Otimizar updateFollowerBombs
- [ ] 1.6 Otimizar findNearestFollowerTarget

### Sprint 2 (Fase 2)
- [ ] 2.1 Object pooling para uniquePlayers
- [ ] 2.2 Object pooling para Sets
- [ ] 2.3 Evitar spread operator
- [ ] 2.4 Cache de getRoomSeed

### Sprint 3 (Fase 3)
- [ ] 3.1 Compressão/throttling de snapshots
- [ ] 3.2 Merge adicional de eventos

### Sprint 4 (Fase 4)
- [ ] 4.1 Cache de normalizePlayerId
- [ ] 4.2 Cache de facingToDirection
- [ ] 4.3 Inline de isWallTile
- [ ] 4.4 Pre-computar spawn positions
- [ ] 4.5 Otimizar getTileRandomValue

### Sprint 5 (Fase 5)
- [ ] 5.1 Separar simulação de emissão de rede
- [ ] 5.2 Adicionar sistema de profiling/metrics

---

## 🔍 MÉTRICAS PARA AVALIAÇÃO

### Métricas Pré-Implementação
- Tempo médio por tick (ms)
- Pico de tempo por tick (ms)
- Memory usage (MB)
- GC frequency e duration
- Network bandwidth (KB/s)
- Latência de snapshot (ms)

### Métricas Pós-Implementação
- Comparar com métricas pré-implementação
- Medir ganho percentual por Sprint
- Identificar regressões
- Ajustar estratégia baseado em resultados

---

## 🚀 NOTAS DE IMPLEMENTAÇÃO

1. **Testes:** Implementar testes de performance antes e depois de cada Sprint
2. **Benchmark:** Usar ferramentas como `clinic.js` ou `0x` para profiling
3. **Gradual:** Implementar uma melhoria por vez e medir impacto
4. **Rollback:** Manter código original comentado para fácil rollback se necessário
5. **Monitoramento:** Implementar métricas em produção para validar ganhos reais

---

**Última atualização:** 2025-08-05
**Status:** Planejamento concluído, aguardando aprovação para implementação
