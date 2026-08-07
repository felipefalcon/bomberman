# Sistema de Salas Online - Bomberman

## Visão Geral

O sistema de salas online permite que jogadores criem, entrem e joguem partidas multijogador do Bomberman através de uma interface de lobby intuitiva. O sistema consiste em:

- **Backend**: Gerenciamento de salas via Socket.IO no servidor
- **Frontend**: Páginas HTML para lobby, sala de espera e integração com o jogo

## Arquitetura

### Backend (`server/src/rooms/RoomManager.js`)

O `RoomManager` foi expandido para suportar CRUD de salas com as seguintes funcionalidades:

#### Estrutura da Sala

```javascript
{
  id: string,              // ID único da sala
  name: string,            // Nome da sala
  maxPlayers: number,      // Máximo de jogadores (2-4)
  password: string | null,  // Senha opcional
  creatorId: string,       // Socket ID do criador
  players: Map,            // Jogadores conectados
  status: string,          // 'waiting', 'playing', 'finished'
  locked: boolean,         // true se jogo está em andamento
  hostSocketId: string,    // Socket ID do host atual
  // ... outras propriedades do jogo
}
```

#### Eventos Socket.IO

**Cliente → Servidor:**

- `list-rooms` - Lista todas as salas disponíveis
- `create-room-with-config` - Cria sala com configurações
  - `name`: nome da sala
  - `maxPlayers`: quantidade de jogadores (2-4)
  - `password`: senha opcional
  - `playerId`: ID do jogador criador
- `get-room-details` - Obtém detalhes de uma sala específica
  - `roomId`: ID da sala
- `join-room` - Entra em uma sala
  - `roomId`: ID da sala
  - `playerId`: ID do jogador
  - `password`: senha (se necessário)
- `start-game` - Inicia o jogo (só host)
  - `roomId`: ID da sala
- `leave-room` - Sai da sala
  - `roomId`: ID da sala

**Servidor → Cliente:**

- `rooms-list` - Retorna lista de salas
  - `rooms`: array de salas
- `room-created` - Confirma criação de sala
  - `roomId`: ID da sala criada
  - `room`: dados da sala
- `room-details` - Retorna detalhes da sala
  - `room`: dados completos da sala
- `room-error` - Erro de operação
  - `message`: mensagem de erro
- `game-starting` - Jogo iniciando
  - `roomId`: ID da sala
- `host-changed` - Host foi repassado para outro jogador
  - `newHostSocketId`: Socket ID do novo host
  - `newHostPlayerId`: Player ID do novo host
- `room-state` - Estado atual da sala (já existia)

### Frontend

#### Arquivos

1. **`lobby.html`** - Página principal do lobby
   - Lista todas as salas disponíveis
   - Modal para criar salas
   - Modal para ver detalhes e entrar em salas
   - Auto-refresh a cada 3 segundos

2. **`waiting-room.html`** - Sala de espera
   - Mostra informações da sala atual
   - Lista jogadores conectados
   - Botão "JOGAR" para o host
   - Contagem regressiva antes do jogo
   - Atualização em tempo real

3. **`room-test.html`** - Página de teste
   - Interface simples para testar todas as funcionalidades do backend
   - Útil para debug e validação

4. **`index.html`** - Jogo principal (modificado)
   - Aceita parâmetros `roomId` e `playerId` via URL
   - Integração automática com o sistema online

## Fluxo de Uso

### 1. Criar uma Sala

1. Jogador acessa `lobby.html`
2. Clica em "Criar Sala"
3. Preenche:
   - Nome da sala
   - Quantidade de jogadores (2-4)
   - Senha (opcional)
4. Clica em "Criar Sala"
5. É redirecionado automaticamente para `waiting-room.html`

### 2. Listar e Entrar em Sala

1. Jogador acessa `lobby.html`
2. Vê lista de salas disponíveis (atualizada a cada 3s)
3. Clica em uma sala para ver detalhes
4. No modal:
   - Vê nome, jogadores atuais, status
   - Se tiver senha, digita a senha
   - Clica em "Participar"
5. É redirecionado para `waiting-room.html`

### 3. Sala de Espera

1. Jogadores veem:
   - Nome e detalhes da sala
   - Lista de jogadores conectados
   - Status (aguardando jogadores / pronto para começar)
2. Host vê botão "JOGAR" quando há 2+ jogadores
3. Host clica em "JOGAR"
4. Sala é bloqueada para novos participantes
5. Contagem regressiva: 3, 2, 1, GO!
6. Todos são redirecionados para o jogo

### 4. Jogo

1. Jogadores são redirecionados para `index.html?roomId=X&playerId=Y`
2. Jogo inicializa com configurações online
3. Partida ocorre normalmente

## API de Eventos

### Exemplo de Uso

