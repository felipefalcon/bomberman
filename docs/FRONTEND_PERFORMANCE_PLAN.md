# Plano de Melhorias de Performance - Frontend (src/core)

## Status Atual
- **Backend:** 18 melhorias implementadas (50-70% ganho estimado)
- **Frontend:** Análise concluída, aguardando implementação

---

## 📊 ANÁLISE DE PROBLEMAS IDENTIFICADOS

### GameLoop.js
1. **Normalização repetida de playerIds** - `_normalizePlayerId` chamado múltiplas vezes por frame
2. **Criação/destruição excessiva de sprites** - Remote players criados/removidos frequentemente
3. **sortChildren() desnecessário** - Chamado mesmo quando não há mudanças
4. **Input enviado a cada frame** - Sem throttling, sobrecarrega servidor
5. **Snapshot verificado a cada frame** - Mesmo sem mudanças
6. **Cálculos repetidos de spawn positions** - Recalculado mesmo quando imutável

### EntityManager.js
1. **Criação de arrays em getters** - `getByType()` e `getAll()` criam novos arrays
2. **Iteração completa em find** - Percorre todas as entidades sempre
3. **Falta de cache** - Consultas repetidas sem cache

### OnlineStateBridge.js
1. **Input spamming** - `sendInput` chamado a cada frame (~60x por segundo)
2. **Sem verificação de taxa** - Não limita frequência de envio
3. **Snapshot processado completamente** - Sem delta compression
4. **Reconexão agressiva** - Pode causar loops de reconexão

### Player.js
1. **Getters sem cache** - Cada getter acessa gameState repetidamente
2. **Normalização repetida** - `_applyPlayerTint` normaliza playerId cada vez
3. **Cálculos de tint não cacheados** - Recalculados mesmo quando imutáveis

---

## 🎯 PLANO DE IMPLEMENTAÇÃO

### FASE 1: Otimizações de Comunicação (Alta Prioridade)

#### 1.1 🔥 Throttling de Input
**Problema:** Input enviado a cada frame (~60Hz), sobrecarregando servidor
**Solução:** Limitar envio a 20Hz (cada 50ms) com batching
**Ganho:** Reduz 70% do tráfego de input

**Implementação:**
```javascript
// No OnlineStateBridge:
constructor(gameState, player, onSnapshot = null) {
  // ... existing code ...
  this.lastInputSendTime = 0;
  this.inputThrottleMs = 50; // 20Hz
  this.pendingInput = null;
}

sendInput(input = {}) {
  if (!this.socket?.connected || !this.roomId) return;
  
  const now = Date.now();
  this.pendingInput = { ...(this.pendingInput || {}), ...(input || {}) };
  
  if (now - this.lastInputSendTime >= this.inputThrottleMs) {
    this.lastInputSendTime = now;
    this.clientInputTick += 1;
    this.clientInputSeq += 1;
    this.socket.emit('player-input', {
      roomId: this.roomId,
      input: {
        ...this.pendingInput,
        tick: this.clientInputTick,
        seq: this.clientInputSeq,
        sentAt: now,
      },
    });
    this.pendingInput = null;
  }
}
```

#### 1.2 🔥 Delta Compression de Snapshots
**Problema:** Snapshot completo enviado a cada tick, mesmo com poucas mudanças
**Solução:** Comparar com snapshot anterior e enviar apenas deltas
**Ganho:** Reduz 40-60% do tráfego de snapshots

**Implementação:**
```javascript
// No OnlineStateBridge:
constructor(gameState, player, onSnapshot = null) {
  // ... existing code ...
  this.lastSnapshotHash = null;
}

_computeSnapshotHash(snapshot) {
  return JSON.stringify({
    tick: snapshot.tick,
    players: snapshot.players?.map(p => ({
      playerId: p.playerId,
      x: p.x,
      y: p.y,
      lives: p.lives,
    })),
    bombs: snapshot.bombs?.length,
    explosions: snapshot.explosions?.length,
  });
}

this.socket.on('snapshot', (snapshot) => {
  const currentHash = this._computeSnapshotHash(snapshot);
  if (currentHash === this.lastSnapshotHash) {
    return; // Skip duplicate snapshots
  }
  this.lastSnapshotHash = currentHash;
  
  this.lastSnapshot = snapshot;
  this.hasRemoteSnapshot = true;
  this.onSnapshot?.(snapshot);
});
```

#### 1.3 🔥 Ack e Retransmissão
**Problema:** Sem confirmação de recebimento, pode perder inputs
**Solução:** Implementar ack do servidor e retransmissão
**Ganho:** Melhor confiabilidade sem aumentar tráfego

---

### FASE 2: Otimizações de Loop Principal (Alta Prioridade)

