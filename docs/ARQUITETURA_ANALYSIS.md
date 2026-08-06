# Análise de Arquitetura - Bomberman (PixiJS)

**Data:** 27/07/2026  
**Objetivo:** Avaliar estrutura, identificar problemas e sugerir melhorias para escalabilidade e manutenibilidade.

---

## 1. Estrutura Geral e Padrões

### Organização de Diretórios
```
src/
├── config/          # Configurações centralizadas
├── engine/          # Infraestrutura base (EventBus)
├── entities/        # Entidades do jogo (Player, Monster, Powerup)
├── loaders/         # Carregamento de assets
├── managers/        # Gerenciadores (Audio, GameState, HUD, Input)
├── map/             # Mapa e tiles
├── systems/         # Sistemas de jogo (Bomb, Explosion, Powerup, Monster)
└── utils/           # Utilitários
```

### Padrões Arquiteturais Identificados

- **ECS (Entity-Component-System) parcial**: Separação entre entidades (`entities/`), sistemas (`systems/`) e gerenciadores
- **Event-Driven Architecture**: `EventBus` central para desacoplamento entre componentes
- **Manager Pattern**: Gerenciadores especializados (AudioManager, InputManager, GameState)
- **Factory Pattern**: Loaders para criação de assets
- **Scene Pattern**: `Scene` e `GameScene` para gerenciamento de lifecycle

### Pontos Fortes da Estrutura

- **Separação de responsabilidades**: Cada módulo tem função clara
- **Configuração centralizada**: `Constants.js` com todos os parâmetros do jogo
- **Desacoplamento via eventos**: `EventBus` permite comunicação sem dependências diretas
- **Sistemas modulares**: Cada sistema (Bomb, Explosion, Collision) é independente

---

## 2. Problemas de Arquitetura

### Problemas Críticos

#### 1. Game.js como God Object
- **567 linhas** com múltiplas responsabilidades:
  - Inicialização de assets
  - Game loop
  - Lógica de bombas (duplicada com BombSystem)
  - Gerenciamento de entidades
  - Event listeners
- Viola Single Responsibility Principle
- Difícil de testar e manter

#### 2. Acoplamento Alto entre Game e Sistemas
```javascript
// Game.js passa dependências manualmente
this.bombSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });
this.explosionSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });
```
- Injeção manual de dependências
- Sistemas dependem de estrutura específica de objeto scene
- Difícil de mockar para testes

#### 3. Duplicação de Código
- Lógica de bombas em `Game.js` (métodos legacy) e `BombSystem.js`
- Collision detection em `Player.js`
- Métodos legacy em Game.js: `_updateBombs`, `_spawnMonsters`, `_updateExplosions`

#### 4. Estado Duplicado
- `Player` mantém seu próprio estado (lives, bombs, powerups)
- `GameState` também mantém estado do player
- Sincronização manual via eventos
- Risco de inconsistência

### Anti-Padrões Identificados

- **Feature envy**: `Player.js` acessa diretamente `bombSystem` para kick bombs
- **Shotgun surgery**: Adicionar novo powerup requer alterações em múltiplos arquivos
- **Magic numbers**: Alguns valores hardcoded apesar de `Constants.js`
- **Callback hell**: `Game.js` usa callbacks para explosões
- **God Object**: `Game.js` com responsabilidades excessivas

---

## 3. Melhorias para Escalabilidade

### Arquitetura

#### Implementar ECS Completo
```javascript
// Componentes de dados
class PositionComponent { x, y }
class VelocityComponent { vx, vy }
class HealthComponent { lives, maxLives }
class BombComponent { maxBombs, activeBombs, range }

// Component manager simplificado
class ComponentManager {
  addComponent(type, player, gameState) { /* ... */ }
  hasComponent(type) { /* ... */ }
}
```

#### Dependency Injection
```javascript
// Em vez de:
this.bombSystem.setScene({ getContainer: () => this.gameContainer, map: this.map });

// Usar:
constructor(container, map, collisionSystem) {
  this.container = container;
  this.map = map;
  this.collisionSystem = collisionSystem;
}
```

#### State Management Centralizado
- Remover estado duplicado de `Player`
- `GameState` como single source of truth
- Entidades como views apenas
- Unidirectional data flow

### Modularização

#### Quebrar Game.js em Módulos Menores
```
src/core/
├── GameInitializer.js    # Setup inicial
├── GameLoop.js           # Loop principal
└── SystemCoordinator.js  # Orquestração de sistemas
```

#### Sistema de Componentes para Powerups
```javascript
// Em vez de flags booleanas
this.hasKickBomb = true;
this.hasThrowBomb = true;

// Usar:
this.components = {
  kickBomb: new KickBombComponent(),
  throwBomb: new ThrowBombComponent()
};
```

### Performance

- **Object pooling** para sprites frequentemente criados/destruídos
- **Spatial partitioning** para collision detection (quadtree ou grid)
- **Asset bundling** para reduzir requests
- **Lazy loading** para assets não essenciais

---

## 4. Áreas que Seguem Melhores Práticas

### Excelentes Implementações

#### EventBus
- Implementação robusta com:
  - Subscribe/unsubscribe
  - Once events
  - Error handling
  - Event constants centralizadas
- **Localização**: `src/engine/EventBus.js`

#### Constants.js
- Configuração bem organizada:
  - Agrupada por categoria (HUD, Player, Monster, etc.)
  - Nomes descritivos
  - Valores centralizados
- **Localização**: `src/config/Constants.js`

