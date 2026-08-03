# Bomberman (PixiJS)

Estrutura inicial do projeto Bomberman usando PixiJS e Vite.

Instalação e execução:

```bash
npm install
npm run dev
```

Abrir http://localhost:5173 se não abrir automaticamente.

## Arquitetura em camadas

Documentação da estrutura incremental por camadas:

- `src/ARCHITECTURE_LAYERS.md`

## Observabilidade de runtime

O projeto expõe métricas leves de execução para profiling manual:

- Referência técnica: `src/OBSERVABILITY_RUNTIME.md`
- Snapshot mais recente no browser: `globalThis.__bombermanMetrics`
- Evento de telemetria: `GameEvents.RUNTIME_METRICS`