#### 2.1 🔥 Cache de Normalização de PlayerId
**Problema:** `_normalizePlayerId` chamado repetidamente no loop
**Solução:** Cache LRU de normalizações
**Ganho:** Reduz overhead de string operations

**Implementação:**
```javascript
// No GameLoop:
constructor(gameComponents) {
  // ... existing code ...
  this.playerIdCache = new Map();
  this.playerIdCacheMaxSize = 50;
}

_normalizePlayerId(playerId) {
  const raw = String(playerId || '').trim().toLowerCase();
  if (!raw) return '';
  
  if (this.playerIdCache.has(raw)) {
    return this.playerIdCache.get(raw);
  }
  
  let result;
  if (raw === 'p1' || raw === 'player1' || raw === '1') {
    result = 'player-1';
  } else if (raw === 'p2' || raw === 'player2' || raw === '2') {
    result = 'player-2';
  } else if (raw.startsWith('player-')) {
    result = raw;
  } else {
    result = raw;
  }
  
  // Cache com LRU
  if (this.playerIdCache.size >= this.playerIdCacheMaxSize) {
    const firstKey = this.playerIdCache.keys().next().value;
    this.playerIdCache.delete(firstKey);
  }
  this.playerIdCache.set(raw, result);
  
  return result;
}
```

#### 2.2 🔥 Object Pooling de Remote Players
**Problema:** Sprites criados/destruídos frequentemente
**Solução:** Pool de sprites reutilizáveis
**Ganho:** Reduz GC pressure e alocação de memória

**Implementação:**
```javascript
// No GameLoop:
constructor(gameComponents) {
  // ... existing code ...
  this.remotePlayerPool = [];
  this.maxPoolSize = 8;
}

_getPooledRemotePlayer() {
  return this.remotePlayerPool.pop() || this._createRemotePlayerEntry();
}

_releaseRemotePlayer(remoteEntry) {
  if (this.remotePlayerPool.length < this.maxPoolSize) {
    const sprite = remoteEntry?.sprite || remoteEntry;
    sprite.visible = false;
    this.remotePlayerPool.push(remoteEntry);
  } else {
    const sprite = remoteEntry?.sprite || remoteEntry;
    sprite?.parent?.removeChild(sprite);
  }
}

// No _renderRemotePlayers:
for (const [playerId, remoteEntry] of Array.from(remotePlayers.entries())) {
  if (!otherPlayers.some((entry) => this._normalizePlayerId(entry?.playerId) === playerId)) {
    this._releaseRemotePlayer(remoteEntry);
    remotePlayers.delete(playerId);
  }
}
```

#### 2.3 🔥 Otimizar sortChildren
**Problema:** `sortChildren()` chamado mesmo quando não há mudanças
**Solução:** Flag para marcar quando ordem mudou
**Ganho:** Reduz overhead de renderização

**Implementação:**
```javascript
// No GameLoop:
constructor(gameComponents) {
  // ... existing code ...
  this.needsSorting = false;
}

// No _renderRemotePlayers:
for (const entry of otherPlayers) {
  // ... existing code ...
  if (!remoteEntry) {
    remoteEntry = this._getPooledRemotePlayer();
    const sprite = remoteEntry?.sprite || remoteEntry;
    this.components.gameContainer.addChild(sprite);
    this.needsSorting = true;
    remotePlayers.set(entryId, remoteEntry);
  }
  // ... rest of code ...
}

if (this.needsSorting) {
  this.components.gameContainer.sortChildren();
  this.needsSorting = false;
}
```

#### 2.4 🔥 Skip Snapshot Processing Quando Imutável
**Problema:** Snapshot processado mesmo quando tick não mudou
**Solução:** Verificar tick antes de processar
**Ganho:** Reduz processamento desnecessário

**Implementação:**
```javascript
// No GameLoop update:
if (window.__ONLINE_ENABLED__ && snapshot) {
  const hasNewSnapshot = this._hasNewOnlineSnapshot(snapshot);
  if (hasNewSnapshot) {
    this._syncOnlineWorld(snapshot, tickDelta);
    if (snapshot?.players) {
      this._renderRemotePlayers(snapshot.players, snapshot.tick);
    }
  }
}
```

---

### FASE 3: Otimizações de EntityManager (Média Prioridade)

#### 3.1 ⚡ Cache em Getters
**Problema:** `getByType()` e `getAll()` criam novos arrays
**Solução:** Retornar iteradores ou arrays imutáveis cacheados
**Ganho:** Reduz alocação de memória