#### InputManager
- Abstração limpa de input:
  - Estado atual e anterior
  - Movement vector
  - Event emission
- **Localização**: `src/managers/InputManager.js`

#### Scene/GameScene
- Lifecycle bem definido:
  - create/activate/deactivate/destroy
  - Sistema de gerenciamento de entidades
- **Localização**: `src/engine/Scene.js`

### Boas Práticas de Código

- **JSDoc comments**: Documentação consistente
- **Error handling**: Try/catch em operações assíncronas
- **Fallback mechanisms**: Placeholders quando assets falham
- **Modular imports**: ES modules bem estruturados
- **Event-driven communication**: Desacoplamento via EventBus

---

## 5. Recomendações Prioritárias

### Imediato (Fase 1)

#### 1. Remover Código Duplicado em Game.js
- [ ] Eliminar métodos legacy (_updateBombs, _spawnMonsters, _updateExplosions)
- [ ] Delegar totalmente para sistemas
- [ ] Remover referências a `this.keys` (usar InputManager)
- **Impacto**: Reduz Game.js de 567 para ~300 linhas

#### 2. Unificar Estado do Player
- [ ] Remover estado duplicado de `Player`
- [ ] Usar `GameState` como fonte única
- [ ] Player como view apenas (ler estado de GameState)
- **Impacto**: Elimina sincronização manual

#### 3. Padronizar Injeção de Dependências
- [ ] Criar container DI simples
- [ ] Eliminar setScene manual
- [ ] Passar dependências via constructor
- **Impacto**: Melhora testabilidade e reduz acoplamento

### Médio Prazo (Fase 2)

#### 4. Implementar ECS Completo
- [ ] Extrair componentes das entidades
- [ ] Refatorar sistemas para operarem em componentes
- [ ] Criar SystemCoordinator
- **Impacto**: Maior flexibilidade e reusabilidade

#### 5. Sistema de Powerups Baseado em Componentes
- [ ] Eliminar flags booleanas
- [ ] Permitir composição dinâmica
- [ ] Facilitar adição de novos powerups
- **Impacto**: Reduz shotgun surgery

#### 6. Quebrar Game.js em Módulos
- [ ] Criar GameInitializer
- [ ] Criar GameLoop
- [ ] Criar SystemCoordinator
- **Impacto**: Melhora manutenibilidade

### Longo Prazo (Fase 3)

#### 7. Arquitetura de Rede
- [ ] Separar lógica de visualização
- [ ] Preparar para multiplayer
- [ ] Implementar determinismo
- **Impacto**: Habilita multiplayer

#### 8. Sistema de Save/Load
- [ ] Serializar estado
- [ ] Persistência de progresso
- [ ] Checkpoints
- **Impacto**: Melhora experiência do usuário

#### 9. Ferramentas de Editor
- [ ] Editor de mapas visual
- [ ] Editor de powerups
- [ ] Preview de assets
- **Impacto**: Acelera desenvolvimento

---

## 6. Métricas Atuais

### Complexidade
- **Game.js**: 567 linhas (alto)
- **BombSystem.js**: 991 linhas (alto)
- **HudManager.js**: 16659 bytes (muito alto)
- **Média geral**: Aceitável, com picos em arquivos específicos

### Acoplamento
- **Alto**: Game.js → todos os sistemas
- **Médio**: Sistemas → Scene/Map
- **Baixo**: Sistemas entre si (via EventBus)

### Coesão
- **Alta**: Sistemas individuais (BombSystem, ExplosionSystem)
- **Média**: Managers (GameState, AudioManager)
- **Baixa**: Game.js (múltiplas responsabilidades)

---

## 7. Plano de Refatoração Sugerido

### Semana 1-2: Limpeza Imediata
1. Remover código duplicado em Game.js
2. Unificar estado do player
3. Padronizar injeção de dependências

### Semana 3-4: Modularização
4. Quebrar Game.js em módulos
5. Implementar sistema de componentes para powerups
6. Refatorar collision detection

### Semana 5-6: ECS
7. Extrair componentes das entidades
8. Refatorar sistemas para ECS
9. Criar SystemCoordinator

### Semana 7-8: Polimento
10. Otimização de performance
11. Melhoria de testes
12. Documentação atualizada

---

## 8. Riscos e Mitigações

### Risco: Regressões durante refatoração
- **Mitigação**: Testes automatizados, commits frequentes, code review

### Risco: Curva de aprendizado para ECS
- **Mitigação**: Documentação, exemplos, pair programming

### Risco: Degradação de performance
- **Mitigação**: Benchmarking antes/depois, profiling

### Risco: Aumento de complexidade
- **Mitigação**: Simplificar onde possível, manter padrões consistentes

---

## Conclusão

A arquitetura atual do projeto Bomberman demonstra **boas práticas fundamentais** com separação clara de responsabilidades, sistema de eventos robusto e configuração centralizada. No entanto, sofre de **problemas de escalabilidade** devido ao `Game.js` funcionar como God Object, estado duplicado entre entidades e gerenciadores, e acoplamento alto via injeção manual de dependências.

**Principais pontos fortes**: EventBus, Constants.js, InputManager, e organização modular de sistemas.

**Principais pontos fracos**: Game.js monolítico (567 linhas), duplicação de lógica de bombas/collision, estado duplicado do player, e falta de ECS completo.

**Recomendação prioritária**: Refatorar `Game.js` para eliminar responsabilidades excessivas e implementar injeção de dependências consistente, seguido pela unificação do estado do player em `GameState`.
