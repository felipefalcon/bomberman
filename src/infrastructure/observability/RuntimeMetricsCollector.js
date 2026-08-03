import { GameEvents } from '../../engine/EventBus.js';
import { GAME_CONFIG } from '../../config/Constants.js';

export class RuntimeMetricsCollector {
  constructor(components, eventBus, reportIntervalMs = 1000, sampleWindowSize = 120) {
    this.components = components;
    this.eventBus = eventBus;
    this.reportIntervalMs = reportIntervalMs;
    this.sampleWindowSize = sampleWindowSize;

    this.frameTimes = [];
    this.elapsedMs = 0;
    this.frames = 0;
  }

  observeFrame(tickDelta) {
    const frameMs = (tickDelta / 60) * 1000;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > this.sampleWindowSize) {
      this.frameTimes.shift();
    }

    this.elapsedMs += frameMs;
    this.frames += 1;

    if (this.elapsedMs < this.reportIntervalMs) return;

    const fps = this.frames / (this.elapsedMs / 1000);
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
    const frameTimeP95Ms = sorted[p95Index] ?? 0;

    const metrics = {
      fps: Number(fps.toFixed(2)),
      frameTimeP95Ms: Number(frameTimeP95Ms.toFixed(2)),
      mode: {
        gameMode: GAME_CONFIG.GAME_MODE,
        networkMode: GAME_CONFIG.NETWORK_MODE,
        isOnline: GAME_CONFIG.ONLINE_ENABLED,
      },
      entities: {
        bombs: this.components.systems.bomb.getBombs().length,
        monsters: this.components.systems.monster.getMonsters().length,
        powerups: this.components.systems.powerup.getPowerups().length,
        explosions: this.components.systems.explosion.getExplosions().length,
        destroyingBlocks: this.components.destroyingBlocks.length,
      },
      timestamp: Date.now(),
    };

    // Keep metrics accessible from the browser console for quick profiling.
    globalThis.__bombermanMetrics = metrics;
    this.eventBus.emit(GameEvents.RUNTIME_METRICS, metrics);

    this.elapsedMs = 0;
    this.frames = 0;
  }
}