**Implementação:**
```javascript
// No EntityManager:
constructor() {
  this.entities = new Map();
  this.entitiesByType = new Map();
  this.nextId = 1;
  this._cachedArrays = new Map();
  this._cacheVersion = 0;
}

invalidateCache() {
  this._cacheVersion++;
  this._cachedArrays.clear();
}

add(entity, type = 'default') {
  // ... existing code ...
  this.invalidateCache();
  return id;
}

remove(id) {
  // ... existing code ...
  this.invalidateCache();
  return data.entity;
}

getByType(type) {
  const cacheKey = `type:${type}:${this._cacheVersion}`;
  if (this._cachedArrays.has(cacheKey)) {
    return this._cachedArrays.get(cacheKey);
  }
  
  const ids = this.entitiesByType.get(type);
  if (!ids) {
    this._cachedArrays.set(cacheKey, []);
    return [];
  }
  
  const entities = [];
  for (const id of ids) {
    const data = this.entities.get(id);
    if (data) {
      entities.push(data.entity);
    }
  }
  
  this._cachedArrays.set(cacheKey, entities);
  return entities;
}
```

#### 3.2 ⚡ Índice Espacial para Queries
**Problema:** `find()` itera sobre todas as entidades
**Solução:** Índice espacial simples por região
**Ganho:** O(n) → O(log n) para queries espaciais

---

### FASE 4: Otimizações de Player (Média Prioridade)

#### 4.1 ⚡ Cache de Getters
**Problema:** Getters acessam gameState repetidamente
**Solução:** Cache com invalidação em mudanças
**Ganho:** Reduz acessos a objeto gameState

**Implementação:**
```javascript
// No Player:
constructor(x, y, tileSize = GAME_CONFIG.TILE_SIZE, textures = null, mapping = null, gameState = null) {
  // ... existing code ...
  this._stateCache = new Map();
  this._stateCacheVersion = 0;
}

_getCachedState(getterFn, cacheKey) {
  const cached = this._stateCache.get(cacheKey);
  if (cached && cached.version === this._stateCacheVersion) {
    return cached.value;
  }
  
  const value = getterFn();
  this._stateCache.set(cacheKey, { value, version: this._stateCacheVersion });
  return value;
}

invalidateStateCache() {
  this._stateCacheVersion++;
}

get lives() {
  return this._getCachedState(
    () => this.gameState?.playerState?.lives ?? GAME_CONFIG.PLAYER_STARTING_LIVES,
    'lives'
  );
}

// Chamar invalidateStateCache quando gameState mudar
```

#### 4.2 ⚡ Cache de Player Tints
**Problema:** `_applyPlayerTint` recalcula tint mesmo quando imutável
**Solução:** Cache de tints por playerId
**Ganho:** Reduz cálculos de cor

**Implementação:**
```javascript
// No GameLoop:
constructor(gameComponents) {
  // ... existing code ...
  this.playerTintCache = new Map();
}

_applyPlayerTint(sprite, playerId) {
  const cacheKey = this._normalizePlayerId(playerId);
  if (this.playerTintCache.has(cacheKey)) {
    const tint = this.playerTintCache.get(cacheKey);
    sprite.tint = tint;
    return;
  }
  
  // ... existing tint calculation ...
  this.playerTintCache.set(cacheKey, sprite.tint);
}
```

---

### FASE 5: Otimizações de Network (Média Prioridade)

#### 5.1 ⚡ WebSocket Binary Mode
**Problema:** Envio de dados em JSON (text) é mais lento
**Solução:** Usar binary mode para payloads grandes
**Ganho:** 20-30% redução em tamanho de payload

#### 5.2 ⚡ Reconnection Backoff Exponencial
**Problema:** Reconexão linear pode sobrecarregar servidor
**Solução:** Exponential backoff com jitter
**Ganho:** Melhor estabilidade de conexão

**Implementação:**
```javascript
// No OnlineStateBridge:
constructor(gameState, player, onSnapshot = null) {
  // ... existing code ...
  this.reconnectAttempts = 0;
  this.maxReconnectDelay = 30000; // 30s max
}

this.socket = io(socketUrl, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: (attemptNumber) => {
    this.reconnectAttempts = attemptNumber;
    const delay = Math.min(1000 * Math.pow(2, attemptNumber), this.maxReconnectDelay);
    return delay + Math.random() * 500; // Add jitter
  },
  reconnectionDelayMax: this.maxReconnectDelay,
  timeout: 2000,
});
```

---

### FASE 6: Otimizações de Renderização (Baixa Prioridade)

#### 6.1 💡 Frame Skipping
**Problema:** Tenta renderizar a 60fps mesmo quando não consegue
**Solução:** Skip frames quando sobrecarregado
**Ganho:** Melhor responsividade em situações de lag

#### 6.2 💡 Delta Time Smoothing
**Problema:** Delta time pode variar muito
**Solução:** Suavizar delta time
**Ganho:** Movimentação mais suave

