# Plano de Migracao para Online - Bomberman 4 Players (Socket.IO)

Status atual
- Deploy publico single player concluido e estavel.
- Proxima fase: migracao incremental para multiplayer online.
- Diretriz: economizar tokens, executar por etapas pequenas e testaveis.

## Principios de execucao
1. Uma etapa por vez, sem adiantar a proxima.
2. Maximo de 3 a 6 arquivos alterados por etapa.
3. Cada etapa termina com teste rapido de 2 a 5 minutos.
4. Avancar somente com aprovacao explicita: OK etapa N.
5. Monstros nao serao removidos do codigo:
- PvP online 4P: monstros desativados por configuracao.
- Futuro single player historia: monstros reativados.

## Arquitetura alvo
- Servidor autoritativo com Socket.IO.
- Cliente Pixi apenas renderiza e envia intencao de input.
- Salas de ate 4 jogadores.
- Simulacao por tick fixo no servidor.
- Snapshot periodico do servidor para os clientes.

## Escopo funcional MVP online 4P
1. Lobby e salas.
2. Entrada de 2 a 4 jogadores.
3. Inicio de partida sincronizado.
4. Movimento, bomba e dano sincronizados.
5. Timer e fim de partida sincronizados.
6. Reconexao basica.
7. Monstros desligados no modo PvP (logica preservada no projeto).

## Plano incremental

### Etapa 0 - Baseline e flag de modo online
Objetivo
- Proteger o single player antes da migracao.

Mudancas
- Adicionar flag de modo de jogo e modo de rede.
- Documentar baseline de comportamento e metricas.

Arquivos foco
- src/config/Constants.js
- src/OBSERVABILITY_RUNTIME.md
- src/infrastructure/observability/RuntimeMetricsCollector.js

Teste rapido
1. Rodar single player.
2. Confirmar que nada mudou na jogabilidade.
3. Confirmar metricas em runtime.

Criterio de pronto
- Zero regressao visual, input e timer.

### Etapa 1 - Determinismo com seed (sem rede ainda)
Objetivo
- Garantir repetibilidade para evitar desync no multiplayer.

Mudancas
- Introduzir RNG com seed injetavel.
- Remover dependencia direta de Math.random da logica de jogo.

Arquivos foco
- src/map/TileMap.js
- src/systems/MonsterSystem.js
- src/entities/Monster.js
- src/systems/PowerupSystem.js
- src/core/GameInitializer.js

Teste rapido
1. Iniciar duas partidas com a mesma seed.
2. Comparar layout de blocos e eventos iniciais.

Criterio de pronto
- Mesma seed gera mesmos resultados iniciais.

### Etapa 2 - Preparar cliente para comandos de rede
Objetivo
- Separar input local de comando de jogo.

Mudancas
- Transformar input em estrutura de comando por tick.
- Criar fluxo local que simula envio de comandos.

Arquivos foco
- src/managers/InputManager.js
- src/application/handlers/BombActionHandler.js
- src/core/GameLoop.js
- src/Game.js

Teste rapido
1. Single player continua funcionando.
2. Ver log de comandos por tick no modo online mock.

Criterio de pronto
- Sem impacto no modo offline.

### Etapa 3 - Servidor Socket.IO minimo com salas
Objetivo
- Levantar backbone online.

Mudancas
- Criar servidor Node + Socket.IO.
- Implementar create/join/leave room.
- Limite de 4 jogadores por sala.

Arquivos novos esperados
- server/package.json
- server/src/index.js
- server/src/rooms/RoomManager.js
- server/src/rooms/RoomState.js
- server/src/protocol/events.js

Teste rapido
1. Abrir 2 a 4 abas.
2. Entrar na mesma sala.
3. Ver lista de players e status da sala.

Criterio de pronto
- Sala estavel com ate 4 jogadores.

### Etapa 4 - Snapshot autoritativo de movimento e timer
Objetivo
- Servidor vira fonte da verdade de estado base.

Mudancas
- Cliente envia input.
- Servidor processa tick.
- Servidor envia snapshot.
- Cliente aplica snapshot com suavizacao minima.

Arquivos foco cliente
- src/Game.js
- src/core/GameLoop.js
- src/managers/GameState.js
- src/entities/Player.js

Arquivos foco servidor
- server/src/sim/SimulationLoop.js
- server/src/sim/GameStateOnline.js