```javascript
// Conectar ao servidor
const socket = io('http://localhost:3001', { transports: ['websocket'] });

// Listar salas
socket.emit('list-rooms');
socket.on('rooms-list', (data) => {
  console.log('Salas:', data.rooms);
});

// Criar sala
socket.emit('create-room-with-config', {
  name: 'Minha Sala',
  maxPlayers: 4,
  password: '123',
  playerId: 'player-abc'
});
socket.on('room-created', (data) => {
  console.log('Sala criada:', data.roomId);
});

// Entrar em sala
socket.emit('join-room', {
  roomId: 'room-123',
  playerId: 'player-xyz',
  password: '123'
});
socket.on('room-state', (state) => {
  console.log('Estado da sala:', state);
});

// Iniciar jogo (só host)
socket.emit('start-game', { roomId: 'room-123' });
socket.on('game-starting', (data) => {
  console.log('Jogo iniciando:', data.roomId);
});
```

## Configurações

### Variáveis de Configuração

No `RoomManager.js`:

- `maxPlayers`: 2-4 (validado no servidor)
- `password`: opcional (null para salas públicas)
- `locked`: true quando jogo está em andamento

### URL Parameters

**Lobby → Sala de Espera:**
```
waiting-room.html?roomId=<room-id>&playerId=<player-id>
```

**Sala de Espera → Jogo:**
```
index.html?roomId=<room-id>&playerId=<player-id>
```

## Mudança de Host

Quando o host atual desconecta ou sai da sala, o host é automaticamente repassado para o próximo jogador disponível:

### Funcionamento

1. **Detecção**: O servidor detecta quando o host desconecta (evento `disconnect`) ou sai (evento `leave-room`)
2. **Repasse**: O host é repassado para o primeiro jogador da lista
3. **Notificação**: O servidor envia `host-changed` para todos os clientes
4. **Atualização**: O frontend atualiza a interface mostrando o novo host

### Evento `host-changed`

```javascript
socket.on('host-changed', (data) => {
  console.log('Novo host:', data.newHostPlayerId);
  // Atualizar interface para mostrar novo host
});
```

### Validações

- ✓ O novo host pode iniciar o jogo
- ✓ O botão "JOGAR" aparece apenas para o novo host
- ✓ Notificação visual quando você se torna o host
- ✓ Funciona tanto em desconexão quanto em saída voluntária

## Troubleshooting

### Sala não aparece na lista

- Verifique se o servidor está rodando
- Verifique se o Socket.IO está conectado
- Aguarde o auto-refresh (3 segundos)

### Não consegue entrar em sala

- Verifique se a senha está correta
- Verifique se a sala não está cheia
- Verifique se a sala não está bloqueada (jogo em andamento)

### Botão "JOGAR" não aparece

- Apenas o host pode ver o botão
- É necessário pelo menos 2 jogadores
- Verifique se você é o host (mostrado na lista de jogadores)

### Jogo não inicia

- Verifique se o servidor está enviando o evento `game-starting`
- Verifique se os parâmetros `roomId` e `playerId` estão sendo passados corretamente
- Verifique o console do navegador para erros

### Erro de conexão

- Verifique se o servidor Socket.IO está rodando na porta 3001
- Verifique se não há firewall bloqueando a conexão
- Tente usar http://localhost:3001 para desenvolvimento local

## Validações

### Backend

- ✓ Nome da sala obrigatório
- ✓ MaxPlayers entre 2 e 4
- ✓ Senha validada ao entrar
- ✓ Sala cheia impede novas entradas
- ✓ Sala bloqueada impede novas entradas
- ✓ Apenas host pode iniciar jogo
- ✓ Mínimo 2 jogadores para iniciar

### Frontend

- ✓ Campos obrigatórios marcados
- ✓ Feedback visual de erros
- ✓ Botões desabilitados quando apropriado
- ✓ Indicadores de carregamento
- ✓ Auto-refresh de listas

## Próximas Melhorias

Sugestões para futuras melhorias:

1. **Persistência**: Salvar salas em banco de dados
2. **Sistema de ranking**: Pontuação e histórico
3. **Chat**: Chat na sala de espera
4. **Skins**: Personalização de personagens
5. **Modos de jogo**: Diferentes modos (survival, team, etc.)
6. **Spectator**: Permitir assistir partidas
7. **Kick**: Host poder remover jogadores
8. **Timer**: Timer automático para iniciar jogo

## Arquivos Modificados

### Backend
- `server/src/rooms/RoomManager.js` - Expandido com CRUD de salas

### Frontend
- `lobby.html` - NOVO: Página principal do lobby
- `waiting-room.html` - NOVO: Sala de espera
- `room-test.html` - NOVO: Página de teste
- `src/core/Game.js` - Modificado para aceitar novos parâmetros

## Como Testar

### Teste Rápido

1. Inicie o servidor: `cd server && npm start`
2. Acesse `lobby.html` em duas abas diferentes
3. Crie uma sala na primeira aba
4. Entre na sala na segunda aba
5. Inicie o jogo como host
6. Ambos devem ser redirecionados para o jogo

### Teste Completo

Use `room-test.html` para testar cada funcionalidade individualmente:

1. Conectar ao servidor
2. Listar salas
3. Criar sala com/sem senha
4. Entrar em sala com senha correta/incorreta
5. Ver detalhes da sala
6. Iniciar jogo como host/não-host
7. Sair da sala

## Suporte

Para problemas ou dúvidas, verifique:
- Console do navegador para erros
- Logs do servidor
- Documentação do Socket.IO
- Arquivo de troubleshooting acima
