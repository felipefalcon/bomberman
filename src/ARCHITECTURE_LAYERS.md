# Architecture Layers

This project now uses an incremental layered architecture. The structure is designed to avoid big-bang rewrites and keep old imports working while modules migrate.

## Layers

- `application/`: orchestration and use-case handlers
- `domain/`: gameplay rules and factories without rendering details
- `presentation/`: visual renderers and UI-facing modules
- `infrastructure/`: technical adapters and bridges (events, runtime services)

## Current Migration State

- `core/GameLoop` now imports handlers from `application/`.
- Bomb construction is provided by `domain/bomb/BombFactory`.
- Explosion visuals are provided by `presentation/renderers/ExplosionRenderer`.
- Event bridge is available in `infrastructure/events/EventBusBridge` and re-exported by `infrastructure/index`.

## Compatibility Strategy

Existing paths remain valid through re-export shims in old locations:

- `core/handlers/*` re-export from `application/handlers/*`
- `systems/bomb/BombFactory` re-exports from `domain/bomb/BombFactory`
- `systems/explosion/ExplosionRenderer` re-exports from `presentation/renderers/ExplosionRenderer`

This allows step-by-step migration with minimal risk.
