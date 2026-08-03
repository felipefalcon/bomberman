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
- Runtime diagnostics are produced by `infrastructure/observability/RuntimeMetricsCollector` and consumed through `GameEvents.RUNTIME_METRICS`.

## Observability Placement

- Metrics collection belongs to `infrastructure/` because it is a technical concern.
- The loop integration (`core/GameLoop`) only calls `observeFrame(...)` and does not process diagnostics logic.
- Consumers should subscribe through the event bus or inspect `globalThis.__bombermanMetrics` during manual tests.

## Optional Final Cleanup (Non-breaking)

- Keep diagnostics contracts centralized in one guide: `src/OBSERVABILITY_RUNTIME.md`.
- Avoid scattering ad-hoc `console.log` profiling outside the collector.
- If new runtime indicators are added, evolve the metrics payload compatibly.

## Compatibility Strategy

Existing paths remain valid through re-export shims in old locations:

- `systems/bomb/BombFactory` re-exports from `domain/bomb/BombFactory`
- `systems/explosion/ExplosionRenderer` re-exports from `presentation/renderers/ExplosionRenderer`

This allows step-by-step migration with minimal risk.