Teste rapido
1. Dois clientes movimentando simultaneamente.
2. Ambos veem o mesmo estado.

Criterio de pronto
- Sincronizacao consistente de posicao e timer.

### Etapa 5 - Bombas e explosoes autoritativas
Objetivo
- Migrar regras mais sensiveis para servidor.

Mudancas
- Servidor valida plantio de bomba.
- Timer de bomba, explosao e dano calculados no servidor.
- Cliente apenas reproduz resultado.

Arquivos foco cliente
- src/systems/BombSystem.js
- src/systems/ExplosionSystem.js
- src/application/handlers/BombLifecycleHandler.js

Arquivos foco servidor
- server/src/sim/systems/BombSystemOnline.js
- server/src/sim/systems/ExplosionSystemOnline.js

Teste rapido
1. Dois players plantam bombas em paralelo.
2. Resultado identico em todos os clientes.

Criterio de pronto
- Sem desync de bomba e dano.

### Etapa 6 - Powerups e habilidades especiais
Objetivo
- Sincronizar coleta e efeitos para 4 players.

Mudancas
- Spawn/coleta no servidor.
- Aplicacao de efeitos no servidor.
- Snapshot replica estado de powerups.

Arquivos foco cliente
- src/systems/PowerupSystem.js
- src/components/ComponentManager.js
- src/components/PowerupComponent.js
- src/components/PowerupComponents.js
- src/entities/Player.js

Arquivos foco servidor
- server/src/sim/systems/PowerupSystemOnline.js

Teste rapido
1. Spawn e coleta com 2 clientes.
2. Sem duplicacao de item.
3. Efeito coerente para todos.

Criterio de pronto
- Estado de powerups consistente em toda a sala.

### Etapa 7 - Suavizacao de rede
Objetivo
- Melhorar sensacao de controle.

Mudancas
- Predicao local do proprio player.
- Interpolacao para jogadores remotos.
- Reconciliacao leve quando houver divergencia.

Arquivos foco
- src/core/GameLoop.js
- src/entities/Player.js
- src/managers/GameState.js
- src/infrastructure/observability/RuntimeMetricsCollector.js

Teste rapido
1. Simular latencia.
2. Verificar reducao de teleporte visual.

Criterio de pronto
- Jogabilidade aceitavel com latencia moderada.

### Etapa 8 - Robustez para beta
Objetivo
- Fechar requisitos de operacao real.

Mudancas
- Reconexao com janela de tolerancia.
- Timeout de inatividade.
- Validacao anti-cheat basica.
- Encerramento de partida confiavel.

Arquivos foco
- server/src/network/ConnectionGuard.js
- server/src/network/ReconnectionManager.js
- server/src/validation/InputValidator.js
- src/managers/HudManager.js

Teste rapido
1. Fechar e reabrir cliente.
2. Confirmar que a sala continua.
3. Confirmar timeout de jogador ausente.

Criterio de pronto
- MVP pronto para teste externo controlado.

## Politica de monstros (definicao oficial)
1. Nao remover MonsterSystem nem Monster.
2. Modo PvP online 4P: monstersEnabled = false.
3. Modo single historia futuro: monstersEnabled = true.
4. Futuro coop online: monstersEnabled opcional por sala.

## Criterios de aceite do MVP online 4P
1. 4 jogadores em sala unica com inicio sincronizado.
2. Movimento e bomba consistentes por 10 minutos sem desync critico.
3. Timer e condicao de vitoria identicos para todos.
4. Reconexao de 1 jogador sem derrubar partida.
5. Telemetria minima de RTT e jitter visivel.

## Forma economica de trabalho com IA (tokens)
1. Prompt de execucao por etapa:
- Execute Etapa N. Mudanca minima. Nao avance para Etapa N+1.
2. Prompt de correcoes:
- Corrija apenas o erro X da Etapa N, sem refatoracao extra.
3. Prompt de validacao:
- Revise Etapa N e liste somente riscos bloqueantes.

## Prompt inicial para novo chat
Use o arquivo PLANO_ONLINE_SOCKETIO_4P.md como fonte unica.
Execute apenas a Etapa 0 com mudanca minima.
Nao avance para a proxima etapa sem meu OK.
Ao final, entregue: arquivos alterados, o que mudou, como testar em 2-5 minutos e criterio de pronto.
