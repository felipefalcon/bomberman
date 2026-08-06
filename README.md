# Bomberman (PixiJS + Socket.IO)

Projeto Bomberman com frontend em PixiJS (Vite) e backend Socket.IO para modo online em salas de ate 4 jogadores.

## Estado atual do online (em implementacao)

As mudancas online ja ativas nesta base incluem:

- Servidor autoritativo com Socket.IO.
- Salas com limite de 4 jogadores.
- Tick de simulacao no servidor.
- Snapshot sincronizado de players, bombas, explosoes, powerups e blocos destrutiveis.
- Seed deterministica por sala para manter consistencia de mapa.
- Modo PvP online com monstros desativados (single player preservado).

Planejamento incremental completo:

- `PLANO_ONLINE_SOCKETIO_4P.md`

## Pre-requisitos

- Node.js 18+ (recomendado 20+)
- npm

## Instalar dependencias

Instale dependencias do frontend (raiz) e do servidor (pasta `server`):

```bash
# na raiz do projeto
npm install

# no servidor
cd server
npm install
```

## Como subir o servidor online

Em um terminal, na pasta `server`:

```bash
cd server
npm start
```

Servidor Socket.IO padrao:

- `http://127.0.0.1:3001`

## Como subir o frontend

Em outro terminal, na raiz do projeto:

```bash
npm run dev
```

Frontend Vite padrao:

- `http://localhost:5173`
- Em producao (GitHub Pages), a URL sera algo como:
	- `https://SEU_USUARIO.github.io/bomberman/`
- Backend em producao (exemplo Render):
	- `https://SEU_BACKEND.onrender.com`

## Como entrar com mais de 1 jogador (2 a 4 jogadores)

Com servidor e frontend ligados:

1. Abra 2 a 4 abas do navegador.
2. Em cada aba, acesse a mesma sala com `online=1` e `room` igual.
3. Troque apenas o `player` por aba.

Exemplo (mesma sala `sala1`):

- Jogador 1: `http://localhost:5173/?online=1&room=sala1&player=player-1`
- Jogador 2: `http://localhost:5173/?online=1&room=sala1&player=player-2`
- Jogador 3: `http://localhost:5173/?online=1&room=sala1&player=player-3`
- Jogador 4: `http://localhost:5173/?online=1&room=sala1&player=player-4`

Exemplo em producao (GitHub Pages):

- Jogador 1: `https://SEU_USUARIO.github.io/bomberman/?online=1&room=sala1&player=player-1`

# Githubpages

- Jogador 1: `https://felipefalcon.github.io/bomberman/?online=1&room=sala1&player=player-1`
- Jogador 2: `https://felipefalcon.github.io/bomberman/?online=1&room=sala1&player=player-2`

Observacoes:

- O servidor normaliza IDs como `p1`, `player1` e `1` para `player-1`.
- Se a sala passar de 4 jogadores, o servidor emite erro de sala cheia.
- Para jogar offline/local, abra sem `online=1`.

## Teste rapido de salas Socket.IO

Existe uma pagina auxiliar para testar create/join/leave manualmente:

- `http://localhost:5173/socket-test.html`

Arquivo:

- `socket-test.html`

## Variaveis de ambiente para deploy

### Frontend (Vite)

Defina `VITE_SOCKET_URL` com a URL publica do backend Socket.IO.

Exemplo (`.env.production` na raiz):

```bash
VITE_SOCKET_URL=https://SEU_BACKEND.onrender.com
```

### Backend (Node.js + Socket.IO)

Defina `FRONTEND_ORIGIN` com a origem do frontend para CORS.
Aceita 1 origem ou varias separadas por virgula.

Exemplos:

- `FRONTEND_ORIGIN=https://SEU_USUARIO.github.io`
- `FRONTEND_ORIGIN=https://SEU_USUARIO.github.io,https://SEU_DOMINIO.com`

## Arquitetura e observabilidade

Documentacao tecnica complementar:

- Arquitetura por camadas: `src/ARCHITECTURE_LAYERS.md`
- Analise geral: `ARQUITETURA_ANALYSIS.md`
- Observabilidade runtime: `src/OBSERVABILITY_RUNTIME.md`

Metricas de runtime no browser:

- Snapshot: `globalThis.__bombermanMetrics`
- Evento de telemetria: `GameEvents.RUNTIME_METRICS`
