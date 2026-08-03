# Runtime Observability Guide

This document describes how runtime metrics are collected, published, and consumed during manual profiling.

## Goals

- Keep profiling lightweight and always-on during development.
- Provide stable visibility into frame pacing and entity pressure.
- Avoid coupling gameplay rules to diagnostics concerns.

## Current Architecture

- Producer: `infrastructure/observability/RuntimeMetricsCollector`
- Integration point: `core/GameLoop.update(...)`
- Event channel: `GameEvents.RUNTIME_METRICS` (`runtime:metrics`)
- Global mirror for fast inspection: `globalThis.__bombermanMetrics`

## Metric Payload Contract

Published once per reporting interval (default 1000ms):

```js
{
  fps: number,
  frameTimeP95Ms: number,
  entities: {
    bombs: number,
    monsters: number,
    powerups: number,
    explosions: number,
    destroyingBlocks: number,
  },
  timestamp: number,
}
```

## How To Inspect During Manual Tests

1. Run the game with `npm run dev`.
2. Open browser DevTools Console.
3. Read latest sample from `globalThis.__bombermanMetrics`.

Example:

```js
globalThis.__bombermanMetrics
```

## Event Subscription Example

For temporary diagnostics tools or overlays, subscribe to the event bus instead of polling global state:

```js
import { globalEventBus, GameEvents } from './engine/EventBus.js';

const unsubscribe = globalEventBus.on(GameEvents.RUNTIME_METRICS, (metrics) => {
  console.log('[metrics]', metrics);
});

// Later
unsubscribe();
```

## Operational Thresholds (Suggested)

- Healthy frame pacing target: `frameTimeP95Ms <= 20ms`.
- Investigate spikes when `frameTimeP95Ms > 30ms` for several consecutive samples.
- Watch entity pressure when explosions and monsters both stay high.

These thresholds are guidance only and should be tuned by level complexity.

## Maintenance Notes

- Prefer adding new counters in `RuntimeMetricsCollector` only.
- Keep event payload backward compatible whenever possible.
- Do not add heavy allocations or expensive traversals per frame.
- Keep subscriber lifecycle explicit using returned unsubscribe functions.

## Optional Next Improvements

- Move metrics configuration (`reportIntervalMs`, `sampleWindowSize`) to `config/Constants.js`.
- Add a small in-game debug overlay that consumes `RUNTIME_METRICS`.
- Add percentile variants (`p50`, `p99`) if needed for deeper performance analysis.