#### 6.3 💡 Culling de Entidades
**Problema:** Renderiza entidades fora da tela
**Solução:** Não renderizar fora da viewport
**Ganho:** Reduz carga de GPU

---

## 🎯 ORDEM RECOMENDADA DE IMPLEMENTAÇÃO

### Sprint 1 - Comunicação (Ganho Imediato)
1. Throttling de Input (20Hz)
2. Delta Compression de Snapshots
3. Ack e Retransmissão

**Impacto esperado:** 60-70% redução em tráfego de rede

### Sprint 2 - Loop Principal (Ganho Significativo)
4. Cache de Normalização de PlayerId
5. Object Pooling de Remote Players
6. Otimizar sortChildren
7. Skip Snapshot Processing Quando Imutável

**Impacto esperado:** 30-40% redução em CPU

### Sprint 3 - EntityManager (Ganho Moderado)
8. Cache em Getters
9. Índice Espacial para Queries

**Impacto esperado:** 20-30% redução em alocação de memória

### Sprint 4 - Player (Ganho Moderado)
10. Cache de Getters
11. Cache de Player Tints

**Impacto esperado:** 10-15% redução em CPU

### Sprint 5 - Network (Ganho Moderado)
12. WebSocket Binary Mode
13. Reconnection Backoff Exponencial

**Impacto esperado:** 15-20% melhoria em estabilidade

### Sprint 6 - Renderização (Ganho Menor)
14. Frame Skipping
15. Delta Time Smoothing
16. Culling de Entidades

**Impacto esperado:** 5-10% melhoria em suavidade

---

## 📈 RESUMO DE IMPACTO ESTIMADO

| Fase | Complexidade | Impacto CPU | Impacto Memória | Impacto Network |
|------|-------------|-------------|-----------------|-----------------|
| Fase 1 | Média | - | - | 🔥🔥🔥🔥🔥 |
| Fase 2 | Alta | 🔥🔥🔥🔥 | 🔥🔥🔥 | - |
| Fase 3 | Média | 🔥🔥 | 🔥🔥🔥🔥 | - |
| Fase 4 | Baixa | 🔥🔥 | 🔥 | - |
| Fase 5 | Média | - | - | 🔥🔥🔥 |
| Fase 6 | Baixa | 🔥 | 🔥 | - |

**Ganho total estimado frontend:** 50-70% redução em consumo de rede e 30-40% redução em CPU

**Ganho combinado (backend + frontend):** 70-85% melhoria geral de performance

---

## 🔍 MÉTRICAS PARA AVALIAÇÃO

### Métricas Pré-Implementação
- FPS médio
- Input rate (inputs/segundo)
- Snapshot rate (snapshots/segundo)
- Tamanho médio de payload
- Latência de round-trip
- Memory usage do cliente
- CPU usage do cliente

### Métricas Pós-Implementação
- Comparar com métricas pré-implementação
- Medir ganho percentual por Sprint
- Identificar regressões
- Ajustar estratégia baseado em resultados

---

## 🚀 NOTAS DE IMPLEMENTAÇÃO

1. **Testes:** Implementar testes de performance antes e depois de cada Sprint
2. **Benchmark:** Usar Chrome DevTools Performance para profiling
3. **Gradual:** Implementar uma melhoria por vez e medir impacto
4. **Rollback:** Manter código original comentado para fácil rollback se necessário
5. **Monitoramento:** Implementar métricas em produção para validar ganhos reais

---

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

### Sprint 1 (Fase 1)
- [ ] 1.1 Throttling de Input
- [ ] 1.2 Delta Compression de Snapshots
- [ ] 1.3 Ack e Retransmissão

### Sprint 2 (Fase 2)
- [ ] 2.1 Cache de Normalização de PlayerId
- [ ] 2.2 Object Pooling de Remote Players
- [ ] 2.3 Otimizar sortChildren
- [ ] 2.4 Skip Snapshot Processing Quando Imutável

### Sprint 3 (Fase 3)
- [ ] 3.1 Cache em Getters
- [ ] 3.2 Índice Espacial para Queries

### Sprint 4 (Fase 4)
- [ ] 4.1 Cache de Getters
- [ ] 4.2 Cache de Player Tints

### Sprint 5 (Fase 5)
- [ ] 5.1 WebSocket Binary Mode
- [ ] 5.2 Reconnection Backoff Exponencial

### Sprint 6 (Fase 6)
- [ ] 6.1 Frame Skipping
- [ ] 6.2 Delta Time Smoothing
- [ ] 6.3 Culling de Entidades

---

**Última atualização:** 2025-08-05
**Status:** Planejamento concluído, aguardando aprovação para implementação
